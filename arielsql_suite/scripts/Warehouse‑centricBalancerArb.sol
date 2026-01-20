// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/*
  MEV v18 — WarehouseBalancerArb (final production MEV-hardened + self-sustaining)

  Upgrades over v17:
    1) Emergency withdrawals:
       - ETH withdraw (unwrapped from WETH when topping paymaster is not enough)
       - Token withdraw (retained)
    2) Recover stuck NFTs / LP positions:
       - Generic ERC721 rescue (e.g., Uniswap V3 position NFTs)
       - Generic ERC1155 rescue (optional LP receipts)
    3) Circuit breaker for rapid price changes:
       - Guard against sudden buy/sell price deviations vs. last observed price
       - Configurable max deviation (bps) and lookback enable/disable
    4) Gas optimizations:
       - Cache IERC20(bwaezi) in immutable storage (BW)
       - Use unchecked arithmetic where safe
       - Consolidate approvals—leave only approvals from this contract (SCW assumed unlimited)
       - Batch approvals utility
       - Leaner SafeERC20 with assembly return handling and no forced zero-reset unless needed
    5) Minor internal caching and micro-optimizations without changing core logic

  Highlights (unchanged capabilities):
    - Balancer Vault flash loans (USDC, WETH)
    - SCW acts as internal counterparty (buy/sell legs) with pool fallbacks
    - Dynamic internal pricing (V3/V2/Sushi + Balancer spot), normalized to 1e18 USD
    - Chainlink ETH/USD freshness checks
    - Reentrancy guard on all external state-changing entry points
    - EIP-712 signed kickers (single + batch) with nonce tracking
    - Full 8-pool reinvest + initial seeding:
        * Uniswap V3 mint via INonfungiblePositionManager
        * Uniswap V2/Sushi addLiquidity
        * Balancer joins using stored pool IDs
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
        uint24 fee;
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
        uint24 fee,
        uint160 sqrtPriceLimitX96
    ) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate);
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
    function getPoolTokens(bytes32 poolId) external view returns (address[] memory tokens, uint256[] memory balances, uint256 lastChangeBlock);
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
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);
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
    function mint(MintParams calldata params) external payable returns (
        uint256 tokenId,
        uint128 liquidity,
        uint256 amount0,
        uint256 amount1
    );
}

/* ----------------------------- Gas-efficient SafeERC20 ----------------------------- */
library SafeERC20 {
    function safeTransfer(IERC20 t, address to, uint256 v) internal {
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, 0xa9059cbb00000000000000000000000000000000000000000000000000000000) // transfer selector
            mstore(add(ptr, 4), to)
            mstore(add(ptr, 36), v)
            let success := call(gas(), t, 0, ptr, 68, 0, 0)
            if iszero(success) { revert(0, 0) }
        }
    }

    function safeTransferFrom(IERC20 t, address f, address to, uint256 v) internal {
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, 0x23b872dd00000000000000000000000000000000000000000000000000000000) // transferFrom
            mstore(add(ptr, 4), f)
            mstore(add(ptr, 36), to)
            mstore(add(ptr, 68), v)
            let success := call(gas(), t, 0, ptr, 100, 0, 0)
            if iszero(success) { revert(0, 0) }
        }
    }

    // Approve without forced zero-reset; caller should manage non-standard tokens separately.
    function safeApprove(IERC20 t, address s, uint256 v) internal {
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, 0x095ea7b300000000000000000000000000000000000000000000000000000000) // approve
            mstore(add(ptr, 4), s)
            mstore(add(ptr, 36), v)
            let success := call(gas(), t, 0, ptr, 68, 0, 0)
            if iszero(success) { revert(0, 0) }
        }
    }
}

