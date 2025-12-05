// contracts/BWAEZIPaymaster.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ERC-4337 core interfaces
import "@account-abstraction/contracts/interfaces/IPaymaster.sol";
// Using the file that was successfully resolved in the previous step
import "@account-abstraction/contracts/interfaces/PackedUserOperation.sol"; 
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

// NOTE: The IPaymaster interface requires the UserOperation struct, but the installed
// dependency version only seems to expose PackedUserOperation. We use PackedUserOperation
// to resolve the immediate 'DeclarationError'.
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
        // Only allow the Paymaster's owner/treasury to call this (implementation details omitted)
        // This is a simple proof-of-concept for the sponsor logic
        
        uint256 bwaeziWithBuffer = (bwaeziAmount * BUFFER_PERCENT) / 100;
        
        // Pull BWAEZI from the SCW and send to bundler (or keep as treasury)
        bwaeziToken.safeTransferFrom(sponsorSCW, address(this), bwaeziWithBuffer);
    }

    // Called by EntryPoint during validation
    function validatePaymasterUserOp(
        // CRITICAL FIX: Changed to PackedUserOperation to resolve DeclarationError
        PackedUserOperation calldata userOp, 
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
        require(allowance >= requiredWithBuffer, "BWAEZI: Insufficient allowance for Paymaster");

        // The validation logic is simplified here to only check token balance/allowance
        
        // Return success and a context byte string (empty here)
        return ("", 0); 
    }

    // Called by EntryPoint during execution (or failure)
    function postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost
    ) external override {
        // This function is required by the IPaymaster interface.
    }
}
