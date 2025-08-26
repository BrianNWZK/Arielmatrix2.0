import serviceManager from '../service-manager.js';

class AutonomousAgentCore {
    constructor(agentType) {
        this.agentType = agentType;
        this.bwaeziChain = null;
        this.payoutSystem = null;
        this.agentId = `agent_${agentType}_${Math.random().toString(36).substr(2, 9)}`;
    }

    async initialize() {
        if (!this.bwaeziChain) {
            this.bwaeziChain = serviceManager.getBwaeziChain();
            this.payoutSystem = serviceManager.getPayoutSystem();
        }
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

    // Autonomous decision making for payouts
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
}

export default AutonomousAgentCore;
