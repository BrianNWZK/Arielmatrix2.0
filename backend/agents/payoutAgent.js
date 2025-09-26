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
import { logServiceCall } from '../blockchain/BrianNwaezikeChain.js';
import { BWAEZI_SOVEREIGN_CONFIG } from '../../config/bwaezi-config.js';

const founderWallet = BWAEZI_SOVEREIGN_CONFIG.SOVEREIGN_OWNER;
const revenueShare = BWAEZI_SOVEREIGN_CONFIG.SOVEREIGN_SERVICES.revenueShare;

await wallet.send(founderWallet, amount * (1 - revenueShare), 'ETH');

const ETHEREUM_TRUST_WALLET = process.env.ETHEREUM_TRUST_WALLET_ADDRESS;
const SOLANA_TRUST_WALLET = process.env.SOLANA_TRUST_WALLET_ADDRESS;

class PayoutAgent {
  constructor() {
    console.log("✅ Payout Agent initialized.");
    this.intervalId = null;
  }

  async getServiceOwner(serviceName) {
    return serviceName.includes('sol') ? SOLANA_TRUST_WALLET : ETHEREUM_TRUST_WALLET;
  }

  async queue(payment) {
    const recipient = await this.getServiceOwner(payment.service);
    await db.insert("payout_queue", {
      recipient,
      amount: payment.amount,
      service: payment.service,
      currency: payment.currency || "ETH",
      status: "pending",
      timestamp: Date.now()
    });
    console.log(`🧾 Queued payout for ${payment.service} → ${recipient}`);
  }

  async processPendingJobs() {
    const jobs = await db.all("SELECT * FROM payout_queue WHERE status = 'pending'");
    for (const job of jobs) {
      try {
        await send(job.recipient, job.amount, job.currency);
        await db.update("payout_queue", { id: job.id }, { status: "completed" });
        await logServiceCall({
          service: job.service,
          caller: "system",
          action: "payout",
          payload: job
        });
        console.log(`✅ Payout sent: ${job.amount} ${job.currency} → ${job.recipient}`);
      } catch (err) {
        console.error(`❌ Payout failed for ${job.recipient}:`, err.message);
        await db.update("payout_queue", { id: job.id }, { status: "failed" });
      }
    }
  }

  start(intervalMs = 5000) {
    if (this.intervalId) return console.log("⚠️ Agent already running.");
    console.log(`🚀 Payout Agent started. Checking queue every ${intervalMs / 1000}s.`);
    this.intervalId = setInterval(() => this.processPendingJobs(), intervalMs);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("🛑 Payout Agent stopped.");
    }
  }
}

export default new PayoutAgent();
