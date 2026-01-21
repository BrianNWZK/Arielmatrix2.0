// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*
  MEV v20 — WarehouseBalancerArb (MV19 + MV18 best features, compact)
  - Strict access (owner or SCW), nonReentrant, pause
  - Signature-gated kicks (EIP-712) single/batch with nonce + deadline
  - Balancer Vault flash loans (USDC, WETH)
  - Internal market-maker priority (SCW) for buy/sell legs
  - Routing: Uniswap V3 primary, Uniswap V2/Sushi fallback
  - Tight slippage (epsilonBps cap), short deadlines
  - Adaptive sizing (alpha/beta/gamma/kappa), per-leg safe caps
  - Dynamic blended internal pricing (Balancer spot + venue quotes)
  - Circuit breaker (maxDeviationBps) with Chainlink freshness checks
  - 8-venue reinvest drip (compact best-effort)
  - Dual paymasters; top-up only if deposit below target (check first)
  - Emergency rescues: ERC20, ETH (unwrap WETH), ERC721, ERC1155
  - Module toggles: REINVEST, PAYMASTER_TOPUP, CIRCUIT_BREAKER
  - Assembly SafeERC20; custom errors; unchecked math where safe
  - viaIR=true, runs=1, yul=true, revertStrings="strip"
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

interface IERC721 {
    function transferFrom(address from, address to, uint256 tokenId) external;
}

interface IERC1155 {
    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata data) external;
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

    struct JoinPoolRequest {
        address[] assets;
        uint256[] maxAmountsIn;
        bytes userData;
        bool fromInternalBalance;
    }

    function joinPool(bytes32 poolId, address sender, address recipient, JoinPoolRequest calldata request) external payable;
    function getPoolTokens(bytes32 poolId) external view returns (address[] memory tokens, uint256[] memory balances, uint256);
}

interface IFlashLoanRecipient {
    function receiveFlashLoan(address[] calldata tokens, uint256[] calldata amounts, uint256[] calldata fees, bytes calldata userData) external;
}

interface IUniswapV2Router {
    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts);
    function swapExactTokensForTokens(
        uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline
    ) external returns (uint256[] memory amounts);
    function addLiquidity(
        address tokenA, address tokenB, uint256 amountA, uint256 amountB,
        uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline
    ) external returns (uint256, uint256, uint256);
}

interface INonfungiblePositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }
    function mint(MintParams calldata params) external payable returns (uint256, uint128, uint256, uint256);
}

/* ----------------------------- Libraries ----------------------------- */
library SafeERC20 {
    function safeTransfer(IERC20 t, address to, uint256 v) internal {
        assembly {
            let p := mload(0x40)
            mstore(p, 0xa9059cbb00000000000000000000000000000000000000000000000000000000)
            mstore(add(p, 4), to)
            mstore(add(p, 36), v)
            if iszero(call(gas(), t, 0, p, 68, 0, 0)) { revert(0, 0) }
        }
    }
    function safeTransferFrom(IERC20 t, address f, address to, uint256 v) internal {
        assembly {
            let p := mload(0x40)
            mstore(p, 0x23b872dd00000000000000000000000000000000000000000000000000000000)
            mstore(add(p, 4), f)
            mstore(add(p, 36), to)
            mstore(add(p, 68), v)
            if iszero(call(gas(), t, 0, p, 100, 0, 0)) { revert(0, 0) }
        }
    }
    function safeApprove(IERC20 t, address s, uint256 v) internal {
        assembly {
            let p := mload(0x40)
            mstore(p, 0x095ea7b300000000000000000000000000000000000000000000000000000000)
            mstore(add(p, 4), s)
            mstore(add(p, 36), v)
            if iszero(call(gas(), t, 0, p, 68, 0, 0)) { revert(0, 0) }
        }
    }
}

