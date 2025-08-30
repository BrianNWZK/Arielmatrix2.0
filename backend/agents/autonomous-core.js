import { ethers } from 'ethers';
import serviceManager from '../serviceManager.js';
import payoutAgent from './payoutAgent.js';

// Minimal ABI for RevenueDistributor.sol (assumed based on project context)
const REVENUE_DISTRIBUTOR_ABI = [
  "function getRevenue() external view returns (uint256)"
];

class AutonomousAgentCore {
    constructor(agentType) {
        this.agentType = agentType;
        this.bwaeziChain = null;
        this.payoutSystem = null;
        this.agentId = `agent_${agentType}_${Math.random().toString(36).substr(2, 9)}`;
        this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://rpc.example.com');
        this.contract = new ethers.Contract(
            process.env.REVENUE_CONTRACT_ADDRESS || '0xContractAddr',
            REVENUE_DISTRIBUTOR_ABI,
            this.provider
        );
        this.threshold = parseFloat(process.env.PAYOUT_THRESHOLD || '1000'); // Revenue threshold in wei
    }

    async initialize() {
        if (!this.bwaeziChain) {
            this.bwaeziChain = serviceManager.getBwaeziChain();
            this.payoutSystem = serviceManager.getPayoutSystem();
        }
        // Start autonomous loop after initialization
        this.startAutonomousLoop();
        return true;
    }

    async processBwaeziPayout(userId, amount, description, metadata = {}) {
        await this.initialize();
        
        try {
            const transaction = await this.bwaeziChain.createTransaction(
                'system-rewards',
                userId,
                amount,
                'BWAEZI',
                process.env.SYSTEM_PRIVATE_KEY
            );
            
            // Log the payout
            await this.logPayout({
                userId,
                amount,
                description,
                transactionId: transaction.id,
                agent: this.agentType,
                metadata
            });
            
            console.log(`✅ ${this.agentType}: Paid ${amount} BWAEZI to ${userId} for ${description}`);
            return transaction;
        } catch (error) {
            console.error(`❌ ${this.agentType}: Payout failed:`, error);
            throw error;
        }
    }

    async logPayout(payoutData) {
        await this.initialize();
        
        await this.payoutSystem.db.run(
            `INSERT INTO agent_payouts_log (payout_id, user_id, amount, description, transaction_id, agent_type, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                `payout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                payoutData.userId,
                payoutData.amount,
                payoutData.description,
                payoutData.transactionId,
                payoutData.agent,
                JSON.stringify(payoutData.metadata || {})
            ]
        );
    }

    async getBwaeziBalance(address) {
        await this.initialize();
        return await this.bwaeziChain.getAccountBalance(address, 'BWAEZI');
    }

    async getAgentEarnings(agentType = null) {
        await this.initialize();
        
        const query = agentType 
            ? `SELECT SUM(amount) as total_earnings FROM agent_payouts_log WHERE agent_type = ?`
            : `SELECT agent_type, SUM(amount) as total_earnings FROM agent_payouts_log GROUP BY agent_type`;
        
        const result = await this.payoutSystem.db.all(query, agentType ? [agentType] : []);
        return agentType ? result[0]?.total_earnings || 0 : result;
    }

    async calculateAutonomousPayout(baseAmount, factors = {}) {
        const {
            userLoyalty = 1.0,
            marketConditions = 1.0,
            performanceMultiplier = 1.0,
            agentPriority = 1.0
        } = factors;

        let calculatedAmount = baseAmount;
        
        // Apply multipliers
        calculatedAmount *= userLoyalty;
        calculatedAmount *= marketConditions;
        calculatedAmount *= performanceMultiplier;
        calculatedAmount *= agentPriority;

        // Ensure minimum payout
        return Math.max(0.001, calculatedAmount);
    }

    // Autonomous loop for blockchain-based revenue checks
    async autonomousLoop() {
        try {
            const revenue = await this.contract.getRevenue();
            console.log(`📊 ${this.agentType}: Current revenue: ${ethers.formatEther(revenue)} ETH`);
            if (revenue > this.threshold) {
                await this.triggerPayout();
            }
        } catch (error) {
            console.error(`❌ ${this.agentType}: Autonomous loop error:`, error);
            // Exponential backoff retry (max 5 attempts)
            const retryDelay = Math.min(60000 * Math.pow(2, this.retryCount || 1), 300000);
            this.retryCount = (this.retryCount || 0) + 1;
            if (this.retryCount <= 5) {
                console.log(`🔄 ${this.agentType}: Retrying in ${retryDelay / 1000}s...`);
                setTimeout(() => this.autonomousLoop(), retryDelay);
                return;
            }
            console.error(`❌ ${this.agentType}: Max retries reached, pausing loop.`);
        }
        // Reset retry count on success
        this.retryCount = 0;
        setTimeout(() => this.autonomousLoop(), 60000); // Poll every 60s
    }

    async triggerPayout() {
        try {
            // Example payout: adjust userId and amount as needed
            const userId = 'system-user'; // Configurable via env or serviceManager
            const amount = await this.calculateAutonomousPayout(0.1, {
                userLoyalty: 1.2,
                marketConditions: 1.1,
                performanceMultiplier: 1.0,
                agentPriority: 1.0
            });
            await payoutAgent.processPayout(userId, amount, 'Revenue-based payout', { source: 'autonomousLoop' });
            console.log(`💸 ${this.agentType}: Triggered payout of ${amount} BWAEZI to ${userId}`);
        } catch (error) {
            console.error(`❌ ${this.agentType}: Payout trigger failed:`, error);
            throw error;
        }
    }

    startAutonomousLoop() {
        console.log(`🚀 ${this.agentType}: Starting autonomous revenue loop...`);
        this.autonomousLoop();
    }
}

export default AutonomousAgentCore;
