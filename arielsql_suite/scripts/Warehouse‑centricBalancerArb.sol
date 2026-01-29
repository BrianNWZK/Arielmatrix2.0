// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*
  MIRACLE M26D — WarehouseBalancerArb (Production Version, Final Corrections)
  
  UPDATED WITH $4M BOOTSTRAP STRATEGY BASED ON LIVE ETHERSCAN DATA:
  - SCW BWZC Balance: 29,999,999.53 (30M essentially)
  - Balancer Price: $23.50 per BWZC (2 USDC : 0.0851063829787234 BWZC)
  - Target Price: $100 per BWZC (Uniswap V3)
  - Spread: $76.50 per BWZC (325% ROI per arbitrage)
  - Projected: $184k profit/cycle, 10 cycles/day → $1.84M daily to SCW
  - 3% pool deepening per cycle from profits
*/

abstract contract ReentrancyGuard {
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;

    uint256 private _status;

    error ReentrancyGuardReentrantCall();

    constructor() {
        _status = NOT_ENTERED;
    }

    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    function _nonReentrantBefore() private {
        if (_status == ENTERED) {
            revert ReentrancyGuardReentrantCall();
        }
        _status = ENTERED;
    }

    function _nonReentrantAfter() private {
        _status = NOT_ENTERED;
    }
}

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
    struct IncreaseLiquidityParams { uint256 tokenId; uint256 amount0Desired; uint256 amount1Desired; uint256 amount0Min; uint256 amount1Min; uint256 deadline; }
    function increaseLiquidity(IncreaseLiquidityParams calldata params) external payable returns (uint128 liquidity, uint256 amount0, uint256 amount1);
    struct DecreaseLiquidityParams { uint256 tokenId; uint128 liquidity; uint256 amount0Min; uint256 amount1Min; uint256 deadline; }
    function decreaseLiquidity(DecreaseLiquidityParams calldata params) external payable returns (uint256 amount0, uint256 amount1);
    struct CollectParams { uint256 tokenId; address recipient; uint128 amount0Max; uint128 amount1Max; }
    function collect(CollectParams calldata params) external returns (uint256 amount0, uint256 amount1);
    function burn(uint256 tokenId) external payable;
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
    struct ExitPoolRequest { address[] assets; uint256[] minAmountsOut; bytes userData; bool toInternalBalance; }
    function exitPool(bytes32 poolId, address sender, address payable recipient, ExitPoolRequest calldata request) external;
    function getPoolTokens(bytes32 poolId) external view returns (address[] memory tokens, uint256[] memory balances, uint256);
    struct SingleSwap { bytes32 poolId; uint8 kind; address assetIn; address assetOut; uint256 amount; bytes userData; }
    struct FundManagement { address sender; bool fromInternalBalance; address payable recipient; bool toInternalBalance; }
    function swap(SingleSwap calldata singleSwap, FundManagement calldata funds, uint256 limit, uint256 deadline) external payable returns (uint256);
    function getPool(bytes32 poolId) external view returns (address, PoolSpecialization);
    enum PoolSpecialization { GENERAL, MINIMAL_SWAP_INFO, TWO_TOKEN }
}

interface IFlashLoanRecipient {
    function receiveFlashLoan(address[] calldata tokens, uint256[] calldata amounts, uint256[] calldata feeAmounts, bytes calldata userData) external;
}

interface IUniswapV2Router {
    function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) external returns (uint256[] memory amounts);
    function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);
    function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) external returns (uint256 amountA, uint256 amountB);
    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts);
}

interface IUniswapV3Pool {
    function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked);
}

/* -------------------------------- Custom Errors -------------------------------- */
error SwapFailed();
error SpreadTooLow();
error InsufficientBalance();
error ETHTransferFailed();
error MathOverflow();
error LowLiquidity();
error InvalidSignature();
error NonceUsed();
error DeadlineExpired();
error Paused();
error DeviationTooHigh();
error StaleOracle();
error InsufficientLiquidity();
error JoinFailed();
error ExitFailed();
error HarvestFailed();
error InvalidParameter();

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
            revert MathOverflow();
        }
    }
    function max(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a : b;
    }
    function min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}

