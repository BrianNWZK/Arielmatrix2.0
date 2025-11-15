// contracts/BWAEZIPaymaster.sol: The 'Loaves and Fishes' Contract
pragma solidity ^0.8.0;

// NOTE: These contracts are pulled from the Node_modules folder (requires npm install)
import {IPaymaster} from "@account-abstraction/contracts/interfaces/IPaymaster.sol";
import {UserOperation} from "@account-abstraction/contracts/interfaces/UserOperation.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// FIX: Correcting the OpenZeppelin SafeERC20 path for common compiler configurations
// The 'utils/' path is often deprecated or incorrect depending on the OZ version.
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol"; 

// Interface for the Uniswap V3 Quoter to get BWAEZI price
interface IQuoter {
    function quoteExactOutputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountOut,
        uint160 sqrtPriceLimitX96
    ) external returns (uint256 amountIn);
}

contract BWAEZIPaymaster is IPaymaster {
    using SafeERC20 for IERC20;

    address immutable private entryPoint;
    address immutable private bwaeziToken;
    address immutable private wethToken;
    address immutable private quoterAddress;
    uint24 immutable private BWAEZI_WETH_FEE;

    constructor(
        address _entryPoint,
        address _bwaeziToken,
        address _wethToken,
        address _quoterAddress,
        uint24 _bwaeziWethFee
    ) {
        entryPoint = _entryPoint;
        bwaeziToken = _bwaeziToken;
        wethToken = _wethToken;
        quoterAddress = _quoterAddress;
        BWAEZI_WETH_FEE = _bwaeziWethFee;
    }

    // --- PAYMASTER LOGIC ---

    // This function calculates the cost of the UserOperation in the gas token (ETH/WETH)
    // and determines how much BWAEZI the user must send to cover the fee.
    function postOp(
        UserOperation calldata userOp,
        uint256 actualGasCost,
        uint256 actualGasPrice
    ) external payable {
        // Only the EntryPoint can call this function
        require(msg.sender == entryPoint, "BP01: only EntryPoint");

        // Calculate the total payment required in WETH (actualGasCost * actualGasPrice)
        uint256 wethPaymentRequired = actualGasCost * actualGasPrice;
        
        // Use the Quoter to determine the BWAEZI required to purchase wethPaymentRequired
        uint256 bwaeziRequired = IQuoter(quoterAddress).quoteExactOutputSingle(
            bwaeziToken,
            wethToken,
            BWAEZI_WETH_FEE,
            wethPaymentRequired,
            0 // sqrtPriceLimitX96 0 means no limit
        );

        // Refund logic skipped for this simplified Paymaster, assuming required BWAEZI was 
        // transferred in validatePaymasterUserOp and EntryPoint handles ETH refund.
    }


    // This function is the primary gate: it validates if the Paymaster will pay the gas for the UserOperation.
    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 requiredPreFund
    )
        external
        view
        returns (bytes memory context, uint256 validationData)
    {
        // Require that the Paymaster has enough ETH deposited into the EntryPoint (external check)
        // Check SCW signature and validity (handled implicitly by the EntryPoint calling this hook)

        // 1. Calculate the maximum cost of the transaction in ETH
        uint256 maxCost = userOp.preVerificationGas * userOp.maxFeePerGas + userOp.callGasLimit * userOp.maxFeePerGas;

        // 2. Use the Quoter to determine the BWAEZI required for the requiredPreFund WETH
        uint256 bwaeziRequiredForMaxPreFund = IQuoter(quoterAddress).quoteExactOutputSingle(
            bwaeziToken,
            wethToken,
            BWAEZI_WETH_FEE,
            requiredPreFund,
            0 // sqrtPriceLimitX96 0 means no limit
        );

        // 3. Check if the Smart Account has approved the Paymaster to spend the required BWAEZI.
        uint256 allowance = IERC20(bwaeziToken).allowance(address(userOp.sender), address(this));
        
        // Allow a 10% buffer
        uint256 requiredAllowanceWithBuffer = bwaeziRequiredForMaxPreFund * 110 / 100;

        require(allowance >= requiredAllowanceWithBuffer, "BP03: BWAEZI allowance too low");

        // Return a default value to indicate success without complex anti-replay.
        return (hex"00", 0); 
    }

    // Fallback function required for IPaymaster
    function getHash() external pure returns (bytes32) {
        return keccak256("BWAEZIPaymaster");
    }

    // Required to receive ETH for deposits (when funding the Paymaster)
    receive() external payable {}
}
