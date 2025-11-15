// arielsql_suite/BWAEZIPaymaster.sol: The 'Loaves and Fishes' Contract
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

// === FLAT DIRECTORY IMPORTS - NON-RELATIVE FIX ===
import "IPaymaster.sol";
import "UserOperation.sol"; // The struct is needed directly
import "IERC20.sol";
import "SafeERC20.sol";

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

    function postOp(
        UserOperation calldata userOp,
        uint256 actualGasCost,
        uint256 actualGasPrice
    ) external payable {
        require(msg.sender == entryPoint, "BP01: only EntryPoint");

        uint256 wethPaymentRequired = actualGasCost * actualGasPrice;
        
        uint256 bwaeziRequired = IQuoter(quoterAddress).quoteExactOutputSingle(
            bwaeziToken,
            wethToken,
            BWAEZI_WETH_FEE,
            wethPaymentRequired,
            0 
        );
    }

    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 requiredPreFund
    )
        external
        view
        returns (bytes memory context, uint256 validationData)
    {
        uint256 maxCost = userOp.preVerificationGas * userOp.maxFeePerGas + 
                             userOp.callGasLimit * userOp.maxFeePerGas;

        uint256 bwaeziRequiredForMaxPreFund = IQuoter(quoterAddress).quoteExactOutputSingle(
            bwaeziToken,
            wethToken,
            BWAEZI_WETH_FEE,
            requiredPreFund,
            0 
        );

        uint256 allowance = IERC20(bwaeziToken).allowance(userOp.sender, address(this));
        uint256 requiredAllowanceWithBuffer = bwaeziRequiredForMaxPreFund * 110 / 100;

        require(allowance >= requiredAllowanceWithBuffer, "BP03: BWAEZI allowance too low");

        return (hex"00", 0); 
    }

    function getHash() external pure returns (bytes32) {
        return keccak256("BWAEZIPaymaster");
    }

    receive() external payable {}
}
