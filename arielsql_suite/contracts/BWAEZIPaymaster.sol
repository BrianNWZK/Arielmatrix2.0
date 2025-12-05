// contracts/BWAEZIPaymaster.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ERC-4337 interfaces
import "@account-abstraction/contracts/interfaces/IPaymaster.sol";
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

contract BWAEZIPaymaster is IPaymaster {
    using SafeERC20 for IERC20;

    // EntryPoint contract address
    address public immutable entryPoint;

    // Tokens and pricing infra
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

    // Called by external accounts to deposit funds (no-op for WETH here; kept for symmetry)
    function deposit() public payable {}

    // Fallback in case of wrong call
    receive() external payable {
        revert("BWAEZIPaymaster: Deposit WETH via deposit()");
    }

    // Utility: simple hash helper (not part of IPaymaster)
    function getHash(PackedUserOperation calldata userOp) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(
            userOp.sender,
            userOp.nonce,
            userOp.callGasLimit
        ));
    }

    // External helper: pre-pull BWAEZI with buffer from an SCW sponsor
    function sponsorUserOperation(
        address sponsorSCW,
        uint256 bwaeziAmount
    ) external {
        uint256 bwaeziWithBuffer = (bwaeziAmount * BUFFER_PERCENT) / 100;
        bwaeziToken.safeTransferFrom(sponsorSCW, address(this), bwaeziWithBuffer);
    }

    // IPaymaster override: validate funding for the userOp.
    // IMPORTANT: signature must EXACTLY match the installed IPaymaster interface.
    function validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 /* userOpHash */,
        uint256 maxCost
    ) external override returns (bytes memory context, uint256 validationData) {
        require(msg.sender == entryPoint, "BWAEZIPaymaster: Only EntryPoint");

        // Use EntryPoint-provided worst-case cost
        uint256 maxPossibleCost = maxCost;

        // Quote BWAEZI needed to cover WETH-denominated gas
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

        // Ensure the user (SCW) has granted allowance to this paymaster
        uint256 allowance = bwaeziToken.allowance(userOp.sender, address(this));
        require(allowance >= requiredWithBuffer, "BWAEZI: Insufficient allowance for Paymaster");

        // Return empty context (can encode paymaster-specific data if you need in postOp)
        // validationData = 0 signals "valid"
        return ("", 0);
    }

    // IPaymaster override: settle after execution.
    function postOp(
        IPaymaster.PostOpMode /* mode */,
        bytes calldata /* context */,
        uint256 /* actualGasCost */
    ) external override {
        require(msg.sender == entryPoint, "BWAEZIPaymaster: Only EntryPoint");

        // TODO: implement settlement logic (e.g., swap BWAEZI->WETH to reimburse gas, or burn/lock BWAEZI).
        // This is left blank to focus on fixing the interface mismatch.
    }
}
