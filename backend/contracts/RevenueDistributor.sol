// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IERC20 {
    function transfer(address recipient, uint256 amount) external returns (bool);
}

contract RevenueDistributor {
    address[] public wallets;
    address public gasWallet;
    IERC20 public usdt;
    uint256 public gasReserve;

    constructor(address[] memory _wallets, address _gasWallet, address _usdt) {
        wallets = _wallets;
        gasWallet = _gasWallet;
        usdt = IERC20(_usdt);
    }

    function distribute(uint256 amount) external {
        uint256 gasFee = (amount * 5) / 100; // 5% for gas
        gasReserve += gasFee;
        uint256 share = (amount - gasFee) / wallets.length;
        for (uint i = 0; i < wallets.length; i++) {
            usdt.transfer(wallets[i], share);
        }
    }

    function withdrawGasFees() external {
        usdt.transfer(gasWallet, gasReserve);
        gasReserve = 0;
    }
}
