// contracts/BWAEZIPaymaster.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// OFFICIAL ERC-4337 v0.7/v0.8 interfaces
import "@account-abstraction/contracts/interfaces/IPaymaster.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
// Note: We avoid importing PackedUserOperation.sol to fix the "Member not found" error.

// CRITICAL FIX: Define the required structs/enums locally to guarantee compatibility
// and access to all fields (like verificationGasLimit) without relying on Packed structs.
struct UserOperation {
    address sender;
    uint256 nonce;
    bytes initCode;
    bytes callData;
    uint256 callGasLimit;
    uint256 verificationGasLimit;
    uint256 preVerificationGas;
    uint256 maxFeePerGas;
    uint256 maxPriorityFeePerGas;
    bytes paymasterAndData;
    bytes signature;
}

enum PostOpMode {
    opSucceeded,
    opReverted,
    postOpReverted
}

// Uniswap V3 QuoterV2 (from previous code)
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
    uint256 public constant BUFFER_PERCENT = 120; // 20% buffer

    constructor(
        address _entryPoint,
        address _bwaeziToken, // Note: Constructor arg is address, internal is IERC20
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

    // EntryPoint deposits WETH here to cover gas
    function deposit() external payable {}
    receive() external payable {
        revert("Use deposit()");
    }

    // Implement getHash (required to not be abstract)
    function getHash(UserOperation calldata userOp)
        external
        view
        returns (bytes32)
    {
        // Simple hash calculation to satisfy the interface requirement
        return keccak256(abi.encode(
            userOp.sender,
            userOp.nonce,
            keccak256(userOp.callData)
        ));
    }

    // MAIN VALIDATION: Uses UserOperation struct and canonical signature
    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 /* userOpHash */,
        uint256 requiredPrefund
    ) external view override returns (bytes memory context, uint256 validationData) {
        require(msg.sender == entryPoint, "Only EntryPoint");

        // Max possible cost in native token (WETH)
        uint256 maxPossibleCost = requiredPrefund +
            userOp.verificationGasLimit * userOp.maxFeePerGas + // FIX: Fields are now accessible
            userOp.callGasLimit * userOp.maxFeePerGas;

        // How much BWAEZI do we need to cover that cost?
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

        // Check user's allowance to this paymaster
        require(
            bwaeziToken.allowance(userOp.sender, address(this)) >= requiredWithBuffer,
            "BWAEZI allowance too low"
        );

        // Return empty context + success (0)
        return ("", 0);
    }

    // POST-OP: Uses the official 4-argument signature from EIP-4337 v0.7+
    function postOp(
        PostOpMode mode,
        bytes calldata context, // Unused in this version, kept for signature
        uint256 actualGasCost,
        UserOperation calldata userOp // CRITICAL FIX: Added UserOp struct as the 4th argument
    ) external override {
        // FIX: The override error is resolved by matching the 4-argument signature.
        require(msg.sender == entryPoint, "Only EntryPoint");

        // If postOp itself reverted, or the userOp failed, do nothing
        if (mode != PostOpMode.opSucceeded) {
            return;
        }

        // Recalculate exact cost in WETH
        uint256 costInWeth = actualGasCost;
        (uint256 bwaeziCharge, , , ) = quoter.quoteExactOutputSingle(
            IQuoterV2.QuoteExactOutputSingleParams({
                tokenIn: address(bwaeziToken),
                tokenOut: weth,
                amount: costInWeth,
                fee: poolFee,
                sqrtPriceLimitX96: 0
            })
        );
        uint256 finalCharge = (bwaeziCharge * BUFFER_PERCENT) / 100;

        // CRITICAL FIX: Pull tokens from userOp.sender, not msg.sender (which is EntryPoint)
        bwaeziToken.safeTransferFrom(userOp.sender, address(this), finalCharge);
    }
}