/* ----------------------------- Contract ----------------------------- */
contract WarehouseBalancerArb is IFlashLoanRecipient {
    using SafeERC20 for IERC20;

    /* --- Errors --- */
    error NotAuthorized();
    error Paused();
    error BadArgs();
    error Reentrancy();
    error SlippageTooLoose();
    error Expired();
    error Inactive();
    error Used();
    error NoQuote();
    error ZeroLoan();
    error BadPool();
    error CircuitBreak();
    error StalePrice();

    /* --- Ownership & access --- */
    address public owner;
    address public immutable scw;
    modifier onlyOwner() {
        if (msg.sender != owner && msg.sender != scw) revert NotAuthorized();
        _;
    }

    /* --- Core addresses --- */
    address public immutable vault;
    address public immutable bwaezi;
    IERC20  public immutable BWZC;
    address public immutable usdc;
    address public immutable weth;
    address public immutable uniV3Router;
    address public immutable uniV2Router;
    address public immutable sushiRouter;
    address public immutable quoter;
    address public immutable entryPoint;
    address public immutable chainlinkEthUsd;
    address public immutable positionManager;

    /* --- Venue pools (wired via constructor) --- */
    address public immutable uniV3BWUSDC;
    address public immutable uniV3BWWETH;
    address public immutable uniV2BWUSDC;
    address public immutable uniV2BWWETH;
    address public immutable sushiBWUSDC;
    address public immutable sushiBWWETH;
    bytes32 public immutable balBWUSDCId;
    bytes32 public immutable balBWWETHId;

    /* --- Paymasters --- */
    address public immutable paymasterA;
    address public immutable paymasterB;
    uint8   public activePaymaster; // 0 = A, 1 = B

    /* --- Config --- */
    uint24  public bwUsdcFee;
    uint24  public bwWethFee;
    uint256 public epsilonBps;       // <= 50
    uint256 public maxDeadline;      // seconds
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
    uint256 public paymasterDrawBps;   // draw % of SCW WETH for top-up
    uint256 public targetDepositWei;   // EntryPoint deposit target for selected paymaster

    /* --- State --- */
    uint256 public cycleCount;
    uint256 public checkpointPeriod;

    /* --- Circuit breaker --- */
    uint256 public lastPrice1e18;
    uint256 public maxDeviationBps; // e.g., 500 = 5%
    bool    public breakerEnabled;

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

    /* --- Modules --- */
    mapping(bytes32 => bool) public moduleEnabled; // "REINVEST", "PAYMASTER_TOPUP", "CIRCUIT_BREAKER"

    /* --- EIP-712 signature gating --- */
    bytes32 public DOMAIN_SEPARATOR;
    bytes32 public constant KICK_TYPEHASH = keccak256("Kick(uint256 bundleId,uint256 deadline,uint256 nonce)");
    bytes32 public constant KICKBATCH_TYPEHASH = keccak256("KickBatch(bytes32 idsHash,uint256 deadline,uint256 nonce)");
    uint256 public kickNonce;
    mapping(uint256 => bool) public kickUsed;

    /* --- Events --- */
    event OwnerChanged(address indexed newOwner);
    event PausedSet(bool status);
    event ConfigUpdated();
    event AdaptiveParamsUpdated();
    event CircuitBreakerUpdated(uint256 maxDeviationBps, bool enabled);
    event BundleStaged(uint256 bundleId, BundleConfig cfg);
    event BundleCancelled(uint256 bundleId);
    event BundleKicked(uint256 bundleId);
    event BatchedKick(uint256 count);
    event CycleExecuted(uint256 bundleId, uint256 usdcLoan, uint256 wethLoan, uint256 bwSold, uint256 usdcResidual, uint256 wethResidual);
    event Reinvested(uint256 rBps, uint256 usdcIntoPools, uint256 wethIntoPools);
    event PaymasterTopped(address paymaster, uint256 ethAdded, uint256 newBalance);
    event InternalBuyLeg(uint256 bwDirect, uint256 usdcIn, uint256 wethIn);
    event PartialInternalBuy(uint256 bwDirect, uint256 bwPool);
    event InternalSellLeg(uint256 bwToScw, uint256 stablesValue1e18);
    event ModuleToggled(bytes32 module, bool enabled);
    event ActivePaymasterSet(uint8 index);
    event ERC20Withdrawn(address token, uint256 amount);
    event ETHWithdrawn(uint256 amount);
    event ERC721Rescued(address token, uint256 tokenId);
    event ERC1155Rescued(address token, uint256 id, uint256 amount);

    /* --- NonReentrancy --- */
    uint256 private _lock;
    modifier nonReentrant() {
        if (_lock == 1) revert Reentrancy();
        _lock = 1;
        _;
        _lock = 0;
    }

    /* --- Constructor --- */
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
        address _positionManager,
        address _uniV3BWUSDC,
        address _uniV3BWWETH,
        address _uniV2BWUSDC,
        address _uniV2BWWETH,
        address _sushiBWUSDC,
        address _sushiBWWETH,
        bytes32 _balBWUSDCId,
        bytes32 _balBWWETHId,
        address _paymasterA,
        address _paymasterB
    ) {
        if (_scw == address(0) || _vault == address(0) || _bwaezi == address(0) || _usdc == address(0) || _weth == address(0)) revert BadArgs();
        if (_uniV3Router == address(0) || _uniV2Router == address(0) || _sushiRouter == address(0)) revert BadArgs();
        if (_quoter == address(0) || _entryPoint == address(0) || _chainlinkEthUsd == address(0) || _positionManager == address(0)) revert BadArgs();
        if (_uniV3BWUSDC == address(0) || _uniV3BWWETH == address(0) || _uniV2BWUSDC == address(0) || _uniV2BWWETH == address(0)) revert BadArgs();
        if (_sushiBWUSDC == address(0) || _sushiBWWETH == address(0)) revert BadArgs();
        if (_paymasterA == address(0) || _paymasterB == address(0)) revert BadArgs();

        owner             = msg.sender;
        scw               = _scw;
        vault             = _vault;
        bwaezi            = _bwaezi;
        BWZC              = IERC20(_bwaezi);
        usdc              = _usdc;
        weth              = _weth;
        uniV3Router       = _uniV3Router;
        uniV2Router       = _uniV2Router;
        sushiRouter       = _sushiRouter;
        quoter            = _quoter;
        entryPoint        = _entryPoint;
        chainlinkEthUsd   = _chainlinkEthUsd;
        positionManager   = _positionManager;

        uniV3BWUSDC       = _uniV3BWUSDC;
        uniV3BWWETH       = _uniV3BWWETH;
        uniV2BWUSDC       = _uniV2BWUSDC;
        uniV2BWWETH       = _uniV2BWWETH;
        sushiBWUSDC       = _sushiBWUSDC;
        sushiBWWETH       = _sushiBWWETH;
        balBWUSDCId       = _balBWUSDCId;
        balBWWETHId       = _balBWWETHId;

        paymasterA        = _paymasterA;
        paymasterB        = _paymasterB;
        activePaymaster   = 0; // default to A

        bwUsdcFee         = 3000;
        bwWethFee         = 3000;
        epsilonBps        = 30;
        maxDeadline       = 900;
        paused            = false;

        alpha             = 5e18;
        beta              = 8e17;
        gamma             = 2e16;
        kappa             = 3e16;

        rMin              = 1e17;
        rMax              = 35e16;
        lambda_           = 1e17;
        paymasterDrawBps  = 300;   // 3% of SCW WETH
        targetDepositWei  = 3e17;  // 0.3 ETH

        checkpointPeriod  = 40;
        nextBundleId      = 1;

        maxDeviationBps   = 500;   // 5%
        breakerEnabled    = true;

        moduleEnabled[keccak256("REINVEST")] = true;
        moduleEnabled[keccak256("PAYMASTER_TOPUP")] = true;
        moduleEnabled[keccak256("CIRCUIT_BREAKER")] = true;

        _initDomainSeparator();

        // Pre-approvals (compact)
        BWZC.safeApprove(uniV3Router, type(uint256).max);
        IERC20(usdc).safeApprove(uniV3Router, type(uint256).max);
        IERC20(weth).safeApprove(uniV3Router, type(uint256).max);
        BWZC.safeApprove(uniV2Router, type(uint256).max);
        IERC20(usdc).safeApprove(uniV2Router, type(uint256).max);
        IERC20(weth).safeApprove(uniV2Router, type(uint256).max);
        BWZC.safeApprove(sushiRouter, type(uint256).max);
        IERC20(usdc).safeApprove(sushiRouter, type(uint256).max);
        IERC20(weth).safeApprove(sushiRouter, type(uint256).max);
        BWZC.safeApprove(positionManager, type(uint256).max);
        IERC20(usdc).safeApprove(positionManager, type(uint256).max);
        IERC20(weth).safeApprove(positionManager, type(uint256).max);
    }

    /* ----------------------------- EIP-712 ----------------------------- */
    function _initDomainSeparator() internal {
        uint256 chainId;
        assembly { chainId := chainid() }
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes("WarehouseBalancerArb")),
            keccak256(bytes("1")),
            chainId,
            address(this)
        ));
    }

    /* ----------------------------- Admin ----------------------------- */
    function setOwner(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert BadArgs();
        owner = newOwner;
        emit OwnerChanged(newOwner);
    }

    function setPaused(bool p) external onlyOwner {
        paused = p;
        emit PausedSet(p);
    }

    function toggleModule(bytes32 key, bool enabled) external onlyOwner {
        moduleEnabled[key] = enabled;
        emit ModuleToggled(key, enabled);
    }

    function setActivePaymaster(uint8 idx) external onlyOwner {
        if (idx > 1) revert BadArgs();
        activePaymaster = idx;
        emit ActivePaymasterSet(idx);
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
        if (_epsilonBps > 50) revert SlippageTooLoose();
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

    function setCircuitBreaker(uint256 _maxDeviationBps, bool _enabled) external onlyOwner {
        if (_maxDeviationBps > 5000) revert BadArgs(); // cap at 50%
        maxDeviationBps = _maxDeviationBps;
        breakerEnabled = _enabled;
        emit CircuitBreakerUpdated(_maxDeviationBps, _enabled);
    }

    /* ----------------------------- Helpers ----------------------------- */
    uint256 public constant MAX_CHAINLINK_AGE = 30 minutes;

    function _fetchEthUsdFresh() internal view returns (uint256 price1e18) {
        (uint80 roundId, int256 ans, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound) =
            IChainlinkFeed(chainlinkEthUsd).latestRoundData();
        if (ans <= 0) revert StalePrice();
        if (answeredInRound < roundId) revert StalePrice();
        if (updatedAt < startedAt) revert StalePrice();
        if (block.timestamp - updatedAt > MAX_CHAINLINK_AGE) revert StalePrice();
        price1e18 = uint256(ans) * 1e10; // 1e8 → 1e18
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

    function _max3(uint256 a, uint256 b, uint256 c) internal pure returns (uint256) {
        return a > b ? (a > c ? a : c) : (b > c ? b : c);
    }

    /* ----------------------------- Balancer spot price (USD per BW) ----------------------------- */
    function _balancerSpotPriceUSD(bytes32 poolId, address tokenA, address tokenB) internal view returns (uint256 price1e18) {
        (address[] memory tokens, uint256[] memory balances,) = IBalancerVault(vault).getPoolTokens(poolId);
        if (tokens.length != 2 || balances.length != 2) revert BadPool();
        uint8 decA = IERC20(tokenA).decimals();
        uint8 decB = IERC20(tokenB).decimals();

        uint256 balA;
        uint256 balB;
        if (tokens[0] == tokenA) {
            balA = balances[0];
            balB = balances[1];
        } else if (tokens[1] == tokenA) {
            balA = balances[1];
            balB = balances[0];
        } else {
            revert BadPool();
        }

        // Assume 80/20 BW/stable or BW/WETH pools
        uint256 wA = tokenA == bwaezi ? 8e17 : 2e17;
        uint256 wB = tokenB == bwaezi ? 8e17 : 2e17;

        uint256 balANorm = balA * (10 ** (18 - decA));
        uint256 balBNorm = balB * (10 ** (18 - decB));

        uint256 ratio = (balBNorm * 1e18 / wB) * 1e18 / (balANorm * 1e18 / wA);

        if (tokenB == usdc) {
            price1e18 = ratio * 1e12; // USDC 6→1e18
        } else if (tokenB == weth) {
            uint256 ethUsd = _fetchEthUsdFresh();
            price1e18 = ratio * ethUsd / 1e18;
        } else {
            revert BadPool();
        }
    }

    /* ----------------------------- Quoting ----------------------------- */
    function _quoteExactInputV3(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint24  fee
    ) internal returns (uint256 amountOut) {
        (amountOut,,,) = IQuoterV2(quoter).quoteExactInputSingle(tokenIn, tokenOut, amountIn, fee, 0);
    }

    function _quoteExactInputV2(
        address router,
        address tokenIn,
        address tokenOut,
        uint256 amountIn
    ) internal view returns (uint256 amountOut) {
        address[] memory path = new address[](2);
        path[0] = tokenIn; path[1] = tokenOut;
        try IUniswapV2Router(router).getAmountsOut(amountIn, path) returns (uint256[] memory amounts) {
            if (amounts.length >= 2) return amounts[1];
            return 0;
        } catch { return 0; }
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
                deadline: block.timestamp + 300,
                amountIn: amountIn,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            })
        ) returns (uint256 outV3) {
            return outV3;
        } catch {
            // Fallback Uniswap V2
            address[] memory path = new address[](2);
            path[0] = tokenIn; path[1] = tokenOut;
            try IUniswapV2Router(uniV2Router).swapExactTokensForTokens(
                amountIn, minOut, path, address(this), block.timestamp + 300
            ) returns (uint256[] memory amounts) {
                return amounts[1];
            } catch {
                // Fallback Sushi
                try IUniswapV2Router(sushiRouter).swapExactTokensForTokens(
                    amountIn, minOut, path, address(this), block.timestamp + 300
                ) returns (uint256[] memory amounts2) {
                    return amounts2[1];
                } catch { return 0; }
            }
        }
    }

    /* ----------------------------- Dynamic internal pricing ----------------------------- */
    function _internalBuyPriceUSD1e18() internal returns (uint256) {
        uint256 spotUsdc = _balancerSpotPriceUSD(balBWUSDCId, bwaezi, usdc);
        uint256 oneUsdc = 1e6;
        uint256 bwOutV3 = _quoteExactInputV3(usdc, bwaezi, oneUsdc, bwUsdcFee);
        uint256 bwOutV2 = _quoteExactInputV2(uniV2Router, usdc, bwaezi, oneUsdc);
        uint256 bwOutSu = _quoteExactInputV2(sushiRouter, usdc, bwaezi, oneUsdc);
        uint256 bwOutAvg = (bwOutV3 + bwOutV2 + bwOutSu) / 3;
        if (bwOutAvg == 0) return spotUsdc;
        uint256 venuePrice = (oneUsdc * 1e12) * 1e18 / bwOutAvg; // USD per BW
        uint256 blended = (spotUsdc + venuePrice) / 2;
        return (blended * 9950) / 10000; // 0.5% discount
    }

    function _internalSellPriceUSD1e18(uint16 extraBps) internal returns (uint256) {
        uint256 spotUsdc = _balancerSpotPriceUSD(balBWUSDCId, bwaezi, usdc);
        uint256 oneBw = 1e18;
        uint256 usdcOutV3 = _quoteExactInputV3(bwaezi, usdc, oneBw, bwUsdcFee);
        uint256 usdcOutV2 = _quoteExactInputV2(uniV2Router, bwaezi, usdc, oneBw);
        uint256 usdcOutSu = _quoteExactInputV2(sushiRouter, bwaezi, usdc, oneBw);
        uint256 usdcOutAvg = (usdcOutV3 + usdcOutV2 + usdcOutSu) / 3;
        if (usdcOutAvg == 0) return spotUsdc;
        uint256 venuePrice = (usdcOutAvg * 1e12); // USD per BW
        uint256 blended = (spotUsdc + venuePrice) / 2;
        return blended * (10000 + extraBps) / 10000; // premium
    }

    function _checkBreaker(uint256 newPrice1e18) internal view {
        if (!breakerEnabled || !moduleEnabled[keccak256("CIRCUIT_BREAKER")]) return;
        if (lastPrice1e18 == 0) return;
        uint256 diff = newPrice1e18 > lastPrice1e18 ? (newPrice1e18 - lastPrice1e18) : (lastPrice1e18 - newPrice1e18);
        if (diff * 10000 / lastPrice1e18 > maxDeviationBps) revert CircuitBreak();
    }

    /* ----------------------------- Bundles ----------------------------- */
    function stageBundle(
        uint256 RbarUSD1e18,
        uint256 spreadUSD1e18,
        uint16  usdcShareBps,
        uint16  bwSellExtraBps
    ) external onlyOwner {
        if (usdcShareBps > 10000 || bwSellExtraBps > 30000) revert BadArgs();
        uint256 bundleId = nextBundleId++;
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
        if (!bundles[bundleId].active) revert Inactive();
        bundles[bundleId].active = false;
        emit BundleCancelled(bundleId);
    }

    /* ----------------------------- Kicks (MEV-hardened) ----------------------------- */
    function _kickBundleInternal(uint256 bundleId) internal {
        if (paused) revert Paused();
        BundleConfig memory cfg = bundles[bundleId];
        if (!cfg.active) revert Inactive();

        address[] memory tokens = new address[](2);
        tokens[0] = usdc; tokens[1] = weth;

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = _computeUsdcLoanSize(bundleId);
        amounts[1] = _computeWethLoanSize(bundleId);
        if (amounts[0] == 0 && amounts[1] == 0) revert ZeroLoan();

        bytes memory userData = abi.encode(bundleId);
        IBalancerVault(vault).flashLoan(address(this), tokens, amounts, userData);
        emit BundleKicked(bundleId);
    }

    function kickBundleSigned(
        uint256 bundleId,
        uint256 deadline,
        uint8 v, bytes32 r, bytes32 s
    ) external onlyOwner {
        if (paused) revert Paused();
        if (block.timestamp > deadline || deadline > block.timestamp + maxDeadline) revert Expired();
        if (!bundles[bundleId].active) revert Inactive();
        if (kickUsed[bundleId]) revert Used();

        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            keccak256(abi.encode(KICK_TYPEHASH, bundleId, deadline, kickNonce))
        ));
        address signer = ecrecover(digest, v, r, s);
        if (signer != owner && signer != scw) revert NotAuthorized();

        kickUsed[bundleId] = true;
        kickNonce++;

        _kickBundleInternal(bundleId);
    }

    function kickBundlesSigned(
        uint256[] calldata bundleIds,
        uint256 deadline,
        uint8 v, bytes32 r, bytes32 s
    ) external onlyOwner {
        if (paused) revert Paused();
        if (bundleIds.length > 3) revert BadArgs();
        if (block.timestamp > deadline || deadline > block.timestamp + maxDeadline) revert Expired();

        bytes32 idsHash = keccak256(abi.encodePacked(bundleIds));
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            keccak256(abi.encode(KICKBATCH_TYPEHASH, idsHash, deadline, kickNonce))
        ));
        address signer = ecrecover(digest, v, r, s);
        if (signer != owner && signer != scw) revert NotAuthorized();
        kickNonce++;

        for (uint256 i = 0; i < bundleIds.length; i++) {
            uint256 id = bundleIds[i];
            if (!bundles[id].active) revert Inactive();
            if (kickUsed[id]) revert Used();
            kickUsed[id] = true;
            _kickBundleInternal(id);
        }
        emit BatchedKick(bundleIds.length);
    }

    /* ----------------------------- Sizing ----------------------------- */
    function _computeUsdcLoanSize(uint256 bundleId) internal view returns (uint256) {
        BundleConfig memory cfg = bundles[bundleId];
        if (!cfg.active) revert Inactive();
        uint256 L1e18   = _loanSize(cfg.RbarUSD1e18, cfg.spreadUSD1e18);
        uint256 cap1e18 = _safeLeg(cfg.RbarUSD1e18);
        uint256 usdcUSD1e18 = L1e18 * cfg.usdcShareBps / 10000;
        if (usdcUSD1e18 > cap1e18) usdcUSD1e18 = cap1e18;
        uint8 usdcDec = IERC20(usdc).decimals();
        return usdcUSD1e18 / (10 ** (18 - usdcDec)); // USDC 6-dec
    }

    function _computeWethLoanSize(uint256 bundleId) internal view returns (uint256) {
        BundleConfig memory cfg = bundles[bundleId];
        if (!cfg.active) revert Inactive();
        uint256 L1e18   = _loanSize(cfg.RbarUSD1e18, cfg.spreadUSD1e18);
        uint256 cap1e18 = _safeLeg(cfg.RbarUSD1e18);
        uint256 usdcUSD1e18 = L1e18 * cfg.usdcShareBps / 10000;
        uint256 wethUSD1e18 = L1e18 - usdcUSD1e18;
        if (wethUSD1e18 > cap1e18) wethUSD1e18 = cap1e18;
        uint256 ethUsd1e18 = _fetchEthUsdFresh();
        uint8 wethDec = IERC20(weth).decimals();
        uint256 wethUnits1e18 = wethUSD1e18 * 1e18 / ethUsd1e18;
        return wethUnits1e18 / (10 ** (18 - wethDec)); // WETH 18-dec
    }

    /* ----------------------------- Spread inference ----------------------------- */
    function _spreadFromQuotes() internal returns (uint256 spread1e18) {
        uint256 oneUsdc = 1e6; // USDC 6 dec
        uint256 bwOut = _quoteExactInputV3(usdc, bwaezi, oneUsdc, bwUsdcFee);
        uint256 usdcBack = _quoteExactInputV3(bwaezi, usdc, bwOut, bwUsdcFee);
        if (usdcBack > oneUsdc) {
            spread1e18 = (usdcBack - oneUsdc) * 1e12;
        } else {
            spread1e18 = (oneUsdc - usdcBack) * 1e12;
        }
    }

    /* ----------------------------- Flash loan callback ----------------------------- */
    function receiveFlashLoan(
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata fees,
        bytes calldata userData
    ) external override nonReentrant {
        if (msg.sender != vault) revert BadArgs();
        if (tokens.length != 2 || amounts.length != 2 || fees.length != 2) revert BadArgs();
        if (!(tokens[0] == usdc && tokens[1] == weth)) revert BadArgs();

        uint256 bundleId = abi.decode(userData, (uint256));
        BundleConfig memory cfg = bundles[bundleId];
        if (!cfg.active) revert Inactive();
        if (paused) revert Paused();

        uint256 usdcIn  = amounts[0];
        uint256 wethIn  = amounts[1];
        uint256 usdcFee = fees[0];
        uint256 wethFee = fees[1];

        // Circuit breaker check using blended buy price
        uint256 buyPrice1e18  = _internalBuyPriceUSD1e18();
        _checkBreaker(buyPrice1e18);
        lastPrice1e18 = buyPrice1e18;

        // Compute BW needed for direct internal buy
        uint256 neededBwForUsdc = usdcIn > 0 ? (usdcIn * 1e12) * 1e18 / buyPrice1e18 : 0; // USDC 6→1e18
        uint256 ethUsd          = _fetchEthUsdFresh();
        uint256 neededBwForWeth = wethIn > 0 ? (wethIn * ethUsd) * 1e18 / buyPrice1e18 : 0;
        uint256 totalNeededBw   = neededBwForUsdc + neededBwForWeth;

        uint256 scwBwBal = BWZC.balanceOf(scw);
        uint256 bwBought = 0;

        if (scwBwBal >= totalNeededBw && totalNeededBw > 0) {
            BWZC.safeTransferFrom(scw, address(this), totalNeededBw);
            bwBought = totalNeededBw;
            emit InternalBuyLeg(totalNeededBw, usdcIn, wethIn);
        } else {
            uint256 pulled = 0;
            if (scwBwBal > 0) {
                BWZC.safeTransferFrom(scw, address(this), scwBwBal);
                pulled = scwBwBal;
                bwBought += scwBwBal;
            }

            // Fallback to pools for remaining legs
            uint256 eps = epsilonBps;

            if (usdcIn > 0) {
                uint256 outV3 = _quoteExactInputV3(usdc, bwaezi, usdcIn, bwUsdcFee);
                uint256 outV2 = _quoteExactInputV2(uniV2Router, usdc, bwaezi, usdcIn);
                uint256 outSu = _quoteExactInputV2(sushiRouter, usdc, bwaezi, usdcIn);
                uint256 best  = _max3(outV3, outV2, outSu);
                if (best == 0) revert NoQuote();
                uint256 minOut = best * (10000 - eps) / 10000;
                bwBought      += _swapBestIn(usdc, bwaezi, usdcIn, minOut, bwUsdcFee);
            }
            if (wethIn > 0) {
                uint256 outV3 = _quoteExactInputV3(weth, bwaezi, wethIn, bwWethFee);
                uint256 outV2 = _quoteExactInputV2(uniV2Router, weth, bwaezi, wethIn);
                uint256 outSu = _quoteExactInputV2(sushiRouter, weth, bwaezi, wethIn);
                uint256 best  = _max3(outV3, outV2, outSu);
                if (best == 0) revert NoQuote();
                uint256 minOut = best * (10000 - eps) / 10000;
                bwBought      += _swapBestIn(weth, bwaezi, wethIn, minOut, bwWethFee);
            }
            emit PartialInternalBuy(pulled, bwBought > pulled ? (bwBought - pulled) : 0);
        }

        // SELL leg: direct to SCW (SCW buys back BWAEZI at internal ask)
        if (bwBought > 0) {
            uint256 sellPrice1e18 = _internalSellPriceUSD1e18(cfg.bwSellExtraBps);
            BWZC.safeTransfer(scw, bwBought);
            uint256 stablesValue1e18 = (bwBought * sellPrice1e18) / 1e18;
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

        // Reinvest drip at checkpoint
        if (moduleEnabled[keccak256("REINVEST")] && (cycleCount % checkpointPeriod == 0)) {
            _reinvestDrip();
        }

        // Paymaster draw if needed
        if (moduleEnabled[keccak256("PAYMASTER_TOPUP")]) {
            _maybeTopEntryPoint();
        }
    }

    /* ----------------------------- Reinvest drip (compact best-effort) ----------------------------- */
    function _v2Add(address router, address a, address b, uint256 amtA, uint256 amtB) internal {
        IERC20(a).safeApprove(router, amtA);
        IERC20(b).safeApprove(router, amtB);
        try IUniswapV2Router(router).addLiquidity(a, b, amtA, amtB, amtA * 99 / 100, amtB * 99 / 100, address(this), block.timestamp + 600) {} catch {}
    }

    function _v3Mint(address t0, address t1, uint24 fee, int24 lower, int24 upper, uint256 amt0, uint256 amt1) internal {
        IERC20(t0).safeApprove(positionManager, amt0);
        IERC20(t1).safeApprove(positionManager, amt1);
        try INonfungiblePositionManager(positionManager).mint(
            INonfungiblePositionManager.MintParams({
                token0: t0,
                token1: t1,
                fee: fee,
                tickLower: lower,
                tickUpper: upper,
                amount0Desired: amt0,
                amount1Desired: amt1,
                amount0Min: amt0 * 99 / 100,
                amount1Min: amt1 * 99 / 100,
                recipient: address(this),
                deadline: block.timestamp + 600
            })
        ) {} catch {}
    }

    function _balJoin(bytes32 poolId, address a, address b, uint256 amtA, uint256 amtB) internal {
        (address[] memory tokens, ,) = IBalancerVault(vault).getPoolTokens(poolId);
        address[] memory assets = new address[](2);
        uint256[] memory maxIn = new uint256[](2);
        if (tokens[0] == a) {
            assets[0] = a; assets[1] = b;
            maxIn[0] = amtA; maxIn[1] = amtB;
        } else {
            assets[0] = b; assets[1] = a;
            maxIn[0] = amtB; maxIn[1] = amtA;
        }
        bytes memory userData = abi.encode(uint8(1), maxIn, 0);
        IERC20(a).safeApprove(vault, amtA);
        IERC20(b).safeApprove(vault, amtB);
        IBalancerVault.JoinPoolRequest memory req = IBalancerVault.JoinPoolRequest({
            assets: assets,
            maxAmountsIn: maxIn,
            userData: userData,
            fromInternalBalance: false
        });
        try IBalancerVault(vault).joinPool(poolId, address(this), address(this), req) {} catch {}
    }

    function _reinvestDrip() internal {
        // Simple ratio from spread; if spread unavailable, use mid ratio
        uint256 spread1e18 = _spreadFromQuotes();
        uint256 r = _reinvestRatio(spread1e18);

        uint256 scwUsdc = IERC20(usdc).balanceOf(scw);
        uint256 scwWeth = IERC20(weth).balanceOf(scw);
        uint256 scwBw   = BWZC.balanceOf(scw);

        uint256 usdcDeposit = scwUsdc * r / 1e18;
        uint256 wethDeposit = scwWeth * r / 1e18;
        uint256 bwDeposit   = scwBw   * r / 1e18;

        if (usdcDeposit > 0) IERC20(usdc).safeTransferFrom(scw, address(this), usdcDeposit);
        if (wethDeposit > 0) IERC20(weth).safeTransferFrom(scw, address(this), wethDeposit);
        if (bwDeposit   > 0) BWZC.safeTransferFrom(scw, address(this), bwDeposit);

        // Split across 8 venues (best-effort, equal splits)
        uint256 uSplit = usdcDeposit / 3;
        uint256 wSplit = wethDeposit / 3;
        uint256 bSplit = bwDeposit   / 4;

        if (uSplit > 0 && bSplit > 0) {
            _v2Add(uniV2Router, usdc, bwaezi, uSplit, bSplit);
            _v2Add(sushiRouter, usdc, bwaezi, uSplit, bSplit);
            _v3Mint(usdc, bwaezi, bwUsdcFee, -887220, 887220, uSplit, bSplit);
            _balJoin(balBWUSDCId, usdc, bwaezi, uSplit, bSplit);
        }
        if (wSplit > 0 && bSplit > 0) {
            _v2Add(uniV2Router, weth, bwaezi, wSplit, bSplit);
            _v2Add(sushiRouter, weth, bwaezi, wSplit, bSplit);
            _v3Mint(weth, bwaezi, bwWethFee, -887220, 887220, wSplit, bSplit);
            _balJoin(balBWWETHId, weth, bwaezi, wSplit, bSplit);
        }

        emit Reinvested(r * 10000 / 1e18, usdcDeposit, wethDeposit);
    }

    /* ----------------------------- Paymaster top-up (dual) ----------------------------- */
    function _maybeTopEntryPoint() internal {
        address pm = activePaymaster == 0 ? paymasterA : paymasterB;
        uint256 dep = IEntryPoint(entryPoint).balanceOf(pm);
        if (dep >= targetDepositWei) return;

        uint256 scwWeth = IERC20(weth).balanceOf(scw);
        if (scwWeth == 0) return;

        uint256 draw = scwWeth * paymasterDrawBps / 10000;
        if (draw == 0) return;

        IERC20(weth).safeTransferFrom(scw, address(this), draw);
        IWETH(weth).withdraw(draw);
        IEntryPoint(entryPoint).depositTo{value: draw}(pm);

        emit PaymasterTopped(pm, draw, IEntryPoint(entryPoint).balanceOf(pm));
    }

    /* ----------------------------- Treasury & rescues ----------------------------- */
    function withdrawToken(address token, uint256 amount) external onlyOwner nonReentrant {
        IERC20(token).safeTransfer(owner, amount);
        emit ERC20Withdrawn(token, amount);
    }

    function emergencyWithdrawETH(uint256 amount) external onlyOwner nonReentrant {
        (bool s,) = payable(owner).call{value: amount}("");
        if (!s) revert BadArgs();
        emit ETHWithdrawn(amount);
    }

    function emergencyUnwrapWETH(uint256 amount) external onlyOwner nonReentrant {
        IWETH(weth).withdraw(amount);
        (bool s,) = payable(owner).call{value: amount}("");
        if (!s) revert BadArgs();
        emit ETHWithdrawn(amount);
    }

    function emergencyPause() external onlyOwner {
        paused = true;
        emit PausedSet(true);
    }

    function rescueERC721(address nft, uint256 id, address to) external onlyOwner nonReentrant {
        IERC721(nft).transferFrom(address(this), to, id);
        emit ERC721Rescued(nft, id);
    }

    function rescueERC1155(address t, uint256 id, uint256 a, address to, bytes calldata d) external onlyOwner nonReentrant {
        IERC1155(t).safeTransferFrom(address(this), to, id, a, d);
        emit ERC1155Rescued(t, id, a);
    }

    receive() external payable {}
}
