// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*
  MEV v17 — Warehouse‑centric arbitrage engine
  - Balancer Vault flash loans (USDC, WETH) for buy legs.
  - SCW warehouse inventory for sell legs (BWAEZI).
  - Adaptive sizing (loan sizing, safe caps, reinvest ratio).
  - MinOut enforcement with epsilon slippage buffer.
  - Live ETH/USD via Chainlink for WETH normalization.
  - Paymaster-aware top-ups (BW->WETH->ETH) when EntryPoint deposit is low.
  - Multi‑venue routing: Uniswap V3 (primary), Uniswap V2, SushiSwap, Balancer pools (addresses wired).
  - Parallel bundle orchestration: stage multiple bundle configs and kick them independently—submit 2–4 private bundles per block via off-chain private relays.
  - Privacy-first: no external bundler dependencies; SCW wired directly to paymaster/EntryPoint.
  - Modification hooks: enable/disable modules, add/replace strategy handlers, and guardrails.

  Notes:
  - “Parallel bundles” are achieved off-chain by submitting separate private transactions concurrently; on-chain execution is sequential per transaction.
  - This contract exposes per-bundle kick functions and a batched kick that emits distinct bundle IDs for off-chain parallel submission.
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
    function quoteExactOutputSingle(
        address tokenIn,
        address tokenOut,
        uint256 amountOut,
        uint24  fee,
        uint160 sqrtPriceLimitX96
    ) external returns (uint256 amountIn, uint160, uint32, uint256);
}

interface IChainlinkFeed {
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

/* ---------------- Balancer Vault flash loan ---------------- */
interface IBalancerVault {
    enum SwapKind { GIVEN_IN, GIVEN_OUT }
    function flashLoan(address recipient, address[] calldata tokens, uint256[] calldata amounts, bytes calldata userData) external;
}

interface IFlashLoanRecipient {
    function receiveFlashLoan(address[] calldata tokens, uint256[] calldata amounts, uint256[] calldata fees, bytes calldata userData) external;
}

/* ---------------- Uniswap V2 / SushiSwap ---------------- */
interface IUniswapV2Router {
    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts);
    function swapExactTokensForTokens(
        uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline
    ) external returns (uint256[] memory amounts);
}

/* ---------------- Library ---------------- */
library SafeERC20 {
    function safeApprove(IERC20 t, address s, uint256 v) internal {
        require(t.approve(s, v), "approve fail");
    }
    function safeTransfer(IERC20 t, address to, uint256 v) internal {
        require(t.transfer(to, v), "transfer fail");
    }
    function safeTransferFrom(IERC20 t, address f, address to, uint256 v) internal {
        require(t.transferFrom(f, to, v), "transferFrom fail");
    }
}

