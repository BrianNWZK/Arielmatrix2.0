// backend/agents/payoutAgent.js
import { ethers } from 'ethers';
import crypto from 'crypto';

// --- A small utility to add human-like delay between actions ---
const quantumDelay = (ms) => new Promise(resolve => {
    const jitter = crypto.randomInt(500, 2000); // Jitter between 0.5 to 2 seconds
    setTimeout(resolve, ms + jitter);
});

/**
 * @class PayoutAgent
 * @description The master agent that manages and executes payouts
 * by interacting with the secure RevenueDistributor smart contract.
 */
class PayoutAgent {
    constructor(CONFIG, logger) {
        this.CONFIG = CONFIG;
        this.logger = logger;
        this.wallet = null;
        this.contract = null;
    }

    async init() {
        try {
            const privateKey = this.CONFIG.MASTER_PRIVATE_KEY;
            const contractAddress = this.CONFIG.SMART_CONTRACT_ADDRESS;
            const contractABI = this.CONFIG.REVENUE_DISTRIBUTOR_ABI; // ABI from your deployed contract
            const rpcUrl = this.CONFIG.RPC_URL;

            // Connect to the blockchain
            const provider = new ethers.JsonRpcProvider(rpcUrl);
            this.wallet = new ethers.Wallet(privateKey, provider);
            
            // Connect to the deployed smart contract
            this.contract = new ethers.Contract(contractAddress, contractABI, this.wallet);

            this.logger.success(`✅ PayoutAgent initialized with wallet: ${this.wallet.address}`);
            return true;
        } catch (error) {
            this.logger.error(`🚨 PayoutAgent initialization failed: ${error.message}`);
            return false;
        }
    }

    /**
     * @description The main execution loop of the PayoutAgent.
     * It checks for a payout threshold and triggers a distribution.
     */
    async run() {
        this.logger.info('💰 PayoutAgent: Executing payout assessment...');
        
        if (!this.wallet || !this.contract) {
            this.logger.error('🚨 PayoutAgent not initialized. Please call init() first.');
            return { status: 'failed', error: 'Agent not initialized' };
        }

        try {
            // Get the total reported revenue from the smart contract
            const totalReportedRevenue = await this.contract.totalReportedRevenue();
            const revenueInUsdt = ethers.formatUnits(totalReportedRevenue, 6); // USDT has 6 decimal places

            this.logger.info(`Total reported revenue in contract: $${revenueInUsdt}`);

            if (parseFloat(revenueInUsdt) >= parseFloat(this.CONFIG.PAYOUT_THRESHOLD_USD)) {
                this.logger.success('🔥 Payout threshold met. Triggering distribution...');
                await quantumDelay(2000); // Simulate a brief wait
                
                // Call the secure, owner-only distribute() function
                const tx = await this.contract.distribute();
                
                this.logger.info(`⏳ Distribution transaction sent. Tx Hash: ${tx.hash}`);
                await tx.wait(); // Wait for transaction confirmation
                this.logger.success('✅ Payout successful. Transaction confirmed on the blockchain.');

                return { status: 'success', message: 'Payout successful', txHash: tx.hash };
            } else {
                this.logger.info(`Earnings $${revenueInUsdt} below threshold of $${this.CONFIG.PAYOUT_THRESHOLD_USD}.`);
                return { status: 'skipped', message: 'Below payout threshold' };
            }
        } catch (error) {
            this.logger.error(`🚨 PayoutAgent failed: ${error.message}`);
            return { status: 'failed', error: error.message };
        }
    }
}

export default PayoutAgent;
