// contracts/BWAEZIPaymaster.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ERC-4337 core interfaces
import "@account-abstraction/contracts/interfaces/IPaymaster.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// CRITICAL FIX: Explicitly define the UserOperation struct, which the IPaymaster 
// interface requires, to resolve all type and "Member not found" errors.
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

// CRITICAL FIX: Explicitly define the PostOpMode enum, required by the IPaymaster interface.
enum PostOpMode {
    opSucceeded,
    opReverted,
    postOpReverted
}


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

    // 103% buffer for price volatility and gas reserve
    uint256 public constant BUFFER_PERCENT = 103;

    constructor(
        address _entryPoint,
        IERC20 _bwaeziToken,
        address _weth,
        IQuoterV2 _quoter,
        uint24 _poolFee
    ) {
        entryPoint = _entryPoint;
        bwaeziToken = _bwaeziToken;
        weth = _weth;
        quoter = _quoter;
        poolFee = _poolFee;
    }

    // Called by EntryPoint to receive funds (WETH in this case, for gas)
    function deposit() public payable {}
    
    // Fallback in case of wrong call
    receive() external payable {
        revert("BWAEZIPaymaster: Deposit WETH via deposit()");
    }

    // The function called by the wallet to sponsor the transaction
    function sponsorUserOperation(
        address sponsorSCW,
        uint256 bwaeziAmount
    ) external {
        uint256 bwaeziWithBuffer = (bwaeziAmount * BUFFER_PERCENT) / 100;
        // Assuming sponsorSCW is approved this contract to pull BWAEZI
        bwaeziToken.safeTransferFrom(sponsorSCW, address(this), bwaeziWithBuffer);
    }

    // Implementation of getHash (required by IPaymaster)
    function getHash(UserOperation calldata userOp) public view returns (bytes32) {
        // Simple hash calculation for compilation success
        return keccak256(abi.encodePacked(
            userOp.sender, 
            userOp.nonce,
            userOp.callGasLimit
        ));
    }

    // Called by EntryPoint during validation
    function validatePaymasterUserOp(
        UserOperation calldata userOp, 
        bytes32 userOpHash,
        uint256 requiredPrefund // CRITICAL FIX: Revert to 'requiredPrefund'
    ) external view override returns (bytes memory context, uint256 validationData) {
        // CRITICAL FIX: Added 'view' modifier back to match the most common IPaymaster signature

        require(msg.sender == entryPoint, "BWAEZIPaymaster: Only EntryPoint");

        // Calculate max possible cost
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
        require(allowance >= requiredWithBuffer, "BWAEZI: Insufficient allowance for Paymaster");

        // Return success validation data (0 for success)
        return ("", 0); 
    }

    // Called by EntryPoint during execution (or failure)
    function postOp(
        PostOpMode mode, 
        bytes calldata context,
        uint256 actualGasCost 
    ) external override {
        // The signature now matches the IPaymaster interface for your version
        require(msg.sender == entryPoint, "BWAEZIPaymaster: Only EntryPoint");

        // Add real post-operation logic here (e.g., swapping BWAEZI for WETH)
    }
}