/* ---------------- Main contract ---------------- */
contract WarehouseBalancerArb is IFlashLoanRecipient {
    using SafeERC20 for IERC20;

    /* Core addresses */
    address public owner;
    address public immutable scw;            // Smart Contract Wallet (warehouse)
    address public immutable vault;          // Balancer Vault
    address public immutable bwaezi;         // BWAEZI token
    address public immutable usdc;           // USDC
    address public immutable weth;           // WETH
    address public immutable uniV3Router;    // Uniswap V3 Router
    address public immutable uniV2Router;    // Uniswap V2 Router
    address public immutable sushiRouter;    // SushiSwap Router
    address public immutable quoter;         // Uniswap QuoterV2
    address public immutable entryPoint;     // EntryPoint for paymaster deposit
    address public immutable chainlinkEthUsd;// Chainlink ETH/USD feed

    /* Venue pool wiring (addresses from logs) */
    // Uniswap V3 pools (fee 3000)
    address public immutable uniV3BWUSDC;    // 0x261c64d4d96EBfa14398B52D93C9d063E3a619f8
    address public immutable uniV3BWWETH;    // 0x142C3dce0a5605Fb385fAe7760302fab761022aa
    // Uniswap V2 pairs
    address public immutable uniV2BWUSDC;    // 0xb3911905f8a6160eF89391442f85ecA7c397859c
    address public immutable uniV2BWWETH;    // 0x6dF6F882ED69918349F75Fe397b37e62C04515b6
    // SushiSwap pairs
    address public immutable sushiBWUSDC;    // 0x9d2f8F9A2E3C240dECbbE23e9B3521E6ca2489D1
    address public immutable sushiBWWETH;    // 0xE9E62C8Cc585C21Fb05fd82Fb68e0129711869f9
    // Balancer weighted pools (80/20, 0.3% fee)
    address public immutable balBWUSDC;      // 0x6659Db7c55c701bC627fA2855BFBBC6D75D6fD7A
    address public immutable balBWWETH;      // 0x9B143788f52Daa8C91cf5162fb1b981663a8a1eF

    /* Execution config */
    uint24  public bwUsdcFee;      // V3 fee, e.g., 3000
    uint24  public bwWethFee;      // V3 fee, e.g., 3000
    uint256 public epsilonBps;     // minOut buffer, e.g., 30 = 0.30%
    uint256 public maxDeadline;    // sec, e.g., 1800
    bool    public paused;

    /* Adaptive sizing params (1e18 fixed-point) */
    uint256 public alpha;          // base scaling multiplier (e.g., 5e18)
    uint256 public beta;           // spread throttle (e.g., 8e17)
    uint256 public gamma;          // safe leg baseline (e.g., 2e16)
    uint256 public kappa;          // curvature (e.g., 3e16)

    /* Reinvestment and paymaster */
    uint256 public rMin;           // min reinvest ratio (e.g., 1e17 = 0.10)
    uint256 public rMax;           // max reinvest ratio (e.g., 35e16 = 0.35)
    uint256 public lambda_;        // sensitivity to spread (e.g., 1e17)
    uint256 public paymasterDrawBps;// e.g., 300 = 3%
    uint256 public targetDepositWei;// e.g., 3e17 (0.3 ETH)

    /* State tracking */
    uint256 public cycleCount;
    uint256 public checkpointPeriod; // e.g., 40 cycles
    uint256 public lastEthUsd;       // cached ETH/USD (normalized to 1e18)
    uint256 public ethUsdDecimals;   // 1e8 -> normalized to 1e18

    /* Parallel bundle orchestration */
    struct BundleConfig {
        uint256 RbarUSD1e18;     // average paired reserve per pool (USD normalized)
        uint256 spreadUSD1e18;   // normalized spread (USD)
        uint16  usdcShareBps;    // % of loan to USDC leg
        uint16  bwSellExtraBps;  // % extra BW from SCW to sell
        uint256 createdAt;       // timestamp
        bool    active;
    }
    uint256 public nextBundleId;
    mapping(uint256 => BundleConfig) public bundles;

    /* Module toggles and hooks */
    mapping(bytes32 => bool) public moduleEnabled; // e.g., keccak256("REINVEST"), "PAYMASTER_TOPUP"
    mapping(bytes32 => address) public strategyHandler; // optional external strategy handler contracts

    /* Events */
    event OwnerChanged(address indexed newOwner);
    event Paused(bool status);
    event ConfigUpdated();
    event AdaptiveParamsUpdated();
    event CycleExecuted(uint256 bundleId, uint256 usdcLoan, uint256 wethLoan, uint256 bwSold, uint256 usdcProfit, uint256 wethProfit);
    event Reinvested(uint256 rBps, uint256 usdcIntoPools, uint256 wethIntoPools);
    event PaymasterTopped(uint256 ethAdded, uint256 newBalance);
    event BundleStaged(uint256 bundleId, BundleConfig cfg);
    event BundleCancelled(uint256 bundleId);
    event ModuleToggled(bytes32 module, bool enabled);
    event StrategyHandlerSet(bytes32 key, address handler);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

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
        // Pools wiring
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
        epsilonBps        = 30;         // 0.30%
        maxDeadline       = 1800;       // 30 min
        paused            = false;

        alpha             = 5e18;       // 5
        beta              = 8e17;       // 0.8
        gamma             = 2e16;       // 0.02
        kappa             = 3e16;       // 0.03

        rMin              = 1e17;       // 0.10
        rMax              = 35e16;      // 0.35
        lambda_           = 1e17;       // 0.10-ish
        paymasterDrawBps  = 300;        // 3%
        targetDepositWei  = 3e17;       // 0.3 ETH

        checkpointPeriod  = 40;
        ethUsdDecimals    = 1e8;

        nextBundleId      = 1;

        // Pre-approve routers for warehouse tokens (best-effort)
        IERC20(bwaezi).approve(uniV3Router, type(uint256).max);
        IERC20(usdc).approve(uniV3Router, type(uint256).max);
        IERC20(weth).approve(uniV3Router, type(uint256).max);

        IERC20(bwaezi).approve(uniV2Router, type(uint256).max);
        IERC20(usdc).approve(uniV2Router, type(uint256).max);
        IERC20(weth).approve(uniV2Router, type(uint256).max);

        IERC20(bwaezi).approve(sushiRouter, type(uint256).max);
        IERC20(usdc).approve(sushiRouter, type(uint256).max);
        IERC20(weth).approve(sushiRouter, type(uint256).max);

        // Default modules enabled
        moduleEnabled[keccak256("REINVEST")] = true;
        moduleEnabled[keccak256("PAYMASTER_TOPUP")] = true;
    }

    /* ---------------- Admin ---------------- */
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

    /* ---------------- Module toggles and strategy hooks ---------------- */
    function toggleModule(bytes32 key, bool enabled) external onlyOwner {
        moduleEnabled[key] = enabled;
        emit ModuleToggled(key, enabled);
    }

    function setStrategyHandler(bytes32 key, address handler) external onlyOwner {
        strategyHandler[key] = handler;
        emit StrategyHandlerSet(key, handler);
    }

    /* ---------------- Live ETH/USD ---------------- */
    function _fetchEthUsd() internal view returns (uint256 price1e18) {
        (, int256 ans,,,) = IChainlinkFeed(chainlinkEthUsd).latestRoundData();
        require(ans > 0, "bad price");
        price1e18 = uint256(ans) * 1e10; // 8-dec -> 18-dec
    }

    /* ---------------- Sizing helpers ---------------- */
    // safe_leg ≈ gamma * Rbar * min(1, kappa*Rbar)
    function _safeLeg(uint256 Rbar1e18) internal view returns (uint256) {
        uint256 curvature = kappa * Rbar1e18 / 1e18;
        if (curvature > 1e18) curvature = 1e18;
        return gamma * Rbar1e18 / 1e18 * curvature / 1e18; // USD 1e18
    }

    function _loanSize(uint256 Rbar1e18, uint256 spread1e18) internal view returns (uint256) {
        uint256 aTerm = alpha * Rbar1e18 / 1e18;
        uint256 bTerm = beta * spread1e18 / 1e18 * Rbar1e18 / 1e18;
        return aTerm < bTerm ? aTerm : bTerm; // USD 1e18
    }

    function _reinvestRatio(uint256 spread1e18) internal view returns (uint256) {
        uint256 x = lambda_ * spread1e18 / 1e18;
        uint256 frac = x * 1e18 / (1e18 + x); // in 1e18
        return rMin + (rMax - rMin) * frac / 1e18;
    }

    /* ---------------- Bundle staging (for parallel private bundles) ---------------- */
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

    /* ---------------- Public kick: initiate single bundle cycle ---------------- */
    function kickBundle(uint256 bundleId) public onlyOwner {
        require(!paused, "paused");
        BundleConfig memory cfg = bundles[bundleId];
        require(cfg.active, "bundle inactive");

        // Optional external strategy handler override
        address handler = strategyHandler[keccak256("KICK")];
        if (handler != address(0)) {
            (bool ok,) = handler.delegatecall(abi.encodeWithSignature("onKick(uint256)", bundleId));
            require(ok, "handler kick fail");
        }

        // Compute loan size (USD 1e18) and per-leg safe caps
        uint256 L1e18   = _loanSize(cfg.RbarUSD1e18, cfg.spreadUSD1e18);
        uint256 cap1e18 = _safeLeg(cfg.RbarUSD1e18);

        // Split loan between USDC and WETH (USD units)
        uint256 usdcUSD1e18 = L1e18 * cfg.usdcShareBps / 10000;
        uint256 wethUSD1e18 = L1e18 - usdcUSD1e18;

        // Enforce per-leg caps
        if (usdcUSD1e18 > cap1e18) usdcUSD1e18 = cap1e18;
        if (wethUSD1e18 > cap1e18) wethUSD1e18 = cap1e18;

        // Convert USD (1e18) to token amounts
        uint256 ethUsd1e18 = _fetchEthUsd(); // live reference
        lastEthUsd = ethUsd1e18;

        uint8 usdcDec = IERC20(usdc).decimals();
        uint8 wethDec = IERC20(weth).decimals();

        // USD -> USDC
        uint256 usdcLoan = usdcUSD1e18 / (10 ** (18 - usdcDec)); // USDC has 6 decimals
        // USD -> WETH (USD/WETH)
        uint256 wethUnits1e18 = wethUSD1e18 * 1e18 / ethUsd1e18; // WETH amount (1e18)
        uint256 wethLoan = wethUnits1e18 / (10 ** (18 - wethDec));

        // Prepare balancer flash loan
        address[] memory tokens = new address[](2);
        tokens[0] = usdc;
        tokens[1] = weth;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = usdcLoan;
        amounts[1] = wethLoan;

        bytes memory userData = abi.encode(
            bundleId,
            cfg.bwSellExtraBps,
            ethUsd1e18,
            block.timestamp + maxDeadline,
            usdcUSD1e18,
            wethUSD1e18
        );

        IBalancerVault(vault).flashLoan(address(this), tokens, amounts, userData);
    }



