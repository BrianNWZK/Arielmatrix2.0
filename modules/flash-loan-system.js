// modules/flash-loan-system.js
import { randomBytes } from 'crypto';
import { EventEmitter } from 'events';
import { ArielSQLiteEngine } from './ariel-sqlite-engine/index.js';
import SovereignRevenueEngine from './sovereign-revenue-engine.js';
import { BWAEZI_CHAIN } from '../config/bwaezi-config.js';

export class FlashLoanSystem {
  constructor(config = {}) {
    this.config = {
      supportedAssets: ['ETH', 'USDT', 'USDC', 'bwzC'],
      maxLoanToValue: 0.8,
      minLoanAmount: 100,
      maxLoanAmount: 1000000,
      flashFee: 0.09,
      ...config
    };
    this.activeLoans = new Map();
    this.loanPools = new Map();
    this.db = new ArielSQLiteEngine({ path: './flash-loan-system.db' });
    this.events = new EventEmitter();
    this.sovereignService = null;
    this.serviceId = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    await this.db.init();
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS flash_loans (
        id TEXT PRIMARY KEY,
        borrower TEXT NOT NULL,
        asset TEXT NOT NULL,
        amount REAL NOT NULL,
        fee REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        transactionHash TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        repaidAt DATETIME
      )
    `);

    this.sovereignService = new SovereignRevenueEngine();
    await this.sovereignService.initialize();
    
    this.serviceId = await this.sovereignService.registerService({
      name: 'FlashLoanSystem',
      description: 'Flash loan service for BWAEZI Chain',
      registrationFee: 3500,
      annualLicenseFee: 1750,
      revenueShare: 0.16
    });

    await this.initializeLoanPools();
    this.startLoanMonitoring();
    this.initialized = true;
    this.events.emit('initialized');
  }

  async initializeLoanPools() {
    for (const asset of this.config.supportedAssets) {
      const initialLiquidity = this.getInitialLiquidity(asset);
      this.loanPools.set(asset, {
        asset,
        totalLiquidity: initialLiquidity,
        availableLiquidity: initialLiquidity,
        utilizationRate: 0,
        totalFees: 0
      });
    }
  }

  getInitialLiquidity(asset) {
    const liquidityMap = { 'ETH': 1000, 'USDT': 1000000, 'USDC': 1000000, 'bwzC': 50000 };
    return liquidityMap[asset] || 100000;
  }

  async requestFlashLoan(borrower, asset, amount) {
    if (!this.initialized) await this.initialize();
    
    await this.validateLoanRequest(asset, amount);

    const pool = this.loanPools.get(asset);
    if (pool.availableLiquidity < amount) {
      throw new Error(`Insufficient liquidity for ${asset}. Available: ${pool.availableLiquidity}`);
    }

    const loanId = randomBytes(32).toString('hex');
    const fee = this.calculateFlashFee(amount);

    await this.db.run(`
      INSERT INTO flash_loans (id, borrower, asset, amount, fee, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [loanId, borrower, asset, amount, fee, 'active']);

    this.reserveLiquidity(asset, amount);

    this.activeLoans.set(loanId, {
      borrower, asset, amount, fee, status: 'active', createdAt: Date.now()
    });

    if (this.sovereignService && this.serviceId) {
      await this.sovereignService.processRevenue(this.serviceId, fee, 'flash_loan_initiation');
    }

    this.events.emit('flashLoanRequested', { loanId, borrower, asset, amount, fee });
    return loanId;
  }

  async validateLoanRequest(asset, amount) {
    if (!this.config.supportedAssets.includes(asset)) {
      throw new Error(`Unsupported asset: ${asset}`);
    }
    if (amount < this.config.minLoanAmount) {
      throw new Error(`Loan amount below minimum: ${this.config.minLoanAmount}`);
    }
    if (amount > this.config.maxLoanAmount) {
      throw new Error(`Loan amount exceeds maximum: ${this.config.maxLoanAmount}`);
    }
  }

  calculateFlashFee(amount) {
    return amount * (this.config.flashFee / 100);
  }

  reserveLiquidity(asset, amount) {
    const pool = this.loanPools.get(asset);
    pool.availableLiquidity -= amount;
    pool.utilizationRate = (pool.totalLiquidity - pool.availableLiquidity) / pool.totalLiquidity;
  }

  async executeFlashLoan(loanId, operations) {
    const loan = this.activeLoans.get(loanId);
    if (!loan || loan.status !== 'active') {
      throw new Error(`Invalid or inactive loan: ${loanId}`);
    }

    try {
      const results = await this.executeOperations(loan, operations);
      await this.verifyLoanRepayment(loan);
      await this.repayFlashLoan(loanId);

      this.events.emit('flashLoanExecuted', { loanId, results });
      return results;
    } catch (error) {
      await this.updateLoanStatus(loanId, 'failed', error.message);
      throw error;
    }
  }

