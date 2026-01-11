// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./IERC20.sol";

library SafeERC20 {
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        (bool ok, bytes memory data) = address(token).call(
            abi.encodeWithSelector(token.transfer.selector, to, value)
        );
        require(ok, "SafeERC20: transfer failed");
        if (data.length > 0) require(abi.decode(data, (bool)), "SafeERC20: bad return");
    }

    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        (bool ok, bytes memory data) = address(token).call(
            abi.encodeWithSelector(token.transferFrom.selector, from, to, value)
        );
        require(ok, "SafeERC20: transferFrom failed");
        if (data.length > 0) require(abi.decode(data, (bool)), "SafeERC20: bad return");
    }

    function safeApprove(IERC20 token, address spender, uint256 value) internal {
        (bool ok, bytes memory data) = address(token).call(
            abi.encodeWithSelector(token.approve.selector, spender, value)
        );
        require(ok, "SafeERC20: approve failed");
        if (data.length > 0) require(abi.decode(data, (bool)), "SafeERC20: bad return");
    }
}