/* ---------------- Secure kick functions - permanent fix (restricted + private submission safe) ---------------- */
event BundleKicked(uint256 indexed bundleId);
event BatchedKick(uint256 count);

modifier onlyOwnerOrSCW() {
    require(msg.sender == owner || msg.sender == scw, "not owner/scw");
    _;
}

function kickBundle(uint256 bundleId) external onlyOwnerOrSCW {
    require(!paused, "paused");

    // Encode userData with bundleId + any params you need (adapt from your config)
    bytes memory userData = abi.encode(bundleId);

    // Dual flash loan - use your adaptive sizing (replace with your real computation)
    address[] memory tokens = new address[](2);
    tokens[0] = usdc;
    tokens[1] = weth;

    uint256[] memory amounts = new uint256[](2);
    amounts[0] = _computeUsdcLoanSize(bundleId);  // Your adaptive USDC size
    amounts[1] = _computeWethLoanSize(bundleId);  // Your adaptive WETH size

    require(amounts[0] > 0 || amounts[1] > 0, "zero loan");

    IBalancerVault(vault).flashLoan(IFlashLoanRecipient(address(this)), tokens, amounts, userData);

    emit BundleKicked(bundleId);
}

function kickBundles(uint256[] calldata bundleIds) external onlyOwnerOrSCW {
    require(!paused, "paused");
    require(bundleIds.length <= 4, "batch too large");  // Safe gas limit for sequential on-chain

    for (uint256 i = 0; i < bundleIds.length; i++) {
        kickBundle(bundleIds[i]);
    }

    emit BatchedKick(bundleIds.length);
}