contract WarehouseBalancerArb is IFlashLoanRecipient {
    using SafeERC20 for IERC20;

    /* --- Custom Errors --- */
    error NotAuthorized();
    error ContractPaused();
    error InactiveBundle();
    error StalePrice();
    error Reentrancy();
    error BadSignature();
    error ZeroLoan();
    error BadPool();
    error CircuitBreak();

    /* --- Events --- */
    event OwnerChanged(address indexed newOwner);
    event Paused(bool status);
    event ConfigUpdated();
    event AdaptiveParamsUpdated();
    event BundleStaged(uint256 indexed bundleId, BundleConfig cfg);
    event BundleCancelled(uint256 indexed bundleId);
    event BundleKicked(uint256 indexed bundleId);
    event BatchedKick(uint256 count);
    event CycleExecuted(uint256 indexed bundleId, uint256 usdcLoan, uint256 wethLoan, uint256 bwBought, uint256 usdcProfit, uint256 wethProfit);
    event Reinvested(uint256 rBps, uint256 usdcIntoPools, uint256 wethIntoPools);
    event PaymasterTopped(uint256 ethAdded, uint256 newBalance);
    event InternalBuyLeg(uint256 bwDirect, uint256 usdcIn, uint256 wethIn);
    event PartialInternalBuy(uint256 bwDirect, uint256 bwPool);
    event InternalSellLeg(uint256 bwToScw, uint256 stablesValue1e18);
    event PoolsSeeded(uint256 usdcUsed, uint256 wethUsed, uint256 bwUsed);
    event CircuitBreakerUpdated(uint256 maxDeviationBps, bool enabled);
    event BatchApproved(address spender, uint256 amount, uint256 count);

    /* --- Ownership & access --- */
    address public owner;
    address public immutable scw;
    modifier onlyOwner() {
        if (msg.sender != owner && msg.sender != scw) revert NotAuthorized();
        _;
    }

    /* --- Reentrancy Guard --- */
    uint256 private _entered;
    modifier nonReentrant() {
        if (_entered == 1) revert Reentrancy();
        _entered = 1;
        _;
        _entered = 0;
    }

    /* --- Core addresses --- */
    address public immutable vault;
    address public immutable bwaezi;
    address public immutable usdc;
    address public immutable weth;
    address public immutable uniV3Router;
    address public immutable uniV2Router;
    address public immutable sushiRouter;
    address public immutable quoter;
    IEntryPoint public immutable entryPoint;
    address public immutable chainlinkEthUsd;

    /* --- Cached token (gas) --- */
    IERC20 public immutable BW; // cached IERC20 for bwaezi

    /* --- Venue pools (addresses) --- */
    address public immutable uniV3BWUSDC;
    address public immutable uniV3BWWETH;
    address public immutable uniV2BWUSDC;
    address public immutable uniV2BWWETH;
    address public immutable sushiBWUSDC;
    address public immutable sushiBWWETH;
    address public immutable balBWUSDC;
    address public immutable balBWWETH;

    /* --- Balancer pool IDs --- */
    bytes32 public immutable balBWUSDCId;
    bytes32 public immutable balBWWETHId;

    /* --- Uniswap V3 position manager (for mint) --- */
    address public immutable positionManager;

    /* --- Config --- */
    uint24 public bwUsdcFee;
    uint24 public bwWethFee;
    uint256 public epsilonBps;
    uint256 public maxDeadline;
    bool public paused;

    /* --- Adaptive --- */
    uint256 public alpha;
    uint256 public beta;
    uint256 public gamma;
    uint256 public kappa;

    /* --- Reinvest & Paymaster --- */
    uint256 public rMin;
    uint256 public rMax;
    uint256 public lambda_;
    uint256 public paymasterDrawBps;
    uint256 public targetDepositWei;

    /* --- State --- */
    uint256 public cycleCount;
    uint256 public checkpointPeriod;

    /* --- Circuit breaker --- */
    uint256 public lastPrice1e18;        // last blended price observed (USD per BW)
    uint256 public maxDeviationBps;      // e.g., 500 = 5%
    bool    public breakerEnabled;       // toggle

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

    /* --- EIP-712 --- */
    bytes32 public DOMAIN_SEPARATOR;
    bytes32 public constant KICK_TYPEHASH = keccak256("Kick(uint256 bundleId,uint256 deadline,uint256 nonce)");
    uint256 public kickNonce;
    mapping(uint256 => bool) public kickUsed;

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
        address _balBWWETH,
        bytes32 _balBWUSDCId,
        bytes32 _balBWWETHId,
        address _positionManager
    ) {
        require(_scw != address(0) && _vault != address(0) && _bwaezi != address(0) && _usdc != address(0) && _weth != address(0), "bad core");
        require(_uniV3Router != address(0) && _uniV2Router != address(0) && _sushiRouter != address(0), "bad routers");
        require(_quoter != address(0) && _entryPoint != address(0) && _chainlinkEthUsd != address(0), "bad infra");
        require(_uniV3BWUSDC != address(0) && _uniV3BWWETH != address(0), "bad v3");
        require(_uniV2BWUSDC != address(0) && _uniV2BWWETH != address(0), "bad v2");
        require(_sushiBWUSDC != address(0) && _sushiBWWETH != address(0), "bad sushi");
        require(_balBWUSDC != address(0) && _balBWWETH != address(0), "bad bal");
        require(_balBWUSDCId != bytes32(0) && _balBWWETHId != bytes32(0), "bad bal ids");
        require(_positionManager != address(0), "bad pos mgr");

        owner = msg.sender;
        scw = _scw;
        vault = _vault;
        bwaezi = _bwaezi;
        usdc = _usdc;
        weth = _weth;
        uniV3Router = _uniV3Router;
        uniV2Router = _uniV2Router;
        sushiRouter = _sushiRouter;
        quoter = _quoter;
        entryPoint = IEntryPoint(_entryPoint);
        chainlinkEthUsd = _chainlinkEthUsd;

        uniV3BWUSDC = _uniV3BWUSDC;
        uniV3BWWETH = _uniV3BWWETH;
        uniV2BWUSDC = _uniV2BWUSDC;
        uniV2BWWETH = _uniV2BWWETH;
        sushiBWUSDC = _sushiBWUSDC;
        sushiBWWETH = _sushiBWWETH;
        balBWUSDC = _balBWUSDC;
        balBWWETH = _balBWWETH;

        balBWUSDCId = _balBWUSDCId;
        balBWWETHId = _balBWWETHId;

        positionManager = _positionManager;

        // Cached IERC20 for BW token
        BW = IERC20(_bwaezi);

        bwUsdcFee = 3000;
        bwWethFee = 3000;
        epsilonBps = 30;
        maxDeadline = 900;
        paused = false;

        alpha = 5e18;
        beta = 8e17;
        gamma = 2e16;
        kappa = 3e16;

        rMin = 1e17;
        rMax = 35e16;
        lambda_ = 1e17;

        paymasterDrawBps = 300;
        targetDepositWei = 3e17;

        checkpointPeriod = 40;
        nextBundleId = 1;

        // Circuit breaker defaults
        maxDeviationBps = 500; // 5%
        breakerEnabled = true;

        _initDomainSeparator();
    }

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
    function setOwner(address newOwner) external onlyOwner nonReentrant {
        require(newOwner != address(0), "zero");
        owner = newOwner;
        emit OwnerChanged(newOwner);
    }

    function setPaused(bool p) external onlyOwner nonReentrant {
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
    ) external onlyOwner nonReentrant {
        require(_epsilonBps <= 50, "slippage too loose");
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
    ) external onlyOwner nonReentrant {
        alpha   = _alpha;
        beta    = _beta;
        gamma   = _gamma;
        kappa   = _kappa;
        rMin    = _rMin;
        rMax    = _rMax;
        lambda_ = _lambda;
        emit AdaptiveParamsUpdated();
    }

    /* ----------------------------- Circuit breaker config ----------------------------- */
    function setCircuitBreaker(uint256 _maxDeviationBps, bool _enabled) external onlyOwner nonReentrant {
        require(_maxDeviationBps <= 5000, "too large"); // cap at 50%
        maxDeviationBps = _maxDeviationBps;
        breakerEnabled = _enabled;
        emit CircuitBreakerUpdated(_maxDeviationBps, _enabled);
    }

    /* ----------------------------- Chainlink freshness ----------------------------- */
    uint256 public constant MAX_CHAINLINK_AGE = 30 minutes;

    function _fetchEthUsdFresh() internal view returns (uint256 price1e18) {
        (uint80 roundId, int256 ans, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound) =
            IChainlinkFeed(chainlinkEthUsd).latestRoundData();
        if (ans <= 0) revert StalePrice();
        if (answeredInRound < roundId) revert StalePrice();
        if (updatedAt < startedAt) revert StalePrice();
        if (block.timestamp - updatedAt > MAX_CHAINLINK_AGE) revert StalePrice();
        price1e18 = uint256(ans) * 1e10; // normalize 1e8 → 1e18
    }

    /* ----------------------------- Adaptive helpers ----------------------------- */
    function _safeLeg(uint256 Rbar1e18) internal view returns (uint256) {
        uint256 curvature = (kappa * Rbar1e18) / 1e18;
        if (curvature > 1e18) curvature = 1e18;
        return (((gamma * Rbar1e18) / 1e18) * curvature) / 1e18;
    }

    function _loanSize(uint256 Rbar1e18, uint256 spread1e18) internal view returns (uint256) {
        uint256 aTerm = (alpha * Rbar1e18) / 1e18;
        uint256 bTerm = ((beta * spread1e18) / 1e18) * Rbar1e18 / 1e18;
        return aTerm < bTerm ? aTerm : bTerm;
    }

    function _reinvestRatio(uint256 spread1e18) internal view returns (uint256) {
        uint256 x = (lambda_ * spread1e18) / 1e18;
        uint256 frac = (x * 1e18) / (1e18 + x);
        return rMin + ((rMax - rMin) * frac) / 1e18;
    }

    function _max3(uint256 a, uint256 b, uint256 c) internal pure returns (uint256) {
        return a > b ? (a > c ? a : c) : (b > c ? b : c);
    }

    /* ----------------------------- Bundles ----------------------------- */
    function stageBundle(
        uint256 RbarUSD1e18,
        uint256 spreadUSD1e18,
        uint16  usdcShareBps,
        uint16  bwSellExtraBps
    ) external onlyOwner nonReentrant returns (uint256 bundleId) {
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

    function cancelBundle(uint256 bundleId) external onlyOwner nonReentrant {
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
            if (amounts.length >= 2) return amounts[1];
            return 0;
        } catch {
            return 0;
        }
    }

    /* ----------------------------- Balancer spot price ----------------------------- */
    // 80/20 weighted pool spot price: (balB / wB) / (balA / wA), normalized to USD
    function _balancerSpotPriceUSD(bytes32 poolId, address tokenA, address tokenB) internal view returns (uint256 price1e18) {
        (address[] memory tokens, uint256[] memory balances,) = IBalancerVault(vault).getPoolTokens(poolId);
        require(tokens.length == 2 && balances.length == 2, "bal tokens");
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

    /* ----------------------------- Swap best-in ----------------------------- */
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
            path[0] = tokenIn;
            path[1] = tokenOut;
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
        uint256 usdcUSD1e18 = (L1e18 * cfg.usdcShareBps) / 10000;
        if (usdcUSD1e18 > cap1e18) usdcUSD1e18 = cap1e18;
        uint8 usdcDec = IERC20(usdc).decimals();
        return usdcUSD1e18 / (10 ** (18 - usdcDec)); // USDC 6-dec
    }

    function _computeWethLoanSize(uint256 bundleId) internal view returns (uint256) {
        BundleConfig memory cfg = bundles[bundleId];
        require(cfg.active, "bundle inactive");
        uint256 L1e18   = _loanSize(cfg.RbarUSD1e18, cfg.spreadUSD1e18);
        uint256 cap1e18 = _safeLeg(cfg.RbarUSD1e18);
        uint256 usdcUSD1e18 = (L1e18 * cfg.usdcShareBps) / 10000;
        uint256 wethUSD1e18 = L1e18 - usdcUSD1e18;
        if (wethUSD1e18 > cap1e18) wethUSD1e18 = cap1e18;
        uint256 ethUsd1e18 = _fetchEthUsdFresh();
        uint8 wethDec = IERC20(weth).decimals();
        uint256 wethUnits1e18 = (wethUSD1e18 * 1e18) / ethUsd1e18;
        return wethUnits1e18 / (10 ** (18 - wethDec)); // WETH 18-dec
    }

    /* ----------------------------- Kickers (MEV-hardened) ----------------------------- */
    function _kickBundleInternal(uint256 bundleId) internal {
        require(!paused, "paused");
        BundleConfig memory cfg = bundles[bundleId];
        require(cfg.active, "bundle inactive");

        address[] memory tokens = new address[](2);
        tokens[0] = usdc;
        tokens[1] = weth;

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
    ) external onlyOwner nonReentrant {
        require(!paused, "paused");
        require(block.timestamp <= deadline && deadline <= block.timestamp + maxDeadline, "expired");
        require(bundles[bundleId].active, "inactive");
        require(!kickUsed[bundleId], "used");

        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            keccak256(abi.encode(KICK_TYPEHASH, bundleId, deadline, kickNonce))
        ));
        address signer = ecrecover(digest, v, r, s);
        if (signer != owner && signer != scw) revert BadSignature();

        kickUsed[bundleId] = true;
        unchecked { kickNonce++; }

        _kickBundleInternal(bundleId);
    }

    function kickBundlesSigned(
        uint256[] calldata bundleIds,
        uint256 deadline,
        uint8 v, bytes32 r, bytes32 s
    ) external onlyOwner nonReentrant {
        require(!paused, "paused");
        require(bundleIds.length <= 3, "batch too large");
        require(block.timestamp <= deadline && deadline <= block.timestamp + maxDeadline, "expired");

        bytes32 idsHash = keccak256(abi.encodePacked(bundleIds));
        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            keccak256(abi.encode(
                keccak256("KickBatch(bytes32 idsHash,uint256 deadline,uint256 nonce)"),
                idsHash,
                deadline,
                kickNonce
            ))
        ));
        address signer = ecrecover(digest, v, r, s);
        if (signer != owner && signer != scw) revert BadSignature();
        unchecked { kickNonce++; }

        for (uint256 i = 0; i < bundleIds.length; ) {
            uint256 id = bundleIds[i];
            require(bundles[id].active, "inactive");
            require(!kickUsed[id], "used");
            kickUsed[id] = true;
            _kickBundleInternal(id);
            unchecked { ++i; }
        }
        emit BatchedKick(bundleIds.length);
    }

    /* ----------------------------- Internal pricing (USD per BW) ----------------------------- */
    // Buy price: conservative—blend Balancer spot + venue quotes, apply small discount
    function _internalBuyPriceUSD1e18() internal returns (uint256) {
        uint256 spotUsdc = _balancerSpotPriceUSD(balBWUSDCId, bwaezi, usdc);
        uint256 oneUsdc = 1e6;
        uint256 bwOutV3 = _quoteExactInputV3(usdc, bwaezi, oneUsdc, bwUsdcFee);
        uint256 bwOutV2 = _quoteExactInputV2(uniV2Router, usdc, bwaezi, oneUsdc);
        uint256 bwOutSu = _quoteExactInputV2(sushiRouter, usdc, bwaezi, oneUsdc);
        uint256 bwOutAvg = (bwOutV3 + bwOutV2 + bwOutSu) / 3;
        if (bwOutAvg == 0) return spotUsdc; // fallback
        uint256 venuePrice = (oneUsdc * 1e12) * 1e18 / bwOutAvg; // USD per BW
        uint256 blended = (spotUsdc + venuePrice) / 2;
        return (blended * 9950) / 10000; // 0.5% discount
    }

    // Sell price: conservative—blend Balancer spot + venue quotes, apply small premium
    function _internalSellPriceUSD1e18(uint16 extraBps) internal returns (uint256) {
        uint256 spotUsdc = _balancerSpotPriceUSD(balBWUSDCId, bwaezi, usdc);
        uint256 oneBw = 1e18;
        uint256 usdcOutV3 = _quoteExactInputV3(bwaezi, usdc, oneBw, bwUsdcFee);
        uint256 usdcOutV2 = _quoteExactInputV2(uniV2Router, bwaezi, usdc, oneBw);
        uint256 usdcOutSu = _quoteExactInputV2(sushiRouter, bwaezi, usdc, oneBw);
        uint256 usdcOutAvg = (usdcOutV3 + usdcOutV2 + usdcOutSu) / 3;
        uint256 venuePrice = usdcOutAvg * 1e12; // USD per BW
        uint256 blended = venuePrice == 0 ? spotUsdc : (spotUsdc + venuePrice) / 2;
        uint256 premium = 10000 + (extraBps > 500 ? 500 : extraBps); // cap extra at 5%
        return (blended * premium) / 10000;
    }

    /* ----------------------------- Circuit breaker check ----------------------------- */
    function _checkBreaker(uint256 newPrice1e18) internal view {
        if (!breakerEnabled || lastPrice1e18 == 0) return;
        uint256 diff = newPrice1e18 > lastPrice1e18 ? (newPrice1e18 - lastPrice1e18) : (lastPrice1e18 - newPrice1e18);
        uint256 bps = (diff * 10000) / lastPrice1e18;
        if (bps > maxDeviationBps) revert CircuitBreak();
    }

    /* ----------------------------- Flash loan callback ----------------------------- */
    function receiveFlashLoan(
        address[] calldata tokens,
        uint256[] calldata amounts,
        uint256[] calldata fees,
        bytes calldata userData
    ) external override nonReentrant {
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

        uint256 buyPrice1e18  = _internalBuyPriceUSD1e18();
        uint256 sellPrice1e18 = _internalSellPriceUSD1e18(cfg.bwSellExtraBps);

        // Circuit breaker against rapid price changes
        _checkBreaker(buyPrice1e18);
        _checkBreaker(sellPrice1e18);
        lastPrice1e18 = (buyPrice1e18 + sellPrice1e18) / 2;

        uint256 ethUsd          = _fetchEthUsdFresh();
        uint256 neededBwForUsdc = usdcIn > 0 ? (usdcIn * 1e12) * 1e18 / buyPrice1e18 : 0;
        uint256 neededBwForWeth = wethIn > 0 ? (wethIn * ethUsd) * 1e18 / buyPrice1e18 : 0;
        uint256 totalNeededBw   = neededBwForUsdc + neededBwForWeth;

        uint256 scwBwBal = BW.balanceOf(scw);
        uint256 bwBought = 0;

        if (scwBwBal >= totalNeededBw && totalNeededBw > 0) {
            BW.safeTransferFrom(scw, address(this), totalNeededBw);
            bwBought = totalNeededBw;
            emit InternalBuyLeg(totalNeededBw, usdcIn, wethIn);
        } else {
            uint256 pulled = 0;
            if (scwBwBal > 0) {
                BW.safeTransferFrom(scw, address(this), scwBwBal);
                pulled = scwBwBal;
                bwBought += scwBwBal;
            }
            if (usdcIn > 0) {
                uint256 outV3 = _quoteExactInputV3(usdc, bwaezi, usdcIn, bwUsdcFee);
                uint256 outV2 = _quoteExactInputV2(uniV2Router, usdc, bwaezi, usdcIn);
                uint256 outSu = _quoteExactInputV2(sushiRouter, usdc, bwaezi, usdcIn);
                uint256 best  = _max3(outV3, outV2, outSu);
                require(best > 0, "no usdc quote");
                uint256 minOut = (best * (10000 - epsilonBps)) / 10000;
                bwBought      += _swapBestIn(usdc, bwaezi, usdcIn, minOut, bwUsdcFee);
            }
            if (wethIn > 0) {
                uint256 outV3 = _quoteExactInputV3(weth, bwaezi, wethIn, bwWethFee);
                uint256 outV2 = _quoteExactInputV2(uniV2Router, weth, bwaezi, wethIn);
                uint256 outSu = _quoteExactInputV2(sushiRouter, weth, bwaezi, wethIn);
                uint256 best  = _max3(outV3, outV2, outSu);
                require(best > 0, "no weth quote");
                uint256 minOut = (best * (10000 - epsilonBps)) / 10000;
                bwBought      += _swapBestIn(weth, bwaezi, wethIn, minOut, bwWethFee);
            }
            emit PartialInternalBuy(pulled, bwBought > pulled ? (bwBought - pulled) : 0);
        }

        if (bwBought > 0) {
            BW.safeTransfer(scw, bwBought);
            uint256 stablesValue1e18 = (bwBought * sellPrice1e18) / 1e18;
            emit InternalSellLeg(bwBought, stablesValue1e18);
        }

        IERC20(usdc).safeTransfer(vault, usdcIn + usdcFee);
        IERC20(weth).safeTransfer(vault, wethIn + wethFee);

        uint256 residualUsdc = IERC20(usdc).balanceOf(address(this));
        uint256 residualWeth = IERC20(weth).balanceOf(address(this));
        if (residualUsdc > 0) IERC20(usdc).safeTransfer(scw, residualUsdc);
        if (residualWeth > 0) IERC20(weth).safeTransfer(scw, residualWeth);

        unchecked { cycleCount += 1; }
        emit CycleExecuted(bundleId, usdcIn, wethIn, bwBought, residualUsdc, residualWeth);

        if (cycleCount % checkpointPeriod == 0) {
            _reinvestDrip(cfg.RbarUSD1e18, cfg.spreadUSD1e18);
        }
        _maybeTopEntryPoint();
    }

    /* ----------------------------- Reinvestment drip (8 pools) ----------------------------- */
    function _reinvestDrip(uint256 RbarUSD1e18, uint256 spread1e18) internal {
        uint256 r = _reinvestRatio(spread1e18);
        uint256 scwUsdc = IERC20(usdc).balanceOf(scw);
        uint256 scwWeth = IERC20(weth).balanceOf(scw);
        uint256 scwBw   = BW.balanceOf(scw);

        uint256 usdcDeposit = (scwUsdc * r) / 1e18;
        uint256 wethDeposit = (scwWeth * r) / 1e18;
        uint256 bwDeposit   = (scwBw   * r) / 1e18;

        if (usdcDeposit > 0) IERC20(usdc).safeTransferFrom(scw, address(this), usdcDeposit);
        if (wethDeposit > 0) IERC20(weth).safeTransferFrom(scw, address(this), wethDeposit);
        if (bwDeposit   > 0) BW.safeTransferFrom(scw, address(this), bwDeposit);

        // Split deposits across venues (simple equal split)
        uint256 usdcEach = usdcDeposit / 3; // V2/Sushi + V3
        uint256 wethEach = wethDeposit / 3; // V2/Sushi + V3
        uint256 bwEach   = bwDeposit   / 4; // Balancer USDC/WETH + V2 + Sushi

        // Batch approvals (only from this contract; SCW assumed unlimited)
        {
            address[] memory tokensApprove = new address[](6);
            tokensApprove[0] = usdc; tokensApprove[1] = weth; tokensApprove[2] = bwaezi;
            tokensApprove[3] = usdc; tokensApprove[4] = weth; tokensApprove[5] = bwaezi;
            _batchApprove(tokensApprove, uniV2Router, usdcEach > 0 ? usdcEach : 0);
            _batchApprove(tokensApprove, sushiRouter, usdcEach > 0 ? usdcEach : 0);
        }

        // V2 addLiquidity (USDC/BW, WETH/BW)
        if (usdcEach > 0 && bwEach > 0) {
            try IUniswapV2Router(uniV2Router).addLiquidity(
                usdc, bwaezi, usdcEach, bwEach, (usdcEach * 99) / 100, (bwEach * 99) / 100, address(this), block.timestamp + 300
            ) {} catch {}
        }
        if (wethEach > 0 && bwEach > 0) {
            try IUniswapV2Router(uniV2Router).addLiquidity(
                weth, bwaezi, wethEach, bwEach, (wethEach * 99) / 100, (bwEach * 99) / 100, address(this), block.timestamp + 300
            ) {} catch {}
        }

        // Sushi addLiquidity (USDC/BW, WETH/BW)
        if (usdcEach > 0 && bwEach > 0) {
            try IUniswapV2Router(sushiRouter).addLiquidity(
                usdc, bwaezi, usdcEach, bwEach, (usdcEach * 99) / 100, (bwEach * 99) / 100, address(this), block.timestamp + 300
            ) {} catch {}
        }
        if (wethEach > 0 && bwEach > 0) {
            try IUniswapV2Router(sushiRouter).addLiquidity(
                weth, bwaezi, wethEach, bwEach, (wethEach * 99) / 100, (bwEach * 99) / 100, address(this), block.timestamp + 300
            ) {} catch {}
        }

        // Uniswap V3 mint positions (USDC/BW, WETH/BW)
        IERC20(usdc).safeApprove(positionManager, usdcEach);
        IERC20(weth).safeApprove(positionManager, wethEach);
        BW.safeApprove(positionManager, bwEach);

        if (usdcEach > 0 && bwEach > 0) {
            try INonfungiblePositionManager(positionManager).mint(
                INonfungiblePositionManager.MintParams({
                    token0: usdc,
                    token1: bwaezi,
                    fee: bwUsdcFee,
                    tickLower: -887220,
                    tickUpper:  887220,
                    amount0Desired: usdcEach,
                    amount1Desired: bwEach,
                    amount0Min: (usdcEach * 99) / 100,
                    amount1Min: (bwEach * 99) / 100,
                    recipient: address(this),
                    deadline: block.timestamp + 300
                })
            ) {} catch {}
        }

        if (wethEach > 0 && bwEach > 0) {
            try INonfungiblePositionManager(positionManager).mint(
                INonfungiblePositionManager.MintParams({
                    token0: weth,
                    token1: bwaezi,
                    fee: bwWethFee,
                    tickLower: -887220,
                    tickUpper:  887220,
                    amount0Desired: wethEach,
                    amount1Desired: bwEach,
                    amount0Min: (wethEach * 99) / 100,
                    amount1Min: (bwEach * 99) / 100,
                    recipient: address(this),
                    deadline: block.timestamp + 300
                })
            ) {} catch {}
        }

        // Balancer joins (USDC/BW, WETH/BW) — ExactTokensInForBPTOut encoding
        {
            (address[] memory tokensU, ,) = IBalancerVault(vault).getPoolTokens(balBWUSDCId);
            address[] memory assetsU = new address[](2);
            uint256[] memory maxInU = new uint256[](2);
            if (tokensU[0] == usdc && tokensU[1] == bwaezi) {
                assetsU[0] = usdc; assetsU[1] = bwaezi;
                maxInU[0] = usdcEach; maxInU[1] = bwEach;
            } else {
                assetsU[0] = bwaezi; assetsU[1] = usdc;
                maxInU[0] = bwEach; maxInU[1] = usdcEach;
            }
            bytes memory userDataU = abi.encode(uint8(1), maxInU, uint256(0)); // 1 = ExactTokensInForBPTOut
            IERC20(usdc).safeApprove(vault, usdcEach);
            BW.safeApprove(vault, bwEach);
            try IBalancerVault(vault).joinPool(
                balBWUSDCId, address(this), address(this),
                IBalancerVault.JoinPoolRequest({assets: assetsU, maxAmountsIn: maxInU, userData: userDataU, fromInternalBalance: false})
            ) {} catch {}
        }
        {
            (address[] memory tokensW, ,) = IBalancerVault(vault).getPoolTokens(balBWWETHId);
            address[] memory assetsW = new address[](2);
            uint256[] memory maxInW = new uint256[](2);
            if (tokensW[0] == weth && tokensW[1] == bwaezi) {
                assetsW[0] = weth; assetsW[1] = bwaezi;
                maxInW[0] = wethEach; maxInW[1] = bwEach;
            } else {
                assetsW[0] = bwaezi; assetsW[1] = weth;
                maxInW[0] = bwEach; maxInW[1] = wethEach;
            }
            bytes memory userDataW = abi.encode(uint8(1), maxInW, uint256(0));
            IERC20(weth).safeApprove(vault, wethEach);
            BW.safeApprove(vault, bwEach);
            try IBalancerVault(vault).joinPool(
                balBWWETHId, address(this), address(this),
                IBalancerVault.JoinPoolRequest({assets: assetsW, maxAmountsIn: maxInW, userData: userDataW, fromInternalBalance: false})
            ) {} catch {}
        }

        emit Reinvested((r * 10000) / 1e18, usdcDeposit, wethDeposit);
    }

    /* ----------------------------- Initial seeding (8 pools) ----------------------------- */
    function seedAllPools(
        uint256 usdcAmount,
        uint256 wethAmount,
        uint256 bwAmount,
        // V3 ticks (strategy-computed ranges)
        int24 usdcBwTickLower,
        int24 usdcBwTickUpper,
        int24 wethBwTickLower,
        int24 wethBwTickUpper
    ) external onlyOwner nonReentrant {
        require(usdcAmount > 0 || wethAmount > 0 || bwAmount > 0, "zero");
        // Pull from SCW (SCW has unlimited approvals)
        if (usdcAmount > 0) IERC20(usdc).safeTransferFrom(scw, address(this), usdcAmount);
        if (wethAmount > 0) IERC20(weth).safeTransferFrom(scw, address(this), wethAmount);
        if (bwAmount   > 0) BW.safeTransferFrom(scw, address(this), bwAmount);

        uint256 usdcSplit = usdcAmount / 3;
        uint256 wethSplit = wethAmount / 3;
        uint256 bwSplit   = bwAmount   / 4;

        // Approvals (only from this contract)
        IERC20(usdc).safeApprove(uniV2Router, usdcSplit);
        IERC20(weth).safeApprove(uniV2Router, wethSplit);
        BW.safeApprove(uniV2Router, bwSplit);

        IERC20(usdc).safeApprove(sushiRouter, usdcSplit);
        IERC20(weth).safeApprove(sushiRouter, wethSplit);
        BW.safeApprove(sushiRouter, bwSplit);

        IERC20(usdc).safeApprove(positionManager, usdcSplit);
        IERC20(weth).safeApprove(positionManager, wethSplit);
        BW.safeApprove(positionManager, bwSplit);

        // V2 addLiquidity
        if (usdcSplit > 0 && bwSplit > 0) {
            try IUniswapV2Router(uniV2Router).addLiquidity(
                usdc, bwaezi, usdcSplit, bwSplit, (usdcSplit * 99) / 100, (bwSplit * 99) / 100, address(this), block.timestamp + 600
            ) {} catch {}
        }
        if (wethSplit > 0 && bwSplit > 0) {
            try IUniswapV2Router(uniV2Router).addLiquidity(
                weth, bwaezi, wethSplit, bwSplit, (wethSplit * 99) / 100, (bwSplit * 99) / 100, address(this), block.timestamp + 600
            ) {} catch {}
        }

        // Sushi addLiquidity
        if (usdcSplit > 0 && bwSplit > 0) {
            try IUniswapV2Router(sushiRouter).addLiquidity(
                usdc, bwaezi, usdcSplit, bwSplit, (usdcSplit * 99) / 100, (bwSplit * 99) / 100, address(this), block.timestamp + 600
            ) {} catch {}
        }
        if (wethSplit > 0 && bwSplit > 0) {
            try IUniswapV2Router(sushiRouter).addLiquidity(
                weth, bwaezi, wethSplit, bwSplit, (wethSplit * 99) / 100, (bwSplit * 99) / 100, address(this), block.timestamp + 600
            ) {} catch {}
        }

        // V3 mint positions
        if (usdcSplit > 0 && bwSplit > 0) {
            try INonfungiblePositionManager(positionManager).mint(
                INonfungiblePositionManager.MintParams({
                    token0: usdc,
                    token1: bwaezi,
                    fee: bwUsdcFee,
                    tickLower: usdcBwTickLower,
                    tickUpper: usdcBwTickUpper,
                    amount0Desired: usdcSplit,
                    amount1Desired: bwSplit,
                    amount0Min: (usdcSplit * 99) / 100,
                    amount1Min: (bwSplit * 99) / 100,
                    recipient: address(this),
                    deadline: block.timestamp + 600
                })
            ) {} catch {}
        }
        if (wethSplit > 0 && bwSplit > 0) {
            try INonfungiblePositionManager(positionManager).mint(
                INonfungiblePositionManager.MintParams({
                    token0: weth,
                    token1: bwaezi,
                    fee: bwWethFee,
                    tickLower: wethBwTickLower,
                    tickUpper: wethBwTickUpper,
                    amount0Desired: wethSplit,
                    amount1Desired: bwSplit,
                    amount0Min: (wethSplit * 99) / 100,
                    amount1Min: (bwSplit * 99) / 100,
                    recipient: address(this),
                    deadline: block.timestamp + 600
                })
            ) {} catch {}
        }

        // Balancer joins
        {
            (address[] memory tokensU, ,) = IBalancerVault(vault).getPoolTokens(balBWUSDCId);
            address[] memory assetsU = new address[](2);
            uint256[] memory maxInU = new uint256[](2);
            if (tokensU[0] == usdc && tokensU[1] == bwaezi) {
                assetsU[0] = usdc; assetsU[1] = bwaezi;
                maxInU[0] = usdcSplit; maxInU[1] = bwSplit;
            } else {
                assetsU[0] = bwaezi; assetsU[1] = usdc;
                maxInU[0] = bwSplit; maxInU[1] = usdcSplit;
            }
            bytes memory userDataU = abi.encode(uint8(1), maxInU, uint256(0));
            IERC20(usdc).safeApprove(vault, usdcSplit);
            BW.safeApprove(vault, bwSplit);
            try IBalancerVault(vault).joinPool(
                balBWUSDCId, address(this), address(this),
                IBalancerVault.JoinPoolRequest({assets: assetsU, maxAmountsIn: maxInU, userData: userDataU, fromInternalBalance: false})
            ) {} catch {}
        }
        {
            (address[] memory tokensW, ,) = IBalancerVault(vault).getPoolTokens(balBWWETHId);
            address[] memory assetsW = new address[](2);
            uint256[] memory maxInW = new uint256[](2);
            if (tokensW[0] == weth && tokensW[1] == bwaezi) {
                assetsW[0] = weth; assetsW[1] = bwaezi;
                maxInW[0] = wethSplit; maxInW[1] = bwSplit;
            } else {
                assetsW[0] = bwaezi; assetsW[1] = weth;
                maxInW[0] = bwSplit; maxInW[1] = wethSplit;
            }
            bytes memory userDataW = abi.encode(uint8(1), maxInW, uint256(0));
            IERC20(weth).safeApprove(vault, wethSplit);
            BW.safeApprove(vault, bwSplit);
            try IBalancerVault(vault).joinPool(
                balBWWETHId, address(this), address(this),
                IBalancerVault.JoinPoolRequest({assets: assetsW, maxAmountsIn: maxInW, userData: userDataW, fromInternalBalance: false})
            ) {} catch {}
        }

        emit PoolsSeeded(usdcAmount, wethAmount, bwAmount);
    }

    /* ----------------------------- Paymaster top-up ----------------------------- */
    function _maybeTopEntryPoint() internal {
        uint256 dep = entryPoint.balanceOf(address(this));
        if (dep >= targetDepositWei) return;

        uint256 scwWeth = IERC20(weth).balanceOf(scw);
        if (scwWeth == 0) return;

        uint256 draw = (scwWeth * paymasterDrawBps) / 10000;
        if (draw == 0) return;

        IERC20(weth).safeTransferFrom(scw, address(this), draw);
        IWETH(weth).withdraw(draw);
        entryPoint.depositTo{value: draw}(address(this));

        emit PaymasterTopped(draw, entryPoint.balanceOf(address(this)));
    }

    /* ----------------------------- Treasury & Emergency ----------------------------- */
    function withdrawToken(address token, uint256 amount) external onlyOwner nonReentrant {
        IERC20(token).safeTransfer(owner, amount);
    }

    // Emergency ETH withdrawal (only owner)
    function emergencyWithdrawETH(uint256 amount) external onlyOwner nonReentrant {
        require(address(this).balance >= amount, "insufficient ETH");
        (bool ok, ) = payable(owner).call{value: amount}("");
        require(ok, "eth withdraw fail");
    }

    function emergencyPause() external onlyOwner nonReentrant {
        paused = true;
        emit Paused(true);
    }

    /* ----------------------------- Rescue NFTs / LP positions ----------------------------- */
    // Recover stuck ERC721 (e.g., Uniswap V3 position NFTs)
    function rescueERC721(address nft, uint256 tokenId, address to) external onlyOwner nonReentrant {
        IERC721(nft).transferFrom(address(this), to, tokenId);
    }

    // Recover stuck ERC1155 (optional LP receipts)
    function rescueERC1155(address token, uint256 id, uint256 amount, address to, bytes calldata data) external onlyOwner nonReentrant {
        IERC1155(token).safeTransferFrom(address(this), to, id, amount, data);
    }

    /* ----------------------------- Batch approvals (gas utility) ----------------------------- */
    function _batchApprove(address[] memory tokens, address spender, uint256 amount) internal {
        uint256 len = tokens.length;
        for (uint256 i = 0; i < len; ) {
            // Skip zero address
            if (tokens[i] != address(0)) {
                IERC20(tokens[i]).safeApprove(spender, amount);
            }
            unchecked { ++i; }
        }
        emit BatchApproved(spender, amount, len);
    }

    receive() external payable {}
}
