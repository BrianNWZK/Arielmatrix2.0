// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ERC-4337 v0.8.0 interfaces + lib for hash/unpack
import "@account-abstraction/contracts/interfaces/IPaymaster.sol";
import "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import "@account-abstraction/contracts/core/UserOperationLib.sol";  // For hash() & unpack utils

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// Uniswap V3 QuoterV2 interface
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
    using UserOperationLib for PackedUserOperation;  // Enables userOp.hash(), unpackGasFees(), etc.

    address public immutable entryPoint;
    IERC20 public immutable bwaeziToken;
    address public immutable weth;
    IQuoterV2 public immutable quoter;
    uint24 public immutable poolFee;

    // 103% buffer for volatility + gas reserve
    uint256 public constant BUFFER_PERCENT = 103;
    // Fallback min charge if quoter fails (e.g., 1 BWAEZI per 1 ETH cost – adjust per tokenomics)
    uint256 public constant FALLBACK_BWAEZI_PER_ETH = 1e18;

    // Owner for withdrawals (add Ownable from OZ for prod)
    address public owner;

    event ChargedBWAEZI(address indexed user, uint256 bwaeziAmount, uint256 gasCost);
    event Sponsored(address indexed sponsor, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(
        address _entryPoint,
        IERC20 _bwaeziToken,
        address _weth,
        IQuoterV2 _quoter,
        uint24 _poolFee
    ) {
        require(_entryPoint != address(0) && _weth != address(0), "Invalid addresses");
        entryPoint = _entryPoint;
        bwaeziToken = _bwaeziToken;
        weth = _weth;
        quoter = _quoter;
        poolFee = _poolFee;
        owner = msg.sender;
    }

    // EntryPoint deposits native token (WETH/ETH) here
    function deposit() external payable {
        // Funds received; EntryPoint handles balance checks
    }

    receive() external payable {
        revert("Use deposit()");
    }

    // Sponsor pre-funds with buffered BWAEZI
    function sponsorUserOperation(address sponsor, uint256 bwaeziAmount) external {
        uint256 withBuffer = (bwaeziAmount * BUFFER_PERCENT) / 100;
        bwaeziToken.safeTransferFrom(sponsor, address(this), withBuffer);
        emit Sponsored(sponsor, withBuffer);
    }

    // Optional: getHash using lib (for bundler/EOA signing compatibility)
    function getHash(PackedUserOperation calldata userOp) external view returns (bytes32) {
        // Uses lib's hash() – excludes signature
        return userOp.hash();
        // Novel: For ERC-712 (HW wallets), use: entryPoint.getUserOpHash(userOp)
    }

    // Novel: Safe quote via assembly staticcall (resilient to reverts)
    function _safeQuoteBWAEZINeeded(uint256 wethAmount) internal view returns (uint256 bwaeziNeeded) {
        IQuoterV2.QuoteExactOutputSingleParams memory params = IQuoterV2.QuoteExactOutputSingleParams({
            tokenIn: address(bwaeziToken),
            tokenOut: weth,
            amount: wethAmount,
            fee: poolFee,
            sqrtPriceLimitX96: 0
        });

        // Encode call data
        bytes memory callData = abi.encodeWithSelector(
            IQuoterV2.quoteExactOutputSingle.selector,
            params
        );

        // Assembly staticcall (gas-efficient, handles failures)
        (bool success, bytes memory returnData) = address(quoter).staticcall(callData);
        if (success && returnData.length >= 32) {
            bwaeziNeeded = abi.decode(returnData, (uint256));  // amountIn
            bwaeziNeeded = (bwaeziNeeded * BUFFER_PERCENT) / 100;
        } else {
            // Fallback: Conservative estimate
            bwaeziNeeded = (wethAmount * FALLBACK_BWAEZI_PER_ETH / 1e18) * BUFFER_PERCENT / 100;
        }
    }

    // validatePaymasterUserOp: Exact v0.8 match (view, packed)
    function validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 /* userOpHash */,
        uint256 maxCost
    ) external view override returns (bytes memory context, uint256 validationData) {
        require(msg.sender == entryPoint, "Only EntryPoint");

        // Unpack using lib (precise, audited)
        (uint256 verificationGas, uint256 callGas) = userOp.unpackAccountGasLimits();
        (uint256 maxFeePerGas, uint256 maxPriorityFeePerGas) = userOp.unpackGasFees();

        // Precise max cost calc (use maxFeePerGas for upper bound)
        uint256 preciseMaxCost = maxCost +
            verificationGas * maxFeePerGas +
            callGas * maxFeePerGas;

        uint256 bwaeziRequired = _safeQuoteBWAEZINeeded(preciseMaxCost);

        // Check allowance
        require(
            bwaeziToken.allowance(userOp.sender, address(this)) >= bwaeziRequired,
            "BWAEZI: Insufficient allowance"
        );

        // Success: Encode sender in context for postOp (multi-op safe)
        context = abi.encode(userOp.sender);
        validationData = 0;
    }

    // postOp: Exact v0.8 match (4 params)
    function postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 actualUserOpFeePerGas
    ) external override {
        require(msg.sender == entryPoint, "Only EntryPoint");

        if (mode == PostOpMode.postOpReverted) {
            return;  // No charge on revert (user-safe)
        }

        address user = abi.decode(context, (address));  // From validate

        // Use actualUserOpFeePerGas for precise cost (v0.8 feature)
        uint256 preciseActualCost = actualGasCost * actualUserOpFeePerGas;

        uint256 bwaeziToCharge = _safeQuoteBWAEZINeeded(preciseActualCost);

        bwaeziToken.safeTransferFrom(user, address(this), bwaeziToCharge);
        emit ChargedBWAEZI(user, bwaeziToCharge, actualGasCost);

        // Optional: Auto-swap to WETH (import SwapRouter & call here for full automation)
    }

    // Withdraw BWAEZI (owner only)
    function withdrawBWAEZI(uint256 amount) external onlyOwner {
        bwaeziToken.safeTransfer(owner, amount);
    }

    // Emergency withdraw native funds
    function withdrawNative(uint256 amount) external onlyOwner {
        payable(owner).transfer(amount);
    }
}
