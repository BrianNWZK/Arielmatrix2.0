// =========================================================================
// ArielSQL Autonomous AI Engine: The core decision-making unit for live networks.
// =========================================================================

import { ethers } from 'ethers';
import { Connection, clusterApiUrl } from '@solana/web3.js';

/**
 * The AutonomousCore is a centralized, AI-driven agent that manages the
 * most critical real-time decisions for the ArielSQL suite.
 * Its primary function is to analyze live network conditions across
 * multiple blockchain providers and select the optimal one for transactions.
 */
export class AutonomousCore {
    constructor(config, logger, serviceManager) {
        this.config = config;
        this.logger = logger;
        this.serviceManager = serviceManager;
        this.networkConnections = {};
        this.isInitialized = false;
        this.currentProvider = null;
        this.agentId = `agent_autonomous_core_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Initializes the AutonomousCore by establishing connections to all
     * available blockchain networks.
     */
    async initialize() {
        this.logger.info('🧠 Initializing Autonomous AI Engine...');
        try {
            // Establish connections to different blockchain networks
            this.networkConnections.ethereum = new ethers.JsonRpcProvider(this.config.blockchain.ethereumRpc);
            this.networkConnections.solana = new Connection(this.config.blockchain.solanaRpc);
            
            // Perform an initial selection of the best provider
            await this.selectBlockchainProvider();

            this.isInitialized = true;
            this.logger.info('✅ AutonomousCore initialized successfully.');
        } catch (error) {
            this.logger.error('❌ Failed to initialize AutonomousCore:', error);
            throw error;
        }
    }

    /**
     * Analyzes live network conditions and autonomously selects the best
     * blockchain provider based on a set of criteria.
     * This is the core of the AI-driven logic.
     */
    async selectBlockchainProvider() {
        this.logger.info('🔍 Analyzing network conditions to select the optimal provider...');

        // Placeholder for the advanced AI-driven logic.
        // In a live system, this would involve real-time data from a database
        // or market APIs (e.g., gas fees, transaction speed, network health).
        const providers = [
            { name: 'Ethereum', connection: this.networkConnections.ethereum },
            { name: 'Solana', connection: this.networkConnections.solana },
        ];

        let bestProvider = null;
        let bestMetric = Infinity;

        // This is a simplified, deterministic example. A real AI would
        // use a more complex model (e.g., a neural network or a heuristic engine).
        for (const provider of providers) {
            try {
                const metric = await this.getProviderHealthMetric(provider.name);
                if (metric < bestMetric) {
                    bestMetric = metric;
                    bestProvider = provider;
                }
            } catch (error) {
                this.logger.warn(`⚠️ Provider ${provider.name} is unhealthy or unreachable.`);
            }
        }

        if (bestProvider) {
            this.currentProvider = bestProvider.connection;
            this.logger.info(`✨ Selected optimal provider: ${bestProvider.name}.`);
        } else {
            throw new Error('No healthy blockchain providers available.');
        }
    }

    /**
     * Gets a health metric for a given provider. Lower is better.
     * @param {string} providerName - The name of the blockchain provider.
     * @returns {Promise<number>} A metric representing the provider's health.
     */
    async getProviderHealthMetric(providerName) {
        // This is a placeholder for a real-time health check.
        // In a live system, this would ping the network, check gas fees, etc.
        if (providerName === 'Ethereum') {
            const gasPrice = await this.networkConnections.ethereum.getFeeData();
            // A simple metric: gas price in gwei
            return parseFloat(ethers.formatUnits(gasPrice.gasPrice, 'gwei'));
        } else if (providerName === 'Solana') {
            const blockHeight = await this.networkConnections.solana.getSlot();
            // A simple metric: recent block height (higher is better, so we invert)
            return 1 / blockHeight;
        }
        return Infinity;
    }

    /**
     * Gets the currently selected blockchain provider instance.
     * @returns {object} The Web3 or Solana Connection object.
     */
    getProvider() {
        if (!this.isInitialized || !this.currentProvider) {
            throw new Error('AutonomousCore not initialized or no provider selected.');
        }
        return this.currentProvider;
    }

    /**
     * Processes a payout and logs it to the database using the ServiceManager.
     * This function is now a core part of the AutonomousCore itself.
     */
    async processBwaeziPayout(userId, amount, description, metadata = {}) {
        try {
            const payoutSystem = this.serviceManager.getService('payoutAgent');
            const transaction = await payoutSystem.processPayout(userId, amount, description, metadata);
            
            await this.logPayout({
                userId,
                amount,
                description,
                transactionId: transaction.id,
                agent: 'autonomous_core',
                metadata
            });
            
            this.logger.info(`✅ Paid ${amount} BWAEZI to ${userId} for ${description}`);
            return transaction;
        } catch (error) {
            this.logger.error(`❌ Payout failed:`, error);
            throw error;
        }
    }

    async logPayout(payoutData) {
        const db = this.serviceManager.getService('brianNwaezikeDB');
        const payoutId = `payout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await db.run(
            `INSERT INTO agent_payouts_log (payout_id, user_id, amount, description, transaction_id, agent_type, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                payoutId,
                payoutData.userId,
                payoutData.amount,
                payoutData.description,
                payoutData.transactionId,
                payoutData.agent,
                JSON.stringify(payoutData.metadata || {})
            ]
        );
    }
}
