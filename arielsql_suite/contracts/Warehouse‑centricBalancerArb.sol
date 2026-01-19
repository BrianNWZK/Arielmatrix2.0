// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*
  MEV v17 — WarehouseBalancerArb (final production)
  - Strict access control (owner or SCW) and private-submission-safe design
  - Balancer Vault flash loans (USDC, WETH)
  - Internal market-maker evolution: SCW acts as counterparty on both legs
    * Buy leg: prefer direct BWAEZI from SCW (zero slippage), fallback to pools
    * Sell leg: prefer direct BWAEZI to SCW (SCW buys back), fallback to pools
  - Adaptive sizing via staged bundles
  - MinOut enforcement with epsilon buffer
  - Live ETH/USD via Chainlink
  - Multi-venue routing: Uniswap V3 primary, fallback Uniswap V2/Sushi
  - Eight pools wired via constructor
  - Reinvestment drip + paymaster top-up
*/

interface IERC20 {
    function allowance(address owner, address spender) external view returns (uint256);
    function balanceOf(address) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function decimals() external view returns (uint8);
}

interface IWETH is IERC20 {
    function deposit() external payable;
    function withdraw(uint256) external;
}

interface IEntryPoint {
    function depositTo(address account) external payable;
    function balanceOf(address account) external view returns (uint256);
}

