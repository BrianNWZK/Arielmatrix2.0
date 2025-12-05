// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// OFFICIAL ERC-4337 v0.7/v0.8 interfaces
import "@account-abstraction/contracts/interfaces/IPaymaster.sol";
import "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// Uniswap V3 QuoterV2
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

    // 103% volatility + gas buffer
    uint256 public constant BUFFER_PERCENT = 103;

    constructor(
        address _entryPoint,
        IERC20 _bwaeziToken,
        address _weth,
        IQuoterV2 _quoter,
        uint24 _poolFee
    ) {
        require(_entryPoint != address(0), "invalid entrypoint");
        entryPoint = _entryPoint;
        bwaeziToken = _bwaeziToken;
        weth = _weth;
        quoter = _quoter;
        poolFee = _poolFee;
    }

    // EntryPoint deposits WETH here to cover gas
    function deposit() external payable {}

    receive() external payable {
        revert("Use deposit()");
    }

    // Optional sponsor function
    function sponsorUserOperation(address sponsor, uint256 bwaeziAmount) external {
        uint256 withBuffer = (bwaeziAmount * BUFFER_PERCENT) / 100;
        bwaeziToken.safeTransferFrom(sponsor, address(this), withBuffer);
    }

    // Required by newer versions of the spec
    function getHash(PackedUserOperation calldata userOp)
        external
        view
        returns (bytes32)
    {
        return keccak256(abi.encode(userOp.sender, userOp.nonce, keccak256(userOp.callData)));
    }

    // MAIN VALIDATION – matches EXACT current IPaymaster interface
    function validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 /* userOpHash */,
        uint256 requiredPreFund
    ) external override returns (bytes memory context, uint256 validationData) {
        require(msg.sender == entryPoint, "Only EntryPoint");

        // Max possible cost in native token (WETH on most chains)
        uint256 maxCost = requiredPreFund +
            userOp.verificationGasLimit * userOp.maxFeePerGas +
            userOp.callGasLimit * userOp.maxFeePerGas;

        // How much BWAEZI do we need to cover that cost?
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

        // Check user's allowance to this paymaster
        require(
            bwaeziToken.allowance(userOp.sender, address(this)) >= requiredWithBuffer,
            "BWAEZI allowance too low"
        );

        // Return empty context + success
        return ("", 0);
    }

    // POST-OP – matches current interface (4 parameters in v0.7+)
    function postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost,
        PackedUserOperation calldata userOp
    ) external override {
        require(msg.sender == entryPoint, "Only EntryPoint");

        // If postOp itself reverted, do nothing (pre-funded tokens stay safe)
        if (mode == PostOpMode.postOpReverted) {
            return;
        }

        // Recalculate exact cost
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

        // Pull exact amount from user
        bwaeziToken.safeTransferFrom(userOp.sender, address(this), finalCharge);

        // Optional: swap to WETH and deposit to EntryPoint here
        // Or keep BWAEZI and withdraw manually later
    }
}
