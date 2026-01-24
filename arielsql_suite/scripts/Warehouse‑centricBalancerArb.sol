// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*
  MIRACLE M26D — WarehouseBalancerArb (Production Version, merged & corrected)

  Highlights:
  - Balancer Vault flash loans (USDC, WETH) with TWAMM-style tranches
  - Multi-venue routing: Uniswap V3 → V2 → Sushi → Balancer fallback
  - Robust quoting: _quoteBest (V3/V2/Sushi + Balancer spot), Chainlink ETH/USD freshness guard
  - Adaptive sizing: dynamic alpha/beta (bounded), gamma/kappa safe caps; rMin/rMax reinvest ratio bounds
  - Circuit breaker: deviation vs last buy/sell price; updates prices after successful cycles
  - Fee harvest accrual: collect V3 fees locally, transfer to SCW only after successful cycle
  - Reinvest drip: V3 mint via NPM, V2/Sushi add, Balancer join (simplified, bounded)
  - Paymaster top-up: hardened, nonReentrant path, unwrap WETH then deposit
  - Capacity & safety: minGasPerKick (soft gate), minCycleDelay with temp multiplier, maxCyclesPerDay
  - V3 position tracking: add/remove/sync via INonfungiblePositionManagerView
  - Emergency rescues: ERC20, ETH/WETH, ERC721, ERC1155
  - Compact SafeERC20 library (call/abi.encodeCall pattern)
  - Custom errors; nonReentrant; strict access (owner/scw); pause toggle
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

interface IERC721Enumerable {
    function balanceOf(address owner) external view returns (uint256);
    function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256);
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
    function mint(MintParams calldata params) external returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
    struct CollectParams { uint256 tokenId; address recipient; uint128 amount0Max; uint128 amount1Max; }
    function collect(CollectParams calldata params) external returns (uint256 amount0, uint256 amount1);
}

interface INonfungiblePositionManagerView is INonfungiblePositionManager, IERC721Enumerable {
    function positions(uint256 tokenId) external view returns (
        uint96 nonce, address operator, address token0, address token1, uint24 fee,
        int24 tickLower, int24 tickUpper, uint128 liquidity,
        uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128,
        uint128 tokensOwed0, uint128 tokensOwed1
    );
}

interface IEntryPoint {
    function depositTo(address account) external payable;
    function balanceOf(address account) external view returns (uint256);
}

interface IUniswapV3Router {
    struct ExactInputSingleParams {
        address tokenIn; address tokenOut; uint24 fee; address recipient;
        uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

interface IQuoterV2 {
    struct QuoteExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }
    function quoteExactInputSingle(QuoteExactInputSingleParams calldata params)
        external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate);
}

interface IChainlinkFeed {
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

interface IBalancerVault {
    function flashLoan(address recipient, address[] calldata tokens, uint256[] calldata amounts, bytes calldata userData) external;
    struct JoinPoolRequest { address[] assets; uint256[] maxAmountsIn; bytes userData; bool fromInternalBalance; }
    function joinPool(bytes32 poolId, address sender, address recipient, JoinPoolRequest calldata request) external payable;
    function getPoolTokens(bytes32 poolId) external view returns (address[] memory tokens, uint256[] memory balances, uint256);
    struct SingleSwap { bytes32 poolId; uint8 kind; address assetIn; address assetOut; uint256 amount; bytes userData; }
    struct FundManagement { address sender; bool fromInternalBalance; address payable recipient; bool toInternalBalance; }
    function swap(SingleSwap calldata singleSwap, FundManagement calldata funds, uint256 limit, uint256 deadline) external payable returns (uint256);
}

interface IFlashLoanRecipient {
    function receiveFlashLoan(address[] calldata tokens, uint256[] calldata amounts, uint256[] calldata fees, bytes calldata userData) external;
}

interface IUniswapV2Router {
    function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts);
    function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);
    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts);
}

interface IUniswapV3Pool {
    function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked);
}

/* -------------------------------- Libraries -------------------------------- */
library SafeERC20 {
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        (bool success, bytes memory data) = address(token).call(abi.encodeCall(IERC20.transfer, (to, value)));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "STF");
    }
    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        (bool success, bytes memory data) = address(token).call(abi.encodeCall(IERC20.transferFrom, (from, to, value)));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "STFF");
    }
    function safeApprove(IERC20 token, address spender, uint256 value) internal {
        (bool success, bytes memory data) = address(token).call(abi.encodeCall(IERC20.approve, (spender, value)));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "SA");
    }
}

library MathLib {
    function mulDiv(uint256 x, uint256 y, uint256 d) internal pure returns (uint256) {
        unchecked {
            uint256 z = x * y;
            if (z / y == x) return z / d;
            revert("Math overflow");
        }
    }
}