/* ------------------------------- Main Contract ------------------------------- */
contract WarehouseBalancerArb is IFlashLoanRecipient, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using MathLib for uint256;

    /* ----------------------------- PRECISE CONSTANTS ----------------------------- */
    uint256 public constant TOTAL_BOOTSTRAP_USD = 4_000_000 * 1e6; // $4M total
    uint256 public constant BUY_LEG_PERCENT = 15; // 15% for arbitrage = $600k
    uint256 public constant SEED_LEG_PERCENT = 15; // 15% for pre-seed = $600k
    
    // PRICES FROM LIVE ETHERSCAN DATA
    uint256 public constant BALANCER_PRICE_USD = 23_500_000; // $23.50 with 6 decimals precision
    uint256 public constant UNIV3_TARGET_PRICE_USD = 100_000_000; // $100 target
    uint256 public constant SPREAD_USD = 76_500_000; // $76.50 spread
    
    // CYCLE PARAMETERS (from your extrapolation)
    uint256 public constant CYCLES_PER_DAY = 10;
    uint256 public constant PROFIT_PER_CYCLE_USD = 184_000 * 1e6; // $184k
    uint256 public constant FEES_PER_CYCLE_USD = 9_200 * 1e6; // $9.2k
    uint256 public constant BWZC_PER_CYCLE = 30_667 * 1e18; // 30,667 BWZC for deepening
    uint256 public constant DEEPENING_PERCENT_BPS = 300; // 3% pool deepening
    
    /* ----------------------------- Events ----------------------------- */
    event DualCycleExecuted(uint256 bundleId, uint256 seedAmount, uint256 arbAmount, uint256 bwzcBought, uint256 residualUsdc, uint256 residualWeth);
    event PaymasterTopped(address pm, uint256 draw, uint256 newBal);
    event ERC20Withdrawn(address token, uint256 amount, address to);
    event ETHWithdrawn(uint256 amount, address to);
    event ERC721Rescued(address token, uint256 tokenId, address to);
    event ERC1155Rescued(address token, uint256 id, uint256 amount, address to);
    event FeesHarvested(uint256 feeUsdc, uint256 feeWeth, uint256 feeBw);
    event WithdrawnToOwner(address asset, uint256 amount);
    event ConfigUpdated(string param, uint256 oldValue, uint256 newValue);
    event BootstrapExecuted(uint256 bwzcAmount, uint256 usdAmount);
    event PreciseCycleExecuted(
        uint256 indexed cycleNumber,
        uint256 usdcProfit,
        uint256 wethProfit,
        uint256 bwzcBought,
        uint256 bwzcDeepened,
        uint256 poolDeepeningValue
    );

    /* ----------------------------- Immutables ----------------------------- */
    address public immutable owner;
    address public immutable scw;
    address public immutable usdc;
    address public immutable weth;
    address public immutable bwzc;
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
    uint256 public maxDeviationBps = 1000;  // circuit breaker

    uint256 public lastBuyPrice1e18;
    uint256 public lastSellPrice1e18;

    uint256 public targetDepositWei = 1e16; // paymaster target
    uint256 public paymasterDrawBps = 300;  // 3%

    uint256 public cycleCount;

    uint256 public stalenessThreshold = 3600;
    uint256 public minQuoteThreshold = 1e12;

    bool    public paused;
    mapping(bytes32 => bool) public moduleEnabled;
    mapping(address => mapping(uint256 => bool)) public usedNonces;

    /* ----------------------------- V3 Position Tracking ----------------------------- */
    uint256[] public v3UsdcBwTokenIds;
    uint256[] public v3WethBwTokenIds;

    /* ----------------------------- Capacity & Safety ----------------------------- */
    uint256 public minCycleDelay = 180;
    uint256 public lastCycleTimestamp;
    uint256 public tempDelayMultiplier = 1;
    string  public autoPauseReason;

    uint256 public minGasPerKick = 1e15;

    bytes32 public constant KICK_TYPEHASH = keccak256("Kick(uint256 bundleId,uint256 deadline,uint256 nonce)");
    bytes32 public immutable DOMAIN_SEPARATOR;

    struct SignedKick {
        uint256 bundleId;
        uint256 deadline;
        uint256 nonce;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    // Permanent liquidity tracking
    uint256 public permanentUSDCAdded;
    uint256 public permanentWETHAdded;
    uint256 public permanentBWZCAdded;

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlySCW() {
        require(msg.sender == scw, "not SCW");
        _;
    }

    modifier bypassPause() {
        if (paused) revert Paused();
        _;
    }

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
        uint8 _bwzcDecimals,
        address _paymasterA,
        address _paymasterB,
        bytes32 _balBWUSDCId,
        bytes32 _balBWWETHId
    ) {
        owner = _owner;
        scw = _scw;
        usdc = _usdc;
        weth = _weth;
        bwzc = _bwzc;
        uniV3Router = _uniV3Router;
        quoterV2 = _quoterV2;
        chainlinkEthUsd = _chainlinkEthUsd;
        vault = _vault;
        uniV2Router = _uniV2Router;
        sushiRouter = _sushiRouter;
        entryPoint = _entryPoint;
        npm = _npm;
        bwzcDecimals = _bwzcDecimals;

        paymasterA = _paymasterA;
        paymasterB = _paymasterB;
        balBWUSDCId = _balBWUSDCId;
        balBWWETHId = _balBWWETHId;

        // Unlimited approvals for atomic txs
        IERC20(_usdc).safeApprove(_uniV3Router, type(uint256).max);
        IERC20(_usdc).safeApprove(_vault, type(uint256).max);
        IERC20(_usdc).safeApprove(_uniV2Router, type(uint256).max);
        IERC20(_usdc).safeApprove(_sushiRouter, type(uint256).max);
        IERC20(_usdc).safeApprove(_npm, type(uint256).max);
        IERC20(_weth).safeApprove(_uniV3Router, type(uint256).max);
        IERC20(_weth).safeApprove(_vault, type(uint256).max);
        IERC20(_weth).safeApprove(_uniV2Router, type(uint256).max);
        IERC20(_weth).safeApprove(_sushiRouter, type(uint256).max);
        IERC20(_weth).safeApprove(_npm, type(uint256).max);
        IERC20(_bwzc).safeApprove(_uniV3Router, type(uint256).max);
        IERC20(_bwzc).safeApprove(_vault, type(uint256).max);
        IERC20(_bwzc).safeApprove(_uniV2Router, type(uint256).max);
        IERC20(_bwzc).safeApprove(_sushiRouter, type(uint256).max);
        IERC20(_bwzc).safeApprove(_npm, type(uint256).max);

        DOMAIN_SEPARATOR = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256(bytes("WarehouseBalancerArb")),
            keccak256(bytes("1")),
            block.chainid,
            address(this)
        ));
    }

    // ──────────────────────────────────────────────────────────────
    //                  PRECISE $4M BOOTSTRAP FUNCTIONS
    // ──────────────────────────────────────────────────────────────

    function calculatePreciseBootstrap() public pure returns (
        uint256 totalBwzcNeeded,
        uint256 expectedDailyProfit,
        uint256 expectedDailyFees,
        uint256 bwzcConsumptionDaily,
        uint256 roiPerCycle
    ) {
        // BWZC needed for $600k buy leg @ $23.50
        uint256 bwzcForBuyLeg = (600_000 * 1e6 * 1e18) / BALANCER_PRICE_USD;
        
        // BWZC needed for $600k seed leg
        uint256 bwzcForSeedLeg = bwzcForBuyLeg;
        
        totalBwzcNeeded = bwzcForBuyLeg + bwzcForSeedLeg;
        
        // Expected profit calculations
        uint256 bwzcBought = (600_000 * 1e6 * 1e18) / BALANCER_PRICE_USD;
        uint256 expectedReturn = (bwzcBought * UNIV3_TARGET_PRICE_USD) / 1e18;
        expectedDailyProfit = PROFIT_PER_CYCLE_USD * CYCLES_PER_DAY;
        expectedDailyFees = FEES_PER_CYCLE_USD * CYCLES_PER_DAY;
        bwzcConsumptionDaily = BWZC_PER_CYCLE * CYCLES_PER_DAY;
        
        roiPerCycle = ((expectedReturn - 600_000 * 1e6) * 10000) / (600_000 * 1e6);
        
        return (
            totalBwzcNeeded,
            expectedDailyProfit,
            expectedDailyFees,
            bwzcConsumptionDaily,
            roiPerCycle
        );
    }

    function executePreciseBootstrap() external nonReentrant onlySCW {
        // Verify SCW has enough BWZC (30M from Etherscan)
        uint256 scwBwzcBalance = IERC20(bwzc).balanceOf(scw);
        (uint256 totalBwzcNeeded, , , , ) = calculatePreciseBootstrap();
        
        require(scwBwzcBalance >= totalBwzcNeeded, "SCW insufficient BWZC");
        
        // Transfer BWZC from SCW
        IERC20(bwzc).safeTransferFrom(scw, address(this), totalBwzcNeeded);
        
        // Execute in precise phases
        _phase1PreSeed(totalBwzcNeeded / 2);
        _phase2BorrowAndArbitrage(totalBwzcNeeded / 2);
        
        emit BootstrapExecuted(totalBwzcNeeded, TOTAL_BOOTSTRAP_USD);
    }

    function _phase1PreSeed(uint256 bwzcAmount) internal {
        // Split between USDC and WETH pools (50/50)
        uint256 bwzcForUsdc = bwzcAmount / 2;
        uint256 bwzcForWeth = bwzcAmount - bwzcForUsdc;
        
        // Calculate required stablecoin amounts
        uint256 usdcForSeed = (bwzcForUsdc * BALANCER_PRICE_USD) / 1e18;
        uint256 wethForSeed = (bwzcForWeth * BALANCER_PRICE_USD) / 1e18;
        
        // Convert WETH value to actual WETH
        uint256 ethUsdPrice = _getEthUsdPrice();
        uint256 wethAmount = (wethForSeed * 1e18) / ethUsdPrice;
        
        // Pre-seed Balancer pools
        _addToBalancerPoolPrecise(balBWUSDCId, usdcForSeed, bwzcForUsdc);
        _addToBalancerPoolPrecise(balBWWETHId, wethAmount, bwzcForWeth);
        
        // Pre-seed other venues (UniV2, Sushi) with 1/3 each
        _preSeedOtherVenues(usdcForSeed / 3, wethAmount / 3, bwzcAmount / 6);
    }

    function _phase2BorrowAndArbitrage(uint256 bwzcForArbitrage) internal {
        // Borrow $4M from Balancer (50/50 USDC/WETH)
        uint256 ethUsdPrice = _getEthUsdPrice();
        uint256 usdcBorrow = TOTAL_BOOTSTRAP_USD / 2;
        uint256 wethBorrow = (TOTAL_BOOTSTRAP_USD / 2 * 1e18) / ethUsdPrice;
        
        address[] memory tokens = new address[](2);
        tokens[0] = usdc;
        tokens[1] = weth;
        
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = usdcBorrow;
        amounts[1] = wethBorrow;
        
        // Encode precise parameters
        bytes memory userData = abi.encode(
            bwzcForArbitrage,
            usdcBorrow,
            wethBorrow,
            block.timestamp + 1 hours
        );
        
        // Execute flash loan
        IBalancerVault(vault).flashLoan(address(this), tokens, amounts, userData);
    }

    // ──────────────────────────────────────────────────────────────
    //                  PRECISE FLASH LOAN EXECUTION
    // ──────────────────────────────────────────────────────────────

    function receiveFlashLoan(
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata feeAmounts,
        bytes calldata userData
    ) external override nonReentrant {
        require(msg.sender == vault, "Not vault");
        require(tokens[0] == usdc && tokens[1] == weth, "Invalid tokens");
        
        (
            uint256 bwzcForArbitrage,
            uint256 usdcBorrowed,
            uint256 wethBorrowed,
            uint256 deadline
        ) = abi.decode(userData, (uint256, uint256, uint256, uint256));
        
        require(block.timestamp <= deadline, "Flash loan expired");
        
        // Execute precise arbitrage
        (uint256 usdcProfit, uint256 wethProfit, uint256 bwzcBought) = 
            _executePreciseArbitrage(usdcBorrowed, wethBorrowed, bwzcForArbitrage);
        
        // Calculate 3% pool deepening from total borrowed amount
        uint256 totalBorrowValue = usdcBorrowed + (wethBorrowed * _getEthUsdPrice() / 1e18);
        uint256 deepeningValue = totalBorrowValue * DEEPENING_PERCENT_BPS / 10000; // 3%
        
        // Buy BWZC for deepening using profits
        uint256 bwzcForDeepening = (deepeningValue * 1e18) / BALANCER_PRICE_USD;
        
        // Ensure we have enough profit
        uint256 totalProfitValue = usdcProfit + (wethProfit * _getEthUsdPrice() / 1e18);
        require(totalProfitValue >= deepeningValue, "Insufficient profit for deepening");
        
        // Distribute profits and execute deepening
        _distributeProfitsAndDeepen(
            usdcProfit,
            wethProfit,
            bwzcForDeepening,
            deepeningValue
        );
        
        // Repay flash loan
        IERC20(usdc).safeTransfer(vault, usdcBorrowed + feeAmounts[0]);
        IERC20(weth).safeTransfer(vault, wethBorrowed + feeAmounts[1]);
        
        // Return BWZC loan to SCW
        IERC20(bwzc).safeTransfer(scw, bwzcForArbitrage);
        
        cycleCount++;
        _maybeTopEntryPoint();
        lastCycleTimestamp = block.timestamp;
        
        emit PreciseCycleExecuted(
            cycleCount,
            usdcProfit,
            wethProfit,
            bwzcBought,
            bwzcForDeepening,
            deepeningValue
        );
    }

    function _executePreciseArbitrage(
        uint256 usdcAmount,
        uint256 wethAmount,
        uint256 expectedBwzc
    ) internal returns (uint256 usdcProfit, uint256 wethProfit, uint256 bwzcBought) {
        // Execute buy on Balancer (USDC and WETH legs)
        uint256 bwzcFromUsdc = _buyOnBalancerUSDC(usdcAmount);
        uint256 bwzcFromWeth = _buyOnBalancerWETH(wethAmount);
        
        bwzcBought = bwzcFromUsdc + bwzcFromWeth;
        require(bwzcBought >= expectedBwzc * 95 / 100, "Buy insufficient");
        
        // Execute sell on Uniswap V3
        uint256 usdcReceived = _sellOnUniswapV3USDC(bwzcFromUsdc);
        uint256 wethReceived = _sellOnUniswapV3WETH(bwzcFromWeth);
        
        // Calculate profits
        usdcProfit = usdcReceived > usdcAmount ? usdcReceived - usdcAmount : 0;
        wethProfit = wethReceived > wethAmount ? wethReceived - wethAmount : 0;
        
        return (usdcProfit, wethProfit, bwzcBought);
    }

    function _distributeProfitsAndDeepen(
        uint256 usdcProfit,
        uint256 wethProfit,
        uint256 bwzcForDeepening,
        uint256 deepeningValue
    ) internal {
        // Calculate fees (5% of profit)
        uint256 usdcFees = usdcProfit * 500 / 10000;
        uint256 wethFees = wethProfit * 500 / 10000;
        
        // Send fees to EOA (owner)
        if (usdcFees > 0) IERC20(usdc).safeTransfer(owner, usdcFees);
        if (wethFees > 0) IERC20(weth).safeTransfer(owner, wethFees);
        
        // Calculate net profits (after fees)
        uint256 usdcNet = usdcProfit - usdcFees;
        uint256 wethNet = wethProfit - wethFees;
        
        // Buy BWZC for pool deepening from profits
        uint256 totalProfitValue = usdcNet + (wethNet * _getEthUsdPrice() / 1e18);
        require(totalProfitValue >= deepeningValue, "Insufficient net profit");
        
        // Execute deepening
        _deepenAllPools(bwzcForDeepening);
        
        // Send remaining profits to SCW
        uint256 remainingUsdc = IERC20(usdc).balanceOf(address(this));
        uint256 remainingWeth = IERC20(weth).balanceOf(address(this));
        
        if (remainingUsdc > 0) IERC20(usdc).safeTransfer(scw, remainingUsdc);
        if (remainingWeth > 0) IERC20(weth).safeTransfer(scw, remainingWeth);
        
        // Update permanent liquidity tracking
        uint256 ethUsd = _getEthUsdPrice();
        permanentUSDCAdded += deepeningValue / 2;
        permanentWETHAdded += (deepeningValue / 2 * 1e18) / ethUsd;
        permanentBWZCAdded += bwzcForDeepening;
    }

    function _deepenAllPools(uint256 bwzcAmount) internal {
        // Split 50/50 between USDC and WETH pairs
        uint256 bwzcForUsdc = bwzcAmount / 2;
        uint256 bwzcForWeth = bwzcAmount - bwzcForUsdc;
        
        // Calculate token amounts based on current prices
        uint256 usdcAmount = (bwzcForUsdc * BALANCER_PRICE_USD) / 1e18;
        uint256 wethAmount = (bwzcForWeth * BALANCER_PRICE_USD) / (2 * _getEthUsdPrice());
        
        // Split deepening across 4 venues (25% each)
        uint256 quarterUsdc = usdcAmount / 4;
        uint256 quarterWeth = wethAmount / 4;
        uint256 quarterBwzcUsdc = bwzcForUsdc / 4;
        uint256 quarterBwzcWeth = bwzcForWeth / 4;
        
        // Add to Balancer
        _addToBalancerPoolPrecise(balBWUSDCId, quarterUsdc, quarterBwzcUsdc);
        _addToBalancerPoolPrecise(balBWWETHId, quarterWeth, quarterBwzcWeth);
        
        // Add to Uniswap V3
        _addLiquidityV3(usdc, quarterUsdc, quarterBwzcUsdc);
        _addLiquidityV3(weth, quarterWeth, quarterBwzcWeth);
        
        // Add to Uniswap V2
        IUniswapV2Router(uniV2Router).addLiquidity(
            usdc, bwzc, quarterUsdc, quarterBwzcUsdc, 0, 0, address(this), block.timestamp + 300
        );
        IUniswapV2Router(uniV2Router).addLiquidity(
            weth, bwzc, quarterWeth, quarterBwzcWeth, 0, 0, address(this), block.timestamp + 300
        );
        
        // Add to Sushi
        IUniswapV2Router(sushiRouter).addLiquidity(
            usdc, bwzc, quarterUsdc, quarterBwzcUsdc, 0, 0, address(this), block.timestamp + 300
        );
        IUniswapV2Router(sushiRouter).addLiquidity(
            weth, bwzc, quarterWeth, quarterBwzcWeth, 0, 0, address(this), block.timestamp + 300
        );
    }

    // ──────────────────────────────────────────────────────────────
    //                  PREDICTIVE ANALYTICS & MONITORING
    // ──────────────────────────────────────────────────────────────

    function predictBalances(uint256 daysToSimulate) external pure returns (
        uint256 scwUsdc,
        uint256 scwWeth,
        uint256 scwBwzc,
        uint256 eoaUsdc,
        uint256 eoaWeth,
        uint256 poolUsdcAdded,
        uint256 poolWethAdded,
        uint256 poolBwzcAdded
    ) {
        uint256 cycles = daysToSimulate * CYCLES_PER_DAY;
        
        // Starting from SCW: 30M BWZC
        uint256 initialBwzc = 30_000_000 * 1e18;
        
        // BWZC consumption for deepening
        uint256 bwzcConsumed = BWZC_PER_CYCLE * cycles;
        
        // Profits accumulation (50% USDC, 50% WETH value)
        uint256 totalProfitUsdc = PROFIT_PER_CYCLE_USD * cycles / 2;
        uint256 totalProfitWethValue = PROFIT_PER_CYCLE_USD * cycles / 2;
        uint256 ethUsdPrice = 3003 * 1e18; // Your ETH price
        uint256 totalProfitWeth = (totalProfitWethValue * 1e18) / ethUsdPrice;
        
        // Fees accumulation (5% of profits)
        uint256 totalFeesUsdc = totalProfitUsdc * 500 / 10000;
        uint256 totalFeesWeth = totalProfitWeth * 500 / 10000;
        
        // Pool deepening (3% of $4M per cycle)
        uint256 totalDeepeningValue = (TOTAL_BOOTSTRAP_USD * DEEPENING_PERCENT_BPS / 10000) * cycles;
        uint256 poolUsdcAddition = totalDeepeningValue / 2;
        uint256 poolWethAddition = (totalDeepeningValue / 2 * 1e18) / ethUsdPrice;
        
        return (
            totalProfitUsdc - poolUsdcAddition - totalFeesUsdc, // SCW USDC (profit minus deepening & fees)
            totalProfitWeth - poolWethAddition - totalFeesWeth, // SCW WETH
            initialBwzc - bwzcConsumed,                        // SCW BWZC (consumed for deepening)
            totalFeesUsdc,                                     // EOA USDC fees
            totalFeesWeth,                                     // EOA WETH fees
            poolUsdcAddition,                                  // Pool USDC added
            poolWethAddition,                                  // Pool WETH added
            bwzcConsumed                                       // Pool BWZC added
        );
    }

    function getLiveBalances() external view returns (
        uint256 scwUsdc,
        uint256 scwWeth,
        uint256 scwBwzc,
        uint256 eoaUsdc,
        uint256 eoaWeth,
        uint256 eoaBwzc,
        uint256 contractUsdc,
        uint256 contractWeth,
        uint256 contractBwzc,
        uint256 poolUsdc,
        uint256 poolWeth,
        uint256 poolBwzc
    ) {
        scwUsdc = IERC20(usdc).balanceOf(scw);
        scwWeth = IERC20(weth).balanceOf(scw);
        scwBwzc = IERC20(bwzc).balanceOf(scw);
        
        eoaUsdc = IERC20(usdc).balanceOf(owner);
        eoaWeth = IERC20(weth).balanceOf(owner);
        eoaBwzc = IERC20(bwzc).balanceOf(owner);
        
        contractUsdc = IERC20(usdc).balanceOf(address(this));
        contractWeth = IERC20(weth).balanceOf(address(this));
        contractBwzc = IERC20(bwzc).balanceOf(address(this));
        
        // Get actual pool balances
        (poolUsdc, poolWeth, poolBwzc) = _getActualPoolBalances();
        
        return (
            scwUsdc, scwWeth, scwBwzc,
            eoaUsdc, eoaWeth, eoaBwzc,
            contractUsdc, contractWeth, contractBwzc,
            poolUsdc, poolWeth, poolBwzc
        );
    }

    // ──────────────────────────────────────────────────────────────
    //                  HELPER FUNCTIONS (UPDATED)
    // ──────────────────────────────────────────────────────────────

    function _getEthUsdPrice() internal view returns (uint256) {
        (uint80 roundId, int256 price, , uint256 updatedAt, uint80 answeredInRound) = 
            IChainlinkFeed(chainlinkEthUsd).latestRoundData();
        if (updatedAt == 0 || answeredInRound < roundId) revert StaleOracle();
        if (block.timestamp - updatedAt > stalenessThreshold) revert StaleOracle();
        return uint256(price) * 1e10;
    }

    function _buyOnBalancerUSDC(uint256 usdcAmount) internal returns (uint256 bwzcOut) {
        IBalancerVault.SingleSwap memory ss = IBalancerVault.SingleSwap({
            poolId: balBWUSDCId,
            kind: 0, // GIVEN_IN
            assetIn: usdc,
            assetOut: bwzc,
            amount: usdcAmount,
            userData: ""
        });
        IBalancerVault.FundManagement memory fm = IBalancerVault.FundManagement({
            sender: address(this),
            fromInternalBalance: false,
            recipient: payable(address(this)),
            toInternalBalance: false
        });
        
        uint256 minOut = (usdcAmount * 1e18 * 95) / (BALANCER_PRICE_USD * 100); // 5% slippage
        bwzcOut = IBalancerVault(vault).swap(ss, fm, minOut, block.timestamp + 300);
        return bwzcOut;
    }

    function _buyOnBalancerWETH(uint256 wethAmount) internal returns (uint256 bwzcOut) {
        IBalancerVault.SingleSwap memory ss = IBalancerVault.SingleSwap({
            poolId: balBWWETHId,
            kind: 0,
            assetIn: weth,
            assetOut: bwzc,
            amount: wethAmount,
            userData: ""
        });
        IBalancerVault.FundManagement memory fm = IBalancerVault.FundManagement({
            sender: address(this),
            fromInternalBalance: false,
            recipient: payable(address(this)),
            toInternalBalance: false
        });
        
        uint256 ethUsd = _getEthUsdPrice();
        uint256 usdValue = (wethAmount * ethUsd) / 1e18;
        uint256 minOut = (usdValue * 1e18 * 95) / (BALANCER_PRICE_USD * 100);
        bwzcOut = IBalancerVault(vault).swap(ss, fm, minOut, block.timestamp + 300);
        return bwzcOut;
    }

    function _sellOnUniswapV3USDC(uint256 bwzcAmount) internal returns (uint256 usdcOut) {
        IUniswapV3Router.ExactInputSingleParams memory params = IUniswapV3Router.ExactInputSingleParams({
            tokenIn: bwzc,
            tokenOut: usdc,
            fee: 3000,
            recipient: address(this),
            deadline: block.timestamp + 300,
            amountIn: bwzcAmount,
            amountOutMinimum: (bwzcAmount * UNIV3_TARGET_PRICE_USD * 95) / (1e18 * 100), // 5% slippage
            sqrtPriceLimitX96: 0
        });
        usdcOut = IUniswapV3Router(uniV3Router).exactInputSingle(params);
        return usdcOut;
    }

    function _sellOnUniswapV3WETH(uint256 bwzcAmount) internal returns (uint256 wethOut) {
        IUniswapV3Router.ExactInputSingleParams memory params = IUniswapV3Router.ExactInputSingleParams({
            tokenIn: bwzc,
            tokenOut: weth,
            fee: 3000,
            recipient: address(this),
            deadline: block.timestamp + 300,
            amountIn: bwzcAmount,
            amountOutMinimum: (bwzcAmount * UNIV3_TARGET_PRICE_USD * 95) / (_getEthUsdPrice() * 100),
            sqrtPriceLimitX96: 0
        });
        wethOut = IUniswapV3Router(uniV3Router).exactInputSingle(params);
        return wethOut;
    }

    function _addToBalancerPoolPrecise(bytes32 poolId, uint256 stableAmount, uint256 bwzcAmount) internal {
        (address[] memory tokens, , ) = IBalancerVault(vault).getPoolTokens(poolId);
        uint256[] memory maxAmountsIn = new uint256[](tokens.length);
        
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] == usdc || tokens[i] == weth) {
                maxAmountsIn[i] = stableAmount;
            } else if (tokens[i] == bwzc) {
                maxAmountsIn[i] = bwzcAmount;
            }
        }
        
        bytes memory userData = abi.encode(1, maxAmountsIn, 1); // EXACT_TOKENS_IN_FOR_BPT_OUT
        IBalancerVault.JoinPoolRequest memory request = IBalancerVault.JoinPoolRequest({
            assets: tokens,
            maxAmountsIn: maxAmountsIn,
            userData: userData,
            fromInternalBalance: false
        });
        
        IBalancerVault(vault).joinPool(poolId, address(this), address(this), request);
    }

    function _preSeedOtherVenues(uint256 usdcAmount, uint256 wethAmount, uint256 bwzcAmount) internal {
        // Seed Uniswap V2
        IUniswapV2Router(uniV2Router).addLiquidity(
            usdc, bwzc, usdcAmount, bwzcAmount / 2, 0, 0, address(this), block.timestamp + 300
        );
        IUniswapV2Router(uniV2Router).addLiquidity(
            weth, bwzc, wethAmount, bwzcAmount / 2, 0, 0, address(this), block.timestamp + 300
        );
        
        // Seed Sushi
        IUniswapV2Router(sushiRouter).addLiquidity(
            usdc, bwzc, usdcAmount, bwzcAmount / 2, 0, 0, address(this), block.timestamp + 300
        );
        IUniswapV2Router(sushiRouter).addLiquidity(
            weth, bwzc, wethAmount, bwzcAmount / 2, 0, 0, address(this), block.timestamp + 300
        );
    }

    function _getActualPoolBalances() internal view returns (
        uint256 totalUsdc,
        uint256 totalWeth,
        uint256 totalBwzc
    ) {
        // Balancer pools
        (address[] memory tokens1, uint256[] memory balances1, ) = 
            IBalancerVault(vault).getPoolTokens(balBWUSDCId);
        
        (address[] memory tokens2, uint256[] memory balances2, ) = 
            IBalancerVault(vault).getPoolTokens(balBWWETHId);
        
        for (uint256 i = 0; i < tokens1.length; i++) {
            if (tokens1[i] == usdc) totalUsdc += balances1[i];
            if (tokens1[i] == bwzc) totalBwzc += balances1[i];
        }
        
        for (uint256 i = 0; i < tokens2.length; i++) {
            if (tokens2[i] == weth) totalWeth += balances2[i];
            if (tokens2[i] == bwzc) totalBwzc += balances2[i];
        }
        
        return (totalUsdc, totalWeth, totalBwzc);
    }

    // ──────────────────────────────────────────────────────────────
    //                  ORIGINAL FUNCTIONS (PRESERVED)
    // ──────────────────────────────────────────────────────────────

    function _quoteBest(address tokenIn, address tokenOut, uint256 amountIn, uint24 fee) internal returns (uint256 amountOut) {
        if (amountIn < minQuoteThreshold) revert LowLiquidity();

        IQuoterV2.QuoteExactInputSingleParams memory params = IQuoterV2.QuoteExactInputSingleParams(tokenIn, tokenOut, amountIn, fee, 0);
        (uint256 v3Out, , , ) = IQuoterV2(quoterV2).quoteExactInputSingle(params);

        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;
        uint256[] memory v2OutArr = IUniswapV2Router(uniV2Router).getAmountsOut(amountIn, path);
        uint256 v2Out = v2OutArr[1];

        uint256[] memory sushiOutArr = IUniswapV2Router(sushiRouter).getAmountsOut(amountIn, path);
        uint256 sushiOut = sushiOutArr[1];

        bytes32 poolId = tokenIn == usdc ? balBWUSDCId : balBWWETHId;
        IBalancerVault.SingleSwap memory ss = IBalancerVault.SingleSwap(poolId, 0, tokenIn, tokenOut, amountIn, "");
        IBalancerVault.FundManagement memory fm = IBalancerVault.FundManagement(address(this), false, payable(address(this)), false);
        uint256 balOut = IBalancerVault(vault).swap(ss, fm, 0, block.timestamp + 300);

        amountOut = MathLib.max(MathLib.max(v3Out, v2Out), MathLib.max(sushiOut, balOut));
    }

    function _addLiquidityV3(address paired, uint256 pairedAmount, uint256 bwzcAmount) internal returns (uint256 tokenId) {
        address pool = paired == usdc ? uniV3UsdcPool : uniV3WethPool;
        ( , int24 tick, , , , , ) = IUniswapV3Pool(pool).slot0();
        int24 tickSpacing = 60;
        int24 tickLower = tick - tickSpacing * 5;
        int24 tickUpper = tick + tickSpacing * 5;

        address token0 = paired < bwzc ? paired : bwzc;
        address token1 = paired < bwzc ? bwzc : paired;
        uint256 amount0Desired = token0 == paired ? pairedAmount : bwzcAmount;
        uint256 amount1Desired = token0 == paired ? bwzcAmount : pairedAmount;

        INonfungiblePositionManager.MintParams memory params = INonfungiblePositionManager.MintParams({
            token0: token0,
            token1: token1,
            fee: 3000,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: amount0Desired,
            amount1Desired: amount1Desired,
            amount0Min: amount0Desired * (10000 - epsilonBps) / 10000,
            amount1Min: amount1Desired * (10000 - epsilonBps) / 10000,
            recipient: address(this),
            deadline: block.timestamp + 300
        });
        (tokenId, , , ) = INonfungiblePositionManager(npm).mint(params);

        if (paired == usdc) v3UsdcBwTokenIds.push(tokenId);
        else v3WethBwTokenIds.push(tokenId);
        
        return tokenId;
    }

    function _maybeTopEntryPoint() internal nonReentrant {
        address pm = activePaymaster == 0 ? paymasterA : paymasterB;
        if (pm == address(0)) return;

        uint256 bal = IEntryPoint(entryPoint).balanceOf(pm);
        if (bal >= targetDepositWei) return;

        uint256 draw = (targetDepositWei - bal) * paymasterDrawBps / 10000;
        uint256 wethBal = IERC20(weth).balanceOf(address(this));
        if (wethBal < draw) return;

        IWETH(weth).withdraw(draw);
        try IEntryPoint(entryPoint).depositTo{value: draw}(pm) {
            emit PaymasterTopped(pm, draw, bal + draw);
        } catch {
            revert InsufficientBalance();
        }
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

    // ──────────────────────────────────────────────────────────────
    //                  CONFIGURATION SETTERS
    // ──────────────────────────────────────────────────────────────

    function setAlpha(uint256 newAlpha) external onlyOwner {
        require(newAlpha >= 1e18 && newAlpha <= 10e18, "InvalidParameter");
        emit ConfigUpdated("alpha", alpha, newAlpha);
        alpha = newAlpha;
    }

    function setBeta(uint256 newBeta) external onlyOwner {
        require(newBeta >= 1e17 && newBeta <= 2e18, "InvalidParameter");
        emit ConfigUpdated("beta", beta, newBeta);
        beta = newBeta;
    }

    function setGamma(uint256 newGamma) external onlyOwner {
        require(newGamma >= 1e15 && newGamma <= 5e16, "InvalidParameter");
        emit ConfigUpdated("gamma", gamma, newGamma);
        gamma = newGamma;
    }

    function setKappa(uint256 newKappa) external onlyOwner {
        require(newKappa >= 1e15 && newKappa <= 5e16, "InvalidParameter");
        emit ConfigUpdated("kappa", kappa, newKappa);
        kappa = newKappa;
    }

    function setEpsilonBps(uint256 newEpsilonBps) external onlyOwner {
        require(newEpsilonBps >= 10 && newEpsilonBps <= 100, "InvalidParameter");
        emit ConfigUpdated("epsilonBps", epsilonBps, newEpsilonBps);
        epsilonBps = newEpsilonBps;
    }

    function setMaxDeviationBps(uint256 newMaxDeviationBps) external onlyOwner {
        require(newMaxDeviationBps >= 500 && newMaxDeviationBps <= 2000, "InvalidParameter");
        emit ConfigUpdated("maxDeviationBps", maxDeviationBps, newMaxDeviationBps);
        maxDeviationBps = newMaxDeviationBps;
    }

    // ──────────────────────────────────────────────────────────────
    //                  ORIGINAL KICK FUNCTION (FOR BACKWARD COMPAT)
    // ──────────────────────────────────────────────────────────────

    function kick(SignedKick calldata signedKick) external {
        require(block.timestamp <= signedKick.deadline, "expired");
        require(!usedNonces[msg.sender][signedKick.nonce], "nonce used");
        usedNonces[msg.sender][signedKick.nonce] = true;

        bytes32 structHash = keccak256(abi.encode(KICK_TYPEHASH, signedKick.bundleId, signedKick.deadline, signedKick.nonce));
        bytes32 hash = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
        address signer = ecrecover(hash, signedKick.v, signedKick.r, signedKick.s);
        require(signer == scw, "invalid sig");

        address[] memory tokens = new address[](2);
        tokens[0] = usdc; tokens[1] = weth;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1e6;
        amounts[1] = 1e18 / _getEthUsdPrice();
        bytes memory userData = abi.encode(signedKick.bundleId, 600, 600, 1e3, 1e3);

        IBalancerVault(vault).flashLoan(address(this), tokens, amounts, userData);
    }

    // ──────────────────────────────────────────────────────────────
    //                  DEPRECATED FUNCTIONS (FOR COMPATIBILITY)
    // ──────────────────────────────────────────────────────────────

    function harvestAllFees() external pure returns (uint256 feeUsdc, uint256 feeWeth, uint256 feeBw) {
        // Fees are now handled in _distributeProfitsAndDeepen
        return (0, 0, 0);
    }
    
    function bootstrapLargeCycleUpgraded() external {
        // Deprecated - use executePreciseBootstrap instead
        revert("Use executePreciseBootstrap()");
    }
}
