// contracts/BWAEZIPaymaster.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Latest ERC-4337 interfaces (v0.7+ / v0.8+)
import "@account-abstraction/contracts/interfaces/IPaymaster.sol";
import "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

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
        returns (
            uint256 amountIn,
            uint160 sqrtPriceX96After,
            uint32 initializedTicksCrossed,
            uint256 gasEstimate
        );
}

contract BWAEZIPaymaster is IPaymaster {
    using SafeERC20 for IERC20;

    address public immutable entryPoint;
    IERC20 public immutable bwaeziToken;
    address public immutable weth;
    IQuoterV2 public immutable quoter;
    uint24 public immutable poolFee;

    // 103% buffer for price volatility + gas reserve
    uint256 public constant BUFFER_PERCENT = 103;

    constructor(
        address _entryPoint,
        IERC20 _bwaeziToken,
        address _weth,
        IQuoterV2 _quoter,
        uint24 _poolFee
    ) {
        require(_entryPoint != address(0), "Invalid EntryPoint");
        entryPoint = _entryPoint;
        bwaeziToken = _bwaeziToken;
        weth = _weth;
        quoter = _quoter;
        poolFee = _poolFee;
    }

    // EntryPoint sends WETH here to cover gas
    function deposit() public payable {}

    receive() external payable {
        revert("Use deposit()");
    }

    // Optional: allow sponsor to pre-fund paymaster with BWAEZI
    function sponsorUserOperation(address sponsorSCW, uint256 bwaeziAmount) external {
        uint256 bwaeziWithBuffer = (bwaeziAmount * BUFFER_PERCENT) / 100;
        bwaeziToken.safeTransferFrom(sponsorSCW, address(this), bwaeziWithBuffer);
    }

    // REQUIRED: Implement getHash for ERC-4337 v0.7+ (used by some bundlers)
    function getHash(PackedUserOperation calldata userOp)
        external
        view
        returns (bytes32)
    {
        return keccak256(abi.encode(userOp.sender, userOp.nonce, keccak256(userOp.callData(userOp))));
    }

    // Helper to extract paymasterAndData
    function userOpData(PackedUserOperation calldata userOp) internal pure returns (bytes calldata) {
        return userOp.paymasterAndData.length > 20
            ? userOp.paymasterAndData[20:]
            : bytes("");
    }

    /**
     * @dev Main validation function – matches current IPaymaster interface
     */
    function validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 requiredPreFund
    ) external override returns (bytes memory context, uint256 validationData) {
        require(msg.sender == entryPoint, "Only EntryPoint");

        // Extract max possible cost in WETH
        uint256 maxCost = requiredPreFund +
            userOp.verificationGasLimit * userOp.maxFeePerGas +
            userOp.callGasLimit * userOp.maxFeePerGas;

        // Quote how much BWAEZI needed to cover maxCost in WETH
        (uint256 bwaeziNeeded, , , ) = quoter.quoteExactOutputSingle(
            IQuoterV2.QuoteExactOutputSingleParams({
                tokenIn: address(bwaeziToken),
                tokenOut: weth,
                amount: maxCost,
                fee: poolFee,
                sqrtPriceLimitX96: 0
            })
        );

        uint256 requiredWithBuffer = (bwaeziNeeded * BUFFER_PERCENT) / 100;

        // Check allowance from the account (userOp.sender) to this paymaster
        uint256 allowance = bwaeziToken.allowance(userOp.sender, address(this));
        require(allowance >= requiredWithBuffer, "Insufficient BWAEZI allowance");

        // Return empty context (we'll charge in postOp) + success (0)
        return ("", 0);
    }

    /**
     * @dev Called after user operation execution
     */
    function postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost,
        PackedUserOperation calldata userOp // added in newer versions for context
    ) external override {
        require(msg.sender == entryPoint, "Only EntryPoint");

        // If operation reverted, do nothing (we already have allowance, but don't burn tokens)
        if (mode == PostOpMode.postOpReverted) {
            return;
        }

        // Recalculate actual cost in WETH
        uint256 actualCostWeth = actualGasCost; // EntryPoint already converted to requiredPreFund units

        (uint256 bwaeziToCharge, , , ) = quoter.quoteExactOutputSingle(
            IQuoterV2.QuoteExactOutputSingleParams({
                tokenIn: address(bwaeziToken),
                tokenOut: weth,
                amount: actualCostWeth,
                fee: poolFee,
                sqrtPriceLimitX96: 0
            })
        );

        uint256 finalCharge = (bwaeziToCharge * BUFFER_PERCENT) / 100;

        // Pull exact BWAEZI amount from user
        bwaeziToken.safeTransferFrom(userOp.sender, address(this), finalCharge);

        // TODO: Here you can swap BWAEZI → WETH on Uniswap and deposit to EntryPoint
        // or keep BWAEZI and withdraw later
    }
}
