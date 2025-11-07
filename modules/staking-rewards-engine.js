// modules/staking-rewards-engine.js
import { randomBytes, createHash } from 'crypto';
import { EventEmitter } from 'events';
import { ArielSQLiteEngine } from './ariel-sqlite-engine/index.js';
import { SovereignRevenueEngine } from './sovereign-revenue-engine.js';
import { 
    BWAEZI_CHAIN, 
    TOKEN_CONVERSION_RATES,
    BWAEZI_SOVEREIGN_CONFIG,
    COMPLIANCE_STRATEGY,
    PUBLIC_COMPLIANCE_STATEMENTS,
    ConfigUtils 
} from '../config/bwaezi-config.js';

export class StakingRewardsEngine extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      rewardRate: 0.15, // 15% APY
      minStakingPeriod: 7 * 24 * 60 * 60 * 1000, // 7 days
      compoundingEnabled: true,
      unstakingPenalty: 0.05, // 5% penalty for early unstaking
      ...BWAEZI_SOVEREIGN_CONFIG,
      ...config
    };
    this.stakingPositions = new Map();
    this.rewardPools = new Map();
    this.db = new ArielSQLiteEngine({ path: './data/staking-rewards.db' });
    this.events = new EventEmitter();
    this.sovereignService = getSovereignRevenueEngine();
    this.serviceId = null;
    this.initialized = false;
    this.blockchainConnected = false;
    
    // Enhanced tracking
    this.totalStaked = 0;
    this.totalRewardsDistributed = 0;
    this.activePositionsCount = 0;
    
    // Compliance tracking
    this.complianceState = {
      dataProcessing: 'zero-knowledge',
      piiHandling: 'none',
      encryption: 'end-to-end',
      lastAudit: Date.now(),
      architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT
    };

    // Monitoring intervals
    this.rewardDistributionInterval = null;
    this.healthCheckInterval = null;
  }

  async initialize() {
    if (this.initialized) return;
    
    console.log('🚀 Initializing BWAEZI Staking Rewards Engine - MAINNET LIVE...');
    
    try {
      await this.db.init();
      await this.createStakingTables();

      // Initialize sovereign service
      await this.sovereignService.initialize();
      
      this.serviceId = await this.sovereignService.registerService({
        name: 'StakingRewardsEngine',
        description: 'Staking and rewards distribution for BWAEZI Chain',
        registrationFee: 3000,
        annualLicenseFee: 1500,
        revenueShare: 0.18,
        compliance: ['Zero-Knowledge Architecture', 'Encrypted Position Data'],
        dataPolicy: 'No PII Storage - Encrypted Staking Data Only'
      });

      // Load initial stats
      await this.loadStakingStats();
      
      // Start monitoring
      this.startRewardDistribution();
      this.startHealthMonitoring();
      
      this.initialized = true;
      
      console.log('✅ BWAEZI Staking Rewards Engine Initialized - MAINNET LIVE');
      this.emit('initialized', {
        timestamp: Date.now(),
        totalStaked: this.totalStaked,
        activePositions: this.activePositionsCount,
        compliance: this.complianceState
      });
      
    } catch (error) {
      console.error('❌ Failed to initialize Staking Rewards Engine:', error);
      throw error;
    }
  }

  async createStakingTables() {
    // Enhanced staking positions table with compliance metadata
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS staking_positions (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        amount REAL NOT NULL,
        stakedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        unlockTime DATETIME NOT NULL,
        lastRewardClaim DATETIME DEFAULT CURRENT_TIMESTAMP,
        totalRewardsEarned REAL DEFAULT 0,
        status TEXT DEFAULT 'active',
        encrypted_user_data TEXT,
        compliance_metadata TEXT,
        architectural_alignment TEXT,
        blockchain_tx_hash TEXT,
        wallet_address TEXT
      )
    `);

    // Enhanced reward distributions table
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS reward_distributions (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        positionId TEXT NOT NULL,
        amount REAL NOT NULL,
        type TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        compliance_metadata TEXT,
        verification_methodology TEXT,
        blockchain_tx_hash TEXT,
        wallet_address TEXT,
        FOREIGN KEY (positionId) REFERENCES staking_positions (id)
      )
    `);

    // Enhanced reward pools table
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS reward_pools (
        id TEXT PRIMARY KEY,
        poolType TEXT NOT NULL,
        totalStaked REAL DEFAULT 0,
        rewardRate REAL NOT NULL,
        lastDistribution DATETIME DEFAULT CURRENT_TIMESTAMP,
        compliance_metadata TEXT,
        architectural_alignment TEXT
      )
    `);

    // Staking compliance evidence table
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS staking_compliance_evidence (
        id TEXT PRIMARY KEY,
        framework TEXT NOT NULL,
        control_id TEXT NOT NULL,
        evidence_type TEXT NOT NULL,
        evidence_data TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        verified BOOLEAN DEFAULT false,
        public_hash TEXT,
        compliance_strategy TEXT,
        architectural_alignment TEXT
      )
    `);

    // Staking transactions table
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS staking_transactions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        userId TEXT NOT NULL,
        positionId TEXT,
        amount REAL NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        status TEXT DEFAULT 'completed',
        blockchain_tx_hash TEXT,
        compliance_metadata TEXT,
        verification_methodology TEXT
      )
    `);
  }

  async stakeTokens(userId, amount, lockPeriodDays = 30, metadata = {}) {
    if (!this.initialized) await this.initialize();
    
    if (amount <= 0) throw new Error('Staking amount must be positive');
    
    const positionId = ConfigUtils.generateZKId(`staking_${userId}`);
    const unlockTime = Date.now() + (lockPeriodDays * 24 * 60 * 60 * 1000);

    // Record compliance evidence
    await this.recordStakingComplianceEvidence('TOKEN_STAKING', {
      positionId,
      userId,
      amount,
      lockPeriodDays,
      architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT,
      verificationMethodology: COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY
    });

    await this.db.run(`
      INSERT INTO staking_positions (id, userId, amount, unlockTime, encrypted_user_data, compliance_metadata, architectural_alignment, blockchain_tx_hash, wallet_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      positionId, 
      userId, 
      amount, 
      unlockTime,
      metadata.encryptedUserData || '',
      JSON.stringify({
        architectural_compliant: true,
        data_encrypted: true,
        pii_excluded: true,
        alignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT
      }),
      JSON.stringify(COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT),
      metadata.blockchainTxHash,
      metadata.walletAddress
    ]);

    await this.updateRewardPool('main', amount);

    // Record staking transaction
    await this.recordStakingTransaction('STAKE', userId, positionId, amount, {
      blockchainTxHash: metadata.blockchainTxHash,
      complianceMetadata: {
        architectural_compliant: true,
        verification: COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY
      }
    });

    this.stakingPositions.set(positionId, {
      userId,
      amount,
      stakedAt: Date.now(),
      unlockTime,
      lastRewardClaim: Date.now(),
      totalRewardsEarned: 0,
      status: 'active',
      encryptedUserData: metadata.encryptedUserData,
      complianceMetadata: {
        architectural_compliant: true,
        data_encrypted: true,
        pii_excluded: true
      }
    });

    // Update local stats
    this.totalStaked += amount;
    this.activePositionsCount++;

    if (this.sovereignService && this.serviceId) {
      await this.sovereignService.processRevenue(this.serviceId, amount * 0.01, 'staking_deposit', 'USD', 'bwaezi', {
        blockchainTxHash: metadata.blockchainTxHash,
        walletAddress: metadata.walletAddress,
        encryptedHash: createHash('sha256').update(positionId + userId).digest('hex')
      });
    }

    this.emit('tokensStaked', { 
      positionId, 
      userId, 
      amount, 
      unlockTime,
      compliance: 'architectural_alignment',
      verification: COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY,
      timestamp: Date.now()
    });
    
    console.log(`✅ Tokens staked: ${amount} ${BWAEZI_CHAIN.NATIVE_TOKEN} by ${userId}`);
    return positionId;
  }

  async unstakeTokens(positionId, metadata = {}) {
    if (!this.initialized) await this.initialize();
    
    const position = await this.getPosition(positionId);
    if (!position) throw new Error('Staking position not found');

    const currentTime = Date.now();
    const isEarlyUnstake = currentTime < position.unlockTime;
    let penalty = 0;

    // Record compliance evidence
    await this.recordStakingComplianceEvidence('TOKEN_UNSTAKING', {
      positionId,
      userId: position.userId,
      amount: position.amount,
      isEarlyUnstake,
      architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT
    });

    // Claim rewards before unstaking
    const pendingRewards = await this.calculatePendingRewards(positionId);
    if (pendingRewards > 0) {
      await this.claimRewards(positionId, metadata);
    }

    if (isEarlyUnstake) {
      penalty = position.amount * this.config.unstakingPenalty;
    }

    const finalAmount = position.amount - penalty;

    await this.db.run(`
      UPDATE staking_positions 
      SET status = 'unstaked' 
      WHERE id = ?
    `, [positionId]);

    await this.updateRewardPool('main', -position.amount);

    // Record unstaking transaction
    await this.recordStakingTransaction('UNSTAKE', position.userId, positionId, finalAmount, {
      penalty,
      isEarlyUnstake,
      blockchainTxHash: metadata.blockchainTxHash,
      complianceMetadata: {
        architectural_compliant: true,
        verification: COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY
      }
    });

    if (this.sovereignService && this.serviceId) {
      await this.sovereignService.processRevenue(this.serviceId, penalty, 'unstaking_penalty', 'USD', 'bwaezi', {
        blockchainTxHash: metadata.blockchainTxHash,
        walletAddress: metadata.walletAddress,
        encryptedHash: createHash('sha256').update(positionId + 'penalty').digest('hex')
      });
    }

    // Update local stats
    this.totalStaked -= position.amount;
    this.activePositionsCount--;

    this.stakingPositions.delete(positionId);

    this.emit('tokensUnstaked', { 
      positionId, 
      userId: position.userId, 
      amount: finalAmount, 
      penalty,
      isEarlyUnstake,
      compliance: 'architectural_alignment',
      verification: COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY,
      timestamp: Date.now()
    });

    console.log(`✅ Tokens unstaked: ${finalAmount} ${BWAEZI_CHAIN.NATIVE_TOKEN} from position ${positionId}`);
    return { amount: finalAmount, penalty, rewardsClaimed: pendingRewards };
  }

  async claimRewards(positionId, metadata = {}) {
    if (!this.initialized) await this.initialize();
    
    const position = await this.getPosition(positionId);
    if (!position) throw new Error('Staking position not found');

    const pendingRewards = await this.calculatePendingRewards(positionId);
    if (pendingRewards <= 0) throw new Error('No rewards to claim');

    const rewardId = ConfigUtils.generateZKId(`reward_${positionId}`);

    // Record compliance evidence
    await this.recordStakingComplianceEvidence('REWARD_CLAIM', {
      positionId,
      userId: position.userId,
      rewardAmount: pendingRewards,
      architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT
    });

    await this.db.run(`
      INSERT INTO reward_distributions (id, userId, positionId, amount, type, compliance_metadata, verification_methodology, blockchain_tx_hash, wallet_address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      rewardId, 
      position.userId, 
      positionId, 
      pendingRewards, 
      'staking_reward',
      JSON.stringify({ architectural_compliant: true }),
      JSON.stringify(COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY),
      metadata.blockchainTxHash,
      metadata.walletAddress
    ]);

    await this.db.run(`
      UPDATE staking_positions 
      SET totalRewardsEarned = totalRewardsEarned + ?, lastRewardClaim = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [pendingRewards, positionId]);

    // Record reward transaction
    await this.recordStakingTransaction('REWARD', position.userId, positionId, pendingRewards, {
      blockchainTxHash: metadata.blockchainTxHash,
      complianceMetadata: {
        architectural_compliant: true,
        verification: COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY
      }
    });

    if (this.config.compoundingEnabled) {
      await this.compoundRewards(positionId, pendingRewards, metadata);
    }

    if (this.sovereignService && this.serviceId) {
      await this.sovereignService.processRevenue(this.serviceId, pendingRewards * 0.05, 'reward_claim', 'USD', 'bwaezi', {
        blockchainTxHash: metadata.blockchainTxHash,
        walletAddress: metadata.walletAddress,
        encryptedHash: createHash('sha256').update(rewardId).digest('hex')
      });
    }

    // Update local stats
    this.totalRewardsDistributed += pendingRewards;

    this.emit('rewardsClaimed', { 
      positionId, 
      userId: position.userId, 
      amount: pendingRewards,
      compliance: 'architectural_alignment',
      verification: COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY,
      timestamp: Date.now()
    });

    console.log(`✅ Rewards claimed: ${pendingRewards} ${BWAEZI_CHAIN.NATIVE_TOKEN} for position ${positionId}`);
    return { rewardId, amount: pendingRewards };
  }

  async calculatePendingRewards(positionId) {
    const position = await this.getPosition(positionId);
    if (!position || position.status !== 'active') return 0;

    const timeStaked = Date.now() - position.lastRewardClaim;
    const daysStaked = timeStaked / (24 * 60 * 60 * 1000);
    
    const annualReward = position.amount * this.config.rewardRate;
    const pendingRewards = (annualReward * daysStaked) / 365;

    return parseFloat(pendingRewards.toFixed(8));
  }

  async compoundRewards(positionId, rewardAmount, metadata = {}) {
    await this.db.run(`
      UPDATE staking_positions 
      SET amount = amount + ? 
      WHERE id = ?
    `, [rewardAmount, positionId]);

    await this.updateRewardPool('main', rewardAmount);

    // Record compounding transaction
    await this.recordStakingTransaction('COMPOUND', (await this.getPosition(positionId)).userId, positionId, rewardAmount, {
      blockchainTxHash: metadata.blockchainTxHash,
      complianceMetadata: {
        architectural_compliant: true,
        verification: COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY
      }
    });

    this.emit('rewardsCompounded', { 
      positionId, 
      amount: rewardAmount,
      compliance: 'architectural_alignment',
      timestamp: Date.now()
    });
  }

  async updateRewardPool(poolType, amount) {
    const currentPool = await this.db.get(
      'SELECT * FROM reward_pools WHERE poolType = ?',
      [poolType]
    );

    if (currentPool) {
      await this.db.run(`
        UPDATE reward_pools 
        SET totalStaked = totalStaked + ?, lastDistribution = CURRENT_TIMESTAMP
        WHERE poolType = ?
      `, [amount, poolType]);
    } else {
      await this.db.run(`
        INSERT INTO reward_pools (id, poolType, totalStaked, rewardRate, compliance_metadata, architectural_alignment)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [
        ConfigUtils.generateZKId(`pool_${poolType}`), 
        poolType, 
        amount, 
        this.config.rewardRate,
        JSON.stringify({ architectural_compliant: true }),
        JSON.stringify(COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT)
      ]);
    }
  }

  async getPosition(positionId) {
    if (this.stakingPositions.has(positionId)) {
      return this.stakingPositions.get(positionId);
    }

    const position = await this.db.get(
      'SELECT * FROM staking_positions WHERE id = ?',
      [positionId]
    );

    if (position) {
      this.stakingPositions.set(positionId, position);
    }

    return position;
  }

  async loadStakingStats() {
    try {
      const totalStaked = await this.db.get(
        'SELECT SUM(amount) as total FROM staking_positions WHERE status = "active"'
      );
      const totalRewards = await this.db.get(
        'SELECT SUM(totalRewardsEarned) as total FROM staking_positions'
      );
      const activePositions = await this.db.get(
        'SELECT COUNT(*) as count FROM staking_positions WHERE status = "active"'
      );

      this.totalStaked = totalStaked?.total || 0;
      this.totalRewardsDistributed = totalRewards?.total || 0;
      this.activePositionsCount = activePositions?.count || 0;

    } catch (error) {
      console.error('Failed to load staking stats:', error);
    }
  }

  startRewardDistribution() {
    this.rewardDistributionInterval = setInterval(async () => {
      await this.distributeAutomaticRewards();
    }, 60 * 60 * 1000); // Every hour

    console.log('💰 Automatic reward distribution activated - MAINNET');
  }

  startHealthMonitoring() {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, 300000); // Every 5 minutes

    console.log('🔍 Staking health monitoring activated - MAINNET');
  }

  async distributeAutomaticRewards() {
    const activePositions = await this.db.all(
      'SELECT * FROM staking_positions WHERE status = "active"'
    );

    let totalDistributed = 0;

    for (const position of activePositions) {
      const pendingRewards = await this.calculatePendingRewards(position.id);
      if (pendingRewards > 0.001) { // Minimum reward threshold
        if (this.config.compoundingEnabled) {
          await this.compoundRewards(position.id, pendingRewards);
        }
        
        await this.db.run(`
          UPDATE staking_positions 
          SET totalRewardsEarned = totalRewardsEarned + ?, lastRewardClaim = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [pendingRewards, position.id]);

        totalDistributed += pendingRewards;
      }
    }

    if (totalDistributed > 0) {
      this.totalRewardsDistributed += totalDistributed;
      
      this.emit('rewardsDistributed', { 
        timestamp: Date.now(), 
        positions: activePositions.length,
        totalDistributed,
        compliance: 'architectural_alignment',
        verification: COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY
      });

      console.log(`✅ Automatic rewards distributed: ${totalDistributed} ${BWAEZI_CHAIN.NATIVE_TOKEN} to ${activePositions.length} positions`);
    }
  }

  async performHealthCheck() {
    const health = {
      status: 'healthy',
      timestamp: Date.now(),
      totalStaked: this.totalStaked,
      activePositions: this.activePositionsCount,
      totalRewards: this.totalRewardsDistributed,
      rewardRate: this.config.rewardRate,
      compliance: this.complianceState,
      architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT
    };

    // Check database connectivity
    try {
      await this.db.get('SELECT 1 as test');
      health.database = 'connected';
    } catch (error) {
      health.database = 'disconnected';
      health.status = 'degraded';
    }

    // Check sovereign service connectivity
    if (this.sovereignService && this.serviceId) {
      health.sovereignService = 'connected';
    } else {
      health.sovereignService = 'disconnected';
      health.status = 'degraded';
    }

    this.emit('healthCheck', health);
    return health;
  }

  async recordStakingComplianceEvidence(framework, evidence) {
    const evidenceId = ConfigUtils.generateZKId(`staking_evidence_${framework}`);
    const publicHash = createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
    
    await this.db.run(`
      INSERT INTO staking_compliance_evidence (id, framework, control_id, evidence_type, evidence_data, public_hash, compliance_strategy, architectural_alignment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      evidenceId, 
      framework, 
      evidence.controlId || 'auto', 
      'architectural_verification', 
      JSON.stringify(evidence), 
      publicHash,
      JSON.stringify(COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY),
      JSON.stringify(COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT)
    ]);

    this.emit('stakingComplianceEvidenceRecorded', {
      evidenceId,
      framework,
      evidence,
      publicHash,
      strategy: COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY,
      alignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT,
      timestamp: Date.now()
    });

    return evidenceId;
  }

  async recordStakingTransaction(type, userId, positionId, amount, metadata = {}) {
    const transactionId = ConfigUtils.generateZKId(`staking_tx_${type}`);
    
    await this.db.run(`
      INSERT INTO staking_transactions (id, type, userId, positionId, amount, blockchain_tx_hash, compliance_metadata, verification_methodology)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      transactionId,
      type,
      userId,
      positionId,
      amount,
      metadata.blockchainTxHash,
      JSON.stringify(metadata.complianceMetadata || { architectural_compliant: true }),
      JSON.stringify(COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY)
    ]);

    this.emit('stakingTransactionRecorded', {
      transactionId,
      type,
      userId,
      positionId,
      amount,
      metadata,
      compliance: 'architectural_alignment',
      verification: COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY,
      timestamp: Date.now()
    });

    return transactionId;
  }

  async getStakingStats() {
    if (!this.initialized) await this.initialize();
    
    const health = await this.performHealthCheck();

    return {
      totalStaked: this.totalStaked,
      totalRewardsDistributed: this.totalRewardsDistributed,
      activePositions: this.activePositionsCount,
      rewardRate: this.config.rewardRate,
      chain: BWAEZI_CHAIN.NAME,
      nativeToken: BWAEZI_CHAIN.NATIVE_TOKEN,
      symbol: BWAEZI_CHAIN.SYMBOL,
      health: health.status,
      compliance: this.complianceState,
      architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT,
      initialized: this.initialized
    };
  }

  async getUserPositions(userId) {
    if (!this.initialized) await this.initialize();
    
    const positions = await this.db.all(
      'SELECT * FROM staking_positions WHERE userId = ? ORDER BY stakedAt DESC',
      [userId]
    );

    const positionsWithRewards = await Promise.all(
      positions.map(async (position) => {
        const pendingRewards = await this.calculatePendingRewards(position.id);
        return { 
          ...position, 
          pendingRewards,
          compliance: 'architectural_alignment',
          verification: COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY
        };
      })
    );

    return positionsWithRewards;
  }

  async getProductionMetrics() {
    const stats = await this.getStakingStats();
    const health = await this.performHealthCheck();

    return {
      status: 'production',
      version: BWAEZI_CHAIN.VERSION,
      timestamp: Date.now(),
      
      staking: stats,
      health: health,
      
      compliance: {
        status: 'compliant',
        framework: 'Zero-Knowledge Architecture',
        dataProcessing: 'encrypted_hashes_only',
        architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT,
        verificationMethodology: COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY
      },
      
      blockchain: {
        nativeToken: BWAEZI_CHAIN.NATIVE_TOKEN,
        symbol: BWAEZI_CHAIN.SYMBOL,
        chainId: BWAEZI_CHAIN.CHAIN_ID
      }
    };
  }

  async getStats() {
    return await this.getProductionMetrics();
  }

  async shutdown() {
    console.log('🛑 Shutting down BWAEZI Staking Rewards Engine - MAINNET...');
    
    // Clear all intervals
    if (this.rewardDistributionInterval) clearInterval(this.rewardDistributionInterval);
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
    
    // Close database connection
    if (this.db) await this.db.close();
    
    this.initialized = false;
    console.log('✅ BWAEZI Staking Rewards Engine shut down gracefully');
    
    this.emit('shutdown', { timestamp: Date.now() });
  }

  // Public API for external integration
  getPublicAPI() {
    return {
      // Staking Operations
      stakeTokens: (userId, amount, lockPeriodDays, metadata) => 
        this.stakeTokens(userId, amount, lockPeriodDays, metadata),
      unstakeTokens: (positionId, metadata) => 
        this.unstakeTokens(positionId, metadata),
      claimRewards: (positionId, metadata) => 
        this.claimRewards(positionId, metadata),
      
      // Query Operations
      getPosition: (positionId) => this.getPosition(positionId),
      getUserPositions: (userId) => this.getUserPositions(userId),
      calculatePendingRewards: (positionId) => this.calculatePendingRewards(positionId),
      
      // Analytics & Reporting
      getStakingStats: () => this.getStakingStats(),
      getProductionMetrics: () => this.getProductionMetrics(),
      getHealth: () => this.performHealthCheck(),
      
      // System Status
      isInitialized: () => this.initialized,
      getVersion: () => BWAEZI_CHAIN.VERSION
    };
  }
}

// Global production instance
let globalStakingEngine = null;

export function getStakingRewardsEngine(config = {}) {
  if (!globalStakingEngine) {
    globalStakingEngine = new StakingRewardsEngine(config);
  }
  return globalStakingEngine;
}

export async function initializeStakingRewardsEngine(config = {}) {
  const engine = getStakingRewardsEngine(config);
  await engine.initialize();
  return engine;
}

export default StakingRewardsEngine;
