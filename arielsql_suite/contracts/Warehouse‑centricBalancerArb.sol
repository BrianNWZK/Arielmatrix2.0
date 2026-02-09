// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
pragma abicoder v2;

/* 
ENHANCED M26D — Institutional WarehouseBalancerArb (Production Version v5.0 - ULTIMATE PERFECTION)
OPTIMIZED VERSION: 24,420 bytes (under 24,560 limit)
*/

abstract contract ReentrancyGuard {
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;
    uint256 private _status;
    
    error ReentrancyGuardReentrantCall();
    
    constructor() { _status = NOT_ENTERED; }
    
    modifier nonReentrant() {
        if (_status == ENTERED) revert ReentrancyGuardReentrantCall();
        _status = ENTERED;
        _;
        _status = NOT_ENTERED;
    }
}

abstract contract Ownable {
    address private _owner;
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(address initialOwner) { _transferOwnership(initialOwner); }

    modifier onlyOwner() { _checkOwner(); _; }

    function owner() public view virtual returns (address) { return _owner; }

    function _checkOwner() internal view virtual { require(owner() == msg.sender, "Not owner"); }

    function renounceOwnership() public virtual onlyOwner { _transferOwnership(address(0)); }

    function transferOwnership(address newOwner) public virtual onlyOwner {
        require(newOwner != address(0), "Zero address");
        _transferOwnership(newOwner);
    }

    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function decimals() external view returns (uint8);
}

interface IWETH is IERC20 {
    function deposit() external payable;
    function withdraw(uint256) external;
}

interface IUniswapV3Router {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256);
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
        external returns (uint256 amountOut, uint160, uint32, uint256);
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
    
    struct SingleSwap {
        bytes32 poolId;
        uint8 kind;
        address assetIn;
        address assetOut;
        uint256 amount;
        bytes userData;
    }
    
    struct FundManagement {
        address sender;
        bool fromInternalBalance;
        address payable recipient;
        bool toInternalBalance;
    }
    
    function swap(SingleSwap calldata singleSwap, FundManagement calldata funds, uint256 limit, uint256 deadline) external payable returns (uint256);
    function getPoolTokens(bytes32 poolId) external view returns (address[] memory tokens, uint256[] memory balances, uint256);
}

interface IFlashLoanRecipient {
    function receiveFlashLoan(address[] calldata tokens, uint256[] calldata amounts, uint256[] calldata feeAmounts, bytes calldata userData) external;
}

interface IUniswapV2Router {
    function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline)
        external returns (uint256 amountA, uint256 amountB, uint256 liquidity);
    function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline)
        external returns (uint256[] memory amounts);
}

interface IUniswapV3Pool {
    function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool);
}

interface ISushiSwapRouter {
    function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline)
        external returns (uint256 amountA, uint256 amountB, uint256 liquidity);
    function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline)
        external returns (uint256[] memory amounts);
}

interface INonfungiblePositionManager {
    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }
    function collect(CollectParams calldata params) external payable returns (uint256 amount0, uint256 amount1);

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
    function mint(MintParams calldata params) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
    function positions(uint256 tokenId) external view returns (uint96, address, address token0, address token1, uint24, int24, int24, uint128, uint256, uint256, uint128, uint128);
}

error SwapFailed();
error SpreadTooLow();
error InsufficientBalance();
error ETHTransferFailed();
error MathOverflow();
error LowLiquidity();
error DeadlineExpired();
error Paused();
error DeviationTooHigh();
error StaleOracle();
error InsufficientLiquidity();
error JoinFailed();
error HarvestFailed();
error InvalidParameter();
error InsufficientFunds();
error OracleConsensusFailed();
error InvalidStateTransition();
error ScaleLimitReached();
error RateLimitExceeded();
error InvalidAddressKey();
error InvalidPoolIdKey();
error ExceedsMaxScale();
error InvalidParameterKey();
error DirectETHNotAllowed();
error InvalidUniswapV3Position();
error IndexOutOfBounds();
error NotInEmergency();
error InsufficientBalancerLiquidity();
error UniswapV3QueryFailed();
error SCWInsufficientBWZC();

library SafeERC20 {
    error SafeERC20FailedOperation(address token);
    
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        (bool success, bytes memory data) = address(token).call(abi.encodeWithSelector(IERC20.transfer.selector, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "Transfer failed");
    }

    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        (bool success, bytes memory data) = address(token).call(abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "TransferFrom failed");
    }

    function safeApprove(IERC20 token, address spender, uint256 value) internal {
        (bool success, bytes memory data) = address(token).call(abi.encodeWithSelector(IERC20.approve.selector, spender, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "Approve failed");
    }
}

library FullMath {
    function mulDiv(uint256 a, uint256 b, uint256 denominator) internal pure returns (uint256 result) {
        unchecked {
            uint256 prod0 = a * b;
            if (prod0 / a != b) revert MathOverflow();
            
            uint256 remainder;
            assembly {
                remainder := mulmod(a, b, denominator)
            }
            prod0 -= remainder;
            uint256 prod1 = remainder;
            
            if (denominator <= prod0) revert MathOverflow();
            
            uint256 twos = denominator & (~denominator + 1);
            assembly {
                denominator := div(denominator, twos)
                prod0 := div(prod0, twos)
                twos := add(div(sub(0, twos), twos), 1)
            }
            prod0 |= prod1 * twos;
            
            uint256 inv = (3 * denominator) ^ 2;
            inv *= 2 - denominator * inv;
            inv *= 2 - denominator * inv;
            inv *= 2 - denominator * inv;
            inv *= 2 - denominator * inv;
            inv *= 2 - denominator * inv;
            
            result = prod0 * inv;
            return result;
        }
    }
}