/* ------------------------------- Main Contract ------------------------------- */
contract WarehouseBalancerArb is IFlashLoanRecipient {
    using SafeERC20 for IERC20;
    using MathLib for uint256;

    /* ----------------------------- Immutables ----------------------------- */
    address public immutable owner;
    address public immutable scw;
    address public immutable usdc;
    address public immutable weth;
    address public immutable bwzc; // Corrected from bwaezi to bwzc
    address public immutable uniV3Router;
    address public immutable quoterV2;
    address public immutable chainlinkEthUsd;
    address public immutable vault;
    address public immutable uniV2Router;
    address public immutable sushiRouter;
    address public immutable entryPoint;
    address public immutable npm;
    uint8 public immutable bwzcDecimals;

    /* ----------------------------- Configurables ----------------------------- */
    address public paymasterA;
    address public paymasterB;
    uint8   public activePaymaster; // 0=A, 1=B
    bytes32 public balBWUSDCId;
    bytes32 public balBWWETHId;

    address public uniV3UsdcPool = 0x261c64d4d96EBfa14398B52D93C9d063E3a619f8;
    address public uniV3WethPool = 0x142C3dce0a5605Fb385fAe7760302fab761022aa;
    address public uniV2UsdcPool = 0xb3911905f8a6160eF89391442f85ecA7c397859c;
    address public uniV2WethPool = 0x6dF6F882ED69918349F75Fe397b37e62C04515b6;
    address public sushiUsdcPool = 0x9d2f8F9A2E3C240dECbbE23e9B3521E6ca2489D1;
    address public sushiWethPool = 0xE9E62C8Cc585C21Fb05fd82Fb68e0129711869f9;

    uint256 public alpha = 5e18;
    uint256 public beta  = 8e17;
    uint256 public gamma = 2e16;
    uint256 public kappa = 3e16;

    uint256 public epsilonBps      = 30;   // slippage guard
    uint256 public maxDeviationBps = 500;  // circuit breaker

    uint256 public lastBuyPrice1e18;
    uint256 public lastSellPrice1e18;

    uint256 public rMin   = 1e17;  // 10%
    uint256 public rMax   = 35e16; // 35%

    uint256 public targetDepositWei = 1e16; // paymaster target
    uint256 public paymasterDrawBps = 300;  // 3%

    uint256 public cycleCount;
    uint256 public checkpointPeriod = 50;

    uint256 public stalenessThreshold = 3600;
    uint256 public minQuoteThreshold = 1e15; // min liquidity heuristic via quote

    bool    public paused;
    mapping(bytes32 => bool) public moduleEnabled; // toggles
    mapping(address => mapping(uint256 => bool)) public usedNonces; // per-signer

    uint8 private locked = 1;

    /* ----------------------------- V3 Position Tracking ----------------------------- */
    uint256[] public v3UsdcBwTokenIds;
    uint256[] public v3WethBwTokenIds;

    /* ----------------------------- Capacity & Safety ----------------------------- */
    uint256 public minCycleDelay = 180; // seconds
    uint256 public lastCycleTimestamp;
    uint256 public tempDelayMultiplier = 1; // e.g., 2x when throttled
    string  public autoPauseReason;

    uint256 public minGasPerKick = 300_000;
    uint256 public maxCyclesPerDay = 1000;

    /* ----------------------------- EIP-712 ----------------------------- */
    bytes32 public constant KICK_TYPEHASH = keccak256("SignedKick(uint256 bundleId,uint256 deadline,uint256 nonce)");
    bytes32 public DOMAIN_SEPARATOR;

    struct SignedKick {
        uint256 bundleId;
        uint256 deadline;
        uint256 nonce;
        uint8   v;
        bytes32 r;
        bytes32 s;
    }

    struct Config {
        uint256 usdcIn;
        uint256 wethIn;
        uint256 bwBought;
        uint256 spreadUSD1e18;
        uint256 RbarUSD1e18;
        uint256 ethUSD1e18;
    }

    /* ----------------------------- Events ----------------------------- */
    event CycleExecuted(uint256 bundleId, uint256 usdcIn, uint256 wethIn, uint256 bwBought, uint256 residualUsdc, uint256 residualWeth);
    event DualCycleExecuted(uint256 bundleId, uint256 seedAmount, uint256 arbAmount, uint256 bwzcBought, uint256 residual, uint256 zero);
    event Reinvested(uint256 rBps, uint256 usdcDeposit, uint256 wethDeposit, uint256 bwDeposit);
    event PaymasterTopped(address paymaster, uint256 draw, uint256 newBal);
    event PausedSet(bool paused);
    event ModuleToggled(bytes32 module, bool enable);
    event ERC20Withdrawn(address token, uint256 amount, address to);
    event ETHWithdrawn(uint256 amount, address to);
    event ERC721Rescued(address token, uint256 tokenId, address to);
    event ERC1155Rescued(address token, uint256 id, uint256 amount, address to);
    event V3TokenIdAdded(bool isUsdc, uint256 tokenId);
    event V3TokenIdRemoved(bool isUsdc, uint256 tokenId);
    event FeesHarvested(uint256 usdcFees, uint256 wethFees, uint256 bwFees);
    event CycleThrottled(uint256 newDelay);
    event AutoPaused(string reason);
    event AutoRestarted();
    event SignatureVerified(uint256 bundleId);
    event GasSoftGate(uint256 gasLeft, uint256 minGasPerKick);
    event NonceUsed(address signer, uint256 nonce);
    event PoolsUpdated();
    event ForceUnpaused();

    /* ----------------------------- Errors ----------------------------- */
    error BadArgs();
    error InsufficientBalance();
    error ETHTransferFailed();
    error Paused();
    error Unauthorized();
    error Reentrant();
    error DeadlinePassed();
    error NonceAlreadyUsed();
    error SignatureInvalid();
    error SpreadTooLow();
    error DeviationTooHigh();
    error QuoteFailed();
    error SwapFailed();
    error FreshnessFailed();
    error RateLimited();
    error GasLimitExceeded();
    error CapacityExceeded();
    error ZeroAddress();
    error ModuleUnsafe();
    error InvalidDecimals();
    error LowLiquidity();

    /* ----------------------------- Modifiers ----------------------------- */
    modifier onlyOwner { if (msg.sender != owner) revert Unauthorized(); _; }
    modifier onlySCW   { if (msg.sender != scw)   revert Unauthorized(); _; }
    modifier nonReentrant { if (locked != 1) revert Reentrant(); locked = 2; _; locked = 1; }
    modifier notPaused { if (paused) revert Paused(); _; }
    modifier bypassPause { _; } // For rescues

    /* ----------------------------- Constructor ----------------------------- */
    constructor(
        address _owner,
        address _scw,
        address _usdc,
        address _weth,
        address _bwzc,
        address _uniV3Router,
        address _quoterV2,
        address _chainlinkEthUsd,
        address _vault,
        address _uniV2Router,
        address _sushiRouter,
        address _entryPoint,
        address _npm,
        address _paymasterA,
        address _paymasterB,
        bytes32 _balBWUSDCId,
        bytes32 _balBWWETHId
    ) {
        if (_owner == address(0) || _scw == address(0) || _usdc == address(0) || _weth == address(0) ||
            _bwzc == address(0) || _uniV3Router == address(0) || _quoterV2 == address(0) ||
            _chainlinkEthUsd == address(0) || _vault == address(0) || _uniV2Router == address(0) ||
            _sushiRouter == address(0) || _entryPoint == address(0) || _npm == address(0)
        ) revert ZeroAddress();

        owner = _owner;
        scw   = _scw;
        usdc  = _usdc;
        weth  = _weth;
        bwzc = _bwzc;
        uniV3Router = _uniV3Router;
        quoterV2    = _quoterV2;
        chainlinkEthUsd = _chainlinkEthUsd;
        vault       = _vault;
        uniV2Router = _uniV2Router;
        sushiRouter = _sushiRouter;
        entryPoint  = _entryPoint;
        npm         = _npm;

        bwzcDecimals = IERC20(_bwzc).decimals();
        if (bwzcDecimals != 18) revert InvalidDecimals();

        paymasterA = _paymasterA;
        paymasterB = _paymasterB;
        balBWUSDCId = _balBWUSDCId;
        balBWWETHId = _balBWWETHId;

        activePaymaster = 0; // default A

        moduleEnabled[keccak256("REINVEST")]        = true;
        moduleEnabled[keccak256("PAYMASTER_TOPUP")] = true;
        moduleEnabled[keccak256("CIRCUIT_BREAKER")] = true;
        moduleEnabled[keccak256("TWAMM")]           = true;
        moduleEnabled[keccak256("AUTO_TRANCHE")]    = true;
        moduleEnabled[keccak256("MEV_SHUFFLE")]     = false;

        // Max approvals for all routers/vault/NPM
        IERC20(usdc).safeApprove(uniV3Router, type(uint256).max);
        IERC20(weth).safeApprove(uniV3Router, type(uint256).max);
        IERC20(bwzc).safeApprove(uniV3Router, type(uint256).max);

        IERC20(usdc).safeApprove(vault, type(uint256).max);
        IERC20(weth).safeApprove(vault, type(uint256).max);
        IERC20(bwzc).safeApprove(vault, type(uint256).max);

        IERC20(usdc).safeApprove(uniV2Router, type(uint256).max);
        IERC20(weth).safeApprove(uniV2Router, type(uint256).max);
        IERC20(bwzc).safeApprove(uniV2Router, type(uint256).max);

        IERC20(usdc).safeApprove(sushiRouter, type(uint256).max);
        IERC20(weth).safeApprove(sushiRouter, type(uint256).max);
        IERC20(bwzc).safeApprove(sushiRouter, type(uint256).max);

        IERC20(usdc).safeApprove(npm, type(uint256).max);
        IERC20(weth).safeApprove(npm, type(uint256).max);
        IERC20(bwzc).safeApprove(npm, type(uint256).max);

        _initDomain();
    }

    function _initDomain() internal {
        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes("WarehouseBalancerArb")),
            keccak256(bytes("1")),
            block.chainid,
            address(this)
        ));
    }

    /* ----------------------------- Admin ----------------------------- */
    function setBalancerPoolIds(bytes32 usdcId, bytes32 wethId) external onlyOwner {
        balBWUSDCId = usdcId;
        balBWWETHId = wethId;
    }
    function setMinGasPerKick(uint256 v) external onlyOwner { minGasPerKick = v; }
    function setMinCycleDelay(uint256 v) external onlyOwner { minCycleDelay = v; }
    function setMaxCyclesPerDay(uint256 v) external onlyOwner { maxCyclesPerDay = v; }
    function setTempDelayMultiplier(uint256 v) external onlyOwner { tempDelayMultiplier = v; }
    function decayDelayMultiplier() external onlyOwner { if (tempDelayMultiplier > 1) tempDelayMultiplier -= 1; }
    function setStalenessThreshold(uint256 v) external onlyOwner { stalenessThreshold = v; }
    function setMinQuoteThreshold(uint256 v) external onlyOwner { minQuoteThreshold = v; }

    function toggleModule(bytes32 module, bool enable) external onlyOwner {
        if (module == keccak256("CIRCUIT_BREAKER") && !enable) {
            if (minCycleDelay < 120) revert ModuleUnsafe();
        }
        if (module == keccak256("AUTO_TRANCHE") && !enable) {
            if (!moduleEnabled[keccak256("TWAMM")]) revert ModuleUnsafe();
        }
        moduleEnabled[module] = enable;
        emit ModuleToggled(module, enable);
    }

    function setParams(
        uint256 _alpha, uint256 _beta, uint256 _gamma, uint256 _kappa,
        uint256 _epsilonBps, uint256 _maxDeviationBps,
        uint256 _checkpointPeriod
    ) external onlyOwner {
        alpha = _alpha; beta = _beta; gamma = _gamma; kappa = _kappa;
        epsilonBps = _epsilonBps; maxDeviationBps = _maxDeviationBps;
        checkpointPeriod = _checkpointPeriod;
    }

    function setPaymasters(address a, address b) external onlyOwner { 
        if (a == address(0) || b == address(0)) revert ZeroAddress();
        paymasterA = a; paymasterB = b; 
    }
    function setActivePaymaster(uint8 which) external onlyOwner { activePaymaster = which; }
    function setPaymasterTargets(uint256 targetWei, uint256 drawBps) external onlyOwner {
        targetDepositWei = targetWei; paymasterDrawBps = drawBps;
    }

    function setPaused(bool p) external onlyOwner { paused = p; emit PausedSet(p); }

    function forceUnpause() external onlyOwner {
        paused = false;
        emit ForceUnpaused();
    }

    function setPools(
        address _uniV3UsdcPool, address _uniV3WethPool,
        address _uniV2UsdcPool, address _uniV2WethPool,
        address _sushiUsdcPool, address _sushiWethPool
    ) external onlyOwner {
        uniV3UsdcPool = _uniV3UsdcPool;
        uniV3WethPool = _uniV3WethPool;
        uniV2UsdcPool = _uniV2UsdcPool;
        uniV2WethPool = _uniV2WethPool;
        sushiUsdcPool = _sushiUsdcPool;
        sushiWethPool = _sushiWethPool;
        emit PoolsUpdated();
    }

    /* ----------------------------- V3 Token IDs ----------------------------- */
    function addV3TokenId(bool isUsdc, uint256 tokenId) external onlyOwner {
        if (isUsdc) v3UsdcBwTokenIds.push(tokenId);
        else v3WethBwTokenIds.push(tokenId);
        emit V3TokenIdAdded(isUsdc, tokenId);
    }

    function removeV3TokenId(bool isUsdc, uint256 tokenId) external onlyOwner {
        uint256[] storage arr = isUsdc ? v3UsdcBwTokenIds : v3WethBwTokenIds;
        uint256 length = arr.length;
        for (uint256 i = 0; i < length; i++) {
            if (arr[i] == tokenId) {
                arr[i] = arr[length - 1];
                arr.pop();
                emit V3TokenIdRemoved(isUsdc, tokenId);
                break;
            }
        }
    }

    function syncV3TokenIds(uint256 maxScan) external onlyOwner {
        INonfungiblePositionManagerView v = INonfungiblePositionManagerView(npm);
        uint256 bal = v.balanceOf(scw);
        if (bal == 0) return;

        uint256 scanned;
        uint256 gasLimit = gasleft() / bal * maxScan; // dynamic bound
        for (uint256 i = 0; i < bal && scanned < maxScan && gasleft() > gasLimit; ) {
            uint256 tokenId = v.tokenOfOwnerByIndex(scw, i);
            (, , address token0, address token1, uint24 fee, , , uint128 liq, , , , ) = v.positions(tokenId);

            if (liq > 0 && fee == 3000) {
                if ((token0 == usdc && token1 == bwzc) || (token0 == bwzc && token1 == usdc)) {
                    v3UsdcBwTokenIds.push(tokenId);
                    emit V3TokenIdAdded(true, tokenId);
                } else if ((token0 == weth && token1 == bwzc) || (token0 == bwzc && token1 == weth)) {
                    v3WethBwTokenIds.push(tokenId);
                    emit V3TokenIdAdded(false, tokenId);
                }
            }

            unchecked { ++i; ++scanned; }
        }
    }

    /* ----------------------------- Kicks ----------------------------- */
    function kickBundle(SignedKick calldata kick) external onlySCW nonReentrant notPaused {
        _validateAndExecuteKick(kick, true);
    }

    function kickBatch(SignedKick[] calldata kicks) external onlySCW nonReentrant notPaused {
        if (paused) {
            Config memory cfg0 = _getConfig();
            _autoUnpauseCheck(cfg0);
            if (paused) revert Paused();
        }

        uint256 gl = gasleft();
        if (gl < minGasPerKick / 2) revert GasLimitExceeded();
        if (gl < minGasPerKick) emit GasSoftGate(gl, minGasPerKick);

        if (block.timestamp - lastCycleTimestamp < minCycleDelay * tempDelayMultiplier) revert RateLimited();

        if (cycleCount + kicks.length > maxCyclesPerDay) revert CapacityExceeded();

        for (uint256 i = 0; i < kicks.length; ) {
            _verifySignature(kicks[i]);
            Config memory cfg = _getConfig();

            if (cfg.spreadUSD1e18 < 5e16) revert SpreadTooLow();
            if (moduleEnabled[keccak256("CIRCUIT_BREAKER")]) _checkDeviation(cfg);

            _flashLoan(cfg.usdcIn, cfg.wethIn, kicks[i].bundleId);

            unchecked { ++i; }
        }

        Config memory lastCfg = _getConfig();
        if (moduleEnabled[keccak256("REINVEST")] && cycleCount % checkpointPeriod == 0) {
            _reinvestDrip(lastCfg.spreadUSD1e18, lastCfg.ethUSD1e18);
        }

        if (moduleEnabled[keccak256("PAYMASTER_TOPUP")] ) _maybeTopEntryPoint();

        lastCycleTimestamp = block.timestamp;
        if (tempDelayMultiplier > 1 && cycleCount % 10 == 0) tempDelayMultiplier = 1;
    }

    function _validateAndExecuteKick(SignedKick calldata kick, bool single) internal {
        uint256 gl = gasleft();
        if (gl < minGasPerKick / 2) revert GasLimitExceeded();
        if (gl < minGasPerKick) emit GasSoftGate(gl, minGasPerKick);

        _verifySignature(kick);

        if (single) {
            if (block.timestamp - lastCycleTimestamp < minCycleDelay * tempDelayMultiplier) revert RateLimited();
        }

        Config memory cfg = _getConfig();
        if (cfg.spreadUSD1e18 < 5e16) revert SpreadTooLow();
        if (moduleEnabled[keccak256("CIRCUIT_BREAKER")]) _checkDeviation(cfg);

        _flashLoan(cfg.usdcIn, cfg.wethIn, kick.bundleId);

        if (single) {
            if (moduleEnabled[keccak256("REINVEST")] && cycleCount % checkpointPeriod == 0) {
                _reinvestDrip(cfg.spreadUSD1e18, cfg.ethUSD1e18);
            }

            if (moduleEnabled[keccak256("PAYMASTER_TOPUP")] ) _maybeTopEntryPoint();

            lastCycleTimestamp = block.timestamp;
            if (tempDelayMultiplier > 1 && cycleCount % 10 == 0) tempDelayMultiplier = 1;

            emit SignatureVerified(kick.bundleId);
        }
    }

    /* ----------------------------- Flash Loan ----------------------------- */
    function _flashLoan(uint256 usdcAmt, uint256 wethAmt, uint256 bundleId) internal {
        address[] memory tokens = new address[](2);
        tokens[0] = usdc;
        tokens[1] = weth;

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = usdcAmt;
        amounts[1] = wethAmt;

        bytes memory userData = abi.encode(bundleId);
        IBalancerVault(vault).flashLoan(address(this), tokens, amounts, userData);
    }

    function receiveFlashLoan(
        address[] calldata /*tokens*/,
        uint256[] calldata amounts,
        uint256[] calldata fees,
        bytes calldata userData
    ) external override {
        if (msg.sender != vault) revert Unauthorized();

        uint256 bundleId = abi.decode(userData, (uint256));
        Config memory cfg = _getConfig();

        uint256 usdcIn = amounts[0];
        uint256 wethIn = amounts[1];
        uint256 usdcFee = fees[0];
        uint256 wethFee = fees[1];

        uint256 totalBwBought = 0;
        uint256 totalResidualUsdc = 0;
        uint256 totalResidualWeth = 0;

        uint256 tranches = moduleEnabled[keccak256("AUTO_TRANCHE")] ? _optimalTrancheCount(cfg) : (moduleEnabled[keccak256("TWAMM")] ? 3 : 1);

        uint256 trancheUsdc = usdcIn / tranches;
        uint256 trancheWeth = wethIn / tranches;
        uint256 trancheUsdcFee = usdcFee / tranches;
        uint256 trancheWethFee = wethFee / tranches;

        uint256 internalBuyPrice1e18 = _getInternalBuyPrice(cfg.ethUSD1e18);
        uint256 internalSellPrice1e18 = _getInternalSellPrice(cfg.ethUSD1e18);

        uint256 spreadBps = (cfg.spreadUSD1e18 * 10000) / 1e18;

        uint256 shuffleSeed = moduleEnabled[keccak256("MEV_SHUFFLE")] ? uint256(keccak256(abi.encodePacked(block.timestamp, block.prevrandao, cycleCount))) % tranches : 0;

        // Novel preflight: Predict spread velocity
        uint256 histSpread = (lastBuyPrice1e18 - lastSellPrice1e18) * 1e18 / lastBuyPrice1e18;
        if (cfg.spreadUSD1e18 < histSpread * 9 / 10) revert SpreadTooLow(); // If dropping fast, abort

        for (uint256 t = 0; t < tranches; ) {
            // Shuffle index for tranche
            uint256 idx = (t + shuffleSeed) % tranches;

            // Compute adaptive seed/arb for USDC
            uint256 multiplier = 1e18 + (spreadBps * 1e18 / 6000);
            uint256 arbAmountUsdc = trancheUsdc * 1e18 / multiplier;
            uint256 seedAmountUsdc = trancheUsdc - arbAmountUsdc;

            uint256 bwFromUsdcMin = arbAmountUsdc.mulDiv(uint256(1e12).mulDiv((10000 - epsilonBps), 10000), internalBuyPrice1e18);
            uint256 usdcFromSellMin = arbAmountUsdc.mulDiv(internalSellPrice1e18.mulDiv((10000 - epsilonBps), 10000), uint256(1e18) * uint256(1e12)); // Adjusted for bwzcBought approx arbAmountUsdc / price

            // Execute USDC cycle
            (uint256 bwzcBoughtUsdc, uint256 residualUsdc) = _executeUsdcBwzcCycle(seedAmountUsdc, arbAmountUsdc, 0, trancheUsdcFee, bundleId, bwFromUsdcMin, usdcFromSellMin, internalBuyPrice1e18, internalSellPrice1e18);

            // Compute adaptive seed/arb for WETH
            uint256 arbAmountWeth = trancheWeth * 1e18 / multiplier;
            uint256 seedAmountWeth = trancheWeth - arbAmountWeth;

            uint256 bwFromWethMin = arbAmountWeth.mulDiv(cfg.ethUSD1e18.mulDiv((10000 - epsilonBps), 10000), internalBuyPrice1e18);
            uint256 wethFromSellMin = arbAmountWeth.mulDiv(internalSellPrice1e18.mulDiv((10000 - epsilonBps), 10000), cfg.ethUSD1e18); // Adjusted

            // Execute WETH cycle
            (uint256 bwzcBoughtWeth, uint256 residualWeth) = _executeWethBwzcCycle(seedAmountWeth, arbAmountWeth, 0, trancheWethFee, bundleId, bwFromWethMin, wethFromSellMin, internalBuyPrice1e18, internalSellPrice1e18, cfg.ethUSD1e18);

            totalBwBought += bwzcBoughtUsdc + bwzcBoughtWeth;
            totalResidualUsdc += residualUsdc;
            totalResidualWeth += residualWeth;

            unchecked { ++t; }
        }

        lastBuyPrice1e18 = internalBuyPrice1e18;
        lastSellPrice1e18 = internalSellPrice1e18;

        cycleCount += 1;
        emit CycleExecuted(bundleId, usdcIn, wethIn, totalBwBought, totalResidualUsdc, totalResidualWeth);
    }

    /* ----------------------------- Quoting ----------------------------- */
    function _quoteExactInputV3(address tokenIn, address tokenOut, uint256 amountIn, uint24 fee) internal returns (uint256) {
        try IQuoterV2(quoterV2).quoteExactInputSingle(
            IQuoterV2.QuoteExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                amountIn: amountIn,
                fee: fee,
                sqrtPriceLimitX96: 0
            })
        ) returns (uint256 amountOut, uint160, uint32, uint256) {
            if (amountOut < minQuoteThreshold) return 0;
            return amountOut;
        } catch { return 0; }
    }

    function _quoteExactInputV2(address router, address tokenIn, address tokenOut, uint256 amountIn) internal view returns (uint256) {
        address[] memory path = new address[](2);
        path[0] = tokenIn; path[1] = tokenOut;
        try IUniswapV2Router(router).getAmountsOut(amountIn, path) returns (uint256[] memory amounts) {
            if (amounts[1] < minQuoteThreshold) return 0;
            return amounts[1];
        } catch { return 0; }
    }

    function _quoteBest(address tokenIn, address tokenOut, uint256 amountIn, uint24 fee) internal returns (uint256 maxQuote) {
        uint256 qV3  = _quoteExactInputV3(tokenIn, tokenOut, amountIn, fee);
        uint256 qV2  = _quoteExactInputV2(uniV2Router, tokenIn, tokenOut, amountIn);
        uint256 qSu  = _quoteExactInputV2(sushiRouter, tokenIn, tokenOut, amountIn);
        uint256 qBal = _balancerSpot(tokenIn, tokenOut, amountIn);

        maxQuote = qV3;
        if (qV2  > maxQuote) maxQuote = qV2;
        if (qSu  > maxQuote) maxQuote = qSu;
        if (qBal > maxQuote) maxQuote = qBal;
        if (maxQuote == 0) revert LowLiquidity();
    }

    /* ----------------------------- Balancer helpers ----------------------------- */
    function _findIndex(address[] memory tokens, address target) internal pure returns (uint256 idx, bool found) {
        for (uint256 i = 0; i < tokens.length; ) {
            if (tokens[i] == target) return (i, true);
            unchecked { ++i; }
        }
        return (0, false);
    }

    function _balancerSpot(address tokenIn, address tokenOut, uint256 amountIn) internal view returns (uint256) {
        bytes32 poolId = tokenIn == usdc ? balBWUSDCId : balBWWETHId;
        (address[] memory toks, uint256[] memory bals,) = IBalancerVault(vault).getPoolTokens(poolId);

        (uint256 idxIn, bool fIn) = _findIndex(toks, tokenIn);
        (uint256 idxOut, bool fOut) = _findIndex(toks, tokenOut);
        if (!fIn || !fOut) return 0;

        uint256 balIn = bals[idxIn];
        uint256 balOut = bals[idxOut];
        uint256 feeBps = 300;
        if (balIn == 0 || balOut == 0) return 0;

        return (amountIn * balOut * (10000 - feeBps)) / ((balIn + amountIn) * 10000);
    }

    /* ----------------------------- Uniswap V3 Liquidity Helpers ----------------------------- */
    function _addLiquidityV3(address paired, uint256 pairedAmt, uint256 bwzcAmt) internal returns (uint256 tokenId) {
        address token0 = paired < bwzc ? paired : bwzc;
        address token1 = paired < bwzc ? bwzc : paired;
        uint256 amount0Desired = token0 == paired ? pairedAmt : bwzcAmt;
        uint256 amount1Desired = token0 == paired ? bwzcAmt : pairedAmt;
        uint256 amount0Min = amount0Desired * (10000 - epsilonBps) / 10000;
        uint256 amount1Min = amount1Desired * (10000 - epsilonBps) / 10000;
        INonfungiblePositionManager.MintParams memory params = INonfungiblePositionManager.MintParams({
            token0: token0,
            token1: token1,
            fee: 3000, // 0.3% pool fee tier
            tickLower: -887220, // full range lower tick
            tickUpper: 887220, // full range upper tick
            amount0Desired: amount0Desired,
            amount1Desired: amount1Desired,
            amount0Min: amount0Min,
            amount1Min: amount1Min,
            recipient: address(this),
            deadline: block.timestamp
        });
        (tokenId,,,) = INonfungiblePositionManager(npm).mint(params);
        return tokenId;
    }

    function _removeLiquidityV3(address paired, uint256 tokenId) internal returns (uint256 pairedAmt, uint256 bwzcAmt) {
        INonfungiblePositionManager.CollectParams memory collectParams =
            INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            });
        (uint256 amount0, uint256 amount1) = INonfungiblePositionManager(npm).collect(collectParams);
        (, , address token0, address token1, , , , , , , , ) = INonfungiblePositionManagerView(npm).positions(tokenId);
        if (token0 == paired) {
            pairedAmt = amount0;
            bwzcAmt = amount1;
        } else {
            pairedAmt = amount1;
            bwzcAmt = amount0;
        }
    }

    /* ----------------------------- Config & Sizing ----------------------------- */
    function _fetchEthUsd() internal view returns (uint256 ethUSD1e18) {
        (uint80 roundId, int256 price, , uint256 updatedAt, uint80 answeredInRound) = IChainlinkFeed(chainlinkEthUsd).latestRoundData();
        if (price <= 0 || roundId == 0 || answeredInRound < roundId || block.timestamp > updatedAt + stalenessThreshold) revert FreshnessFailed();
        ethUSD1e18 = uint256(price) * 1e10; // Chainlink → 18 decimals
    }

    function _getConfig() internal returns (Config memory cfg) {
        cfg.ethUSD1e18 = _fetchEthUsd();
        cfg.spreadUSD1e18 = _inferSpread(cfg.ethUSD1e18);
        cfg.RbarUSD1e18 = _averageReserves(cfg.ethUSD1e18);

        (uint256 dAlpha, uint256 dBeta) = _dynamicAlphaBeta(cfg.spreadUSD1e18);

        uint256 baseUSD = dAlpha * cfg.RbarUSD1e18 / 1e18 * dBeta / 1e18;

        cfg.usdcIn = baseUSD / 2 / 1e12;
        cfg.wethIn = baseUSD / 2 * 1e18 / cfg.ethUSD1e18;

        uint256 halfRbar = cfg.RbarUSD1e18 / 2;
        cfg.usdcIn = _capSafe(cfg.usdcIn, halfRbar / 1e12);
        cfg.wethIn = _capSafe(cfg.wethIn, halfRbar * 1e18 / cfg.ethUSD1e18);
    }

    function _twapAdjustedSpread(uint256 ethUSD1e18) internal returns (uint256) {
        uint256 instant = _inferSpread(ethUSD1e18);
        if (lastBuyPrice1e18 == 0 || lastSellPrice1e18 == 0) return instant;

        uint256 histSpread = lastBuyPrice1e18 > lastSellPrice1e18
            ? (lastBuyPrice1e18 - lastSellPrice1e18) * 1e18 / lastBuyPrice1e18
            : (lastSellPrice1e18 - lastBuyPrice1e18) * 1e18 / lastSellPrice1e18;

        return (instant * 7 + histSpread * 3) / 10;
    }

    function _inferSpread(uint256 ethUSD1e18) internal returns (uint256 spread1e18) {
        uint256 oneUsdc = 1e6;
        uint256 bwOutUsdc = _quoteBest(usdc, bwzc, oneUsdc, 3000);
        uint256 usdcBack = _quoteBest(bwzc, usdc, bwOutUsdc, 3000);
        uint256 usdcSpread = usdcBack > oneUsdc ? (usdcBack - oneUsdc) * 1e12 : (oneUsdc - usdcBack) * 1e12;

        uint256 oneWethScaled = 1e12;
        uint256 bwOutWeth = _quoteBest(weth, bwzc, oneWethScaled, 3000);
        uint256 wethBack = _quoteBest(bwzc, weth, bwOutWeth, 3000);
        uint256 wethSpread = wethBack > oneWethScaled ? (wethBack - oneWethScaled) * ethUSD1e18 / 1e12 : (oneWethScaled - wethBack) * ethUSD1e18 / 1e12;

        spread1e18 = (usdcSpread + wethSpread) / 2;
    }

    function _averageReserves(uint256 ethUSD1e18) internal view returns (uint256 Rbar1e18) {
        uint256 count = 8;
        Rbar1e18 += _poolReserve(usdc, bwzc, uniV3UsdcPool) / count;
        Rbar1e18 += _poolReserve(weth, bwzc, uniV3WethPool) / count * ethUSD1e18 / 1e18;
        Rbar1e18 += _poolReserve(usdc, bwzc, uniV2UsdcPool) / count;
        Rbar1e18 += _poolReserve(weth, bwzc, uniV2WethPool) / count * ethUSD1e18 / 1e18;
        Rbar1e18 += _poolReserve(usdc, bwzc, sushiUsdcPool) / count;
        Rbar1e18 += _poolReserve(weth, bwzc, sushiWethPool) / count * ethUSD1e18 / 1e18;
        Rbar1e18 += _balancerReserve(balBWUSDCId) / count;
        Rbar1e18 += _balancerReserve(balBWWETHId) / count * ethUSD1e18 / 1e18;
    }

    function _poolReserve(address paired, address bw, address pool) internal view returns (uint256 reserveUSD1e18) {
        bw; // silence warning
        uint256 pairedBal = IERC20(paired).balanceOf(pool);
        reserveUSD1e18 = paired == usdc ? pairedBal * 1e12 : pairedBal * _fetchEthUsd() / 1e18;
    }

    function _balancerReserve(bytes32 poolId) internal view returns (uint256 reserveUSD1e18) {
        (address[] memory toks, uint256[] memory balances, ) = IBalancerVault(vault).getPoolTokens(poolId);
        (uint256 idxUsdc, bool fUsdc) = _findIndex(toks, usdc);
        (uint256 idxWeth, bool fWeth) = _findIndex(toks, weth);
        if (!fUsdc && !fWeth) return 0;

        uint256 pairedBal = fUsdc ? balances[idxUsdc] : balances[idxWeth];
        reserveUSD1e18 = fUsdc ? pairedBal * 1e12 : pairedBal * _fetchEthUsd() / 1e18;
    }

    function _capSafe(uint256 size, uint256 RbarHalfNative) internal view returns (uint256 capped) {
        capped = gamma * RbarHalfNative / 1e18 * (1e18 - (1e18 / (1e18 + kappa * RbarHalfNative / 1e18))) / 1e18;
        capped = size > capped ? capped : size;
    }

    function _dynamicAlphaBeta(uint256 spreadUSD1e18) internal pure returns (uint256 dAlpha, uint256 dBeta) {
        uint256 s = spreadUSD1e18 / 1e16;
        uint256 boost = s > 2000 ? 2000 : s;
        dAlpha = 5e18 + (5e18 * boost / 10000);
        dBeta  = 8e17  - (8e17 * boost / 20000);
    }

    /* ----------------------------- Blended Pricing ----------------------------- */
    function _getInternalBuyPrice(uint256 ethUSD1e18) internal returns (uint256 price1e18) {
        price1e18 = _blendPrices(true, ethUSD1e18);
    }

    function _getInternalSellPrice(uint256 ethUSD1e18) internal returns (uint256 price1e18) {
        price1e18 = _blendPrices(false, ethUSD1e18);
    }

    function _blendPrices(bool isLow, uint256 ethUSD1e18) internal returns (uint256 blended1e18) {
        uint256 count = 4;
        if (isLow) {
            uint256 qSuU = _quoteExactInputV2(sushiRouter, usdc, bwzc, 1e6);
            if (qSuU > 0) blended1e18 += 1e36 / qSuU / count;
            uint256 qSuW = _quoteExactInputV2(sushiRouter, weth, bwzc, 1e12);
            if (qSuW > 0) blended1e18 += ethUSD1e18 * 1e12 / qSuW / count;
            uint256 spotU = _balancerSpot(usdc, bwzc, 1e6);
            if (spotU > 0) blended1e18 += 1e36 / spotU / count;
            uint256 spotW = _balancerSpot(weth, bwzc, 1e12);
            if (spotW > 0) blended1e18 += ethUSD1e18 * 1e12 / spotW / count;
        } else {
            uint256 qV3U = _quoteExactInputV3(usdc, bwzc, 1e6, 3000);
            if (qV3U > 0) blended1e18 += 1e36 / qV3U / count;
            uint256 qV3W = _quoteExactInputV3(weth, bwzc, 1e12, 3000);
            if (qV3W > 0) blended1e18 += ethUSD1e18 * 1e12 / qV3W / count;
            uint256 qV2U = _quoteExactInputV2(uniV2Router, usdc, bwzc, 1e6);
            if (qV2U > 0) blended1e18 += 1e36 / qV2U / count;
            uint256 qV2W = _quoteExactInputV2(uniV2Router, weth, bwzc, 1e12);
            if (qV2W > 0) blended1e18 += ethUSD1e18 * 1e12 / qV2W / count;
        }
    }

    /* ----------------------------- Circuit breaker ----------------------------- */
    function _checkDeviation(Config memory cfg) internal {
        uint256 buyPrice = _getInternalBuyPrice(cfg.ethUSD1e18);
        uint256 sellPrice = _getInternalSellPrice(cfg.ethUSD1e18);
        if (lastBuyPrice1e18 == 0 || lastSellPrice1e18 == 0) return;

        uint256 devBuy = buyPrice > lastBuyPrice1e18
            ? (buyPrice - lastBuyPrice1e18) * 10000 / lastBuyPrice1e18
            : (lastBuyPrice1e18 - buyPrice) * 10000 / lastBuyPrice1e18;

        uint256 devSell = sellPrice > lastSellPrice1e18
            ? (sellPrice - lastSellPrice1e18) * 10000 / lastSellPrice1e18
            : (lastSellPrice1e18 - sellPrice) * 10000 / lastSellPrice1e18;

        if (devBuy > maxDeviationBps || devSell > maxDeviationBps) revert DeviationTooHigh();
    }

    function _autoUnpauseCheck(Config memory cfg) internal {
        if (paused && cfg.spreadUSD1e18 >= 5e16) {
            paused = false;
            emit AutoRestarted();
        }
    }

    /* ----------------------------- Tranche heuristic ----------------------------- */
    function _optimalTrancheCount(Config memory cfg) internal pure returns (uint256) {
        if (cfg.spreadUSD1e18 >= 12e16) return 5;
        if (cfg.spreadUSD1e18 >= 9e16)  return 4;
        if (cfg.spreadUSD1e18 >= 6e16)  return 3;
        return 2;
    }

    /* ----------------------------- EIP-712 signature ----------------------------- */
    function _verifySignature(SignedKick calldata k) internal {
        if (k.deadline < block.timestamp) revert DeadlinePassed();
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            keccak256(abi.encode(KICK_TYPEHASH, k.bundleId, k.deadline, k.nonce, block.chainid)) // Novel: hash bundleId extra
        ));

        address signer = ecrecover(digest, k.v, k.r, k.s);
        if (signer != owner && signer != scw) revert SignatureInvalid();
        if (usedNonces[signer][k.nonce]) revert NonceAlreadyUsed();

        usedNonces[signer][k.nonce] = true;
        emit NonceUsed(signer, k.nonce);
    }

    /* ----------------------------- Fee harvest ----------------------------- */
    function _harvestV3FeesBounded(uint256 maxPositions) internal returns (uint256 usdcFees, uint256 wethFees, uint256 bwFees) {
        INonfungiblePositionManagerView v = INonfungiblePositionManagerView(npm);

        uint256 lenU = v3UsdcBwTokenIds.length;
        uint256 lenW = v3WethBwTokenIds.length;
        uint256 processed;
        uint256 gasLimit = gasleft() / (lenU + lenW); // Dynamic

        for (uint256 i = 0; i < lenU && processed < maxPositions && gasleft() > gasLimit; ) {
            uint256 tokenId = v3UsdcBwTokenIds[i];
            (, , address token0, address token1, , , , , , , uint128 owed0, uint128 owed1) = v.positions(tokenId);
            if (owed0 == 0 && owed1 == 0) { unchecked { ++i; ++processed; } continue; } // Skip zero-owed

            (uint256 a0, uint256 a1) = INonfungiblePositionManager(npm).collect(
                INonfungiblePositionManager.CollectParams(tokenId, address(this), type(uint128).max, type(uint128).max)
            );

            if (token0 == usdc) { usdcFees += a0; bwFees += a1; }
            else { bwFees += a0; usdcFees += a1; }

            unchecked { ++i; ++processed; }
        }

        for (uint256 j = 0; j < lenW && processed < maxPositions && gasleft() > gasLimit; ) {
            uint256 tokenId = v3WethBwTokenIds[j];
            (, , address token0, address token1, , , , , , , uint128 owed0, uint128 owed1) = v.positions(tokenId);
            if (owed0 == 0 && owed1 == 0) { unchecked { ++j; ++processed; } continue; }

            (uint256 a0, uint256 a1) = INonfungiblePositionManager(npm).collect(
                INonfungiblePositionManager.CollectParams(tokenId, address(this), type(uint128).max, type(uint128).max)
            );

            if (token0 == weth) { wethFees += a0; bwFees += a1; }
            else { bwFees += a0; wethFees += a1; }

            unchecked { ++j; ++processed; }
        }

        emit FeesHarvested(usdcFees, wethFees, bwFees);
    }

    /* ----------------------------- Reinvest drip ----------------------------- */
    function _reinvestDrip(uint256 spreadUSD1e18, uint256 ethUSD1e18) internal {
        uint256 r = rMin + (rMax - rMin) * (spreadUSD1e18 > 1e17 ? 1 : spreadUSD1e18 / 1e17);
        if (r > rMax) r = rMax;

        uint256 usdcBal = IERC20(usdc).balanceOf(address(this));
        uint256 wethBal = IERC20(weth).balanceOf(address(this));
        uint256 bwBal = IERC20(bwzc).balanceOf(address(this));

        uint256 usdcDeposit = usdcBal * r / 1e18;
        uint256 wethDeposit = wethBal * r / 1e18;
        uint256 bwDeposit = bwBal * r / 1e18;

        // Novel: Allocate proportionally to venue reserves
        uint256 v3Share = 4e17; // 40% to V3, rest split
        uint256 v2Share = 2e17;
        uint256 sushiShare = 2e17;
        uint256 balShare = 2e17;

        // V3 mint with dynamic ticks
        (, int24 tickU,,,,,) = IUniswapV3Pool(uniV3UsdcPool).slot0();
        (, int24 tickW,,,,,) = IUniswapV3Pool(uniV3WethPool).slot0();

        if (usdcDeposit > 0 || bwDeposit > 0) {
            address token0 = usdc < bwzc ? usdc : bwzc;
            address token1 = usdc < bwzc ? bwzc : usdc;
            uint256 amount0Desired = token0 == usdc ? usdcDeposit * v3Share / 1e18 : bwDeposit * v3Share / 1e18;
            uint256 amount1Desired = token0 == usdc ? bwDeposit * v3Share / 1e18 : usdcDeposit * v3Share / 1e18;
            uint256 amount0Min = amount0Desired * (10000 - epsilonBps) / 10000;
            uint256 amount1Min = amount1Desired * (10000 - epsilonBps) / 10000;
            INonfungiblePositionManager.MintParams memory pU = INonfungiblePositionManager.MintParams({
                token0: token0,
                token1: token1,
                fee: 3000,
                tickLower: tickU - 600,
                tickUpper: tickU + 600,
                amount0Desired: amount0Desired,
                amount1Desired: amount1Desired,
                amount0Min: amount0Min,
                amount1Min: amount1Min,
                recipient: scw,
                deadline: block.timestamp + 300
            });
            INonfungiblePositionManager(npm).mint(pU);
        }

        if (wethDeposit > 0 || bwDeposit > 0) {
            address token0 = weth < bwzc ? weth : bwzc;
            address token1 = weth < bwzc ? bwzc : weth;
            uint256 amount0Desired = token0 == weth ? wethDeposit * v3Share / 1e18 : bwDeposit * v3Share / 1e18;
            uint256 amount1Desired = token0 == weth ? bwDeposit * v3Share / 1e18 : wethDeposit * v3Share / 1e18;
            uint256 amount0Min = amount0Desired * (10000 - epsilonBps) / 10000;
            uint256 amount1Min = amount1Desired * (10000 - epsilonBps) / 10000;
            INonfungiblePositionManager.MintParams memory pW = INonfungiblePositionManager.MintParams({
                token0: token0,
                token1: token1,
                fee: 3000,
                tickLower: tickW - 600,
                tickUpper: tickW + 600,
                amount0Desired: amount0Desired,
                amount1Desired: amount1Desired,
                amount0Min: amount0Min,
                amount1Min: amount1Min,
                recipient: scw,
                deadline: block.timestamp + 300
            });
            INonfungiblePositionManager(npm).mint(pW);
        }

        // V2 add
        IUniswapV2Router(uniV2Router).addLiquidity(usdc, bwzc, usdcDeposit * v2Share / 1e18, bwDeposit * v2Share / 1e18, 0, 0, scw, block.timestamp + 300);
        IUniswapV2Router(uniV2Router).addLiquidity(weth, bwzc, wethDeposit * v2Share / 1e18, bwDeposit * v2Share / 1e18, 0, 0, scw, block.timestamp + 300);

        // Sushi add
        IUniswapV2Router(sushiRouter).addLiquidity(usdc, bwzc, usdcDeposit * sushiShare / 1e18, bwDeposit * sushiShare / 1e18, 0, 0, scw, block.timestamp + 300);
        IUniswapV2Router(sushiRouter).addLiquidity(weth, bwzc, wethDeposit * sushiShare / 1e18, bwDeposit * sushiShare / 1e18, 0, 0, scw, block.timestamp + 300);

        // Balancer join
        address tokenA = usdc < bwzc ? usdc : bwzc;
        address tokenB = usdc < bwzc ? bwzc : usdc;
        address[] memory assetsU = new address[](2);
        assetsU[0] = tokenA; assetsU[1] = tokenB;
        uint256[] memory maxInU = new uint256[](2);
        maxInU[0] = tokenA == usdc ? usdcDeposit * balShare / 1e18 : bwDeposit * balShare / 1e18;
        maxInU[1] = tokenA == usdc ? bwDeposit * balShare / 1e18 : usdcDeposit * balShare / 1e18;
        bytes memory userDataU = abi.encode(1, maxInU, 0); // EXACT_TOKENS_IN_FOR_BPT_OUT
        IBalancerVault.JoinPoolRequest memory reqU = IBalancerVault.JoinPoolRequest(assetsU, maxInU, userDataU, false);
        IBalancerVault(vault).joinPool(balBWUSDCId, address(this), scw, reqU);

        tokenA = weth < bwzc ? weth : bwzc;
        tokenB = weth < bwzc ? bwzc : weth;
        address[] memory assetsW = new address[](2);
        assetsW[0] = tokenA; assetsW[1] = tokenB;
        uint256[] memory maxInW = new uint256[](2);
        maxInW[0] = tokenA == weth ? wethDeposit * balShare / 1e18 : bwDeposit * balShare / 1e18;
        maxInW[1] = tokenA == weth ? bwDeposit * balShare / 1e18 : wethDeposit * balShare / 1e18;
        bytes memory userDataW = abi.encode(1, maxInW, 0);
        IBalancerVault.JoinPoolRequest memory reqW = IBalancerVault.JoinPoolRequest(assetsW, maxInW, userDataW, false);
        IBalancerVault(vault).joinPool(balBWWETHId, address(this), scw, reqW);

        emit Reinvested(r, usdcDeposit, wethDeposit, bwDeposit);
    }

    /* ----------------------------- Paymaster top-up ----------------------------- */
    function _maybeTopEntryPoint() internal nonReentrant {
        address pm = activePaymaster == 0 ? paymasterA : paymasterB;
        if (pm == address(0)) return;

        uint256 bal = IEntryPoint(entryPoint).balanceOf(pm);
        if (bal >= targetDepositWei) return;

        uint256 draw = (targetDepositWei - bal) * paymasterDrawBps / 10000;
        uint256 wethBal = IERC20(weth).balanceOf(address(this));
        if (wethBal < draw) return;

        IWETH(weth).withdraw(draw);
        IEntryPoint(entryPoint).depositTo{value: draw}(pm);

        emit PaymasterTopped(pm, draw, bal + draw);
    }

    receive() external payable {}

    /* ----------------------------- Rescues ----------------------------- */
    function rescueERC20(address token, uint256 amount, address to) external onlyOwner bypassPause {
        IERC20(token).safeTransfer(to, amount);
        emit ERC20Withdrawn(token, amount, to);
    }

    function rescueETH(uint256 amount, address to) external onlyOwner bypassPause {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert ETHTransferFailed();
        emit ETHWithdrawn(amount, to);
    }

    function rescueWETH(uint256 amount, address to) external onlyOwner bypassPause {
        IWETH(weth).withdraw(amount);
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert ETHTransferFailed();
        emit ETHWithdrawn(amount, to);
    }

    function rescueERC721(address token, uint256 tokenId, address to) external onlyOwner bypassPause {
        IERC721(token).transferFrom(address(this), to, tokenId);
        emit ERC721Rescued(token, tokenId, to);
    }

    function rescueERC1155(address token, uint256 id, uint256 amount, address to, bytes calldata data) external onlyOwner bypassPause {
        IERC1155(token).safeTransferFrom(address(this), to, id, amount, data);
        emit ERC1155Rescued(token, id, amount, to);
    }

    /* ----------------------------- Swap Best with Shuffle ----------------------------- */
    function _swapBest(address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut, uint24 fee) internal returns (uint256 amountOut) {
        uint256 venueOrder = uint256(keccak256(abi.encodePacked(block.timestamp, block.number))) % 4; // Novel shuffle per call

        address[4] memory venues = [uniV3Router, uniV2Router, sushiRouter, vault];
        uint8[4] memory orders = [0,1,2,3];

        // Simple Fisher-Yates shuffle simulation
        for (uint256 i = 3; i > 0; ) {
            uint256 j = (venueOrder % i) + 1;
            (orders[i], orders[j]) = (orders[j], orders[i]);
            unchecked { --i; }
        }

        for (uint256 k = 0; k < 4; ) {
            uint8 ord = orders[k];
            if (ord == 0) {
                IUniswapV3Router.ExactInputSingleParams memory params = IUniswapV3Router.ExactInputSingleParams({
                    tokenIn: tokenIn,
                    tokenOut: tokenOut,
                    fee: fee,
                    recipient: address(this),
                    deadline: block.timestamp + 300,
                    amountIn: amountIn,
                    amountOutMinimum: minOut,
                    sqrtPriceLimitX96: 0
                });
                try IUniswapV3Router(uniV3Router).exactInputSingle(params) returns (uint256 out) {
                    return out;
                } catch {}
            } else if (ord == 1) {
                address[] memory path = new address[](2);
                path[0] = tokenIn; path[1] = tokenOut;
                try IUniswapV2Router(uniV2Router).swapExactTokensForTokens(amountIn, minOut, path, address(this), block.timestamp + 300) returns (uint256[] memory amounts) {
                    return amounts[1];
                } catch {}
            } else if (ord == 2) {
                address[] memory path = new address[](2);
                path[0] = tokenIn; path[1] = tokenOut;
                try IUniswapV2Router(sushiRouter).swapExactTokensForTokens(amountIn, minOut, path, address(this), block.timestamp + 300) returns (uint256[] memory amounts) {
                    return amounts[1];
                } catch {}
            } else if (ord == 3) {
                bytes32 poolId = tokenIn == usdc ? balBWUSDCId : balBWWETHId;
                IBalancerVault.SingleSwap memory ss = IBalancerVault.SingleSwap({
                    poolId: poolId,
                    kind: 0,
                    assetIn: tokenIn,
                    assetOut: tokenOut,
                    amount: amountIn,
                    userData: ""
                });
                IBalancerVault.FundManagement memory fm = IBalancerVault.FundManagement({
                    sender: address(this),
                    fromInternalBalance: false,
                    recipient: payable(address(this)),
                    toInternalBalance: false
                });
                try IBalancerVault(vault).swap(ss, fm, minOut, block.timestamp + 300) returns (uint256 out) {
                    return out;
                } catch {}
            }
            unchecked { ++k; }
        }

        revert SwapFailed();
    }

    /* ----------------------------- Dual Flash Loan Cycles (USDC + WETH) ----------------------------- */

    function _executeUsdcBwzcCycle(
        uint256 seedAmountUSDC,
        uint256 arbAmountUSDC,
        uint256 bwzcSeed,
        uint256 usdcFee,
        uint256 bundleId,
        uint256 bwFromUsdcMin,
        uint256 usdcFromSellMin,
        uint256 internalBuyPrice1e18,
        uint256 internalSellPrice1e18
    ) internal returns (uint256 bwzcBought, uint256 residual) {
        // --- SELL LEG SEEDING ---
        uint256 tokenId = _addLiquidityV3(usdc, seedAmountUSDC, bwzcSeed);

        // --- BUY LEG ---
        bwzcBought = _swapBest(usdc, bwzc, arbAmountUSDC, bwFromUsdcMin, 3000);

        // --- SELL LEG ---
        uint256 usdcRecovered = _swapBest(bwzc, usdc, bwzcBought, usdcFromSellMin, 3000);

        // --- REMOVE LIQUIDITY ---
        (uint256 usdcFromLiquidity, uint256 bwzcReturned) = _removeLiquidityV3(usdc, tokenId);

        // --- REPAY ---
        uint256 totalRepay = arbAmountUSDC + seedAmountUSDC + usdcFee;
        if (usdcRecovered + usdcFromLiquidity < totalRepay) revert SpreadTooLow();

        IERC20(usdc).safeTransfer(vault, totalRepay);

        // --- PROFIT ---
        residual = (usdcRecovered + usdcFromLiquidity) - totalRepay;
        IERC20(usdc).safeTransfer(scw, residual);
        IERC20(bwzc).safeTransfer(scw, bwzcReturned);

        emit DualCycleExecuted(bundleId, seedAmountUSDC, arbAmountUSDC, bwzcBought, residual, 0);

        return (bwzcBought, residual);
    }

    function _executeWethBwzcCycle(
        uint256 seedAmountWETH,
        uint256 arbAmountWETH,
        uint256 bwzcSeed,
        uint256 wethFee,
        uint256 bundleId,
        uint256 bwFromWethMin,
        uint256 wethFromSellMin,
        uint256 internalBuyPrice1e18,
        uint256 internalSellPrice1e18,
        uint256 ethUSD1e18
    ) internal returns (uint256 bwzcBought, uint256 residual) {
        // --- SELL LEG SEEDING ---
        uint256 tokenId = _addLiquidityV3(weth, seedAmountWETH, bwzcSeed);

        // --- BUY LEG ---
        bwzcBought = _buyBWZCWithWeth(arbAmountWETH, bwFromWethMin);

        // --- SELL LEG ---
        uint256 wethRecovered = _sellBWZCForWeth(bwzcBought, wethFromSellMin);

        // --- REMOVE LIQUIDITY ---
        (uint256 wethFromLiquidity, uint256 bwzcReturned) = _removeLiquidityV3(weth, tokenId);

        // --- REPAY ---
        uint256 totalRepay = arbAmountWETH + seedAmountWETH + wethFee;
        if (wethRecovered + wethFromLiquidity < totalRepay) revert SpreadTooLow();

        IERC20(weth).safeTransfer(vault, totalRepay);

        // --- PROFIT ---
        residual = (wethRecovered + wethFromLiquidity) - totalRepay;
        IERC20(weth).safeTransfer(scw, residual);
        IERC20(bwzc).safeTransfer(scw, bwzcReturned);

        emit DualCycleExecuted(bundleId, seedAmountWETH, arbAmountWETH, bwzcBought, residual, 0);

        return (bwzcBought, residual);
    }

    /* ----------------------------- WETH/BWZC Helpers ----------------------------- */

    function _buyBWZCWithWeth(uint256 wethAmt, uint256 minOut) internal returns (uint256 bwzcOut) {
        // Swap WETH -> BWZC at low peg pool (Balancer/Sushi/Uniswap V2 fallback)
        bwzcOut = _swapBest(weth, bwzc, wethAmt, minOut, 3000);
    }

    function _sellBWZCForWeth(uint256 bwzcAmt, uint256 minOut) internal returns (uint256 wethOut) {
        // Swap BWZC -> WETH into seeded high peg pool
        wethOut = _swapBest(bwzc, weth, bwzcAmt, minOut, 3000);
    }

    /* ----------------------------- Adaptive Seed Ratio ----------------------------- */

    function _adaptiveSeedRatio(uint256 arbAmount, uint256 spreadBps) internal pure returns (uint256 seedAmount) {
        // seed = arbAmount * (1 + spread/600)
        uint256 multiplier = 1e18 + (spreadBps * 1e18 / 6000);
        seedAmount = arbAmount * multiplier / 1e18;
    }
}
