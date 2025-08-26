// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title Bwaezi Revenue Distributor
 * @dev Autonomous revenue distribution with BWAEZI token integration
 */
contract RevenueDistributor is Ownable, ReentrancyGuard {
    struct RevenueShare {
        address recipient;
        uint256 sharePercentage; // Basis points (10000 = 100%)
        uint256 totalDistributed;
        bool isActive;
    }
    
    RevenueShare[] public revenueShares;
    uint256 public totalDistributed;
    uint256 public totalRevenue;
    
    // BWAEZI token interface
    interface IBwaeziToken {
        function transfer(address to, uint256 amount) external returns (bool);
        function balanceOf(address account) external view returns (uint256);
    }
    
    IBwaeziToken public bwaeziToken;
    
    event RevenueReceived(uint256 amount, uint256 timestamp);
    event RevenueDistributed(address indexed recipient, uint256 amount, uint256 share);
    event ShareUpdated(address indexed recipient, uint256 newShare);
    event BwaeziTokenSet(address tokenAddress);
    
    /**
     * @dev Set BWAEZI token address
     */
    function setBwaeziToken(address tokenAddress) external onlyOwner {
        bwaeziToken = IBwaeziToken(tokenAddress);
        emit BwaeziTokenSet(tokenAddress);
    }
    
    /**
     * @dev Add revenue share recipient
     */
    function addRevenueShare(address recipient, uint256 sharePercentage) external onlyOwner {
        require(sharePercentage > 0, "Share must be positive");
        require(_totalShares() + sharePercentage <= 10000, "Total shares exceed 100%");
        
        revenueShares.push(RevenueShare({
            recipient: recipient,
            sharePercentage: sharePercentage,
            totalDistributed: 0,
            isActive: true
        }));
        
        emit ShareUpdated(recipient, sharePercentage);
    }
    
    /**
     * @dev Receive revenue and distribute automatically
     */
    receive() external payable {
        totalRevenue += msg.value;
        emit RevenueReceived(msg.value, block.timestamp);
        _distributeRevenue(msg.value);
    }
    
    /**
     * @dev Distribute revenue to share recipients
     */
    function _distributeRevenue(uint256 amount) internal nonReentrant {
        uint256 remainingAmount = amount;
        
        for (uint256 i = 0; i < revenueShares.length; i++) {
            RevenueShare storage share = revenueShares[i];
            
            if (share.isActive && share.sharePercentage > 0) {
                uint256 shareAmount = (amount * share.sharePercentage) / 10000;
                
                if (shareAmount > 0) {
                    (bool success, ) = share.recipient.call{value: shareAmount}("");
                    if (success) {
                        share.totalDistributed += shareAmount;
                        totalDistributed += shareAmount;
                        remainingAmount -= shareAmount;
                        
                        emit RevenueDistributed(share.recipient, shareAmount, share.sharePercentage);
                    }
                }
            }
        }
    }
    
    /**
     * @dev Distribute BWAEZI tokens to share recipients
     */
    function distributeBwaeziRevenue(uint256 amount) external onlyOwner nonReentrant {
        require(address(bwaeziToken) != address(0), "Bwaezi token not set");
        require(bwaeziToken.balanceOf(address(this)) >= amount, "Insufficient BWAEZI balance");
        
        for (uint256 i = 0; i < revenueShares.length; i++) {
            RevenueShare storage share = revenueShares[i];
            
            if (share.isActive && share.sharePercentage > 0) {
                uint256 shareAmount = (amount * share.sharePercentage) / 10000;
                
                if (shareAmount > 0) {
                    bool success = bwaeziToken.transfer(share.recipient, shareAmount);
                    if (success) {
                        share.totalDistributed += shareAmount;
                        totalDistributed += shareAmount;
                    }
                }
            }
        }
    }
    
    /**
     * @dev Calculate total shares percentage
     */
    function _totalShares() internal view returns (uint256) {
        uint256 total;
        for (uint256 i = 0; i < revenueShares.length; i++) {
            if (revenueShares[i].isActive) {
                total += revenueShares[i].sharePercentage;
            }
        }
        return total;
    }
    
    /**
     * @dev Get active recipients count
     */
    function getActiveRecipients() external view returns (uint256) {
        uint256 count;
        for (uint256 i = 0; i < revenueShares.length; i++) {
            if (revenueShares[i].isActive) {
                count++;
            }
        }
        return count;
    }
    
    /**
     * @dev Update revenue share percentage
     */
    function updateShare(address recipient, uint256 newShare) external onlyOwner {
        require(newShare > 0, "Share must be positive");
        
        for (uint256 i = 0; i < revenueShares.length; i++) {
            if (revenueShares[i].recipient == recipient) {
                revenueShares[i].sharePercentage = newShare;
                emit ShareUpdated(recipient, newShare);
                return;
            }
        }
        revert("Recipient not found");
    }
    
    /**
     * @dev Toggle recipient activity
     */
    function toggleRecipient(address recipient, bool isActive) external onlyOwner {
        for (uint256 i = 0; i < revenueShares.length; i++) {
            if (revenueShares[i].recipient == recipient) {
                revenueShares[i].isActive = isActive;
                return;
            }
        }
        revert("Recipient not found");
    }
}
