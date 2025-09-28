import fetch from 'node-fetch';
import { BrianNwaezikeDB } from '../database/BrianNwaezikeDB.js';
import {
  initializeConnections,
  getWalletBalances,
  getWalletAddresses,
  sendSOL,
  sendETH,
  sendUSDT,
  processRevenuePayment,
  checkBlockchainHealth,
  validateAddress,
  formatBalance,
  testAllConnections,
} from './wallet.js';
import { BrianNwaezikeChain } from '../blockchain/BrianNwaezikeChain.js';
import { BWAEZI_SOVEREIGN_CONFIG } from '../../config/bwaezi-config.js';

const db = new BrianNwaezikeDB();
const blockchain = new BrianNwaezikeChain();

const founderWallet = BWAEZI_SOVEREIGN_CONFIG.SOVEREIGN_OWNER;
const revenueShare = BWAEZI_SOVEREIGN_CONFIG.SOVEREIGN_SERVICES.revenueShare;

const ETHEREUM_TRUST_WALLET = process.env.ETHEREUM_TRUST_WALLET_ADDRESS;
const SOLANA_TRUST_WALLET = process.env.SOLANA_TRUST_WALLET_ADDRESS;

// Enhanced blockchain connection management
class BlockchainConnector {
  constructor() {
    this.connections = new Map();
    this.healthStatus = new Map();
  }

  async initialize() {
    try {
      await initializeConnections();
      console.log("✅ Blockchain connections initialized");
    } catch (error) {
      console.error("❌ Failed to initialize blockchain connections:", error);
      throw error;
    }
  }

  async sendPayment(recipient, amount, currency) {
    try {
      // Validate address before sending
      if (!await validateAddress(recipient, currency)) {
        throw new Error(`Invalid ${currency} address: ${recipient}`);
      }

      let txHash;
      switch (currency.toUpperCase()) {
        case 'ETH':
          txHash = await sendETH(recipient, amount);
          break;
        case 'SOL':
          txHash = await sendSOL(recipient, amount);
          break;
        case 'USDT':
          txHash = await sendUSDT(recipient, amount);
          break;
        default:
          throw new Error(`Unsupported currency: ${currency}`);
      }

      return {
        success: true,
        txHash,
        amount,
        currency,
        recipient,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error(`❌ Payment failed for ${recipient}:`, error);
      return {
        success: false,
        error: error.message,
        amount,
        currency,
        recipient
      };
    }
  }

  async checkHealth() {
    return await checkBlockchainHealth();
  }
}

class PayoutAgent {
  constructor() {
    console.log("✅ Payout Agent initialized.");
    this.intervalId = null;
    this.blockchainConnector = new BlockchainConnector();
    this.retryCount = new Map();
    this.maxRetries = 3;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      await this.blockchainConnector.initialize();
      
      // Verify environment variables
      if (!ETHEREUM_TRUST_WALLET || !SOLANA_TRUST_WALLET) {
        throw new Error('Missing required environment variables: ETHEREUM_TRUST_WALLET_ADDRESS or SOLANA_TRUST_WALLET_ADDRESS');
      }

      // Verify founder wallet configuration
      if (!founderWallet) {
        throw new Error('Founder wallet not configured in BWAEZI_SOVEREIGN_CONFIG');
      }

      console.log("✅ Payout Agent fully initialized and ready for mainnet operations");
      this.initialized = true;
    } catch (error) {
      console.error("❌ Payout Agent initialization failed:", error);
      throw error;
    }
  }

  async getServiceOwner(serviceName) {
    // Enhanced service owner mapping with validation
    const serviceMapping = {
      'sol': SOLANA_TRUST_WALLET,
      'eth': ETHEREUM_TRUST_WALLET,
      'ethereum': ETHEREUM_TRUST_WALLET,
      'solana': SOLANA_TRUST_WALLET,
      'usdt': ETHEREUM_TRUST_WALLET, // USDT typically on Ethereum
      'usdc': SOLANA_TRUST_WALLET   // USDC commonly on Solana
    };

    const normalizedService = serviceName.toLowerCase();
    const wallet = Object.entries(serviceMapping).find(([key]) => 
      normalizedService.includes(key)
    )?.[1] || ETHEREUM_TRUST_WALLET; // Default to ETH wallet

    if (!wallet) {
      throw new Error(`No trust wallet configured for service: ${serviceName}`);
    }

    return wallet;
  }

  async queue(payment) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Validate payment object
      if (!payment.service || !payment.amount || payment.amount <= 0) {
        throw new Error('Invalid payment: missing service or amount');
      }

      const recipient = await this.getServiceOwner(payment.service);
      const currency = payment.currency || "ETH";
      
      // Validate recipient address
      if (!await validateAddress(recipient, currency)) {
        throw new Error(`Invalid recipient address for ${currency}: ${recipient}`);
      }

      // Insert into payout queue with enhanced data
      const payoutRecord = {
        recipient,
        amount: payment.amount,
        service: payment.service,
        currency: currency,
        status: "pending",
        timestamp: Date.now(),
        retry_count: 0,
        last_attempt: null,
        metadata: payment.metadata || {}
      };

      await db.insert("payout_queue", payoutRecord);
      console.log(`🧾 Queued payout for ${payment.service} → ${recipient} (${payment.amount} ${currency})`);
      
