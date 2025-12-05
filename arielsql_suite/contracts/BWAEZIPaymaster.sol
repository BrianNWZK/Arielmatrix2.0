// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@account-abstraction/contracts/interfaces/IPaymaster.sol";
import "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import "@account-abstraction/contracts/core/UserOperationLib.sol";
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
    using UserOperationLib for PackedUserOperation;

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

    function validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32,
        uint256 maxCost
    ) external override returns (bytes memory context, uint256 validationData) {
        require(msg.sender == entryPoint);

        (uint256 vg, uint256 cg) = userOp.unpackAccountGasLimits();
        (uint256 mfg,) = userOp.unpackGasFees();

        uint256 needed = _quote(maxCost + vg * mfg + cg * mfg);

        require(bwaeziToken.allowance(userOp.sender, address(this)) >= needed, "Low allowance");

        return (abi.encode(userOp.sender), 0);
    }

    function postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost,
        uint256
    ) external override {
        require(msg.sender == entryPoint);
        if (mode == PostOpMode.postOpReverted) return;

        address user = abi.decode(context, (address));
        uint256 charge = _quote(actualGasCost);

        bwaeziToken.safeTransferFrom(user, address(this), charge);
        emit Charged(user, charge);
    }

    function _quote(uint256 wethAmount) internal view returns (uint256) {
        try quoter.quoteExactOutputSingle(
            address(bwaeziToken), weth, wethAmount, poolFee, 0
        ) returns (uint256 amountIn, , , ) {
            return amountIn * BUFFER_PERCENT / 100;
        } catch {
            return wethAmount * 110 / 100; // 10% fallback buffer
        }
    }

    function withdraw(uint256 amount) external {
        require(msg.sender == owner);
        bwaeziToken.safeTransfer(owner, amount);
    }
}