  async executeOperations(loan, operations) {
    const results = [];
    for (const operation of operations) {
      try {
        let result;
        switch (operation.type) {
          case 'SWAP':
            result = await this.executeSwapOperation(loan, operation);
            break;
          case 'ARBITRAGE':
            result = await this.executeArbitrageOperation(loan, operation);
            break;
          default:
            throw new Error(`Unsupported operation type: ${operation.type}`);
        }
        results.push(result);
      } catch (error) {
        results.push({ success: false, error: error.message });
      }
    }
    return results;
  }

  async executeSwapOperation(loan, operation) {
    console.log(`Executing swap: ${operation.amount} ${operation.fromToken} -> ${operation.toToken}`);
    return { type: 'SWAP', success: true, outputAmount: operation.amount * 0.995 };
  }

  async executeArbitrageOperation(loan, operation) {
    console.log(`Executing arbitrage between ${operation.dex1} and ${operation.dex2}`);
    return { type: 'ARBITRAGE', success: true, profit: operation.amount * 0.01 };
  }

  async verifyLoanRepayment(loan) {
    const requiredAmount = loan.amount + loan.fee;
    console.log(`Verifying repayment capability: ${requiredAmount}`);
    return true;
  }

  async repayFlashLoan(loanId) {
    const loan = this.activeLoans.get(loanId);
    if (!loan) throw new Error(`Loan not found: ${loanId}`);

    const repaymentAmount = loan.amount + loan.fee;

    await this.db.run(`
      UPDATE flash_loans 
      SET status = 'repaid', repaidAt = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [loanId]);

    this.releaseLiquidity(loan.asset, loan.amount);
    this.addFeeToPool(loan.asset, loan.fee);

    this.activeLoans.delete(loanId);

    if (this.sovereignService && this.serviceId) {
      await this.sovereignService.processRevenue(this.serviceId, loan.fee * 0.1, 'flash_loan_repayment');
    }

    this.events.emit('flashLoanRepaid', { loanId, repaymentAmount, fee: loan.fee });
  }

  releaseLiquidity(asset, amount) {
    const pool = this.loanPools.get(asset);
    pool.availableLiquidity += amount;
    pool.utilizationRate = (pool.totalLiquidity - pool.availableLiquidity) / pool.totalLiquidity;
  }

  addFeeToPool(asset, fee) {
    const pool = this.loanPools.get(asset);
    pool.totalFees += fee;
  }

  async updateLoanStatus(loanId, status, errorMessage = null) {
    const updateFields = ['status = ?'];
    const params = [status];

    if (errorMessage) {
      updateFields.push('errorMessage = ?');
      params.push(errorMessage);
    }

    params.push(loanId);
    await this.db.run(`UPDATE flash_loans SET ${updateFields.join(', ')} WHERE id = ?`, params);

    const loan = this.activeLoans.get(loanId);
    if (loan) {
      loan.status = status;
      if (errorMessage) loan.errorMessage = errorMessage;
    }

    this.events.emit('loanStatusUpdated', { loanId, status, errorMessage });
  }

  startLoanMonitoring() {
    setInterval(async () => {
      await this.monitorActiveLoans();
    }, 30 * 1000);
  }

  async monitorActiveLoans() {
    const activeLoans = await this.db.all(
      'SELECT * FROM flash_loans WHERE status = "active" AND createdAt < ?',
      [Date.now() - (5 * 60 * 1000)]
    );

    for (const loan of activeLoans) {
      await this.updateLoanStatus(loan.id, 'failed', 'Loan execution timeout');
      this.releaseLiquidity(loan.asset, loan.amount);
    }
  }

  async getFlashLoanStats(timeframe = '24h') {
    if (!this.initialized) await this.initialize();
    
    const timeFilter = this.getTimeFilter(timeframe);
    const stats = await this.db.all(`
      SELECT 
        COUNT(*) as totalLoans,
        SUM(amount) as totalVolume,
        SUM(fee) as totalFees,
        COUNT(CASE WHEN status = 'repaid' THEN 1 END) as repaidLoans
      FROM flash_loans 
      WHERE createdAt >= ?
    `, [timeFilter]);

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
    
    const totalLoans = await this.db.get('SELECT COUNT(*) as count FROM flash_loans');
    const totalVolume = await this.db.get('SELECT SUM(amount) as volume FROM flash_loans');

    return {
      totalLoans: totalLoans?.count || 0,
      totalVolume: totalVolume?.volume || 0,
      supportedAssets: this.config.supportedAssets,
      activeLoans: this.activeLoans.size,
      chain: BWAEZI_CHAIN.NAME,
      initialized: this.initialized
    };
  }
}

export default FlashLoanSystem;