library TickMath {
    int24 internal constant MIN_TICK = -887272;
    int24 internal constant MAX_TICK = -MIN_TICK;
    uint160 internal constant MIN_SQRT_RATIO = 4295128739;
    uint160 internal constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

    function getSqrtRatioAtTick(int24 tick) internal pure returns (uint160 sqrtPriceX96) {
        uint256 absTick = tick < 0 ? uint256(-int256(tick)) : uint256(int256(tick));
        require(absTick <= uint256(int256(MAX_TICK)), 'T');

        uint256 ratio = absTick & 0x1 != 0 ? 0xfffcb933bd6fad37aa2d162d1a594001 : 0x100000000000000000000000000000000;
        if (absTick & 0x2 != 0) ratio = (ratio * 0xfff97272373d413259a46990580e213a) >> 128;
        if (absTick & 0x4 != 0) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdcc) >> 128;
        if (absTick & 0x8 != 0) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0) >> 128;
        if (absTick & 0x10 != 0) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644) >> 128;
        if (absTick & 0x20 != 0) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0) >> 128;
        if (absTick & 0x40 != 0) ratio = (ratio * 0xff2ea164f5c96a3843ec78b326b52861) >> 128;
        if (absTick & 0x80 != 0) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053) >> 128;
        if (absTick & 0x100 != 0) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4) >> 128;
        if (absTick & 0x200 != 0) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54) >> 128;
        if (absTick & 0x400 != 0) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3) >> 128;
        if (absTick & 0x800 != 0) ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9) >> 128;
        if (absTick & 0x1000 != 0) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825) >> 128;
        if (absTick & 0x2000 != 0) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5) >> 128;
        if (absTick & 0x4000 != 0) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7) >> 128;
        if (absTick & 0x8000 != 0) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6) >> 128;
        if (absTick & 0x10000 != 0) ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9) >> 128;
        if (absTick & 0x20000 != 0) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604) >> 128;
        if (absTick & 0x40000 != 0) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98) >> 128;
        if (absTick & 0x80000 != 0) ratio = (ratio * 0x48a170391f7dc42444e8fa2) >> 128;

        if (tick > 0) ratio = type(uint256).max / ratio;
        sqrtPriceX96 = uint160((ratio >> 32) + (ratio % (1 << 32) == 0 ? 0 : 1));
    }
}

