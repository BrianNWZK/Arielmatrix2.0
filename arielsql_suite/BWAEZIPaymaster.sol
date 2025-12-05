// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@account-abstraction/contracts/interfaces/IPaymaster.sol";
import "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";

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
    uint24 public immutable poolFee = 3000;

    uint256 public constant BUFFER_PERCENT = 103;
    address public immutable owner;

    event Charged(address indexed user, uint256 amount);

    constructor(
        address _entryPoint,
        IERC20 _bwaeziToken,
        address _weth,
        IQuoterV2 _quoter
    ) {
        require(_entryPoint != address(0), "Bad EP");
        require(address(_bwaeziToken) != address(0), "Bad token");
        require(_weth != address(0), "Bad WETH");
        require(address(_quoter) != address(0), "Bad quoter");

        entryPoint = _entryPoint;
        bwaeziToken = _bwaeziToken;
        weth = _weth;
        quoter = _quoter;
        owner = msg.sender;
    }

    function deposit() external payable {}

    function _quote(uint256 wethAmount) internal view returns (uint256) {
        try quoter.quoteExactOutputSingle(address(bwaeziToken), weth, wethAmount, poolFee, 0)
            returns (uint256 amountIn, , , ) 
        {
            return amountIn * BUFFER_PERCENT / 100;
        } catch {
            return wethAmount * 120 / 100; // 20% safe fallback
        }
    }

    // Manual unpack – works on every v0.8 version
    function _unpackGasLimits(bytes32 data) internal pure returns (uint256 vg, uint256 cg) {
        vg = uint256(uint128(bytes16(data)));
        cg = uint256(uint128(uint256(data)));
    }

    function _unpackFees(bytes32 data) internal pure returns (uint256 prio, uint256 max) {
        prio = uint256(uint128(bytes16(data)));
        max = uint256(uint128(uint256(data)));
    }

    function validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32,
        uint256 requiredPreFund
    ) external override returns (bytes memory context, uint256 validationData) {
        require(msg.sender == entryPoint, "Only EP");

        (uint256 vg, uint256 cg) = _unpackGasLimits(userOp.accountGasLimits);
        (, uint256 maxFee) = _unpackFees(userOp.gasFees);

        uint256 needed = _quote(requiredPreFund + vg * maxFee + cg * maxFee);

        require(bwaeziToken.allowance(userOp.sender, address(this)) >= needed, "Low allowance");

        return (abi.encode(userOp.sender), 0);
    }

    function postOp(PostOpMode mode, bytes calldata context, uint256, uint256) external override {
        require(msg.sender == entryPoint);
        if (mode == PostOpMode.postOpReverted) return;

        address user = abi.decode(context, (address));
        uint256 charge = _quote(requiredPreFund); // approx, or store in context

        bwaeziToken.safeTransferFrom(user, address(this), charge);
        emit Charged(user, charge);
    }

    // Owner withdraw
    function withdraw(uint256 amount) external {
        require(msg.sender == owner);
        bwaeziToken.safeTransfer(owner, amount);
    }
}
