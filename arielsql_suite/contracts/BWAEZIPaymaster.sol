// contracts/BWAEZIPaymaster.sol: The 'Loaves and Fishes' Contract
pragma solidity ^0.8.0;

// NOTE: These contracts are pulled from the Node_modules folder (requires npm install)
import {IPaymaster} from "@account-abstraction/contracts/interfaces/IPaymaster.sol";
import {UserOperation} from "@account-abstraction/contracts/interfaces/UserOperation.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

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

    receive() external payable {}

    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32, /* userOpHash */
        uint256 maxCost
    ) external view returns (bytes memory context, uint256 validationData) {
        uint256 gasCostETH = maxCost; 
        
        // Fetch BWAEZI needed to acquire ETH/WETH gas cost
        uint256 bwaeziAmountNeeded = IQuoter(quoterAddress).quoteExactOutputSingle(
            bwaeziToken,
            wethToken,
            BWAEZI_WETH_FEE,
            gasCostETH, 
            0 
        );

        // 5% slippage buffer
        uint256 bwaeziAmountWithBuffer = bwaeziAmountNeeded * 105 / 100;

        uint256 allowance = IERC20(bwaeziToken).allowance(userOp.sender, address(this));
        require(allowance >= bwaeziAmountWithBuffer, "Paymaster: BWAEZI allowance too low.");

        return (abi.encode(bwaeziAmountWithBuffer), 0); 
    }

    function postOp(
        PostOpInfo calldata postOpInfo,
        bytes calldata context
    ) external {
        require(msg.sender == entryPoint, "Paymaster: only EntryPoint");
        
        uint256 bwaeziAmountNeeded = abi.decode(context, (uint256));

        IERC20(bwaeziToken).safeTransferFrom(
            postOpInfo.userOp.sender, 
            address(this),
            bwaeziAmountNeeded
        );
    }
}