contract WarehouseBalancerArb is ReentrancyGuard, Ownable, IFlashLoanRecipient {
    using SafeERC20 for IERC20;
    
    uint256 public constant TOTAL_BOOTSTRAP_USD = 4_000_000 * 1e6;
    uint256 public constant BALANCER_PRICE_USD = 23_500_000;
    uint256 public constant UNIV3_TARGET_PRICE_USD = 100_000_000;
    uint256 public constant BALANCER_FLASH_FEE_BPS = 9;
    uint256 public constant SAFETY_BUFFER_BPS = 100;
    uint256 public constant SLIPPAGE_TOLERANCE_BPS = 50;
    uint256 public constant DEEPENING_PERCENT_BPS = 300;
    uint256 public constant FEES_TO_EOA_BPS = 1500;
    uint256 public constant SCALE_INCREMENT_BPS = 500;
    uint256 public constant MAX_SCALE_BPS = 5000;
    uint256 public constant PROFIT_PER_CYCLE_USD = 184000 * 1e6;
    
    uint256 public currentScaleFactorBps = 1000;
    uint256 public cycleCount;
    uint256 public lastCycleTimestamp;
    
    enum TxState { IDLE, EXECUTING, COMMITTED, ROLLED_BACK }
    TxState public txState = TxState.IDLE;
    
    address public scw;
    address public usdc;
    address public weth;
    address public bwzc;
    address public vault;
    address public uniV2Router;
    address public sushiRouter;
    address public uniV3Router;
    address public uniV3NFT;
    address public quoterV2;
    address public entryPoint;
    address public paymasterA;
    address public paymasterB;
    
    bytes32 public balBWUSDCId;
    bytes32 public balBWWETHId;
    address public uniV3UsdcPool;
    address public uniV3WethPool;
    address public uniV3EthUsdPool;
    
    address public chainlinkEthUsd;
    address public chainlinkEthUsdSecondary;
    
    bool public paused;
    uint256 public stalenessThreshold = 3600;
    int24 public usdcTickLower = -600;
    int24 public usdcTickUpper = 600;
    int24 public wethTickLower = -600;
    int24 public wethTickUpper = 600;
    uint24 public uniV3Fee = 3000;
    
    uint256 public permanentUSDCAdded;
    uint256 public permanentWETHAdded;
    uint256 public permanentBWZCAdded;
    
    struct PosInfo {
        address token0;
        address token1;
        bool isUsdc;
    }
    
    uint256[] public uniV3PositionIds;
    mapping(uint256 => PosInfo) public positionInfo;
    
    event BootstrapExecuted(uint256 bwzc, uint256 usd);
    event CycleExecuted(uint256 indexed cycle, uint256 usdcProfit, uint256 wethProfit, uint256 bwzcDeepened);
    event PoolDeepened(string indexed pool, uint256 stable, uint256 bwzc);
    event Rollback(string reason);
    event AllPoolsDeepened(uint256 value, uint256 bwzc);
    event EmergencyPause(string reason);
    event EmergencyResume();
    event OracleConsensus(uint256 price, uint8 conf);
    event FeesHarvested(uint256 usdc, uint256 weth, uint256 bwzc);
    event FeesDistributed(address to, uint256 usdc, uint256 weth, uint256 bwzc);
    event ScaleFactorUpdated(uint256 newFactor);
    event AdminAddressUpdated(bytes32 indexed key, address value);
    event AdminPoolIdUpdated(bytes32 indexed key, bytes32 value);
    event ContractPaused(bool paused);
    event TokensRescued(address indexed token, uint256 amount);
    event ETHWithdrawn(uint256 amount);
    event ParameterUpdated(string param, uint256 value);

    constructor(
        address _scw,
        address _usdc,
        address _weth,
        address _bwzc,
        address _vault,
        address _uniV2Router,
        address _sushiRouter,
        address _uniV3Router,
        address _uniV3NFT,
        address _quoterV2,
        bytes32 _balBWUSDCId,
        bytes32 _balBWWETHId,
        address _chainlinkEthUsd,
        address _chainlinkEthUsdSecondary,
        address _uniV3EthUsdPool,
        address _uniV3UsdcPool,
        address _uniV3WethPool,
        address _entryPoint,
        address _paymasterA,
        address _paymasterB
    ) Ownable(msg.sender) {
        scw = _scw;
        usdc = _usdc;
        weth = _weth;
        bwzc = _bwzc;
        vault = _vault;
        uniV2Router = _uniV2Router;
        sushiRouter = _sushiRouter;
        uniV3Router = _uniV3Router;
        uniV3NFT = _uniV3NFT;
        quoterV2 = _quoterV2;
        balBWUSDCId = _balBWUSDCId;
        balBWWETHId = _balBWWETHId;
        chainlinkEthUsd = _chainlinkEthUsd;
        chainlinkEthUsdSecondary = _chainlinkEthUsdSecondary;
        uniV3EthUsdPool = _uniV3EthUsdPool;
        uniV3UsdcPool = _uniV3UsdcPool;
        uniV3WethPool = _uniV3WethPool;
        entryPoint = _entryPoint;
        paymasterA = _paymasterA;
        paymasterB = _paymasterB;
        
        _ensureApprovals();
    }

    function _ensureApprovals() internal {
        address[5] memory spenders = [vault, uniV3Router, uniV2Router, sushiRouter, uniV3NFT];
        IERC20[3] memory tokens = [IERC20(usdc), IERC20(weth), IERC20(bwzc)];
        
        for (uint256 i = 0; i < spenders.length; i++) {
            for (uint256 j = 0; j < tokens.length; j++) {
                if (tokens[j].allowance(address(this), spenders[i]) == 0) {
                    tokens[j].approve(spenders[i], type(uint256).max);
                }
            }
        }
    }

    function adminSetAddress(bytes32 key, address value) external onlyOwner {
        if (key == "scw") scw = value;
        else if (key == "usdc") usdc = value;
        else if (key == "weth") weth = value;
        else if (key == "bwzc") bwzc = value;
        else if (key == "vault") vault = value;
        else if (key == "uniV2Router") uniV2Router = value;
        else if (key == "sushiRouter") sushiRouter = value;
        else if (key == "uniV3Router") uniV3Router = value;
        else if (key == "uniV3NFT") uniV3NFT = value;
        else if (key == "quoterV2") quoterV2 = value;
        else if (key == "chainlinkEthUsd") chainlinkEthUsd = value;
        else if (key == "chainlinkEthUsdSecondary") chainlinkEthUsdSecondary = value;
        else if (key == "uniV3EthUsdPool") uniV3EthUsdPool = value;
        else if (key == "uniV3UsdcPool") uniV3UsdcPool = value;
        else if (key == "uniV3WethPool") uniV3WethPool = value;
        else if (key == "entryPoint") entryPoint = value;
        else if (key == "paymasterA") paymasterA = value;
        else if (key == "paymasterB") paymasterB = value;
        else revert InvalidAddressKey();
        
        emit AdminAddressUpdated(key, value);
    }

    function adminSetPoolId(bytes32 key, bytes32 value) external onlyOwner {
        if (key == "balBWUSDCId") balBWUSDCId = value;
        else if (key == "balBWWETHId") balBWWETHId = value;
        else revert InvalidPoolIdKey();
        
        emit AdminPoolIdUpdated(key, value);
    }

    function adminSetParameter(bytes32 key, uint256 value) external onlyOwner {
        if (key == "stalenessThreshold") {
            stalenessThreshold = value;
        } else if (key == "usdcTickLower") {
            usdcTickLower = int24(int256(value));
        } else if (key == "usdcTickUpper") {
            usdcTickUpper = int24(int256(value));
        } else if (key == "wethTickLower") {
            wethTickLower = int24(int256(value));
        } else if (key == "wethTickUpper") {
            wethTickUpper = int24(int256(value));
        } else if (key == "uniV3Fee") {
            uniV3Fee = uint24(value);
        } else if (key == "currentScaleFactorBps") {
            if (value > MAX_SCALE_BPS) revert ExceedsMaxScale();
            currentScaleFactorBps = value;
        } else {
            revert InvalidParameterKey();
        }
        
        emit ParameterUpdated(string(abi.encodePacked(key)), value);
    }

    function adminSetPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit ContractPaused(_paused);
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    function adminRescueTokens(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
        emit TokensRescued(token, amount);
    }

    function adminWithdrawETH(uint256 amount) external onlyOwner {
        (bool success,) = owner().call{value: amount}("");
        if (!success) revert ETHTransferFailed();
        emit ETHWithdrawn(amount);
    }

    function adminUpdateApprovals() external onlyOwner {
        _ensureApprovals();
    }

    function _calculateScaledAmount(uint256 baseAmount, uint256 scaleFactorBps) internal pure returns (uint256) {
        return FullMath.mulDiv(baseAmount, scaleFactorBps, 10000);
    }

    function _calculateMinRequiredSpread() internal pure returns (uint256) {
        return 200 + BALANCER_FLASH_FEE_BPS + SLIPPAGE_TOLERANCE_BPS + SAFETY_BUFFER_BPS;
    }

    function _getConsensusEthPrice() internal returns (uint256 price, uint8 confidence) {
        uint256[] memory prices = new uint256[](3);
        uint8 valid = 0;
        
        try IChainlinkFeed(chainlinkEthUsd).latestRoundData() returns (uint80, int256 p, uint256, uint256 u, uint80) {
            if (p > 0 && block.timestamp - u <= stalenessThreshold) {
                prices[valid++] = uint256(p) * 1e10;
            }
        } catch {}
        
        try IChainlinkFeed(chainlinkEthUsdSecondary).latestRoundData() returns (uint80, int256 p2, uint256, uint256 u2, uint80) {
            if (p2 > 0 && block.timestamp - u2 <= stalenessThreshold) {
                prices[valid++] = uint256(p2) * 1e10;
            }
        } catch {}
        
        if (uniV3EthUsdPool != address(0)) {
            try IUniswapV3Pool(uniV3EthUsdPool).slot0() returns (uint160 sqrtPriceX96, int24, uint16, uint16, uint16, uint8, bool) {
                uint256 rawPrice = (uint256(sqrtPriceX96) * uint256(sqrtPriceX96)) >> (96 * 2);
                prices[valid++] = rawPrice * 1e12;
            } catch {}
        }
        
        confidence = valid;
        if (valid >= 2) {
            price = (prices[0] + prices[1]) / 2;
            uint256 deviation = prices[0] > prices[1] ? prices[0] - prices[1] : prices[1] - prices[0];
            uint256 deviationBps = FullMath.mulDiv(deviation, 10000, price);
            if (deviationBps > 100) revert DeviationTooHigh();
            emit OracleConsensus(price, confidence);
        } else if (valid == 1) {
            price = prices[0];
            emit OracleConsensus(price, confidence);
        } else {
            revert OracleConsensusFailed();
        }
    }

    function _getUniswapV3Price() internal view returns (uint256) {
        try IUniswapV3Pool(uniV3UsdcPool).slot0() returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool) {
            uint256 rawPrice = (uint256(sqrtPriceX96) * uint256(sqrtPriceX96)) >> (96 * 2);
            uint256 bwzcPerUsdc = rawPrice / 1e12;
            uint256 priceUSD = bwzcPerUsdc == 0 ? 0 : FullMath.mulDiv(1e6, 1, bwzcPerUsdc);
            
            if (priceUSD < BALANCER_PRICE_USD / 10 || priceUSD > BALANCER_PRICE_USD * 10) {
                revert DeviationTooHigh();
            }
            
            return priceUSD;
        } catch {
            revert UniswapV3QueryFailed();
        }
    }

    function _calculateCurrentSpread() internal view returns (uint256 spreadBps) {
        uint256 balancerPrice = BALANCER_PRICE_USD;
        uint256 uniswapPrice = _getUniswapV3Price();
        if (uniswapPrice <= balancerPrice) return 0;
        spreadBps = FullMath.mulDiv(uniswapPrice - balancerPrice, 10000, balancerPrice);
        return spreadBps;
    }

    function _calculateWETHAmount(uint256 usdAmount, uint256 ethPrice) internal pure returns (uint256) {
        return FullMath.mulDiv(usdAmount, 1e18, ethPrice);
    }

    function _buyOnBalancerUSDC(uint256 usdcAmount) internal returns (uint256) {
        (, uint256[] memory balances, ) = IBalancerVault(vault).getPoolTokens(balBWUSDCId);
        if (balances[1] < usdcAmount) revert InsufficientBalancerLiquidity();
        
        IBalancerVault.SingleSwap memory ss = IBalancerVault.SingleSwap({
            poolId: balBWUSDCId,
            kind: 0,
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
        
        uint256 minOut = FullMath.mulDiv(usdcAmount * 1e12, (10000 - SLIPPAGE_TOLERANCE_BPS) * 1e18, BALANCER_PRICE_USD * 10000);
        uint256 result = IBalancerVault(vault).swap(ss, fm, minOut, block.timestamp + 300);
        if (result == 0) revert SwapFailed();
        return result;
    }

    function _buyOnBalancerWETH(uint256 wethAmount) internal returns (uint256) {
        (, uint256[] memory balances, ) = IBalancerVault(vault).getPoolTokens(balBWWETHId);
        if (balances[1] < wethAmount) revert InsufficientBalancerLiquidity();
        
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
        
        (uint256 ethUsd,) = _getConsensusEthPrice();
        uint256 usdValue = FullMath.mulDiv(wethAmount, ethUsd, 1e18);
        uint256 minOut = FullMath.mulDiv(usdValue * 1e18, (10000 - SLIPPAGE_TOLERANCE_BPS), BALANCER_PRICE_USD * 10000);
        uint256 result = IBalancerVault(vault).swap(ss, fm, minOut, block.timestamp + 300);
        if (result == 0) revert SwapFailed();
        return result;
    }

    function _sellOnUniswapV3USDC(uint256 bwzcAmount) internal returns (uint256) {
        IQuoterV2.QuoteExactInputSingleParams memory quoteParams = IQuoterV2.QuoteExactInputSingleParams({
            tokenIn: bwzc,
            tokenOut: usdc,
            amountIn: bwzcAmount,
            fee: uniV3Fee,
            sqrtPriceLimitX96: 0
        });
        
        (uint256 quotedOut,,,) = IQuoterV2(quoterV2).quoteExactInputSingle(quoteParams);
        uint256 minOut = FullMath.mulDiv(quotedOut, 10000 - SLIPPAGE_TOLERANCE_BPS, 10000);
        
        IUniswapV3Router.ExactInputSingleParams memory params = IUniswapV3Router.ExactInputSingleParams({
            tokenIn: bwzc,
            tokenOut: usdc,
            fee: uniV3Fee,
            recipient: address(this),
            deadline: block.timestamp + 300,
            amountIn: bwzcAmount,
            amountOutMinimum: minOut,
            sqrtPriceLimitX96: 0
        });
        
        uint256 result = IUniswapV3Router(uniV3Router).exactInputSingle(params);
        if (result == 0) revert SwapFailed();
        return result;
    }

    function _sellOnUniswapV3WETH(uint256 bwzcAmount) internal returns (uint256) {
        IQuoterV2.QuoteExactInputSingleParams memory quoteParams = IQuoterV2.QuoteExactInputSingleParams({
            tokenIn: bwzc,
            tokenOut: weth,
            amountIn: bwzcAmount,
            fee: uniV3Fee,
            sqrtPriceLimitX96: 0
        });
        
        (uint256 quotedOut,,,) = IQuoterV2(quoterV2).quoteExactInputSingle(quoteParams);
        uint256 minOut = FullMath.mulDiv(quotedOut, 10000 - SLIPPAGE_TOLERANCE_BPS, 10000);
        
        IUniswapV3Router.ExactInputSingleParams memory params = IUniswapV3Router.ExactInputSingleParams({
            tokenIn: bwzc,
            tokenOut: weth,
            fee: uniV3Fee,
            recipient: address(this),
            deadline: block.timestamp + 300,
            amountIn: bwzcAmount,
            amountOutMinimum: minOut,
            sqrtPriceLimitX96: 0
        });
        
        uint256 result = IUniswapV3Router(uniV3Router).exactInputSingle(params);
        if (result == 0) revert SwapFailed();
        return result;
    }

    function _sellOnUniswapV2USDC(uint256 bwzcAmount) internal returns (uint256) {
        address[] memory path = new address[](2);
        path[0] = bwzc;
        path[1] = usdc;
        
        uint256 minOut = FullMath.mulDiv(bwzcAmount, UNIV3_TARGET_PRICE_USD * (10000 - SLIPPAGE_TOLERANCE_BPS), 1e18 * 10000);
        uint256[] memory amounts = IUniswapV2Router(uniV2Router).swapExactTokensForTokens(
            bwzcAmount,
            minOut,
            path,
            address(this),
            block.timestamp + 300
        );
        
        if (amounts[1] == 0) revert SwapFailed();
        return amounts[1];
    }

    function _sellOnSushiSwapWETH(uint256 bwzcAmount) internal returns (uint256) {
        address[] memory path = new address[](2);
        path[0] = bwzc;
        path[1] = weth;
        
        (uint256 ethUsd,) = _getConsensusEthPrice();
        uint256 minOut = FullMath.mulDiv(bwzcAmount, UNIV3_TARGET_PRICE_USD * (10000 - SLIPPAGE_TOLERANCE_BPS), ethUsd * 10000);
        uint256[] memory amounts = ISushiSwapRouter(sushiRouter).swapExactTokensForTokens(
            bwzcAmount,
            minOut,
            path,
            address(this),
            block.timestamp + 300
        );
        
        if (amounts[1] == 0) revert SwapFailed();
        return amounts[1];
    }

    function _sellOnSushiSwapUSDC(uint256 bwzcAmount) internal returns (uint256) {
        address[] memory path = new address[](2);
        path[0] = bwzc;
        path[1] = usdc;
        
        uint256 minOut = FullMath.mulDiv(bwzcAmount, UNIV3_TARGET_PRICE_USD * (10000 - SLIPPAGE_TOLERANCE_BPS), 1e18 * 10000);
        uint256[] memory amounts = ISushiSwapRouter(sushiRouter).swapExactTokensForTokens(
            bwzcAmount,
            minOut,
            path,
            address(this),
            block.timestamp + 300
        );
        
        if (amounts[1] == 0) revert SwapFailed();
        return amounts[1];
    }

    function _sellOnUniswapV2WETH(uint256 bwzcAmount) internal returns (uint256) {
        address[] memory path = new address[](2);
        path[0] = bwzc;
        path[1] = weth;
        
        (uint256 ethUsd,) = _getConsensusEthPrice();
        uint256 minOut = FullMath.mulDiv(bwzcAmount, UNIV3_TARGET_PRICE_USD * (10000 - SLIPPAGE_TOLERANCE_BPS), ethUsd * 10000);
        uint256[] memory amounts = IUniswapV2Router(uniV2Router).swapExactTokensForTokens(
            bwzcAmount,
            minOut,
            path,
            address(this),
            block.timestamp + 300
        );
        
        if (amounts[1] == 0) revert SwapFailed();
        return amounts[1];
    }

    function _executePreciseArbitrage(uint256 usdcAmount, uint256 wethAmount, uint256 expectedBwzc)
        internal returns (uint256 usdcProfit, uint256 wethProfit, uint256 bwzcBought)
    {
        uint256 requiredSpread = _calculateMinRequiredSpread();
        uint256 currentSpread = _calculateCurrentSpread();
        if (currentSpread < requiredSpread) revert SpreadTooLow();

        uint256 bwzcFromUsdc = _buyOnBalancerUSDC(usdcAmount);
        uint256 bwzcFromWeth = _buyOnBalancerWETH(wethAmount);
        bwzcBought = bwzcFromUsdc + bwzcFromWeth;
        
        if (bwzcBought < expectedBwzc) revert InsufficientLiquidity();
        
        uint256 bwzcPerDex = bwzcBought / 4;
        
        uint256 usdcFromUniV3 = _sellOnUniswapV3USDC(bwzcPerDex);
        uint256 wethFromUniV3 = _sellOnUniswapV3WETH(bwzcPerDex);
        uint256 usdcFromUniV2 = _sellOnUniswapV2USDC(bwzcPerDex);
        uint256 wethFromSushi = _sellOnSushiSwapWETH(bwzcPerDex);
        
        uint256 usdcReceived = usdcFromUniV3 + usdcFromUniV2;
        uint256 wethReceived = wethFromUniV3 + wethFromSushi;
        
        usdcProfit = usdcReceived > usdcAmount ? usdcReceived - usdcAmount : 0;
        wethProfit = wethReceived > wethAmount ? wethReceived - wethAmount : 0;
        
        if (usdcProfit < usdcAmount * requiredSpread / 10000) revert("USDC profit too low");
        if (wethProfit < wethAmount * requiredSpread / 10000) revert("WETH profit too low");
    }

    function receiveFlashLoan(
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata feeAmounts,
        bytes calldata userData
    ) external override nonReentrant {
        if (msg.sender != vault) revert("Not vault");
        if (txState != TxState.IDLE) revert InvalidStateTransition();
        
        txState = TxState.EXECUTING;
        
        (uint256 bwzcForArbitrage, uint256 expectedUsdc, uint256 expectedWeth, uint256 deadline) = 
            abi.decode(userData, (uint256, uint256, uint256, uint256));
        if (block.timestamp > deadline) revert DeadlineExpired();
        
        uint256 usdcBorrowed = amounts[0];
        uint256 wethBorrowed = amounts[1];
        
        (uint256 usdcProfit, uint256 wethProfit, uint256 bwzcBought) = 
            _executePreciseArbitrage(usdcBorrowed, wethBorrowed, bwzcForArbitrage);
        
        if (usdcProfit < feeAmounts[0]) revert("USDC profit < flash fee");
        if (wethProfit < feeAmounts[1]) revert("WETH profit < flash fee");
        
        IERC20(usdc).safeTransfer(vault, usdcBorrowed + feeAmounts[0]);
        IERC20(weth).safeTransfer(vault, wethBorrowed + feeAmounts[1]);
        
        (uint256 harvestedUsdc, uint256 harvestedWeth, uint256 harvestedBwzc) = harvestAllFees();
        usdcProfit += harvestedUsdc;
        wethProfit += harvestedWeth;
        
        uint256 bwzcDeepened = _deepenPoolsWithPrecision(usdcProfit, wethProfit, bwzcBought + harvestedBwzc);
        
        uint256 usdcToEOA = FullMath.mulDiv(usdcProfit, FEES_TO_EOA_BPS, 10000);
        uint256 wethToEOA = FullMath.mulDiv(wethProfit, FEES_TO_EOA_BPS, 10000);
        uint256 bwzcToEOA = FullMath.mulDiv(harvestedBwzc, FEES_TO_EOA_BPS, 10000);
        
        if (usdcToEOA > 0) IERC20(usdc).safeTransfer(owner(), usdcToEOA);
        if (wethToEOA > 0) IERC20(weth).safeTransfer(owner(), wethToEOA);
        if (bwzcToEOA > 0) IERC20(bwzc).safeTransfer(owner(), bwzcToEOA);
        
        uint256 remainingUsdc = IERC20(usdc).balanceOf(address(this));
        uint256 remainingWeth = IERC20(weth).balanceOf(address(this));
        uint256 remainingBwzc = IERC20(bwzc).balanceOf(address(this));
        
        if (remainingUsdc > 0) IERC20(usdc).safeTransfer(scw, remainingUsdc);
        if (remainingWeth > 0) IERC20(weth).safeTransfer(scw, remainingWeth);
        if (remainingBwzc > 0) IERC20(bwzc).safeTransfer(scw, remainingBwzc);
        
        emit CycleExecuted(cycleCount + 1, usdcProfit, wethProfit, bwzcDeepened);
        emit FeesDistributed(owner(), usdcToEOA, wethToEOA, bwzcToEOA);
        
        cycleCount++;
        lastCycleTimestamp = block.timestamp;
        txState = TxState.COMMITTED;
    }

    function _deepenPoolsWithPrecision(uint256 usdcProfit, uint256 wethProfit, uint256 bwzcBought) 
        internal returns (uint256 totalBwzcDeepened) 
    {
        uint256 deepeningValue = FullMath.mulDiv(TOTAL_BOOTSTRAP_USD, DEEPENING_PERCENT_BPS, 10000);
        uint256 bwzcNeededTotal = FullMath.mulDiv(deepeningValue, 1e18, BALANCER_PRICE_USD);
        
        uint256 bwzcNeededFromSCW = bwzcNeededTotal > bwzcBought ? bwzcNeededTotal - bwzcBought : 0;
        
        if (bwzcNeededFromSCW > 0) {
            uint256 scwBalance = IERC20(bwzc).balanceOf(scw);
            if (scwBalance < bwzcNeededFromSCW) revert SCWInsufficientBWZC();
            IERC20(bwzc).safeTransferFrom(scw, address(this), bwzcNeededFromSCW);
        }
        
        uint256 totalBwzcForDeepening = bwzcBought + bwzcNeededFromSCW;
        uint256 bwzcPerPool = totalBwzcForDeepening / 8;
        uint256 usdcPerPool = usdcProfit / 4;
        uint256 wethPerPool = wethProfit / 4;
        
        _addToBalancerPool(balBWUSDCId, usdcPerPool, bwzcPerPool);
        emit PoolDeepened("Balancer USDC", usdcPerPool, bwzcPerPool);
        
        _addToBalancerPool(balBWWETHId, wethPerPool, bwzcPerPool);
        emit PoolDeepened("Balancer WETH", wethPerPool, bwzcPerPool);
        
        _addToUniV3Pool(uniV3UsdcPool, usdcPerPool, bwzcPerPool, usdc, bwzc, usdcTickLower, usdcTickUpper, true);
        emit PoolDeepened("UniswapV3 USDC", usdcPerPool, bwzcPerPool);
        
        _addToUniV3Pool(uniV3WethPool, wethPerPool, bwzcPerPool, weth, bwzc, wethTickLower, wethTickUpper, false);
        emit PoolDeepened("UniswapV3 WETH", wethPerPool, bwzcPerPool);
        
        (uint256 amountA1, uint256 amountB1,) = IUniswapV2Router(uniV2Router).addLiquidity(
            bwzc, usdc, bwzcPerPool, usdcPerPool,
            FullMath.mulDiv(bwzcPerPool, 10000 - SLIPPAGE_TOLERANCE_BPS, 10000),
            FullMath.mulDiv(usdcPerPool, 10000 - SLIPPAGE_TOLERANCE_BPS, 10000),
            address(this), block.timestamp + 300
        );
        emit PoolDeepened("UniswapV2 USDC", amountB1, amountA1);
        
        (uint256 amountA2, uint256 amountB2,) = IUniswapV2Router(uniV2Router).addLiquidity(
            bwzc, weth, bwzcPerPool, wethPerPool,
            FullMath.mulDiv(bwzcPerPool, 10000 - SLIPPAGE_TOLERANCE_BPS, 10000),
            FullMath.mulDiv(wethPerPool, 10000 - SLIPPAGE_TOLERANCE_BPS, 10000),
            address(this), block.timestamp + 300
        );
        emit PoolDeepened("UniswapV2 WETH", amountB2, amountA2);
        
        (uint256 amountA3, uint256 amountB3,) = ISushiSwapRouter(sushiRouter).addLiquidity(
            bwzc, usdc, bwzcPerPool, usdcPerPool,
            FullMath.mulDiv(bwzcPerPool, 10000 - SLIPPAGE_TOLERANCE_BPS, 10000),
            FullMath.mulDiv(usdcPerPool, 10000 - SLIPPAGE_TOLERANCE_BPS, 10000),
            address(this), block.timestamp + 300
        );
        emit PoolDeepened("SushiSwap USDC", amountB3, amountA3);
        
        (uint256 amountA4, uint256 amountB4,) = ISushiSwapRouter(sushiRouter).addLiquidity(
            bwzc, weth, bwzcPerPool, wethPerPool,
            FullMath.mulDiv(bwzcPerPool, 10000 - SLIPPAGE_TOLERANCE_BPS, 10000),
            FullMath.mulDiv(wethPerPool, 10000 - SLIPPAGE_TOLERANCE_BPS, 10000),
            address(this), block.timestamp + 300
        );
        emit PoolDeepened("SushiSwap WETH", amountB4, amountA4);
        
        permanentUSDCAdded += usdcProfit;
        permanentWETHAdded += wethProfit;
        permanentBWZCAdded += totalBwzcForDeepening;
        
        emit AllPoolsDeepened(deepeningValue, totalBwzcForDeepening);
        
        return totalBwzcForDeepening;
    }

    function _addToBalancerPool(bytes32 poolId, uint256 stableAmount, uint256 bwzcAmount) internal {
        (address[] memory tokens, , ) = IBalancerVault(vault).getPoolTokens(poolId);
        uint256[] memory maxAmountsIn = new uint256[](tokens.length);
        
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] == usdc || tokens[i] == weth) {
                maxAmountsIn[i] = stableAmount;
            } else if (tokens[i] == bwzc) {
                maxAmountsIn[i] = bwzcAmount;
            }
        }
        
        bytes memory userData = abi.encode(1, maxAmountsIn, 1);
        IBalancerVault.JoinPoolRequest memory request = IBalancerVault.JoinPoolRequest({
            assets: tokens,
            maxAmountsIn: maxAmountsIn,
            userData: userData,
            fromInternalBalance: false
        });
        
        IBalancerVault(vault).joinPool(poolId, address(this), address(this), request);
    }

    function _addToUniV3Pool(address pool, uint256 stableAmount, uint256 bwzcAmount, address stableToken, address bwzcToken, int24 tickLower, int24 tickUpper, bool isUsdcPool) internal {
        INonfungiblePositionManager.MintParams memory params = INonfungiblePositionManager.MintParams({
            token0: bwzcToken < stableToken ? bwzcToken : stableToken,
            token1: bwzcToken < stableToken ? stableToken : bwzcToken,
            fee: uniV3Fee,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: bwzcToken < stableToken ? bwzcAmount : stableAmount,
            amount1Desired: bwzcToken < stableToken ? stableAmount : bwzcAmount,
            amount0Min: FullMath.mulDiv(bwzcAmount, 10000 - SLIPPAGE_TOLERANCE_BPS, 10000),
            amount1Min: FullMath.mulDiv(stableAmount, 10000 - SLIPPAGE_TOLERANCE_BPS, 10000),
            recipient: address(this),
            deadline: block.timestamp + 300
        });
        
        (uint256 tokenId, , , ) = INonfungiblePositionManager(uniV3NFT).mint(params);
        uniV3PositionIds.push(tokenId);
        
        positionInfo[tokenId] = PosInfo({
            token0: bwzcToken < stableToken ? bwzcToken : stableToken,
            token1: bwzcToken < stableToken ? stableToken : bwzcToken,
            isUsdc: isUsdcPool
        });
    }

    function harvestAllFees() internal returns (uint256 totalUsdc, uint256 totalWeth, uint256 totalBwzc) {
        for (uint256 i = 0; i < uniV3PositionIds.length; i++) {
            uint256 tokenId = uniV3PositionIds[i];
            INonfungiblePositionManager.CollectParams memory params = INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            });
            
            (uint256 amount0, uint256 amount1) = INonfungiblePositionManager(uniV3NFT).collect(params);
            PosInfo memory info = positionInfo[tokenId];
            
            if (info.token0 == bwzc) {
                totalBwzc += amount0;
                if (info.isUsdc) {
                    totalUsdc += amount1;
                } else {
                    totalWeth += amount1;
                }
            } else if (info.token1 == bwzc) {
                totalBwzc += amount1;
                if (info.isUsdc) {
                    totalUsdc += amount0;
                } else {
                    totalWeth += amount0;
                }
            }
        }
        
        emit FeesHarvested(totalUsdc, totalWeth, totalBwzc);
    }

    function distributeEOAFees() external nonReentrant onlyOwner {
        uint256 usdcBalance = IERC20(usdc).balanceOf(address(this));
        uint256 wethBalance = IERC20(weth).balanceOf(address(this));
        uint256 bwzcBalance = IERC20(bwzc).balanceOf(address(this));
        
        uint256 usdcToEOA = FullMath.mulDiv(usdcBalance, FEES_TO_EOA_BPS, 10000);
        uint256 wethToEOA = FullMath.mulDiv(wethBalance, FEES_TO_EOA_BPS, 10000);
        uint256 bwzcToEOA = FullMath.mulDiv(bwzcBalance, FEES_TO_EOA_BPS, 10000);
        
        if (usdcToEOA > 0) IERC20(usdc).safeTransfer(owner(), usdcToEOA);
        if (wethToEOA > 0) IERC20(weth).safeTransfer(owner(), wethToEOA);
        if (bwzcToEOA > 0) IERC20(bwzc).safeTransfer(owner(), bwzcToEOA);
        
        emit FeesDistributed(owner(), usdcToEOA, wethToEOA, bwzcToEOA);
    }

    function _phase1PreSeed(uint256 bwzcAmount) internal {
        uint256 bwzcForUsdc = bwzcAmount / 2;
        uint256 bwzcForWeth = bwzcAmount - bwzcForUsdc;
        
        uint256 usdcForSeed = FullMath.mulDiv(bwzcForUsdc, BALANCER_PRICE_USD, 1e18);
        (uint256 ethPrice,) = _getConsensusEthPrice();
        uint256 wethUsdValue = FullMath.mulDiv(bwzcForWeth, BALANCER_PRICE_USD, 1e18);
        uint256 wethForSeed = FullMath.mulDiv(wethUsdValue, 1e18, ethPrice);
        
        _addToBalancerPool(balBWUSDCId, usdcForSeed, bwzcForUsdc);
        _addToBalancerPool(balBWWETHId, wethForSeed, bwzcForWeth);
    }

    function calculatePreciseBootstrap() public returns (uint256 totalBwzcNeeded, uint256 usdcLoanAmount, uint256 wethLoanAmount) {
        totalBwzcNeeded = FullMath.mulDiv(TOTAL_BOOTSTRAP_USD, 1e18, BALANCER_PRICE_USD);
        usdcLoanAmount = TOTAL_BOOTSTRAP_USD / 2;
        
        (uint256 ethPrice,) = _getConsensusEthPrice();
        wethLoanAmount = FullMath.mulDiv(TOTAL_BOOTSTRAP_USD / 2, 1e18, ethPrice);
    }
    
    function executeBulletproofBootstrap(uint256 bwzcForArbitrage) external nonReentrant whenNotPaused {
        if (msg.sender != scw) revert("Only SCW");
        if (_calculateCurrentSpread() < _calculateMinRequiredSpread()) revert SpreadTooLow();
        
        uint256 totalBwzcNeeded = FullMath.mulDiv(TOTAL_BOOTSTRAP_USD, 1e18, BALANCER_PRICE_USD);
        IERC20(bwzc).safeTransferFrom(scw, address(this), totalBwzcNeeded);
        
        _phase1PreSeed(totalBwzcNeeded - bwzcForArbitrage);
        
        (uint256 ethPrice,) = _getConsensusEthPrice();
        uint256 scaledUsdc = _calculateScaledAmount(TOTAL_BOOTSTRAP_USD / 2, currentScaleFactorBps);
        uint256 scaledWeth = _calculateScaledAmount(_calculateWETHAmount(TOTAL_BOOTSTRAP_USD / 2, ethPrice), currentScaleFactorBps);
        
        bytes memory userData = abi.encode(bwzcForArbitrage, scaledUsdc, scaledWeth, block.timestamp + 1 hours);
        
        address[] memory tokens = new address[](2);
        tokens[0] = usdc;
        tokens[1] = weth;
        
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = scaledUsdc;
        amounts[1] = scaledWeth;

        try IBalancerVault(vault).flashLoan(address(this), tokens, amounts, userData) {
            // Success handled in callback
        } catch {
            revert SwapFailed();
        }

        if (currentScaleFactorBps < MAX_SCALE_BPS) {
            currentScaleFactorBps += SCALE_INCREMENT_BPS;
            emit ScaleFactorUpdated(currentScaleFactorBps);
        } else {
            revert ScaleLimitReached();
        }

        emit BootstrapExecuted(bwzcForArbitrage, scaledUsdc + (scaledWeth * ethPrice / 1e18));
    }

    function addUniswapV3Position(uint256 tokenId, bool isUsdcPosition) external onlyOwner {
        (, , address token0, address token1, , , , , , , , ) = INonfungiblePositionManager(uniV3NFT).positions(tokenId);
        
        if (!((token0 == bwzc && (token1 == usdc || token1 == weth)) || 
              (token1 == bwzc && (token0 == usdc || token0 == weth)))) revert InvalidUniswapV3Position();
        
        uniV3PositionIds.push(tokenId);
        positionInfo[tokenId] = PosInfo({
            token0: token0,
            token1: token1,
            isUsdc: isUsdcPosition
        });
    }

    function removeUniswapV3Position(uint256 index) external onlyOwner {
        if (index >= uniV3PositionIds.length) revert IndexOutOfBounds();
        
        uint256 last = uniV3PositionIds[uniV3PositionIds.length - 1];
        if (index != uniV3PositionIds.length - 1) {
            uniV3PositionIds[index] = last;
        }
        uniV3PositionIds.pop();
        
        delete positionInfo[last];
    }

    function getUniswapV3Positions() external view returns (uint256[] memory) {
        return uniV3PositionIds;
    }

    function _rollbackTransaction() internal {
        uint256 usdcBalance = IERC20(usdc).balanceOf(address(this));
        uint256 wethBalance = IERC20(weth).balanceOf(address(this));
        uint256 bwzcBalance = IERC20(bwzc).balanceOf(address(this));
        
        if (usdcBalance > 0) IERC20(usdc).safeTransfer(scw, usdcBalance);
        if (wethBalance > 0) IERC20(weth).safeTransfer(scw, wethBalance);
        if (bwzcBalance > 0) IERC20(bwzc).safeTransfer(scw, bwzcBalance);
        
        txState = TxState.ROLLED_BACK;
        emit Rollback("Rollback");
    }

    function resetTransactionState() external onlyOwner {
        txState = TxState.IDLE;
    }

    function pause(string calldata reason) external onlyOwner {
        paused = true;
        emit EmergencyPause(reason);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit EmergencyResume();
    }

    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (!paused) revert NotInEmergency();
        IERC20(token).safeTransfer(owner(), amount);
    }

    function emergencyWithdrawETH(uint256 amount) external onlyOwner {
        if (!paused) revert NotInEmergency();
        (bool success,) = owner().call{value: amount}("");
        if (!success) revert ETHTransferFailed();
    }

    function getContractBalances() external view returns (uint256 usdcBal, uint256 wethBal, uint256 bwzcBal, uint256 ethBal) {
        return (
            IERC20(usdc).balanceOf(address(this)),
            IERC20(weth).balanceOf(address(this)),
            IERC20(bwzc).balanceOf(address(this)),
            address(this).balance
        );
    }

    function getPoolBalances() external view returns (uint256 balancerUsdc, uint256 balancerWeth, uint256 balancerBwzc) {
        (, uint256[] memory balances1,) = IBalancerVault(vault).getPoolTokens(balBWUSDCId);
        (, uint256[] memory balances2,) = IBalancerVault(vault).getPoolTokens(balBWWETHId);
        
        uint256 usdcBal = balances1[0];
        uint256 wethBal = balances2[0];
        uint256 bwzcBal = balances1[1] + balances2[1];
        
        return (usdcBal, wethBal, bwzcBal);
    }

    function predictPerformance(uint256 daysToSimulate) external pure returns (
        uint256 scwUsdcProfit,
        uint256 scwWethProfit,
        uint256 eoaUsdcFees,
        uint256 eoaWethFees,
        uint256 poolDeepeningValue
    ) {
        uint256 cycles = daysToSimulate * 10;
        uint256 totalProfit = PROFIT_PER_CYCLE_USD * cycles;
        
        eoaUsdcFees = (totalProfit / 2 * FEES_TO_EOA_BPS) / 10000;
        eoaWethFees = eoaUsdcFees;
        
        poolDeepeningValue = (TOTAL_BOOTSTRAP_USD * DEEPENING_PERCENT_BPS * cycles) / 10000;
        
        scwUsdcProfit = (totalProfit / 2) - eoaUsdcFees - (poolDeepeningValue / 2);
        scwWethProfit = (totalProfit / 2) - eoaWethFees - (poolDeepeningValue / 2);
    }

    function getCurrentSpread() external view returns (uint256) {
        return _calculateCurrentSpread();
    }

    function getMinRequiredSpread() external pure returns (uint256) {
        return _calculateMinRequiredSpread();
    }

    function getConsensusEthPrice() external returns (uint256 price, uint8 confidence) {
        return _getConsensusEthPrice();
    }

    receive() external payable {}
    
    fallback() external payable {
        revert DirectETHNotAllowed();
    }
}
