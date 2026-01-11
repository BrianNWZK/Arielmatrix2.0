// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./UserOperation.sol";

interface IPaymaster {
    /**
     * @notice Called by EntryPoint during validation.
     * @dev Must be EntryPoint-only. Should enforce SCW-only sponsorship.
     * @param sender The address of the smart contract wallet (SCW) requesting sponsorship.
     * @param requiredPreFund The amount of ETH prefund required.
     * @param maxFeePerGas The max fee per gas for the UserOperation.
     * @param maxPriorityFeePerGas The max priority fee per gas for the UserOperation.
     * @return context Opaque data passed to postOp for replay protection.
     * @return validationData Optional aggregator signature data (0 if not used).
     */
    function validatePaymasterUserOp(
        address sender,
        uint256 requiredPreFund,
        uint256 maxFeePerGas,
        uint256 maxPriorityFeePerGas
    ) external returns (bytes memory context, uint256 validationData);

    /**
     * @notice Called by EntryPoint after the UserOperation is executed.
     * @dev Must be EntryPoint-only. Should verify context binding and charge SCW.
     * @param context The opaque data returned by validatePaymasterUserOp.
     * @param actualGasCostWei The actual gas cost in wei.
     */
    function postOp(
        bytes calldata context,
        uint256 actualGasCostWei
    ) external;
}
