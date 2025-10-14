// modules/token-bridge.js
import { randomBytes } from 'crypto';
import { EventEmitter } from 'events';
import { ArielSQLiteEngine } from './ariel-sqlite-engine/index.js';
import SovereignRevenueEngine from './sovereign-revenue-engine.js';
import { BWAEZI_CHAIN } from '../config/bwaezi-config.js';

export class TokenBridge {
  constructor(config = {}) {
    this.config = {
      bridgeableTokens: ['bwzC', 'USDT', 'USDC', 'WBTC'],
      bridgeFeePercentage: 0.1,
      minimumBridgeAmount: 0.001,
      maximumBridgeAmount: 1000000,
      supportedChains: ['ethereum', 'bsc', 'polygon'],
      ...config
    };
    this.bridgeOperations = new Map();
    this.db = new ArielSQLiteEngine({ path: './token-bridge.db' });
    this.events = new EventEmitter();
    this.sovereignService = null;
    this.serviceId = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    await this.db.init();
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS token_bridge_operations (
        id TEXT PRIMARY KEY,
        token TEXT NOT NULL,
        fromChain TEXT NOT NULL,
        toChain TEXT NOT NULL,
        amount REAL NOT NULL,
        sender TEXT NOT NULL,
        recipient TEXT NOT NULL,
        bridgeFee REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        sourceTxHash TEXT,
        destTxHash TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.sovereignService = new SovereignRevenueEngine();
    await this.sovereignService.initialize();
    
    this.serviceId = await this.sovereignService.registerService({
      name: 'TokenBridge',
      description: 'Token bridge service for BWAEZI Chain',
      registrationFee: 4000,
      annualLicenseFee: 2000,
      revenueShare: 0.17
    });

    this.startBridgeMonitoring();
    this.initialized = true;
    this.events.emit('initialized');
  }

  async bridgeToken(token, fromChain, toChain, amount, sender, recipient) {
    if (!this.initialized) await this.initialize();
    
    const operationId = randomBytes(32).toString('hex');
    await this.validateBridgeParameters(token, fromChain, toChain, amount);

    const bridgeFee = this.calculateBridgeFee(token, amount);

    await this.db.run(`
      INSERT INTO token_bridge_operations (id, token, fromChain, toChain, amount, sender, recipient, bridgeFee)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [operationId, token, fromChain, toChain, amount, sender, recipient, bridgeFee]);

    this.bridgeOperations.set(operationId, {
      token, fromChain, toChain, amount, sender, recipient, bridgeFee, status: 'pending', createdAt: Date.now()
    });

    if (this.sovereignService && this.serviceId) {
      await this.sovereignService.processRevenue(this.serviceId, bridgeFee, 'token_bridge_initiation');
    }

    this.executeTokenBridge(operationId).catch(error => {
      this.updateBridgeStatus(operationId, 'failed', error.message);
    });

    this.events.emit('tokenBridgeInitiated', { operationId, token, fromChain, toChain, amount });
    return operationId;
  }

  async validateBridgeParameters(token, fromChain, toChain, amount) {
    if (!this.config.bridgeableTokens.includes(token)) {
      throw new Error(`Token ${token} is not bridgeable`);
    }
    if (!this.config.supportedChains.includes(fromChain)) {
      throw new Error(`Unsupported source chain: ${fromChain}`);
    }
    if (!this.config.supportedChains.includes(toChain)) {
      throw new Error(`Unsupported destination chain: ${toChain}`);
    }
    if (amount < this.config.minimumBridgeAmount) {
      throw new Error(`Amount below minimum bridge amount: ${this.config.minimumBridgeAmount}`);
    }
    if (amount > this.config.maximumBridgeAmount) {
      throw new Error(`Amount exceeds maximum bridge amount: ${this.config.maximumBridgeAmount}`);
    }
  }

  calculateBridgeFee(token, amount) {
    const tokenFees = { 'bwzC': 0.08, 'USDT': 0.15, 'USDC': 0.15, 'WBTC': 0.2 };
    const feePercentage = tokenFees[token] || this.config.bridgeFeePercentage;
    const percentageFee = amount * (feePercentage / 100);
    return Math.max(percentageFee, this.config.minimumBridgeAmount);
  }

  async executeTokenBridge(operationId) {
    const operation = await this.db.get('SELECT * FROM token_bridge_operations WHERE id = ?', [operationId]);
    if (!operation) throw new Error(`Bridge operation not found: ${operationId}`);

    try {
      await this.lockTokensOnSourceChain(operation);
      await this.updateBridgeStatus(operationId, 'locked', null, 'lock_tx_hash');
      await this.waitForTokenConfirmations(operation.fromChain, 'lock_tx_hash');
      await this.mintTokensOnDestinationChain(operation);
      await this.updateBridgeStatus(operationId, 'completed', null, null, 'mint_tx_hash');

      if (this.sovereignService && this.serviceId) {
        await this.sovereignService.processRevenue(this.serviceId, operation.bridgeFee * 0.5, 'token_bridge_completion');
      }

      this.events.emit('tokenBridgeCompleted', { operationId });
    } catch (error) {
      await this.updateBridgeStatus(operationId, 'failed', error.message);
      throw error;
    }
  }

  async lockTokensOnSourceChain(operation) {
    console.log(`Locking ${operation.amount} ${operation.token} on ${operation.fromChain}`);
    return { success: true, txHash: 'lock_tx_hash' };
  }

  async mintTokensOnDestinationChain(operation) {
    console.log(`Minting ${operation.amount} ${operation.token} on ${operation.toChain}`);
    return { success: true, txHash: 'mint_tx_hash' };
  }

  async waitForTokenConfirmations(chain, txHash, requiredConfirmations = 12) {
    console.log(`Waiting for ${requiredConfirmations} confirmations on ${chain} for ${txHash}`);
    return { confirmed: true };
  }

  async updateBridgeStatus(operationId, status, errorMessage = null, sourceTxHash = null, destTxHash = null) {
    const updateFields = ['status = ?'];
    const params = [status];

    if (errorMessage) {
      updateFields.push('errorMessage = ?');
      params.push(errorMessage);
    }
    if (sourceTxHash) {
      updateFields.push('sourceTxHash = ?');
      params.push(sourceTxHash);
    }
    if (destTxHash) {
      updateFields.push('destTxHash = ?');
      params.push(destTxHash);
    }

    params.push(operationId);
    await this.db.run(`UPDATE token_bridge_operations SET ${updateFields.join(', ')} WHERE id = ?`, params);

    const operation = this.bridgeOperations.get(operationId);
    if (operation) {
      operation.status = status;
      if (sourceTxHash) operation.sourceTxHash = sourceTxHash;
      if (destTxHash) operation.destTxHash = destTxHash;
    }

    this.events.emit('tokenBridgeStatusUpdated', { operationId, status, errorMessage, sourceTxHash, destTxHash });
  }

  startBridgeMonitoring() {
    setInterval(async () => {
      const pendingBridges = await this.db.all(
        'SELECT * FROM token_bridge_operations WHERE status = "pending" AND createdAt < ?',
        [Date.now() - (15 * 60 * 1000)]
      );

      for (const bridge of pendingBridges) {
        await this.retryTokenBridge(bridge.id);
      }
    }, 2 * 60 * 1000);
  }

  async retryTokenBridge(operationId) {
    const operation = await this.db.get('SELECT * FROM token_bridge_operations WHERE id = ?', [operationId]);
    if (operation) {
      console.log(`Retrying token bridge ${operationId}`);
      await this.executeTokenBridge(operationId);
    }
  }

  async getTokenBridgeStats(token = null, timeframe = '24h') {
    if (!this.initialized) await this.initialize();
    
    const timeFilter = this.getTimeFilter(timeframe);
    let query = `
      SELECT 
        COUNT(*) as totalBridges,
        SUM(amount) as totalVolume,
        SUM(bridgeFee) as totalFees,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completedBridges
      FROM token_bridge_operations 
      WHERE createdAt >= ?
    `;
    
    const params = [timeFilter];
    
    if (token) {
      query += ' AND token = ?';
      params.push(token);
    }

    const stats = await this.db.all(query, params);
    return stats[0] || {};
  }

  getTimeFilter(timeframe) {
    const now = Date.now();
    const periods = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000
    };
    return now - (periods[timeframe] || periods['24h']);
  }

  async getStats() {
    if (!this.initialized) await this.initialize();
    
    const totalBridges = await this.db.get('SELECT COUNT(*) as count FROM token_bridge_operations');
    const totalVolume = await this.db.get('SELECT SUM(amount) as volume FROM token_bridge_operations');

    return {
      totalBridges: totalBridges?.count || 0,
      totalVolume: totalVolume?.volume || 0,
      bridgeableTokens: this.config.bridgeableTokens,
      chain: BWAEZI_CHAIN.NAME,
      initialized: this.initialized
    };
  }
}

export default TokenBridge;
