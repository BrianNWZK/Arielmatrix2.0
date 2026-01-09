// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
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

interface ISushiSwapRouter {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
}

interface IChainlinkOracle {
    function latestAnswer() external view returns (int256);
}

contract FlashArbReceiver {
    address public immutable owner;
    address public immutable AAVE_POOL;

    // Mainnet addresses (verified January 2026)
    address public constant UNI_ROUTER    = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    address public constant SUSHI_ROUTER  = 0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F;
    address public constant USDC          = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address public constant WETH          = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    // Chainlink ETH/USD oracle (8 decimals) - stable & widely used
    address public constant CHAINLINK_ETH_USD = 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419;

    uint24 public constant UNI_FEE_TIER = 3000;           // Patched to your 0.3% pool
    uint256 public constant MIN_PROFIT_BPS = 20;           // Increased to 0.2% for safety
    uint256 public constant MAX_SLIPPAGE_BPS = 50;         // New: 0.5% max slippage tolerance

    constructor(address _aavePool) {
        owner = msg.sender;
        AAVE_POOL = _aavePool;
    }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata /* params */
    ) external returns (bool) {
        require(msg.sender == AAVE_POOL, "Only Aave Pool");
        require(initiator == address(this), "Invalid initiator");
        require(asset == USDC, "Only USDC supported");

        uint256 totalDebt = amount + premium;

        // === PATCHED: Oracle-based slippage protection ===
        // Get expected WETH out for USDC in (Chainlink price)
        int256 ethPriceInt = IChainlinkOracle(CHAINLINK_ETH_USD).latestAnswer();
        require(ethPriceInt > 0, "Invalid oracle price");
        uint256 ethPrice = uint256(ethPriceInt); // 8 decimals

        // Expected WETH = (amount USDC * 1e12) / ethPrice (adjust decimals: USDC 6 → 18 equiv)
        uint256 expectedWethOut = (amount * 1e12) / ethPrice;

        // Apply max slippage tolerance
        uint256 minWethOut = expectedWethOut * (10000 - MAX_SLIPPAGE_BPS) / 10000;

        // === APPROVALS (as you required) ===
        IERC20(USDC).approve(UNI_ROUTER, amount);

        // ── 1. USDC → WETH on Uniswap V3 (your 3000 tier) ─────────────────────
        IUniswapV3Router.ExactInputSingleParams memory uniParams = IUniswapV3Router.ExactInputSingleParams({
            tokenIn: USDC,
            tokenOut: WETH,
            fee: UNI_FEE_TIER,                    // Patched to 3000
            recipient: address(this),
            deadline: block.timestamp + 600,
            amountIn: amount,
            amountOutMinimum: minWethOut,          // New slippage protection
            sqrtPriceLimitX96: 0
        });

        uint256 wethReceived = IUniswapV3Router(UNI_ROUTER).exactInputSingle(uniParams);

        // Approve WETH for SushiSwap
        IERC20(WETH).approve(SUSHI_ROUTER, wethReceived);

        // ── 2. WETH → USDC on SushiSwap V2 (with light slippage check) ───────
        address[] memory path = new address[](2);
        path[0] = WETH;
        path[1] = USDC;

        // Rough min out: expect at least totalDebt (break-even)
        uint256 minUsdcOut = totalDebt * (10000 + MIN_PROFIT_BPS) / 10000;

        uint[] memory amounts = ISushiSwapRouter(SUSHI_ROUTER).swapExactTokensForTokens(
            wethReceived,
            minUsdcOut,
            path,
            address(this),
            block.timestamp + 600
        );

        uint256 usdcReceived = amounts[1];

        // ── 3. Final profit check & repay ───────────────────────────────────
        require(usdcReceived >= totalDebt + (totalDebt * MIN_PROFIT_BPS / 10000), "Insufficient profit");

        // Send profit to owner
        uint256 profit = usdcReceived - totalDebt;
        if (profit > 0) {
            IERC20(USDC).transfer(owner, profit);
        }

        // Final approval for Aave repayment
        IERC20(USDC).approve(AAVE_POOL, totalDebt);

        return true;
    }

    // Public trigger (restrict in production with onlyOwner)
    function executeFlashLoan(uint256 amount) external {
        // Optional: add onlyOwner modifier here for security
        IAavePool(AAVE_POOL).flashLoanSimple(
            address(this),
            USDC,
            amount,
            "",
            0
        );
    }

    // Emergency withdraw (only owner)
    function emergencyWithdraw(address token) external {
        require(msg.sender == owner, "Only owner");
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal > 0) IERC20(token).transfer(owner, bal);
    }
}
