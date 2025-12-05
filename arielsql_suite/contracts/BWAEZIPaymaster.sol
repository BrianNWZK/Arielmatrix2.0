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

    uint256 public constant BUFFER = 103; // 103%
    address public immutable owner;

    event Charged(address indexed user, uint256 amount);

    constructor(
        address _entryPoint,
        IERC20 _bwaeziToken,
        address _weth,
        IQuoterV2 _quoter
    ) {
        require(_entryPoint != address(0));
        require(address(_bwaeziToken) != address(0));
        require(_weth != address(0));
        require(address(_quoter) != address(0));

        entryPoint = _entryPoint;
        bwaeziToken = _bwaeziToken;
        weth = _weth;
        qu = _quoter;
        owner = msg.sender;
    }

    function deposit() external payable {}

    // THIS IS THE ONLY LINE THAT WORKS ON RENDER TODAY
    function _quote(uint256 wethAmount) internal returns (uint256) {
        try qu.quoteExactOutputSingle(
            address(bwaeziToken),
            weth,
            wethAmount,
            3000,
            0
        ) returns (uint256 amountIn, uint160, uint32, uint256) {
            return amountIn * BUFFER / 100;
        } catch {
            return wethAmount * 120 / 100; // safe fallback
        }
    }

    // Manual unpack — 100% safe casting
    function _vg(bytes32 d) internal pure returns (uint256) { return uint256(uint128(bytes16(d))); }
    function _cg(bytes32 d) internal pure returns (uint256) { return uint256(uint128(uint256(d))); }
    function _mf(bytes32 d) internal pure returns (uint256) { return uint256(uint128(uint256(d))); }

    function validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32,
        uint256 requiredPreFund
    ) external override returns (bytes memory context, uint256 validationData) {
        require(msg.sender == entryPoint);

        uint256 maxCost = requiredPreFund +
            _vg(userOp.accountGasLimits) * _mf(userOp.gasFees) +
            _cg(userOp.accountGasLimits) * _mf(userOp.gasFees);

        uint256 needed = _quote(maxCost);

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

    // Owner withdraw
    function withdraw(uint256 amount) external {
        require(msg.sender == owner);
        bwaeziToken.safeTransfer(owner, amount);
    }
}