/* ---------------- Flash loan callback - upgraded with SCW as full internal counterparty ---------------- */
function receiveFlashLoan(
    address[] calldata tokens,
    uint256[] calldata amounts,
    uint256[] calldata fees,
    bytes calldata userData
) external override {
    require(msg.sender == vault, "only vault");
    require(tokens.length == 2 && amounts.length == 2 && fees.length == 2, "bad len");
    require(tokens[0] == usdc && tokens[1] == weth, "bad assets");

    (
        uint256 bundleId,
        uint16 bwSellExtraBps,
        uint256 ethUsd1e18,
        uint256 deadline,
        uint256 usdcUSD1e18,
        uint256 wethUSD1e18
    ) = abi.decode(userData, (uint256, uint16, uint256, uint256, uint256, uint256));
    require(block.timestamp <= deadline, "deadline");

    uint256 usdcIn = amounts[0];
    uint256 wethIn = amounts[1];
    uint256 usdcFee = fees[0];
    uint256 wethFee = fees[1];

    // Internal bid/ask prices (adapt your spread/oracle logic)
    uint256 bid1e18 = _getInternalBidPrice1e18();   // Slightly below avg pool
    uint256 ask1e18 = _getInternalAskPrice1e18();   // Slightly above avg pool

    // === BUY LEG: stables → BWAEZI (SCW direct first, fallback to pools) ===
    uint256 totalBwBought = 0;
    uint256 neededBwUsdc = usdcIn * 1e12 / bid1e18;
    uint256 neededBwWeth = wethIn * ethUsd1e18 / bid1e18;
    uint256 totalNeededBw = neededBwUsdc + neededBwWeth;

    uint256 scwBwBal = IERC20(bwaezi).balanceOf(scw);

    if (scwBwBal >= totalNeededBw) {
        IERC20(bwaezi).safeTransferFrom(scw, address(this), totalNeededBw);
        totalBwBought = totalNeededBw;
        emit InternalBuyLeg(totalNeededBw, usdcIn, wethIn);
    } else {
        if (scwBwBal > 0) {
            IERC20(bwaezi).safeTransferFrom(scw, address(this), scwBwBal);
            totalBwBought += scwBwBal;
        }
        if (usdcIn > 0) {
            uint256 usdcBwOut = _max3(
                _quoteExactInputV3(usdc, bwaezi, usdcIn, bwUsdcFee),
                _quoteExactInputV2(uniV2Router, usdc, bwaezi, usdcIn),
                _quoteExactInputV2(sushiRouter, usdc, bwaezi, usdcIn)
            );
            uint256 usdcMinOut = usdcBwOut * (10000 - epsilonBps) / 10000;
            totalBwBought += _swapBestIn(usdc, bwaezi, usdcIn, usdcMinOut, bwUsdcFee);
        }
        if (wethIn > 0) {
            uint256 wethBwOut = _max3(
                _quoteExactInputV3(weth, bwaezi, wethIn, bwWethFee),
                _quoteExactInputV2(uniV2Router, weth, bwaezi, wethIn),
                _quoteExactInputV2(sushiRouter, weth, bwaezi, wethIn)
            );
            uint256 wethMinOut = wethBwOut * (10000 - epsilonBps) / 10000;
            totalBwBought += _swapBestIn(weth, bwaezi, wethIn, wethMinOut, bwWethFee);
        }
    }

    // === SELL LEG: BWAEZI → stables (SCW direct first) ===
    uint256 extraBW = totalBwBought * bwSellExtraBps / 10000;
    uint256 bwToSell = totalBwBought + extraBW;
    IERC20(bwaezi).safeTransfer(scw, bwToSell);
    emit InternalSellLeg(bwToSell, bwToSell * ask1e18 / 1e18);

    // Repay flash loans
    IERC20(usdc).safeTransfer(vault, usdcIn + usdcFee);
    IERC20(weth).safeTransfer(vault, wethIn + wethFee);

    // Residual profits to SCW
    uint256 residualUsdc = IERC20(usdc).balanceOf(address(this));
    uint256 residualWeth = IERC20(weth).balanceOf(address(this));
    if (residualUsdc > 0) IERC20(usdc).safeTransfer(scw, residualUsdc);
    if (residualWeth > 0) IERC20(weth).safeTransfer(scw, residualWeth);

    _maybeTopEntryPoint(ethUsd1e18);

    cycleCount += 1;
    emit CycleExecuted(bundleId, usdcIn, wethIn, bwToSell, residualUsdc, residualWeth);

    if (cycleCount % checkpointPeriod == 0) {
        _reinvestDrip(usdcUSD1e18, wethUSD1e18, ethUsd1e18, spreadFromQuotes());
    }
}



    // === SELL LEG: BWAEZI → stables (primary: direct to SCW) ===
    uint256 extraBW = totalBwBought * bwSellExtraBps / 10000;
    uint256 bwToSell = totalBwBought + extraBW;

    // Direct: SCW accepts BWAEZI at ask price (profit stays as residuals)
    IERC20(bwaezi).safeTransfer(scw, bwToSell);

    emit InternalSellLeg(bwToSell, bwToSell * ask1e18 / 1e18);  // accounting value

    // Optional fallback sell to pools if better (rare in self-skew)

    // === Repay flash loans ===
    IERC20(usdc).safeTransfer(vault, usdcIn + usdcFee);
    IERC20(weth).safeTransfer(vault, wethIn + wethFee);

    // Accrue residuals (profit) to SCW
    uint256 residualUsdc = IERC20(usdc).balanceOf(address(this));
    uint256 residualWeth = IERC20(weth).balanceOf(address(this));
    if (residualUsdc > 0) IERC20(usdc).safeTransfer(scw, residualUsdc);
    if (residualWeth > 0) IERC20(weth).safeTransfer(scw, residualWeth);

    // Your original post-cycle logic
    _maybeTopEntryPoint(ethUsd1e18);

    cycleCount += 1;
    emit CycleExecuted(bundleId, usdcIn, wethIn, bwToSell, residualUsdc, residualWeth);

    if (cycleCount % checkpointPeriod == 0) {
        _reinvestDrip(usdcUSD1e18, wethUSD1e18, ethUsd1e18, spreadFromQuotes());
    }
}


        // SELL-HIGH leg: use SCW inventory to sell at priciest venue (BW->USDC)
        uint256 scwAllowance = IERC20(bwaezi).allowance(scw, address(this));
        uint256 scwBalBW     = IERC20(bwaezi).balanceOf(scw);
        uint256 extraBW      = bwBought * bwSellExtraBps / 10000;
        if (extraBW > scwBalBW) extraBW = scwBalBW;
        if (extraBW > scwAllowance) extraBW = scwAllowance;
        if (extraBW > 0) {
            IERC20(bwaezi).safeTransferFrom(scw, address(this), extraBW);
        }
        uint256 bwToSell = bwBought + extraBW;

        // BW -> USDC best-of venues
        uint256 bwUsdcOutV3 = _quoteExactInputV3(bwaezi, usdc, bwToSell, bwUsdcFee);
        uint256 bwUsdcOutV2 = _quoteExactInputV2(uniV2Router, bwaezi, usdc, bwToSell);
        uint256 bwUsdcOutSu = _quoteExactInputV2(sushiRouter, bwaezi, usdc, bwToSell);

        uint256 usdcOutQuote = _max3(bwUsdcOutV3, bwUsdcOutV2, bwUsdcOutSu);
        uint256 usdcMinOutSell = usdcOutQuote * (10000 - eps) / 10000;

        uint256 usdcOut = _swapBestIn(bwaezi, usdc, bwToSell, usdcMinOutSell, bwUsdcFee);

        // Repay flash loans
        IERC20(usdc).safeTransfer(vault, usdcIn + usdcFee);
        IERC20(weth).safeTransfer(vault, wethIn + wethFee);

        // Profit accounting (residuals in this contract)
        uint256 usdcProfit = 0;
        if (usdcOut > (usdcIn + usdcFee)) {
            usdcProfit = usdcOut - usdcIn - usdcFee;
        }

        // Accrue residuals to SCW
        if (usdcProfit > 0) {
            IERC20(usdc).safeTransfer(scw, usdcProfit);
        }

        // Paymaster draw if needed (BW->WETH->ETH)
        if (moduleEnabled[keccak256("PAYMASTER_TOPUP")]) {
            _maybeTopEntryPoint(ethUsd1e18);
        }

        cycleCount += 1;
        emit CycleExecuted(bundleId, usdcIn, wethIn, bwToSell, usdcProfit, 0);

        // Reinvestment drip at checkpoint
        if (moduleEnabled[keccak256("REINVEST")] && (cycleCount % checkpointPeriod == 0)) {
            _reinvestDrip(usdcUSD1e18, wethUSD1e18, ethUsd1e18, spreadFromQuotes());
        }
    }

    /* ---------------- Quoting helpers ---------------- */
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
        // Default to Uniswap V3; fallback to V2/Sushi if V3 fails
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
            // fallback to V2 router
            address[] memory path = new address[](2);
            path[0] = tokenIn;
            path[1] = tokenOut;
            try IUniswapV2Router(uniV2Router).swapExactTokensForTokens(
                amountIn, minOut, path, address(this), block.timestamp + 600
            ) returns (uint256[] memory amounts) {
                return amounts[1];
            } catch {
                // fallback to Sushi router
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

    /* ---------------- Spread inference ---------------- */
    function spreadFromQuotes() internal returns (uint256 spread1e18) {
        uint256 oneUsdc = 1e6; // USDC 6 dec
        uint256 bwOut = _quoteExactInputV3(usdc, bwaezi, oneUsdc, bwUsdcFee);
        uint256 usdcBack = _quoteExactInputV3(bwaezi, usdc, bwOut, bwUsdcFee);
        if (usdcBack > oneUsdc) {
            spread1e18 = (usdcBack - oneUsdc) * 1e12;
        } else {
            spread1e18 = (oneUsdc - usdcBack) * 1e12;
        }
    }

    /* ---------------- Reinvestment drip ---------------- */
    function _reinvestDrip(
        uint256 usdcUSD1e18,
        uint256 wethUSD1e18,
        uint256 /* ethUsd1e18 */,
        uint256 spread1e18
    ) internal {
        uint256 r = _reinvestRatio(spread1e18);
        uint256 scwUsdc = IERC20(usdc).balanceOf(scw);
        uint256 scwWeth = IERC20(weth).balanceOf(scw);

        uint256 usdcDeposit = scwUsdc * r / 1e18;
        uint256 wethDeposit = scwWeth * r / 1e18;

        if (usdcDeposit > 0) {
            IERC20(usdc).safeTransferFrom(scw, address(this), usdcDeposit);
        }
        if (wethDeposit > 0) {
            IERC20(weth).safeTransferFrom(scw, address(this), wethDeposit);
        }

        emit Reinvested(r * 10000 / 1e18, usdcDeposit, wethDeposit);
    }

    /* ---------------- Paymaster top-up ---------------- */
    function _maybeTopEntryPoint(uint256 /* ethUsd1e18 */) internal {
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

    /* ---------------- Treasury ---------------- */
    function withdrawToken(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner, amount);
    }

    function emergencyPause() external onlyOwner {
        paused = true;
        emit Paused(true);
    }

    receive() external payable {}
}
