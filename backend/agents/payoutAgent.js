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
            const contractABI = this.CONFIG.REVENUE_DISTRIBUTOR_ABI;
            const rpcUrl = this.CONFIG.RPC_URL;
            const payoutThresholdUSD = this.CONFIG.PAYOUT_THRESHOLD_USD;

            // --- Configuration Validation ---
            if (!privateKey || !contractAddress || !contractABI || !rpcUrl || payoutThresholdUSD === undefined) {
                throw new Error("Missing critical configuration for PayoutAgent (PRIVATE_KEY, CONTRACT_ADDRESS, ABI, RPC_URL, PAYOUT_THRESHOLD_USD).");
            }

            // Connect to the blockchain
            const provider = new ethers.JsonRpcProvider(rpcUrl);
            this.wallet = new ethers.Wallet(privateKey, provider);

            // Connect to the deployed smart contract
            // The `this.wallet` instance is connected, so transactions will be signed by it.
            this.contract = new ethers.Contract(contractAddress, contractABI, this.wallet);

            this.logger.success(`✅ PayoutAgent initialized with wallet: ${this.wallet.address} and contract: ${contractAddress}`);
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
            const revenueInUsdtFormatted = ethers.formatUnits(totalReportedRevenue, 6); // USDT has 6 decimal places
            this.logger.info(`Total reported revenue in contract: $${revenueInUsdtFormatted}`);

            // --- Get actual contract balance for sanity check ---
            const contractBalance = await this.wallet.provider.getBalance(this.contract.target);
            const contractBalanceFormatted = ethers.formatEther(contractBalance); // Assuming native currency for balance check
            this.logger.info(`Actual native token balance of the contract: ${contractBalanceFormatted} ETH/BNB/etc.`);

            // IMPORTANT: If your RevenueDistributor contract holds USDT, you'd need to fetch its USDT balance
            // For example:
            // const usdtContract = new ethers.Contract(this.CONFIG.USDT_TOKEN_ADDRESS, USDT_ABI, this.wallet.provider);
            // const usdtBalance = await usdtContract.balanceOf(this.contract.target);
            // const usdtBalanceFormatted = ethers.formatUnits(usdtBalance, 6);
            // this.logger.info(`Actual USDT balance of the contract: $${usdtBalanceFormatted}`);

            // --- Precise comparison using BigInt ---
            // Convert the configured threshold to BigInt (USDT decimals = 6)
            const payoutThresholdUsdtBigInt = ethers.parseUnits(this.CONFIG.PAYOUT_THRESHOLD_USD.toString(), 6);

            if (totalReportedRevenue >= payoutThresholdUsdtBigInt) {
                this.logger.success(`🔥 Payout threshold met ($${revenueInUsdtFormatted} >= $${this.CONFIG.PAYOUT_THRESHOLD_USD}). Triggering distribution...`);
                await quantumDelay(2000); // Simulate a brief wait

                // --- Gas Estimation ---
                let estimatedGas;
                try {
                    // Estimate gas for the 'distribute' call. `this.contract.distribute.estimateGas()`
                    // requires the same arguments as `distribute()`. If distribute() takes no args, this is correct.
                    estimatedGas = await this.contract.distribute.estimateGas();
                    this.logger.info(`Estimated gas for distribution: ${estimatedGas.toString()}`);
                } catch (gasError) {
                    this.logger.warn(`⚠️ Could not estimate gas for distribution: ${gasError.message}. Proceeding without estimation.`);
                    // Set a default or proceed without specific estimation if it fails
                    estimatedGas = ethers.toBigInt(300000); // A generous fallback gas limit
                }

                // Call the secure, owner-only distribute() function
                // It's good practice to provide a gasLimit for critical transactions
                const tx = await this.contract.distribute({
                    gasLimit: estimatedGas + ethers.toBigInt(50000) // Add a buffer to estimated gas
                });

                this.logger.info(`⏳ Distribution transaction sent. Tx Hash: ${tx.hash}`);
                await tx.wait(); // Wait for transaction confirmation
                this.logger.success(`✅ Payout successful. Transaction confirmed on the blockchain. Tx Hash: ${tx.hash}`);

                return { status: 'success', message: 'Payout successful', txHash: tx.hash };
            } else {
                this.logger.info(`Earnings $${revenueInUsdtFormatted} below threshold of $${this.CONFIG.PAYOUT_THRESHOLD_USD}. No payout triggered.`);
                return { status: 'skipped', message: 'Below payout threshold' };
            }
        } catch (error) {
            this.logger.error(`🚨 PayoutAgent failed during run cycle: ${error.message}`);
            return { status: 'failed', error: error.message };
        }
    }
}

export default PayoutAgent;
