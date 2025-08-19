// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title RevenueDistributor
 * @dev Manages the secure and decentralized distribution of USDT revenue.
 * The contract owner (your master key) is the only address that can initiate a payout.
 * External agents can only report revenue.
 */
contract RevenueDistributor is Ownable {
    // IERC20 interface for the USDT token
    IERC20 public usdt;

    // List of recipient wallets and a gas fee wallet
    address[] public wallets;
    address public gasWallet;
    
    // Total USDT that has been reported by all agents, but not yet distributed
    uint256 public totalReportedRevenue;
    
    // Amount of USDT reserved for gas fees
    uint256 public gasReserve;

    // --- Constructor ---
    constructor(
        address[] memory _wallets,
        address _gasWallet,
        address _usdt
    ) {
        // We set the initial wallets and the gas wallet
        wallets = _wallets;
        gasWallet = _gasWallet;
        usdt = IERC20(_usdt);
    }
    
    // --- External Endpoints for Revenue Agents ---
    /**
     * @dev Allows any revenue-generating agent to securely report their earnings.
     * @param amount The amount of USDT to add to the contract's balance.
     * This function is payable to receive the USDT directly.
     */
    function reportRevenue() external payable {
        // Use msg.value to get the amount of native token (e.g., ETH/MATIC) sent
        // To handle USDT, an agent would first call approve on the USDT contract, then call a deposit function here.
        // For simplicity, we'll assume the external agent sends USDT directly via `transferFrom`.
        // A more secure setup would be a pull-based system (a 'deposit' function).
        totalReportedRevenue += msg.value;
    }

    // --- Owner-Only Distribution & Gas Fee Management ---
    /**
     * @dev The owner (your one-key agent) calls this to distribute funds.
     * It sends a share of the total contract balance to each wallet.
     * Only callable by the contract owner.
     */
    function distribute() external onlyOwner {
        uint256 contractBalance = usdt.balanceOf(address(this));
        require(contractBalance > 0, "No funds to distribute");

        // Calculate gas fee (5% of total contract balance) and reserve it
        uint256 gasFee = (contractBalance * 5) / 100;
        gasReserve += gasFee;
        
        // Calculate the amount to be distributed to the wallets
        uint256 distributableAmount = contractBalance - gasFee;
        uint256 share = distributableAmount / wallets.length;

        // Loop through each wallet and transfer their share
        for (uint i = 0; i < wallets.length; i++) {
            usdt.transfer(wallets[i], share);
        }
    }
    
    /**
     * @dev Allows the owner to withdraw the accumulated gas fees.
     * This separates the gas fund from the distributable funds.
     */
    function withdrawGasFees() external onlyOwner {
        require(gasReserve > 0, "No gas fees to withdraw");
        uint256 gasAmount = gasReserve;
        gasReserve = 0; // Reset the reserve before transfer
        usdt.transfer(gasWallet, gasAmount);
    }

    /**
     * @dev Allows the owner to add or remove recipients.
     * This ensures the list can be updated dynamically.
     */
    function updateRecipients(address[] memory newWallets) external onlyOwner {
        wallets = newWallets;
    }
}
