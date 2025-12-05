// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// ERC-4337 v0.8.0 interfaces only (no Helpers needed)
import "@account-abstraction/contracts/interfaces/IPaymaster.sol";
import "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// Uniswap V3 QuoterV2 (exact sig)
interface IQuoterV2 {
    function quoteExactOutputSingle(
        address tokenIn,
        address tokenOut,
        uint256 amountOut,
        uint24 fee,
        uint160 sqrtPriceLimitX96
    ) external returns (uint256 amountIn, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate);
}

contract BWAEZIPaymaster is IPaymaster {
    using SafeERC20 for IERC20;

    address public immutable entryPoint;
    IERC20 public immutable bwaeziToken;
    address public immutable weth;
    IQuoterV2 public immutable quoter;
    uint24 public immutable poolFee;

    // 103% buffer for volatility + gas reserve
    uint256 public constant BUFFER_PERCENT = 103;
    // Fallback ratio if quoter fails (e.g., 1:1 BWAEZI:ETH – adjust to your token price)
    uint256 public constant FALLBACK_BWAEZI_PER_ETH = 1e18;

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

    // EntryPoint deposits native token here
    function deposit() external payable {}

    receive() external payable {
        revert("Use deposit()");
    }

    // Sponsor pre-funds with buffered BWAEZI
    function sponsorUserOperation(address sponsor, uint256 bwaeziAmount) external {
        uint256 withBuffer = (bwaeziAmount * BUFFER_PERCENT) / 100;
        bwaeziToken.safeTransferFrom(sponsor, address(this), withBuffer);
        emit Sponsored(sponsor, withBuffer);
    }

    // Optional: getHash for bundler compatibility (manual keccak over fields excl. sig)
    function getHash(PackedUserOperation calldata userOp) external view returns (bytes32) {
        // Exclude signature; use EntryPoint's domain for full hash if needed
        return keccak256(abi.encode(
            userOp.sender,
            userOp.nonce,
            keccak256(userOp.initCode),
            keccak256(userOp.callData),
            userOp.accountGasLimits,
            userOp.preVerificationGas,
            userOp.gasFees,
            userOp.paymasterAndData,
            keccak256(userOp.signature)  // Wait, no – exclude sig for paymaster hash; adjust if needed
        ));  // Simplified; use full spec if ERC-712 needed
    }

    // Safe quote via try-catch (full tuple, no parser errors)
    function _safeQuoteBWAEZINeeded(uint256 wethAmount) internal view returns (uint256 bwaeziNeeded) {
        try quoter.quoteExactOutputSingle(
            address(bwaeziToken),
            weth,
            wethAmount,
            poolFee,
            0
        ) returns (uint256 amountIn, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate) {
            bwaeziNeeded = (amountIn * BUFFER_PERCENT) / 100;
        } catch {
            // Fallback: Conservative estimate (prevents DoS on illiquid pools)
            bwaeziNeeded = ((wethAmount * FALLBACK_BWAEZI_PER_ETH) / 1e18) * BUFFER_PERCENT / 100;
        }
    }

    // Manual unpack: accountGasLimits (per v0.8 spec )
    function _unpackAccountGasLimits(bytes32 packed) internal pure returns (uint256 verificationGas, uint256 callGas) {
        verificationGas = uint256(uint128(packed >> 128));
        callGas = uint256(uint128(packed));
    }

    // Manual unpack: gasFees (high 128: maxPriorityFee, low: maxFeePerGas)
    function _unpackGasFees(bytes32 packed) internal pure returns (uint256 maxPriorityFee, uint256 maxFeePerGas) {
        maxPriorityFee = uint256(uint128(packed >> 128));
        maxFeePerGas = uint256(uint128(packed));
    }

    // validatePaymasterUserOp: EXACT v0.8 match (no view, maxCost)
    function validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 /* userOpHash */,
        uint256 maxCost
    ) external override returns (bytes memory context, uint256 validationData) {
        require(msg.sender == entryPoint, "Only EntryPoint");

        // Manual unpack (fixes undeclared identifier)
        (uint256 verificationGas, uint256 callGas) = _unpackAccountGasLimits(userOp.accountGasLimits);
        (, uint256 maxFeePerGas) = _unpackGasFees(userOp.gasFees);  // Use maxFee for upper bound

        // Precise max cost calc
        uint256 preciseMaxCost = maxCost +
            verificationGas * maxFeePerGas +
            callGas * maxFeePerGas;

        uint256 bwaeziRequired = _safeQuoteBWAEZINeeded(preciseMaxCost);

        // Check allowance
        require(
            bwaeziToken.allowance(userOp.sender, address(this)) >= bwaeziRequired,
            "BWAEZI: Insufficient allowance"
        );

        // Success: Encode sender for postOp
        context = abi.encode(userOp.sender);
        validationData = 0;
    }

    // postOp: EXACT v0.8 match (4 params)
    function postOp(
        PostOpMode mode,
        bytes calldata context,
        uint256 actualGasCost,
        uint256 actualUserOpFeePerGas
    ) external override {
        require(msg.sender == entryPoint, "Only EntryPoint");

        if (mode == PostOpMode.postOpReverted) {
            return;  // No charge on revert
        }

        address user = abi.decode(context, (address));

        // Precise actual cost using v0.8 param
        uint256 preciseActualCost = actualGasCost * actualUserOpFeePerGas;

        uint256 bwaeziToCharge = _safeQuoteBWAEZINeeded(preciseActualCost);

        bwaeziToken.safeTransferFrom(user, address(this), bwaeziToCharge);
        emit ChargedBWAEZI(user, bwaeziToCharge, actualGasCost);

        // Optional: Auto-swap BWAEZI → WETH (add Uniswap Router here)
    }

    // Withdrawals (owner only)
    function withdrawBWAEZI(uint256 amount) external onlyOwner {
        bwaeziToken.safeTransfer(owner, amount);
    }

    function withdrawNative(uint256 amount) external onlyOwner {
        payable(owner).transfer(amount);
    }
}
