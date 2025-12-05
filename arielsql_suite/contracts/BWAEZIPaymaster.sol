// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@account-abstraction/contracts/interfaces/IPaymaster.sol";
import "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import "@account-abstraction/contracts/core/Helpers.sol";   // ← THIS IS THE KEY
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IQuoterV2 {
    function quoteExactOutputSingle(
        address tokenIn,
        address tokenOut,
        uint256 amountOut,
        uint24 fee,
        uint160 sqrtPriceLimitX96
    ) external returns (uint256 amountIn, uint160, uint32, uint256);
}

contract BWAEZIPaymaster is IPaymaster {
    using SafeERC20 for IERC20;

    address public immutable entryPoint;
    IERC20 public immutable bwaeziToken;
    address public immutable weth;
    IQuoterV2 public immutable quoter;
    uint24 public immutable poolFee;

    uint256 public constant BUFFER_PERCENT = 103;
    address public owner;

    event Charged(address indexed user, uint256 amount);
    event Sponsored(address indexed sponsor, uint256 amount);

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
        owner = msg.sender;
    }

    function deposit() external payable {}

    function sponsor(address from, uint256 amount) external {
        uint256 withBuffer = (amount * BUFFER_PERCENT) / 100;
        bwaeziToken.safeTransferFrom(from, address(this), withBuffer);
        emit Sponsored(from, withBuffer);
    }

    // Fixed quoting – works with try/catch in 0.8.28
    function _quote(uint256 wethAmount) internal view returns (uint256) {
        try quoter.quoteExactOutputSingle(
            address(bwaeziToken),
            weth,
            wethAmount,
            poolFee,
            0
        ) returns (uint256 amountIn, uint160, uint32, uint256) {
            return (amountIn * BUFFER_PERCENT) / 100;
        } catch {
            return (wethAmount * 110) / 100; // 10% fallback
        }
    }

    function validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32,
        uint256 maxCost
    ) external override returns (bytes memory context, uint256 validationData) {
        require(msg.sender == entryPoint, "Only EntryPoint");

        // THESE ARE THE CORRECT FUNCTIONS IN v0.8.0
        (uint256 verificationGasLimit, uint256 callGasLimit) = 
            userOp.unpackAccountGasLimits();   // from Helpers.sol

        (uint256 maxFeePerGas, ) = userOp.unpackGasFees();  // from Helpers.sol

        uint256 needed = _quote(
            maxCost + verificationGasLimit * maxFeePerGas + callGasLimit * maxFeePerGas
        );

        require(
            bwaeziToken.allowance(userOp.sender, address(this)) >= needed,
            "BWAEZI allowance too low"
        );

        context = abi.encode(userOp.sender);
        validationData = 0;
    }

    function postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 // actualUserOpFeePerGas – unused in most paymasters
    ) external override {
        require(msg.sender == entryPoint, "Only EntryPoint");
        if (mode == PostOpMode.postOpReverted) return;

        address user = abi.decode(context, (address));
        uint256 charge = _quote(actualGasCost);

        bwaeziToken.safeTransferFrom(user, address(this), charge);
        emit Charged(user, charge);
    }

    // Owner functions
    function withdrawTokens(uint256 amount) external {
        require(msg.sender == owner);
        bwaeziToken.safeTransfer(owner, amount);
    }

    function withdrawETH() external {
        require(msg.sender == owner);
        payable(owner).transfer(address(this).balance);
    }
}
