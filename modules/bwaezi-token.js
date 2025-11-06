// modules/bwaezi-token.js
import { SovereignTokenomics } from './tokenomics-engine/index.js';
import { SovereignRevenueEngine } from './sovereign-revenue-engine.js';
import { ArielSQLiteEngine } from './ariel-sqlite-engine/index.js';
import { 
    BWAEZI_CHAIN,
    BWAEZI_SOVEREIGN_CONFIG,
    ConfigUtils 
} from '../config/bwaezi-config.js';
import { createHash, randomBytes, createHmac } from 'crypto';
import { EventEmitter } from 'events';

// 🆕 Dynamic Conversion Rate Function
async function calculateConversionRates() {
  const BWAEZI_TO_USDT = 100;

  const ethPrice = await getLivePrice('ethereum'); // ETH/USDT
  const solPrice = await getLivePrice('solana');    // SOL/USDT

  return {
    BWAEZI: 1.0,
    USDT: BWAEZI_TO_USDT,
    ETH: BWAEZI_TO_USDT / ethPrice,
    SOL: BWAEZI_TO_USDT / solPrice
  };
}

async function getLivePrice(symbol) {
  const idMap = {
    ethereum: 'ethereum',
    solana: 'solana'
  };

  const coinId = idMap[symbol.toLowerCase()];
  if (!coinId) throw new Error(`Unsupported symbol: ${symbol}`);

  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usdt`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    const price = data[coinId]?.usdt;

    if (!price) throw new Error(`Price not found for ${symbol}`);
    return price;
  } catch (error) {
    console.error(`❌ Failed to fetch price for ${symbol}:`, error.message);
    return 1; // Fallback to prevent crash
  }
}

export class BWAEZIToken {
    constructor(config = {}) {
        this.config = {
            name: 'BWAEZI Sovereign Token',
            symbol: 'bwzC',
            decimals: 18,
            totalSupply: 100000000, // 100 million tokens
            initialSupply: 0, // All tokens held by sovereign initially
  
           maxSupply: 100000000,
            transferFee: 0.001, // 0.1% transfer fee
            burnRate: 0.0001, // 0.01% burn rate
            ...config
        };
        
        this.tokenomics = new SovereignTokenomics();
        this.balances = new Map();
        this.allowances = new Map();
        this.transactionHistory = new Map();
        this.stakingPools = new Map();
        this.vestingSchedules = new Map();
        this.db = new ArielSQLiteEngine({ path: './data/bwaezi-token.db' });
        this.events = new EventEmitter();
        this.sovereignService = null;
        this.serviceId = null;
        this.initialized = false;
        
        // Token metrics
        this.metrics = {
            totalTransfers: 0,
            totalVolume: 0,
            activeHolders: 0,
            averageTransferSize: 0,
            totalBurned: 0,
            totalFees: 0
    
        };
    }

    async initialize() {
        if (this.initialized) return;
        await this.db.init();
        await this.createDatabaseTables();
        await this.tokenomics.initialize();
        
        this.sovereignService = new SovereignRevenueEngine();
        await this.sovereignService.initialize();
        this.serviceId = await this.sovereignService.registerService({
            name: 'BWAEZIToken',
            description: 'BWAEZI Sovereign Token with advanced economic features',
            registrationFee: 5000,
            annualLicenseFee: 2500,
            revenueShare: 0.12,
            serviceType: 'token_infrastructure',
            dataPolicy: 
'Encrypted token transaction data only - No sensitive wallet data storage',
            compliance: ['Token Standards', 'Financial Compliance']
        });
        await this.initializeTokenSupply();
        await this.loadTokenMetrics();
        this.initialized = true;
        
        this.events.emit('initialized', {
            timestamp: Date.now(),
            name: this.config.name,
            symbol: this.config.symbol,
            totalSupply: this.config.totalSupply,
            decimals: this.config.decimals
        });
    }

    async createDatabaseTables() {
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS token_balances (
                address TEXT PRIMARY KEY,
                balance TEXT NOT NULL,
                lockedBalance TEXT DEFAULT '0',
          
              lastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP,
                transactionCount INTEGER DEFAULT 0,
                totalReceived TEXT DEFAULT '0',
                totalSent TEXT DEFAULT '0'
            )
        `);
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS token_allowances (
                id TEXT PRIMARY KEY,
                owner TEXT NOT NULL,
                spender TEXT NOT NULL,
                amount TEXT NOT NULL,
     
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                expiresAt DATETIME,
                isActive BOOLEAN DEFAULT true
            )
        `);
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS token_transactions (
                id TEXT PRIMARY KEY,
                fromAddress TEXT NOT NULL,
                toAddress TEXT NOT NULL,
                amount TEXT NOT NULL,
     
                fee TEXT DEFAULT '0',
                burned TEXT DEFAULT '0',
                transactionType TEXT NOT NULL,
                transactionHash TEXT NOT NULL,
                blockNumber INTEGER,
            
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                status TEXT DEFAULT 'confirmed',
                metadata TEXT
            )
        `);
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS staking_positions (
                id TEXT PRIMARY KEY,
                address TEXT NOT NULL,
                amount TEXT NOT NULL,
                poolId TEXT NOT NULL,
     
                startTime DATETIME NOT NULL,
                unlockTime DATETIME,
                rewards TEXT DEFAULT '0',
                isActive BOOLEAN DEFAULT true,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            
)
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS vesting_schedules (
                id TEXT PRIMARY KEY,
                address TEXT NOT NULL,
                totalAmount TEXT NOT NULL,
               
                vestedAmount TEXT DEFAULT '0',
                startTime DATETIME NOT NULL,
                endTime DATETIME NOT NULL,
                cliffPeriod INTEGER DEFAULT 0,
                isActive BOOLEAN DEFAULT true,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
 
            )
        `);
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS token_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                totalSupply TEXT NOT NULL,
                circulatingSupply TEXT NOT NULL,
    
              totalHolders INTEGER DEFAULT 0,
                dailyVolume TEXT DEFAULT '0',
                totalBurned TEXT DEFAULT '0',
                totalFees TEXT DEFAULT '0'
            )
        `);
    }

    async initializeTokenSupply() {
        // Initialize with sovereign ownership of all tokens
        const sovereignAddress = BWAEZI_CHAIN.FOUNDER_ADDRESS;
        const totalSupplyWei = this.toWei(this.config.totalSupply);
        
        await this.db.run(`
            INSERT OR REPLACE INTO token_balances (address, balance, totalReceived, transactionCount)
            VALUES (?, ?, ?, 1)
        `, [sovereignAddress, totalSupplyWei, totalSupplyWei]);
        this.balances.set(sovereignAddress, {
            balance: totalSupplyWei,
            lockedBalance: '0',
            transactionCount: 1,
            totalReceived: totalSupplyWei,
            totalSent: '0'
        });
        // Record initial supply transaction
        const transactionId = this.generateTransactionId();
        await this.db.run(`
            INSERT INTO token_transactions (id, fromAddress, toAddress, amount, transactionType, transactionHash, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            transactionId,
            '0x0000000000000000000000000000000000000000', // Mint address
            sovereignAddress,
           
              totalSupplyWei,
            'mint',
            this.generateTransactionHash('mint', sovereignAddress, totalSupplyWei),
            'confirmed'
        ]);
        await this.updateTokenMetrics();

        this.events.emit('supplyInitialized', {
            sovereignAddress,
            totalSupply: totalSupplyWei,
            timestamp: new Date()
        });
    }

    async transfer(fromAddress, toAddress, amount, metadata = {}) {
        if (!this.initialized) await this.initialize();
        await this.validateTransfer(fromAddress, toAddress, amount);

        const amountWei = this.toWei(amount);
        const transactionId = this.generateTransactionId();
        try {
            // Calculate fees and burn
            const feeAmount = this.calculateTransferFee(amountWei);
            const burnAmount = this.calculateBurnAmount(amountWei);
            const netAmount = this.subtract(amountWei, this.add(feeAmount, burnAmount));
            // Check balance sufficiency
            const fromBalance = await this.getBalance(fromAddress);
            if (this.compare(fromBalance.balance, amountWei) < 0) {
                throw new Error('Insufficient balance');
            }

            // Execute transfer in database transaction
            await this.executeTransfer(
                transactionId,
                fromAddress,
                toAddress,
                amountWei,
      
              netAmount,
                feeAmount,
                burnAmount,
                metadata
            );
            // Update local balances
            await this.updateLocalBalances(fromAddress, toAddress, amountWei, netAmount);
            // Record metrics
            await this.recordTransferMetrics(amountWei, feeAmount, burnAmount);
            // Process revenue from fees
            if (this.sovereignService && this.serviceId) {
                const feeValue = this.fromWei(feeAmount);
                await this.sovereignService.processRevenue(
                    this.serviceId,
                    feeValue * 100, // Convert to USD equivalent
                    'token_transfer_fee',
                    'USD',
            
                'bwaezi',
                    {
                        transactionId,
                        fromAddress,
                        
                        toAddress,
                        amount: this.fromWei(amountWei),
                        fee: feeValue
                    }
                );
            }

            this.events.emit('transferCompleted', {
                transactionId,
                fromAddress,
                toAddress,
                amount: this.fromWei(amountWei),
                netAmount: this.fromWei(netAmount),
     
                fee: this.fromWei(feeAmount),
                burned: this.fromWei(burnAmount),
                timestamp: new Date()
            });
            return {
                success: true,
                transactionId,
                transactionHash: this.generateTransactionHash('transfer', fromAddress, toAddress, amountWei),
                amount: this.fromWei(amountWei),
                fee: this.fromWei(feeAmount),
            
        burned: this.fromWei(burnAmount),
                netAmount: this.fromWei(netAmount)
            };
        } catch (error) {
            await this.recordFailedTransaction(transactionId, fromAddress, toAddress, amountWei, error.message);
            throw error;
        }
    }

    async executeTransfer(transactionId, fromAddress, toAddress, amountWei, netAmount, feeAmount, burnAmount, metadata) {
        // Start database transaction
        await this.db.run('BEGIN TRANSACTION');
        try {
            // Update sender balance
            await this.db.run(`
                UPDATE token_balances 
                SET balance = balance - ?, 
                    totalSent = totalSent + ?,
       
              transactionCount = transactionCount + 1,
                    lastUpdated = CURRENT_TIMESTAMP
                WHERE address = ? AND balance >= ?
            `, [amountWei, amountWei, fromAddress, amountWei]);
            // Update receiver balance
            await this.db.run(`
                INSERT OR REPLACE INTO token_balances (address, balance, totalReceived, transactionCount, lastUpdated)
                VALUES (?, 
                    COALESCE((SELECT balance FROM token_balances WHERE address = ?), 0) + ?,
           
          COALESCE((SELECT totalReceived FROM token_balances WHERE address = ?), 0) + ?,
                    COALESCE((SELECT transactionCount FROM token_balances WHERE address = ?), 0) + 1,
                    CURRENT_TIMESTAMP
                )
            `, [toAddress, toAddress, 
              netAmount, toAddress, netAmount, toAddress]);

            // Collect fee to sovereign
            if (this.compare(feeAmount, '0') > 0) {
                const sovereignAddress = BWAEZI_CHAIN.FOUNDER_ADDRESS;
                await this.db.run(`
                    UPDATE token_balances 
                    SET balance = balance + ?,
                        totalReceived = totalReceived + ?,
                        
              lastUpdated = CURRENT_TIMESTAMP
                    WHERE address = ?
                `, [feeAmount, feeAmount, sovereignAddress]);
            }

            // Burn tokens if applicable
            if (this.compare(burnAmount, '0') > 0) {
                await this.db.run(`
                    UPDATE token_balances 
                    SET balance = balance - ?,
   
                      totalSent = totalSent + ?,
                        lastUpdated = CURRENT_TIMESTAMP
                    WHERE address = ?
                `, [burnAmount, burnAmount, fromAddress]);
                this.metrics.totalBurned = this.add(this.metrics.totalBurned, burnAmount);
            }

            // Record transaction
            await this.db.run(`
                INSERT INTO token_transactions (id, fromAddress, toAddress, amount, fee, burned, transactionType, transactionHash, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
    
                transactionId,
                fromAddress,
                toAddress,
                amountWei,
                feeAmount,
                burnAmount,
        
                'transfer',
                this.generateTransactionHash('transfer', fromAddress, toAddress, amountWei),
                JSON.stringify(metadata)
            ]);
            await this.db.run('COMMIT');

        } catch (error) {
            await this.db.run('ROLLBACK');
            throw error;
        }
    }

    async validateTransfer(fromAddress, toAddress, amount) {
        if (!this.isValidAddress(fromAddress)) {
            throw new Error('Invalid from address');
        }

        if (!this.isValidAddress(toAddress)) {
            throw new Error('Invalid to address');
        }

        if (fromAddress === toAddress) {
            throw new Error('Cannot transfer to same address');
        }

        if (amount <= 0) {
            throw new Error('Transfer amount must be positive');
        }

        if (amount > this.config.totalSupply) {
            throw new Error('Transfer amount exceeds total supply');
        }

        // Check if fromAddress has sufficient unlocked balance
        const balance = await this.getBalance(fromAddress);
        const amountWei = this.toWei(amount);
        
        if (this.compare(balance.balance, amountWei) < 0) {
            throw new Error('Insufficient balance');
        }

        const availableBalance = this.subtract(balance.balance, balance.lockedBalance);
        if (this.compare(availableBalance, amountWei) < 0) {
            throw new Error('Insufficient unlocked balance');
        }
    }

    async approve(spender, amount, owner = null) {
        if (!this.initialized) await this.initialize();
        const actualOwner = owner || BWAEZI_CHAIN.FOUNDER_ADDRESS;
        const amountWei = this.toWei(amount);
        
        await this.validateApproval(actualOwner, spender, amountWei);

        const allowanceId = this.generateAllowanceId(actualOwner, spender);
        await this.db.run(`
            INSERT OR REPLACE INTO token_allowances (id, owner, spender, amount, expiresAt)
            VALUES (?, ?, ?, ?, ?)
        `, [
            allowanceId,
            actualOwner,
            spender,
            amountWei,
    
              new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year expiry
        ]);
        this.allowances.set(allowanceId, {
            id: allowanceId,
            owner: actualOwner,
            spender: spender,
            amount: amountWei,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
         
              isActive: true
        });
        this.events.emit('approvalGranted', {
            allowanceId,
            owner: actualOwner,
            spender,
            amount: this.fromWei(amountWei),
            timestamp: new Date()
        });
        return allowanceId;
    }

    async transferFrom(spender, fromAddress, toAddress, amount) {
        if (!this.initialized) await this.initialize();
        const amountWei = this.toWei(amount);
        await this.validateTransferFrom(spender, fromAddress, toAddress, amountWei);

        const allowanceId = this.generateAllowanceId(fromAddress, spender);
        const currentAllowance = await this.getAllowance(fromAddress, spender);
        if (this.compare(currentAllowance, amountWei) < 0) {
            throw new Error('Insufficient allowance');
        }

        // Use the transfer function but with allowance check
        const result = await this.transfer(fromAddress, toAddress, amount, {
            spender: spender,
            allowanceUsed: amountWei
        });
        // Update allowance
        const newAllowance = this.subtract(currentAllowance, amountWei);
        await this.db.run(`
            UPDATE token_allowances SET amount = ? WHERE id = ?
        `, [newAllowance, allowanceId]);
        if (this.allowances.has(allowanceId)) {
            this.allowances.get(allowanceId).amount = newAllowance;
        }

        return result;
    }

    async validateTransferFrom(spender, fromAddress, toAddress, amountWei) {
        await this.validateTransfer(fromAddress, toAddress, this.fromWei(amountWei));
        if (!this.isValidAddress(spender)) {
            throw new Error('Invalid spender address');
        }

        const allowance = await this.getAllowance(fromAddress, spender);
        if (this.compare(allowance, amountWei) < 0) {
            throw new Error('Insufficient allowance');
        }
    }

    async validateApproval(owner, spender, amountWei) {
        if (!this.isValidAddress(owner)) {
            throw new Error('Invalid owner address');
        }

        if (!this.isValidAddress(spender)) {
            throw new Error('Invalid spender address');
        }

        if (this.compare(amountWei, '0') < 0) {
            throw new Error('Approval amount cannot be negative');
        }

        const ownerBalance = await this.getBalance(owner);
        if (this.compare(amountWei, ownerBalance.balance) > 0) {
            throw new Error('Approval amount exceeds balance');
        }
    }

    async stake(address, amount, poolId = 'default', lockPeriod = 30) {
        if (!this.initialized) await this.initialize();
        const amountWei = this.toWei(amount);
        await this.validateStake(address, amountWei);

        const stakeId = this.generateStakeId(address, poolId);
        const unlockTime = new Date(Date.now() + lockPeriod * 24 * 60 * 60 * 1000);
        // Lock tokens for staking
        await this.db.run(`
            UPDATE token_balances 
            SET balance = balance - ?,
                lockedBalance = lockedBalance + ?,
                lastUpdated = CURRENT_TIMESTAMP
            WHERE address = ? AND balance 
        >= ?
        `, [amountWei, amountWei, address, amountWei]);
        // Create staking position
        await this.db.run(`
            INSERT INTO staking_positions (id, address, amount, poolId, startTime, unlockTime)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
        `, [stakeId, address, amountWei, poolId, unlockTime]);
        this.stakingPools.set(stakeId, {
            id: stakeId,
            address,
            amount: amountWei,
            poolId,
            startTime: new Date(),
            unlockTime,
            rewards: '0',
          
              isActive: true
        });
        this.events.emit('tokensStaked', {
            stakeId,
            address,
            amount: this.fromWei(amountWei),
            poolId,
            lockPeriod,
            unlockTime,
            timestamp: new Date()
        });
        return stakeId;
    }

    async unstake(stakeId, address) {
        if (!this.initialized) await this.initialize();
        const position = await this.getStakingPosition(stakeId);
        if (!position) {
            throw new Error('Staking position not found');
        }

        if (position.address !== address) {
            throw new Error('Not authorized to unstake this position');
        }

        if (new Date() < new Date(position.unlockTime)) {
            throw new Error('Staking period not yet completed');
        }

        // Calculate rewards (simplified - would use real APY calculation)
        const rewards = await this.calculateStakingRewards(position);
        // Unlock tokens and add rewards
        await this.db.run(`
            UPDATE token_balances 
            SET balance = balance + ? + ?,
                lockedBalance = lockedBalance - ?,
                lastUpdated = CURRENT_TIMESTAMP
            WHERE address = 
        ?
        `, [position.amount, rewards, position.amount, address]);
        // Mark position as inactive
        await this.db.run(`
            UPDATE staking_positions 
            SET isActive = false, rewards = ?
            WHERE id = ?
        `, [rewards, stakeId]);
        if (this.stakingPools.has(stakeId)) {
            this.stakingPools.get(stakeId).isActive = false;
            this.stakingPools.get(stakeId).rewards = rewards;
        }

        this.events.emit('tokensUnstaked', {
            stakeId,
            address,
            stakedAmount: this.fromWei(position.amount),
            rewards: this.fromWei(rewards),
            timestamp: new Date()
        });
        return {
            stakedAmount: this.fromWei(position.amount),
            rewards: this.fromWei(rewards),
            totalReceived: this.fromWei(this.add(position.amount, rewards))
        };
    }

    async calculateStakingRewards(position) {
        const stakingDuration = Date.now() - new Date(position.startTime).getTime();
        const daysStaked = stakingDuration / (24 * 60 * 60 * 1000);
        // Simplified APY calculation - 5% annual rate
        const apy = 0.05;
        const dailyRate = apy / 365;
        
        const rewards = this.multiply(
            position.amount,
            this.toWei(dailyRate * daysStaked)
        );
        return rewards;
    }

    async createVestingSchedule(address, totalAmount, vestingPeriod = 365, cliffPeriod = 90) {
        if (!this.initialized) await this.initialize();
        const totalAmountWei = this.toWei(totalAmount);
        const sovereignAddress = BWAEZI_CHAIN.FOUNDER_ADDRESS;

        // Check sovereign balance
        const sovereignBalance = await this.getBalance(sovereignAddress);
        if (this.compare(sovereignBalance.balance, totalAmountWei) < 0) {
            throw new Error('Insufficient sovereign balance for vesting');
        }

        const vestingId = this.generateVestingId(address);
        const startTime = new Date();
        const endTime = new Date(Date.now() + vestingPeriod * 24 * 60 * 60 * 1000);
        // Lock tokens for vesting
        await this.db.run(`
            UPDATE token_balances 
            SET balance = balance - ?,
                lockedBalance = lockedBalance + ?,
                lastUpdated = CURRENT_TIMESTAMP
            WHERE address = ?
   
          `, [totalAmountWei, totalAmountWei, sovereignAddress]);

        // Create vesting schedule
        await this.db.run(`
            INSERT INTO vesting_schedules (id, address, totalAmount, startTime, endTime, cliffPeriod)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [vestingId, address, totalAmountWei, startTime, endTime, cliffPeriod]);
        this.vestingSchedules.set(vestingId, {
            id: vestingId,
            address,
            totalAmount: totalAmountWei,
            vestedAmount: '0',
            startTime,
            endTime,
            cliffPeriod,
            
            isActive: true
        });
        this.events.emit('vestingScheduleCreated', {
            vestingId,
            address,
            totalAmount: this.fromWei(totalAmountWei),
            vestingPeriod,
            cliffPeriod,
            startTime,
            endTime,
            timestamp: new 
        Date()
        });

        return vestingId;
    }

    async claimVestedTokens(vestingId, address) {
        if (!this.initialized) await this.initialize();
        const schedule = await this.getVestingSchedule(vestingId);
        if (!schedule) {
            throw new Error('Vesting schedule not found');
        }

        if (schedule.address !== address) {
            throw new Error('Not authorized to claim from this vesting schedule');
        }

        const vestedAmount = await this.calculateVestedAmount(schedule);
        const claimableAmount = this.subtract(vestedAmount, schedule.vestedAmount);
        if (this.compare(claimableAmount, '0') <= 0) {
            throw new Error('No vested tokens available to claim');
        }

        // Transfer vested tokens from sovereign to beneficiary
        const sovereignAddress = BWAEZI_CHAIN.FOUNDER_ADDRESS;
        await this.db.run(`
            UPDATE token_balances 
            SET lockedBalance = lockedBalance - ?,
                lastUpdated = CURRENT_TIMESTAMP
            WHERE address = ?
        `, [claimableAmount, sovereignAddress]);
        await this.db.run(`
            UPDATE token_balances 
            SET balance = balance + ?,
                totalReceived = totalReceived + ?,
                lastUpdated = CURRENT_TIMESTAMP
            WHERE address = ?
        `, [claimableAmount, claimableAmount, address]);
        // Update vesting schedule
        const newVestedAmount = this.add(schedule.vestedAmount, claimableAmount);
        await this.db.run(`
            UPDATE vesting_schedules 
            SET vestedAmount = ?
            WHERE id = ?
        `, [newVestedAmount, vestingId]);
        if (this.vestingSchedules.has(vestingId)) {
            this.vestingSchedules.get(vestingId).vestedAmount = newVestedAmount;
        }

        // Record vesting claim transaction
        const transactionId = this.generateTransactionId();
        await this.db.run(`
            INSERT INTO token_transactions (id, fromAddress, toAddress, amount, transactionType, transactionHash, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            transactionId,
            sovereignAddress,
            address,
            claimableAmount,
  
              'vesting_claim',
            this.generateTransactionHash('vesting_claim', sovereignAddress, address, claimableAmount),
            JSON.stringify({ vestingId, vestedAmount: newVestedAmount })
        ]);
        this.events.emit('vestingTokensClaimed', {
            vestingId,
            address,
            claimedAmount: this.fromWei(claimableAmount),
            totalVested: this.fromWei(newVestedAmount),
            remaining: this.fromWei(this.subtract(schedule.totalAmount, newVestedAmount)),
            timestamp: new Date()
        });
        return {
            claimedAmount: this.fromWei(claimableAmount),
            totalVested: this.fromWei(newVestedAmount),
            remaining: this.fromWei(this.subtract(schedule.totalAmount, newVestedAmount))
        };
    }

    async calculateVestedAmount(schedule) {
        const now = Date.now();
        const startTime = new Date(schedule.startTime).getTime();
        const endTime = new Date(schedule.endTime).getTime();
        // Check cliff period
        if (now < startTime + schedule.cliffPeriod * 24 * 60 * 60 * 1000) {
            return '0';
        }

        if (now >= endTime) {
            return schedule.totalAmount;
        }

        const elapsed = now - startTime;
        const totalDuration = endTime - startTime;
        const vestedRatio = elapsed / totalDuration;

        return this.multiply(schedule.totalAmount, this.toWei(vestedRatio));
    }

    // Utility methods for big number arithmetic
    toWei(amount) {
        return (BigInt(Math.floor(amount * 1e6)) * BigInt(1e12)).toString();
        // Convert to wei with 18 decimals
    }

    fromWei(amountWei) {
        return Number(BigInt(amountWei) / BigInt(1e18));
    }

    add(a, b) {
        return (BigInt(a) + BigInt(b)).toString();
    }

    subtract(a, b) {
        return (BigInt(a) - BigInt(b)).toString();
    }

    multiply(a, b) {
        return (BigInt(a) * BigInt(b) / BigInt(1e18)).toString();
    }

    compare(a, b) {
        const bigA = BigInt(a);
        const bigB = BigInt(b);
        return bigA > bigB ? 1 : bigA < bigB ? -1 : 0;
    }

    calculateTransferFee(amountWei) {
        const fee = this.multiply(amountWei, this.toWei(this.config.transferFee));
        return fee;
    }

    calculateBurnAmount(amountWei) {
        const burn = this.multiply(amountWei, this.toWei(this.config.burnRate));
        return burn;
    }

    async getBalance(address) {
        if (!this.initialized) await this.initialize();
        if (this.balances.has(address)) {
            return this.balances.get(address);
        }

        const balance = await this.db.get(`
            SELECT * FROM token_balances WHERE address = ?
        `, [address]);
        const defaultBalance = {
            balance: '0',
            lockedBalance: '0',
            transactionCount: 0,
            totalReceived: '0',
            totalSent: '0',
            lastUpdated: new Date()
        };
        if (balance) {
            this.balances.set(address, balance);
            return balance;
        }

        return defaultBalance;
    }

    async getAllowance(owner, spender) {
        const allowanceId = this.generateAllowanceId(owner, spender);
        if (this.allowances.has(allowanceId)) {
            const allowance = this.allowances.get(allowanceId);
            if (allowance.isActive && new Date() < new Date(allowance.expiresAt)) {
                return allowance.amount;
            }
        }

        const allowance = await this.db.get(`
            SELECT amount FROM token_allowances 
            WHERE owner = ? AND spender = ? AND isActive = true AND expiresAt > CURRENT_TIMESTAMP
        `, [owner, spender]);
        return allowance ? allowance.amount : '0';
    }

    async getStakingPosition(stakeId) {
        if (this.stakingPools.has(stakeId)) {
            return this.stakingPools.get(stakeId);
        }

        const position = await this.db.get(`
            SELECT * FROM staking_positions WHERE id = ?
        `, [stakeId]);
        if (position) {
            this.stakingPools.set(stakeId, position);
        }

        return position;
    }

    async getVestingSchedule(vestingId) {
        if (this.vestingSchedules.has(vestingId)) {
            return this.vestingSchedules.get(vestingId);
        }

        const schedule = await this.db.get(`
            SELECT * FROM vesting_schedules WHERE id = ?
        `, [vestingId]);
        if (schedule) {
            this.vestingSchedules.set(vestingId, schedule);
        }

        return schedule;
    }

    async getTokenMetrics() {
        if (!this.initialized) await this.initialize();
        const totalSupply = this.toWei(this.config.totalSupply);
        const burned = this.metrics.totalBurned;
        const circulating = this.subtract(totalSupply, burned);
        const holders = await this.db.get(`
            SELECT COUNT(*) as count FROM token_balances WHERE balance > '0'
        `);
        const dailyVolume = await this.db.get(`
            SELECT SUM(amount) as volume FROM token_transactions 
            WHERE timestamp >= datetime('now', '-24 hours') AND status = 'confirmed'
        `);
        return {
            totalSupply: this.fromWei(totalSupply),
            circulatingSupply: this.fromWei(circulating),
            totalBurned: this.fromWei(burned),
            totalHolders: holders?.count ||
        0,
            dailyVolume: dailyVolume ?
        this.fromWei(dailyVolume.volume) : 0,
            totalTransactions: this.metrics.totalTransfers,
            totalFees: this.fromWei(this.metrics.totalFees),
            timestamp: new Date()
        };
    }

    async updateTokenMetrics() {
        const metrics = await this.getTokenMetrics();
        await this.db.run(`
            INSERT INTO token_metrics (totalSupply, circulatingSupply, totalHolders, dailyVolume, totalBurned, totalFees)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            this.toWei(metrics.totalSupply),
            this.toWei(metrics.circulatingSupply),
            metrics.totalHolders,
            this.toWei(metrics.dailyVolume),
    
            this.toWei(metrics.totalBurned),
            this.toWei(metrics.totalFees)
        ]);
    }

    async loadTokenMetrics() {
        const latestMetrics = await this.db.get(`
            SELECT * FROM token_metrics ORDER BY timestamp DESC LIMIT 1
        `);
        if (latestMetrics) {
            this.metrics = {
                totalTransfers: await this.getTotalTransactions(),
                totalVolume: latestMetrics.dailyVolume,
                activeHolders: latestMetrics.totalHolders,
                averageTransferSize: 0, // Would calculate from history
          
              totalBurned: latestMetrics.totalBurned,
                totalFees: latestMetrics.totalFees
            };
        }
    }

    async recordTransferMetrics(amountWei, feeAmount, burnAmount) {
        this.metrics.totalTransfers++;
        this.metrics.totalVolume = this.add(this.metrics.totalVolume, amountWei);
        this.metrics.totalFees = this.add(this.metrics.totalFees, feeAmount);
        this.metrics.totalBurned = this.add(this.metrics.totalBurned, burnAmount);
        // Update average transfer size
        const totalTransfers = this.metrics.totalTransfers;
        const totalVolume = this.metrics.totalVolume;
        this.metrics.averageTransferSize = this.fromWei(
            this.divide(totalVolume, this.toWei(totalTransfers))
        );
        await this.updateTokenMetrics();
    }

    async recordFailedTransaction(transactionId, fromAddress, toAddress, amountWei, errorMessage) {
        await this.db.run(`
            INSERT INTO token_transactions (id, fromAddress, toAddress, amount, transactionType, status, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            transactionId,
            fromAddress,
      
              toAddress,
            amountWei,
            'transfer',
            'failed',
            JSON.stringify({ error: errorMessage })
        ]);
        this.events.emit('transferFailed', {
            transactionId,
            fromAddress,
            toAddress,
            amount: this.fromWei(amountWei),
            error: errorMessage,
            timestamp: new Date()
        });
    }

    async updateLocalBalances(fromAddress, toAddress, amountWei, netAmount) {
        // Update from address balance
        if (this.balances.has(fromAddress)) {
            const fromBalance = this.balances.get(fromAddress);
            fromBalance.balance = this.subtract(fromBalance.balance, amountWei);
            fromBalance.totalSent = this.add(fromBalance.totalSent, amountWei);
            fromBalance.transactionCount++;
            fromBalance.lastUpdated = new Date();
        }

        // Update to address balance
        if (this.balances.has(toAddress)) {
            const toBalance = this.balances.get(toAddress);
            toBalance.balance = this.add(toBalance.balance, netAmount);
            toBalance.totalReceived = this.add(toBalance.totalReceived, netAmount);
            toBalance.transactionCount++;
            toBalance.lastUpdated = new Date();
        } else {
            this.balances.set(toAddress, {
                balance: netAmount,
                lockedBalance: '0',
                transactionCount: 1,
                totalReceived: netAmount,
                totalSent: 
        '0',
                lastUpdated: new Date()
            });
        }
    }

    async getTotalTransactions() {
        const result = await this.db.get(`
            SELECT COUNT(*) as count FROM token_transactions WHERE status = 'confirmed'
        `);
        return result?.count || 0;
    }

    isValidAddress(address) {
        return typeof address === 'string' && 
               address.length === 42 && 
               address.startsWith('0x') &&
               /^[0-9a-fA-F]+$/.test(address.slice(2));
    }

    generateTransactionId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(16).toString('hex');
        return `tx_${timestamp}_${random}`;
    }

    generateTransactionHash(type, from, to, amount) {
        const data = `${type}_${from}_${to}_${amount}_${Date.now()}_${randomBytes(8).toString('hex')}`;
        return createHash('sha256').update(data).digest('hex');
    }

    generateAllowanceId(owner, spender) {
        return `allowance_${owner}_${spender}`;
    }

    generateStakeId(address, poolId) {
        const timestamp = Date.now().toString(36);
        return `stake_${address}_${poolId}_${timestamp}`;
    }

    generateVestingId(address) {
        const timestamp = Date.now().toString(36);
        return `vesting_${address}_${timestamp}`;
    }

    divide(a, b) {
        return (BigInt(a) * BigInt(1e18) / BigInt(b)).toString();
    }

    async getTransactionHistory(address, limit = 100) {
        if (!this.initialized) await this.initialize();
        const transactions = await this.db.all(`
            SELECT * FROM token_transactions 
            WHERE (fromAddress = ? OR toAddress = ?) 
            ORDER BY timestamp DESC 
            LIMIT ?
        `, [address, address, limit]);
        return transactions.map(tx => ({
            id: tx.id,
            fromAddress: tx.fromAddress,
            toAddress: tx.toAddress,
            amount: this.fromWei(tx.amount),
            fee: this.fromWei(tx.fee),
            burned: this.fromWei(tx.burned),
            transactionType: tx.transactionType,
      
              transactionHash: tx.transactionHash,
            timestamp: tx.timestamp,
            status: tx.status,
            metadata: tx.metadata ? JSON.parse(tx.metadata) : {}
        }));
    }

    async getTopHolders(limit = 100) {
        if (!this.initialized) await this.initialize();
        const holders = await this.db.all(`
            SELECT address, balance, transactionCount, totalReceived, totalSent
            FROM token_balances 
            WHERE balance > '0'
            ORDER BY balance DESC 
            LIMIT ?
        `, [limit]);
        return holders.map(holder => ({
            address: holder.address,
            balance: this.fromWei(holder.balance),
            lockedBalance: this.fromWei(holder.lockedBalance),
            transactionCount: holder.transactionCount,
            totalReceived: this.fromWei(holder.totalReceived),
            totalSent: this.fromWei(holder.totalSent)
        }));
    }

    async burn(amount, fromAddress = null) {
        if (!this.initialized) await this.initialize();
        const actualFromAddress = fromAddress || BWAEZI_CHAIN.FOUNDER_ADDRESS;
        const amountWei = this.toWei(amount);

        const balance = await this.getBalance(actualFromAddress);
        if (this.compare(balance.balance, amountWei) < 0) {
            throw new Error('Insufficient balance for burn');
        }

        // Update balance
        await this.db.run(`
            UPDATE token_balances 
            SET balance = balance - ?,
                totalSent = totalSent + ?,
                lastUpdated = CURRENT_TIMESTAMP
            
        WHERE address = ?
        `, [amountWei, amountWei, actualFromAddress]);
        // Update metrics
        this.metrics.totalBurned = this.add(this.metrics.totalBurned, amountWei);
        // Record burn transaction
        const transactionId = this.generateTransactionId();
        await this.db.run(`
            INSERT INTO token_transactions (id, fromAddress, toAddress, amount, transactionType, transactionHash, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            transactionId,
            actualFromAddress,
            '0x0000000000000000000000000000000000000000', // Burn address
           
              amountWei,
            'burn',
            this.generateTransactionHash('burn', actualFromAddress, '0x0', amountWei),
            JSON.stringify({ purpose: 'token_burn' })
        ]);
        this.events.emit('tokensBurned', {
            transactionId,
            fromAddress: actualFromAddress,
            amount: this.fromWei(amountWei),
            totalBurned: this.fromWei(this.metrics.totalBurned),
            timestamp: new Date()
        });
        await this.updateTokenMetrics();

        return {
            success: true,
            transactionId,
            amount: this.fromWei(amountWei),
            totalBurned: this.fromWei(this.metrics.totalBurned)
        };
    }
}

export default BWAEZIToken;