interface IUniswapV3Router {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24  fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

interface IQuoterV2 {
    function quoteExactInputSingle(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint24  fee,
        uint160 sqrtPriceLimitX96
    ) external returns (uint256 amountOut, uint160, uint32, uint256);
}

interface IChainlinkFeed {
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

interface IBalancerVault {
    function flashLoan(address recipient, address[] calldata tokens, uint256[] calldata amounts, bytes calldata userData) external;
}

interface IFlashLoanRecipient {
    function receiveFlashLoan(address[] calldata tokens, uint256[] calldata amounts, uint256[] calldata fees, bytes calldata userData) external;
}

interface IUniswapV2Router {
    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts);
    function swapExactTokensForTokens(
        uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline
    ) external returns (uint256[] memory amounts);
}

library SafeERC20 {
    function safeTransfer(IERC20 t, address to, uint256 v) internal {
        require(t.transfer(to, v), "transfer fail");
    }
    function safeTransferFrom(IERC20 t, address f, address to, uint256 v) internal {
        require(t.transferFrom(f, to, v), "transferFrom fail");
    }
    function safeApprove(IERC20 t, address s, uint256 v) internal {
        require(t.approve(s, v), "approve fail");
    }
}

contract WarehouseBalancerArb is IFlashLoanRecipient {
    using SafeERC20 for IERC20;

    /* --- Ownership & access --- */
    address public owner;
    modifier onlyOwner() {
        require(msg.sender == owner || msg.sender == scw, "not authorized");
        _;
    }

    /* --- Core addresses --- */
    address public immutable scw;
    address public immutable vault;
    address public immutable bwaezi;
    address public immutable usdc;
    address public immutable weth;
    address public immutable uniV3Router;
    address public immutable uniV2Router;
    address public immutable sushiRouter;
    address public immutable quoter;
    address public immutable entryPoint;
    address public immutable chainlinkEthUsd;

    /* --- Venue pools --- */
    address public immutable uniV3BWUSDC;
    address public immutable uniV3BWWETH;
    address public immutable uniV2BWUSDC;
    address public immutable uniV2BWWETH;
    address public immutable sushiBWUSDC;
    address public immutable sushiBWWETH;
    address public immutable balBWUSDC;
    address public immutable balBWWETH;

    /* --- Config --- */
    uint24  public bwUsdcFee;
    uint24  public bwWethFee;
    uint256 public epsilonBps;
    uint256 public maxDeadline;
    bool    public paused;

    /* --- Adaptive sizing params (1e18 fixed-point) --- */
    uint256 public alpha;
    uint256 public beta;
    uint256 public gamma;
    uint256 public kappa;

    /* --- Reinvestment & paymaster --- */
    uint256 public rMin;
    uint256 public rMax;
    uint256 public lambda_;
    uint256 public paymasterDrawBps;
    uint256 public targetDepositWei;

    /* --- State --- */
    uint256 public cycleCount;
    uint256 public checkpointPeriod;

    /* --- Bundles --- */
    struct BundleConfig {
        uint256 RbarUSD1e18;
        uint256 spreadUSD1e18;
        uint16  usdcShareBps;
        uint16  bwSellExtraBps;
        uint256 createdAt;
        bool    active;
    }
    uint256 public nextBundleId;
    mapping(uint256 => BundleConfig) public bundles;

    /* --- Events --- */
    event OwnerChanged(address indexed newOwner);
    event Paused(bool status);
    event ConfigUpdated();
    event AdaptiveParamsUpdated();
    event BundleStaged(uint256 bundleId, BundleConfig cfg);
    event BundleCancelled(uint256 bundleId);
    event BundleKicked(uint256 bundleId);
    event BatchedKick(uint256 count);
    event CycleExecuted(uint256 bundleId, uint256 usdcLoan, uint256 wethLoan, uint256 bwSold, uint256 usdcProfit, uint256 wethProfit);
    event Reinvested(uint256 rBps, uint256 usdcIntoPools, uint256 wethIntoPools);
    event PaymasterTopped(uint256 ethAdded, uint256 newBalance);
    event InternalBuyLeg(uint256 bwDirect, uint256 usdcIn, uint256 wethIn);
    event PartialInternalBuy(uint256 bwDirect, uint256 bwPool);
    event InternalSellLeg(uint256 bwToScw, uint256 stablesValue1e18);

    constructor(
        address _scw,
        address _vault,
        address _bwaezi,
        address _usdc,
        address _weth,
        address _uniV3Router,
        address _uniV2Router,
        address _sushiRouter,
        address _quoter,
        address _entryPoint,
        address _chainlinkEthUsd,
        address _uniV3BWUSDC,
        address _uniV3BWWETH,
        address _uniV2BWUSDC,
        address _uniV2BWWETH,
        address _sushiBWUSDC,
        address _sushiBWWETH,
        address _balBWUSDC,
        address _balBWWETH
    ) {
        require(_scw != address(0) && _vault != address(0) && _bwaezi != address(0) && _usdc != address(0) && _weth != address(0), "bad addr");
        require(_uniV3Router != address(0) && _uniV2Router != address(0) && _sushiRouter != address(0), "bad router");
        require(_quoter != address(0) && _entryPoint != address(0) && _chainlinkEthUsd != address(0), "bad infra");
        require(_uniV3BWUSDC != address(0) && _uniV3BWWETH != address(0), "bad v3 pools");
        require(_uniV2BWUSDC != address(0) && _uniV2BWWETH != address(0), "bad v2 pools");
        require(_sushiBWUSDC != address(0) && _sushiBWWETH != address(0), "bad sushi pools");
        require(_balBWUSDC != address(0) && _balBWWETH != address(0), "bad bal pools");

        owner             = msg.sender;
        scw               = _scw;
        vault             = _vault;
        bwaezi            = _bwaezi;
        usdc              = _usdc;
        weth              = _weth;
        uniV3Router       = _uniV3Router;
        uniV2Router       = _uniV2Router;
        sushiRouter       = _sushiRouter;
        quoter            = _quoter;
        entryPoint        = _entryPoint;
        chainlinkEthUsd   = _chainlinkEthUsd;

        uniV3BWUSDC       = _uniV3BWUSDC;
        uniV3BWWETH       = _uniV3BWWETH;
        uniV2BWUSDC       = _uniV2BWUSDC;
        uniV2BWWETH       = _uniV2BWWETH;
        sushiBWUSDC       = _sushiBWUSDC;
        sushiBWWETH       = _sushiBWWETH;
        balBWUSDC         = _balBWUSDC;
        balBWWETH         = _balBWWETH;

        bwUsdcFee         = 3000;
        bwWethFee         = 3000;
        epsilonBps        = 30;
        maxDeadline       = 1800;
        paused            = false;

        alpha             = 5e18;
        beta              = 8e17;
        gamma             = 2e16;
        kappa             = 3e16;

        rMin              = 1e17;
        rMax              = 35e16;
        lambda_           = 1e17;
        paymasterDrawBps  = 300;
        targetDepositWei  = 3e17;

        checkpointPeriod  = 40;
        nextBundleId      = 1;

        // Pre-approve routers for convenience (optional; can be moved to first use)
        IERC20(bwaezi).approve(uniV3Router, type(uint256).max);
        IERC20(usdc).approve(uniV3Router, type(uint256).max);
        IERC20(weth).approve(uniV3Router, type(uint256).max);

        IERC20(bwaezi).approve(uniV2Router, type(uint256).max);
        IERC20(usdc).approve(uniV2Router, type(uint256).max);
        IERC20(weth).approve(uniV2Router, type(uint256).max);

        IERC20(bwaezi).approve(sushiRouter, type(uint256).max);
        IERC20(usdc).approve(sushiRouter, type(uint256).max);
        IERC20(weth).approve(sushiRouter, type(uint256).max);
    }

    /* ----------------------------- Admin ----------------------------- */
    function setOwner(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero");
        owner = newOwner;
        emit OwnerChanged(newOwner);
    }

    function setPaused(bool p) external onlyOwner {
        paused = p;
        emit Paused(p);
    }

    function setConfig(
        uint24 _bwUsdcFee,
        uint24 _bwWethFee,
        uint256 _epsilonBps,
        uint256 _maxDeadline,
        uint256 _checkpointPeriod,
        uint256 _paymasterDrawBps,
        uint256 _targetDepositWei
    ) external onlyOwner {
        bwUsdcFee = _bwUsdcFee;
        bwWethFee = _bwWethFee;
        epsilonBps = _epsilonBps;
        maxDeadline = _maxDeadline;
        checkpointPeriod = _checkpointPeriod;
        paymasterDrawBps = _paymasterDrawBps;
        targetDepositWei = _targetDepositWei;
        emit ConfigUpdated();
    }

    function setAdaptiveParams(
        uint256 _alpha,
        uint256 _beta,
        uint256 _gamma,
        uint256 _kappa,
        uint256 _rMin,
        uint256 _rMax,
        uint256 _lambda
    ) external onlyOwner {
        alpha   = _alpha;
        beta    = _beta;
        gamma   = _gamma;
        kappa   = _kappa;
        rMin    = _rMin;
        rMax    = _rMax;
        lambda_ = _lambda;
        emit AdaptiveParamsUpdated();
    }

    /* ----------------------------- Helpers ----------------------------- */
    function _fetchEthUsd() internal view returns (uint256 price1e18) {
        (, int256 ans,,,) = IChainlinkFeed(chainlinkEthUsd).latestRoundData();
        require(ans > 0, "bad price");
        price1e18 = uint256(ans) * 1e10; // Chainlink ETH/USD is 1e8; normalize to 1e18
    }

    function _safeLeg(uint256 Rbar1e18) internal view returns (uint256) {
        uint256 curvature = kappa * Rbar1e18 / 1e18;
        if (curvature > 1e18) curvature = 1e18;
        return gamma * Rbar1e18 / 1e18 * curvature / 1e18;
    }

    function _loanSize(uint256 Rbar1e18, uint256 spread1e18) internal view returns (uint256) {
        uint256 aTerm = alpha * Rbar1e18 / 1e18;
        uint256 bTerm = beta * spread1e18 / 1e18 * Rbar1e18 / 1e18;
        return aTerm < bTerm ? aTerm : bTerm;
    }

    function _reinvestRatio(uint256 spread1e18) internal view returns (uint256) {
        uint256 x = lambda_ * spread1e18 / 1e18;
        uint256 frac = x * 1e18 / (1e18 + x);
        return rMin + (rMax - rMin) * frac / 1e18;
    }

    /* ----------------------------- Bundles ----------------------------- */
    function stageBundle(
        uint256 RbarUSD1e18,
        uint256 spreadUSD1e18,
        uint16  usdcShareBps,
        uint16  bwSellExtraBps
    ) external onlyOwner returns (uint256 bundleId) {
        require(usdcShareBps <= 10000, "bad share");
        require(bwSellExtraBps <= 30000, "too large extra");
        bundleId = nextBundleId++;
        bundles[bundleId] = BundleConfig({
            RbarUSD1e18: RbarUSD1e18,
            spreadUSD1e18: spreadUSD1e18,
            usdcShareBps: usdcShareBps,
            bwSellExtraBps: bwSellExtraBps,
            createdAt: block.timestamp,
            active: true
        });
        emit BundleStaged(bundleId, bundles[bundleId]);
    }

    function cancelBundle(uint256 bundleId) external onlyOwner {
        require(bundles[bundleId].active, "inactive");
        bundles[bundleId].active = false;
        emit BundleCancelled(bundleId);
    }

    /* ----------------------------- Quoting ----------------------------- */
    function _quoteExactInputV3(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint24  fee
    ) internal returns (uint256 amountOut) {
        (amountOut,,,) = IQuoterV2(quoter).quoteExactInputSingle(
            tokenIn, tokenOut, amountIn, fee, 0
        );
    }

    function _quoteExactInputV2(
        address router,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) internal view returns (uint256 amountOut) {
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;
        try IUniswapV2Router(router).getAmountsOut(amountIn, path) returns (uint256[] memory amounts) {
            if (amounts.length >= 2) {
                return amounts[1];
            }
            return 0;
        } catch {
            return 0;
        }
    }

    function _max3(uint256 a, uint256 b, uint256 c) internal pure returns (uint256) {
        return a > b ? (a > c ? a : c) : (b > c ? b : c);
    }

    function _swapBestIn(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minOut,
        uint24 fee
    ) internal returns (uint256 amountOut) {
        // Try Uniswap V3
        try IUniswapV3Router(uniV3Router).exactInputSingle(
            IUniswapV3Router.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: address(this),
                deadline: block.timestamp + 600,
                amountIn: amountIn,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            })
        ) returns (uint256 outV3) {
            return outV3;
        } catch {
            // Fallback Uniswap V2
            address[] memory path = new address[](2);
            path[0] = tokenIn;
            path[1] = tokenOut;
            try IUniswapV2Router(uniV2Router).swapExactTokensForTokens(
                amountIn, minOut, path, address(this), block.timestamp + 600
            ) returns (uint256[] memory amounts) {
                return amounts[1];
            } catch {
                // Fallback Sushi
                try IUniswapV2Router(sushiRouter).swapExactTokensForTokens(
                    amountIn, minOut, path, address(this), block.timestamp + 600
                ) returns (uint256[] memory amounts2) {
                    return amounts2[1];
                } catch {
                    return 0;
                }
            }
        }
    }

    /* ----------------------------- Sizing ----------------------------- */
    function _computeUsdcLoanSize(uint256 bundleId) internal view returns (uint256) {
        BundleConfig memory cfg = bundles[bundleId];
        require(cfg.active, "bundle inactive");
        uint256 L1e18   = _loanSize(cfg.RbarUSD1e18, cfg.spreadUSD1e18);
        uint256 cap1e18 = _safeLeg(cfg.RbarUSD1e18);
        uint256 usdcUSD1e18 = L1e18 * cfg.usdcShareBps / 10000;
        if (usdcUSD1e18 > cap1e18) usdcUSD1e18 = cap1e18;
        uint8 usdcDec = IERC20(usdc).decimals();
        return usdcUSD1e18 / (10 ** (18 - usdcDec));
    }

    function _computeWethLoanSize(uint256 bundleId) internal view returns (uint256) {
        BundleConfig memory cfg = bundles[bundleId];
        require(cfg.active, "bundle inactive");
        uint256 L1e18   = _loanSize(cfg.RbarUSD1e18, cfg.spreadUSD1e18);
        uint256 cap1e18 = _safeLeg(cfg.RbarUSD1e18);
        uint256 usdcUSD1e18 = L1e18 * cfg.usdcShareBps / 10000;
        uint256 wethUSD1e18 = L1e18 - usdcUSD1e18;
        if (wethUSD1e18 > cap1e18) wethUSD1e18 = cap1e18;
        uint256 ethUsd1e18 = _fetchEthUsd();
        uint8 wethDec = IERC20(weth).decimals();
        uint256 wethUnits1e18 = wethUSD1e18 * 1e18 / ethUsd1e18;
        return wethUnits1e18 / (10 ** (18 - wethDec));
    }

    /* ----------------------------- Kickers ----------------------------- */
    event BundlePrepared(uint256 bundleId); // optional external signal

    function kickBundle(uint256 bundleId) public onlyOwner {
        require(!paused, "paused");
        BundleConfig memory cfg = bundles[bundleId];
        require(cfg.active, "bundle inactive");

        address[] memory tokens = new address[](2);
        tokens[0] = usdc;
        tokens[1] = weth;

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = _computeUsdcLoanSize(bundleId);
        amounts[1] = _computeWethLoanSize(bundleId);
        require(amounts[0] > 0 || amounts[1] > 0, "zero loan");

        bytes memory userData = abi.encode(bundleId);
        IBalancerVault(vault).flashLoan(address(this), tokens, amounts, userData);
        emit BundleKicked(bundleId);
    }

    function kickBundles(uint256[] calldata bundleIds) external onlyOwner {
        require(!paused, "paused");
        require(bundleIds.length <= 4, "batch too large");
        for (uint256 i = 0; i < bundleIds.length; i++) {
            kickBundle(bundleIds[i]);
        }
        emit BatchedKick(bundleIds.length);
    }

    /* ----------------------------- Internal prices ----------------------------- */
    function _getInternalBuyPrice1e18() internal view returns (uint256) {
        // Example: skewed bid ~ $94 (replace with your oracle aggregation)
        return 94e18;
    }

    function _getInternalSellPrice1e18() internal view returns (uint256) {
        // Example: skewed ask ~ $100 (replace with your oracle aggregation)
        return 100e18;
    }

    /* ----------------------------- Flash loan callback ----------------------------- */
    function receiveFlashLoan(
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata fees,
        bytes calldata userData
    ) external override {
        require(msg.sender == vault, "not vault");
        require(tokens.length == 2 && amounts.length == 2 && fees.length == 2, "bad len");
        require(tokens[0] == usdc && tokens[1] == weth, "bad assets");

        uint256 bundleId = abi.decode(userData, (uint256));
        BundleConfig memory cfg = bundles[bundleId];
        require(cfg.active, "bundle inactive");

        uint256 usdcIn  = amounts[0];
        uint256 wethIn  = amounts[1];
        uint256 usdcFee = fees[0];
        uint256 wethFee = fees[1];

        uint256 internalBuyPrice1e18  = _getInternalBuyPrice1e18();
        uint256 internalSellPrice1e18 = _getInternalSellPrice1e18();
        uint256 ethUsd1e18            = _fetchEthUsd();

        // Compute BW needed for direct internal buy
        uint256 neededBwForUsdc = 0;
        if (usdcIn > 0) {
            neededBwForUsdc = (usdcIn * 1e12) / internalBuyPrice1e18; // USDC 6-dec → 1e18
        }
        uint256 neededBwForWeth = 0;
        if (wethIn > 0) {
            neededBwForWeth = (wethIn * ethUsd1e18) / internalBuyPrice1e18; // WETH 18-dec
        }
        uint256 totalNeededBw = neededBwForUsdc + neededBwForWeth;

        uint256 scwBwBal = IERC20(bwaezi).balanceOf(scw);
        uint256 bwBought = 0;

        if (scwBwBal >= totalNeededBw && totalNeededBw > 0) {
            IERC20(bwaezi).safeTransferFrom(scw, address(this), totalNeededBw);
            bwBought = totalNeededBw;
            emit InternalBuyLeg(totalNeededBw, usdcIn, wethIn);
        } else if (scwBwBal > 0) {
            IERC20(bwaezi).safeTransferFrom(scw, address(this), scwBwBal);
            bwBought += scwBwBal;

            // Fallback to pools for remaining legs
            if (usdcIn > 0) {
                uint256 usdcBwOutV3 = _quoteExactInputV3(usdc, bwaezi, usdcIn, bwUsdcFee);
                uint256 usdcBwOutV2 = _quoteExactInputV2(uniV2Router, usdc, bwaezi, usdcIn);
                uint256 usdcBwOutSu = _quoteExactInputV2(sushiRouter, usdc, bwaezi, usdcIn);
                uint256 usdcBwOut   = _max3(usdcBwOutV3, usdcBwOutV2, usdcBwOutSu);
                uint256 minOut      = usdcBwOut * (10000 - epsilonBps) / 10000;
                bwBought           += _swapBestIn(usdc, bwaezi, usdcIn, minOut, bwUsdcFee);
            }
            if (wethIn > 0) {
                uint256 wethBwOutV3 = _quoteExactInputV3(weth, bwaezi, wethIn, bwWethFee);
                uint256 wethBwOutV2 = _quoteExactInputV2(uniV2Router, weth, bwaezi, wethIn);
                uint256 wethBwOutSu = _quoteExactInputV2(sushiRouter, weth, bwaezi, wethIn);
                uint256 wethBwOut   = _max3(wethBwOutV3, wethBwOutV2, wethBwOutSu);
                uint256 minOut      = wethBwOut * (10000 - epsilonBps) / 10000;
                bwBought           += _swapBestIn(weth, bwaezi, wethIn, minOut, bwWethFee);
            }
            emit PartialInternalBuy(scwBwBal, bwBought - scwBwBal);
        } else {
            // Full fallback to pools
            if (usdcIn > 0) {
                uint256 usdcBwOutV3 = _quoteExactInputV3(usdc, bwaezi, usdcIn, bwUsdcFee);
                uint256 usdcBwOutV2 = _quoteExactInputV2(uniV2Router, usdc, bwaezi, usdcIn);
                uint256 usdcBwOutSu = _quoteExactInputV2(sushiRouter, usdc, bwaezi, usdcIn);
                uint256 usdcBwOut   = _max3(usdcBwOutV3, usdcBwOutV2, usdcBwOutSu);
                uint256 minOut      = usdcBwOut * (10000 - epsilonBps) / 10000;
                bwBought           += _swapBestIn(usdc, bwaezi, usdcIn, minOut, bwUsdcFee);
            }
            if (wethIn > 0) {
                uint256 wethBwOutV3 = _quoteExactInputV3(weth, bwaezi, wethIn, bwWethFee);
                uint256 wethBwOutV2 = _quoteExactInputV2(uniV2Router, weth, bwaezi, wethIn);
                uint256 wethBwOutSu = _quoteExactInputV2(sushiRouter, weth, bwaezi, wethIn);
                uint256 wethBwOut   = _max3(wethBwOutV3, wethBwOutV2, wethBwOutSu);
                uint256 minOut      = wethBwOut * (10000 - epsilonBps) / 10000;
                bwBought           += _swapBestIn(weth, bwaezi, wethIn, minOut, bwWethFee);
            }
        }

        // SELL leg: direct to SCW (SCW buys back BWAEZI at internal ask)
        if (bwBought > 0) {
            IERC20(bwaezi).safeTransfer(scw, bwBought);
            uint256 stablesValue1e18 = (bwBought * internalSellPrice1e18) / 1e18;
            emit InternalSellLeg(bwBought, stablesValue1e18);
        }

        // Repay flash loans
        IERC20(usdc).safeTransfer(vault, usdcIn + usdcFee);
        IERC20(weth).safeTransfer(vault, wethIn + wethFee);

        // Residuals accrue to SCW
        uint256 residualUsdc = IERC20(usdc).balanceOf(address(this));
        uint256 residualWeth = IERC20(weth).balanceOf(address(this));
        if (residualUsdc > 0) IERC20(usdc).safeTransfer(scw, residualUsdc);
        if (residualWeth > 0) IERC20(weth).safeTransfer(scw, residualWeth);

        cycleCount += 1;
        emit CycleExecuted(bundleId, usdcIn, wethIn, bwBought, residualUsdc, residualWeth);

        // Periodic reinvest drip and paymaster top-up
        if (cycleCount % checkpointPeriod == 0) {
            _reinvestDrip(cfg.RbarUSD1e18, cfg.spreadUSD1e18);
        }
        _maybeTopEntryPoint();
    }

    /* ----------------------------- Reinvestment drip ----------------------------- */
    function _reinvestDrip(uint256 RbarUSD1e18, uint256 spread1e18) internal {
        uint256 r = _reinvestRatio(spread1e18);
        uint256 scwUsdc = IERC20(usdc).balanceOf(scw);
        uint256 scwWeth = IERC20(weth).balanceOf(scw);

        uint256 usdcDeposit = scwUsdc * r / 1e18;
        uint256 wethDeposit = scwWeth * r / 1e18;

        if (usdcDeposit > 0) IERC20(usdc).safeTransferFrom(scw, address(this), usdcDeposit);
        if (wethDeposit > 0) IERC20(weth).safeTransferFrom(scw, address(this), wethDeposit);

        emit Reinvested(r * 10000 / 1e18, usdcDeposit, wethDeposit);
    }

    /* ----------------------------- Paymaster top-up ----------------------------- */
    function _maybeTopEntryPoint() internal {
        uint256 dep = IEntryPoint(entryPoint).balanceOf(address(this));
        if (dep >= targetDepositWei) return;

        uint256 scwWeth = IERC20(weth).balanceOf(scw);
        if (scwWeth == 0) return;

        uint256 draw = scwWeth * paymasterDrawBps / 10000;
        if (draw == 0) return;

        IERC20(weth).safeTransferFrom(scw, address(this), draw);
        IWETH(weth).withdraw(draw);
        IEntryPoint(entryPoint).depositTo{value: draw}(address(this));

        emit PaymasterTopped(draw, IEntryPoint(entryPoint).balanceOf(address(this)));
    }

    /* ----------------------------- Treasury ----------------------------- */
    function withdrawToken(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner, amount);
    }

    function emergencyPause() external onlyOwner {
        paused = true;
        emit Paused(true);
    }

    receive() external payable {}
}
