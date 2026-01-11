// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.24;

import "./UserOperation.sol";

interface IPaymaster {
    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 requiredPreFund
    ) external returns (bytes memory context, uint256 validationData);

    function postOp(
        UserOperation calldata userOp,
        uint256 actualGasCost,
        uint256 actualGasPrice
    ) external payable;
}
