// arielsql_suite/IPaymaster.sol
// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

import "UserOperation.sol"; // Import UserOperation struct

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