      return {
        success: true,
        queueId: payoutRecord.id,
        recipient,
        amount: payment.amount,
        currency
      };
    } catch (error) {
      console.error("❌ Failed to queue payment:", error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async processRevenueShare(amount, service) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Calculate revenue shares
      const founderAmount = amount * (1 - revenueShare);
      const serviceAmount = amount * revenueShare;

      // Get service owner wallet
      const serviceOwner = await this.getServiceOwner(service);

      // Queue both payments
      const founderPayout = await this.queue({
        service: service,
        amount: founderAmount,
        currency: 'ETH', // Founder typically receives ETH
        metadata: { type: 'revenue_share_founder' }
      });

      const servicePayout = await this.queue({
        service: service,
        amount: serviceAmount,
        currency: 'ETH', // Service owner receives ETH
        metadata: { type: 'revenue_share_service' }
      });

      console.log(`💰 Revenue share processed: Founder ${founderAmount} ETH, Service ${serviceAmount} ETH`);

      return {
        founderPayout,
        servicePayout,
        totalAmount: amount
      };
    } catch (error) {
      console.error("❌ Revenue share processing failed:", error);
      throw error;
    }
  }

  async processPendingJobs() {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Check blockchain health before processing
      const health = await this.blockchainConnector.checkHealth();
      if (!health.healthy) {
        console.warn('⚠️ Blockchain health check failed, skipping payout cycle');
        return;
      }

      const jobs = await db.all("SELECT * FROM payout_queue WHERE status = 'pending' OR (status = 'failed' AND retry_count < ?)", [this.maxRetries]);
      
      console.log(`🔍 Processing ${jobs.length} pending payout jobs...`);

      for (const job of jobs) {
        await this.processJob(job);
      }
    } catch (error) {
      console.error("❌ Error processing payout jobs:", error);
    }
  }

  async processJob(job) {
    try {
      console.log(`🔄 Processing payout job ${job.id}: ${job.amount} ${job.currency} → ${job.recipient}`);

      // Update job status to processing
      await db.update("payout_queue", { id: job.id }, { 
        status: "processing",
        last_attempt: Date.now()
      });

      // Send payment
      const result = await this.blockchainConnector.sendPayment(
        job.recipient, 
        job.amount, 
        job.currency
      );

      if (result.success) {
        // Mark as completed
        await db.update("payout_queue", { id: job.id }, { 
          status: "completed",
          tx_hash: result.txHash,
          completed_at: Date.now()
        });

        // Log successful payout
        await this.logServiceCall({
          service: job.service,
          caller: "payout_agent",
          action: "payout_completed",
          payload: {
            jobId: job.id,
            amount: job.amount,
            currency: job.currency,
            recipient: job.recipient,
            txHash: result.txHash,
            timestamp: result.timestamp
          }
        });

        console.log(`✅ Payout completed: ${job.amount} ${job.currency} → ${job.recipient} (TX: ${result.txHash})`);
      } else {
        throw new Error(result.error);
      }

    } catch (error) {
      console.error(`❌ Payout failed for job ${job.id}:`, error.message);
      
      // Update retry count and status
      const retryCount = (job.retry_count || 0) + 1;
      const status = retryCount >= this.maxRetries ? "failed" : "pending";
      
      await db.update("payout_queue", { id: job.id }, { 
        status: status,
        retry_count: retryCount,
        last_error: error.message,
        last_attempt: Date.now()
      });

      // Log failure
      await this.logServiceCall({
        service: job.service,
        caller: "payout_agent",
        action: "payout_failed",
        payload: {
          jobId: job.id,
          error: error.message,
          retryCount,
          maxRetries: this.maxRetries
        }
      });
    }
  }

  async logServiceCall(logData) {
    try {
      await db.insert("service_logs", {
        service: logData.service,
        caller: logData.caller,
        action: logData.action,
        payload: JSON.stringify(logData.payload),
        timestamp: Date.now()
      });
    } catch (error) {
      console.error("❌ Failed to log service call:", error);
    }
  }

  async getPayoutStats() {
    try {
      const stats = await db.all(`
        SELECT 
          status,
          currency,
          COUNT(*) as count,
          SUM(amount) as total_amount
        FROM payout_queue 
        GROUP BY status, currency
      `);

      const recentPayouts = await db.all(`
        SELECT * FROM payout_queue 
        WHERE status = 'completed' 
        ORDER BY completed_at DESC 
        LIMIT 10
      `);

      return {
        stats,
        recentPayouts,
        totalProcessed: stats.filter(s => s.status === 'completed').reduce((sum, s) => sum + s.total_amount, 0),
        pendingCount: stats.filter(s => s.status === 'pending').reduce((sum, s) => sum + s.count, 0)
      };
    } catch (error) {
      console.error("❌ Failed to get payout stats:", error);
      return { stats: [], recentPayouts: [] };
    }
  }

  start(intervalMs = 30000) { // Default 30 seconds for production
    if (this.intervalId) {
      console.log("⚠️ Payout Agent already running.");
      return;
    }

    // Initialize before starting
    this.initialize().then(() => {
      console.log(`🚀 Payout Agent started. Checking queue every ${intervalMs / 1000}s.`);
      this.intervalId = setInterval(() => this.processPendingJobs(), intervalMs);
    }).catch(error => {
      console.error("❌ Failed to start Payout Agent:", error);
    });
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("🛑 Payout Agent stopped.");
    }
  }

  // Graceful shutdown
  async shutdown() {
    this.stop();
    
    // Process any remaining jobs before shutdown
    console.log("🔄 Processing final payouts before shutdown...");
    await this.processPendingJobs();
    
    console.log("✅ Payout Agent shutdown completed.");
  }
}

// Create and export singleton instance
const payoutAgent = new PayoutAgent();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('🔄 Received SIGINT, shutting down Payout Agent...');
  await payoutAgent.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🔄 Received SIGTERM, shutting down Payout Agent...');
  await payoutAgent.shutdown();
  process.exit(0);
});

export default payoutAgent;
