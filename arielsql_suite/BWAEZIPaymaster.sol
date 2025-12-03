// contracts/BWAEZIPaymaster.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ERC-4337 core interfaces
import "@account-abstraction/contracts/interfaces/IPaymaster.sol";
import "@account-abstraction/contracts/interfaces/UserOperation.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// Uniswap V3 Quoter (for BWAEZI → WETH price)
interface IQuoterV2 {
    struct QuoteExactOutputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amount;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }
    function quoteExactOutputSingle(QuoteExactOutputSingleParams calldata params)
        external
        returns (uint256 amountIn, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate);
}

contract BWAEZIPaymaster is IPaymaster {
    using SafeERC20 for IERC20;

    address public immutable entryPoint;
    IERC20 public immutable bwaeziToken;
    address public immutable weth;
    IQuoterV2 public immutable quoter;
    uint24 public immutable poolFee; // e.g., 3000 = 0.3%

    uint256 public constant BUFFER_PERCENT = 120; // 20% buffer

    constructor(
        address _entryPoint,
        address _bwaeziToken,
        address _weth,
        address _quoter,
        uint24 _poolFee
    ) {
        entryPoint = _entryPoint;
        bwaeziToken = IERC20(_bwaeziToken);
        weth = _weth;
        quoter = IQuoterV2(_quoter);
        poolFee = _poolFee;
    }

    // Called by EntryPoint after UserOp success
    function postOp(
        PostOpMode,
        bytes calldata,
        uint256 actualGasCost
    ) external override {
        require(msg.sender == entryPoint, "Only EntryPoint");

        // How much WETH do we owe the bundler?
        uint256 wethRequired = actualGasCost;

        // How much BWAEZI do we need to swap to get that WETH?
        (uint256 bwaeziRequired, , , ) = quoter.quoteExactOutputSingle(
            IQuoterV2.QuoteExactOutputSingleParams({
                tokenIn: address(bwaeziToken),
                tokenOut: weth,
                amount: wethRequired,
                fee: poolFee,
                sqrtPriceLimitX96: 0
            })
        );

        uint256 bwaeziWithBuffer = (bwaeziRequired * BUFFER_PERCENT) / 100;

        // Pull BWAEZI from the SCW and send to bundler (or keep as treasury)
        bwaeziToken.safeTransferFrom(msg.sender, address(this), bwaeziWithBuffer);
    }

    // Called by EntryPoint during validation
    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32,
        uint256 requiredPrefund
    ) external view override returns (bytes memory context, uint256 validationData) {
        // Calculate max possible gas cost
        uint256 maxPossibleCost = requiredPrefund +
            userOp.verificationGasLimit * userOp.maxFeePerGas +
            userOp.callGasLimit * userOp.maxFeePerGas;

        // Quote how much BWAEZI needed for that cost
        (uint256 bwaeziNeeded, , , ) = quoter.quoteExactOutputSingle(
            IQuoterV2.QuoteExactOutputSingleParams({
                tokenIn: address(bwaeziToken),
                tokenOut: weth,
                amount: maxPossibleCost,
                fee: poolFee,
                sqrtPriceLimitX96: 0
            })
        );

        uint256 requiredWithBuffer = (bwaeziNeeded * BUFFER_PERCENT) / 100;

        // Check allowance from SCW to this paymaster
        uint256 allowance = bwaeziToken.allowance(userOp.sender, address(this));
        require(allowance >= requiredWithBuffer, "BWAEZI: insufficient allowance");

        // Success
        return ("", 0);
    }

    // Allow ETH deposits (for withdrawals later)
    receive() external payable {}
}
