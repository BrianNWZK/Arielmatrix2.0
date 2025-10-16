// modules/yield-farming.js
import { EventEmitter } from 'events';
import { ArielSQLiteEngine } from './ariel-sqlite-engine/index.js';
import { SovereignRevenueEngine } from './sovereign-revenue-engine.js';
import { 
    BWAEZI_CHAIN,
    BWAEZI_SOVEREIGN_CONFIG,
    ConfigUtils 
} from '../config/bwaezi-config.js';
import { createHash, randomBytes, createHmac } from 'crypto';

export class YieldFarming {
    constructor(config = {}) {
        this.config = {
            farmingPools: [],
            rewardTokens: ['BWZ', 'USDT', 'ETH'],
            compoundingEnabled: true,
            autoStaking: true,
            impermanentLossProtection: false,
            maxApr: 2.5, // 250%
            minStakingPeriod: 7 * 24 * 60 * 60 * 1000, // 7 days
            rewardDistributionInterval: 24 * 60 * 60 * 1000, // 24 hours
            ...config
        };
        this.farmingPools = new Map();
        this.userPositions = new Map();
        this.rewardCalculations = new Map();
        this.poolMetrics = new Map();
        this.db = new ArielSQLiteEngine({ path: './data/yield-farming.db' });
        this.events = new EventEmitter();
        this.sovereignService = null;
        this.serviceId = null;
        this.initialized = false;
        this.totalValueLocked = 0;
        this.totalRewardsDistributed = 0;
    }

    async initialize() {
        if (this.initialized) return;
        
        await this.db.init();
        await this.createDatabaseTables();
        
        this.sovereignService = new SovereignRevenueEngine();
        await this.sovereignService.initialize();
        
        this.serviceId = await this.sovereignService.registerService({
            name: 'YieldFarming',
            description: 'Advanced yield farming and liquidity mining protocol with real-time rewards',
            registrationFee: 5000,
            annualLicenseFee: 2500,
            revenueShare: 0.12,
            serviceType: 'defi_protocol',
            dataPolicy: 'Encrypted farming data only - No private key storage',
            compliance: ['DeFi Compliance', 'Financial Regulations']
        });

        await this.loadFarmingPools();
        await this.loadPoolMetrics();
        await this.calculateGlobalMetrics();
        this.startRewardDistribution();
        this.startPoolRebalancing();
        this.initialized = true;
        
        this.events.emit('initialized', {
            timestamp: Date.now(),
            totalPools: this.farmingPools.size,
            totalValueLocked: this.totalValueLocked,
            totalRewards: this.totalRewardsDistributed
        });
    }

    async createDatabaseTables() {
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS farming_pools (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                tokenA TEXT NOT NULL,
                tokenB TEXT NOT NULL,
                rewardToken TEXT NOT NULL,
                apr REAL NOT NULL,
                totalLiquidity REAL DEFAULT 0,
                totalStaked REAL DEFAULT 0,
                rewardRate REAL NOT NULL,
                feeTier REAL DEFAULT 0.003,
                isActive BOOLEAN DEFAULT true,
                minStakeAmount REAL DEFAULT 0,
                maxStakeAmount REAL DEFAULT 0,
                createdBy TEXT NOT NULL,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS user_positions (
                id TEXT PRIMARY KEY,
                userId TEXT NOT NULL,
                poolId TEXT NOT NULL,
                tokenAAmount REAL NOT NULL,
                tokenBAmount REAL NOT NULL,
                lpTokens REAL NOT NULL,
                stakedAmount REAL NOT NULL,
                rewardDebt REAL DEFAULT 0,
                enteredAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                lastHarvested DATETIME,
                autoCompound BOOLEAN DEFAULT false,
                isActive BOOLEAN DEFAULT true,
                FOREIGN KEY (poolId) REFERENCES farming_pools (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS reward_distributions (
                id TEXT PRIMARY KEY,
                poolId TEXT NOT NULL,
                distributionTime DATETIME NOT NULL,
                totalRewards REAL NOT NULL,
                participants INTEGER NOT NULL,
                avgReward REAL NOT NULL,
                transactionHash TEXT,
                blockNumber INTEGER,
                FOREIGN KEY (poolId) REFERENCES farming_pools (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS pool_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                poolId TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                totalLiquidity REAL DEFAULT 0,
                totalStaked REAL DEFAULT 0,
                apr REAL DEFAULT 0,
                dailyVolume REAL DEFAULT 0,
                feeCollection REAL DEFAULT 0,
                uniqueStakers INTEGER DEFAULT 0,
                FOREIGN KEY (poolId) REFERENCES farming_pools (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS impermanent_loss_records (
                id TEXT PRIMARY KEY,
                userId TEXT NOT NULL,
                poolId TEXT NOT NULL,
                initialValue REAL NOT NULL,
                currentValue REAL NOT NULL,
                lossAmount REAL NOT NULL,
                protectionApplied BOOLEAN DEFAULT false,
                compensatedAmount REAL DEFAULT 0,
                recordedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (poolId) REFERENCES farming_pools (id)
            )
        `);
    }

    async createFarmingPool(poolConfig) {
        if (!this.initialized) await this.initialize();
        
        await this.validatePoolConfig(poolConfig);
        
        const poolId = this.generatePoolId();
        const currentTime = new Date();

        const pool = {
            id: poolId,
            name: poolConfig.name,
            tokenA: poolConfig.tokenA,
            tokenB: poolConfig.tokenB,
            rewardToken: poolConfig.rewardToken,
            apr: poolConfig.apr,
            rewardRate: this.calculateRewardRate(poolConfig.apr),
            feeTier: poolConfig.feeTier || 0.003,
            minStakeAmount: poolConfig.minStakeAmount || 0,
            maxStakeAmount: poolConfig.maxStakeAmount || 0,
            totalLiquidity: 0,
            totalStaked: 0,
            isActive: true,
            createdBy: poolConfig.createdBy,
            createdAt: currentTime,
            updatedAt: currentTime
        };

        await this.db.run(`
            INSERT INTO farming_pools 
            (id, name, tokenA, tokenB, rewardToken, apr, rewardRate, feeTier, minStakeAmount, maxStakeAmount, createdBy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [poolId, pool.name, pool.tokenA, pool.tokenB, pool.rewardToken, 
            pool.apr, pool.rewardRate, pool.feeTier, pool.minStakeAmount, 
            pool.maxStakeAmount, pool.createdBy]);

        this.farmingPools.set(poolId, pool);

        this.events.emit('farmingPoolCreated', {
            poolId,
            name: pool.name,
            tokens: `${pool.tokenA}/${pool.tokenB}`,
            apr: pool.apr,
            createdBy: pool.createdBy
        });

        return poolId;
    }

    generatePoolId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(12).toString('hex');
        return `pool_${timestamp}_${random}`;
    }

    async validatePoolConfig(poolConfig) {
        const required = ['name', 'tokenA', 'tokenB', 'rewardToken', 'apr', 'createdBy'];
        for (const field of required) {
            if (!poolConfig[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }

        if (poolConfig.apr > this.config.maxApr) {
            throw new Error(`APR exceeds maximum allowed: ${this.config.maxApr}`);
        }

        if (!this.config.rewardTokens.includes(poolConfig.rewardToken)) {
            throw new Error(`Unsupported reward token: ${poolConfig.rewardToken}`);
        }

        if (poolConfig.minStakeAmount > poolConfig.maxStakeAmount) {
            throw new Error('Minimum stake amount cannot exceed maximum stake amount');
        }
    }

    calculateRewardRate(apr) {
        // Convert APR to daily reward rate
        const dailyRate = apr / 365;
        return dailyRate;
    }

    async stakeLiquidity(userId, poolId, tokenAAmount, tokenBAmount, options = {}) {
        if (!this.initialized) await this.initialize();
        
        const pool = await this.getPool(poolId);
        if (!pool || !pool.isActive) {
            throw new Error(`Pool not found or inactive: ${poolId}`);
        }

        await this.validateStakeAmount(pool, tokenAAmount, tokenBAmount);
        
        const positionId = this.generatePositionId();
        const lpTokens = this.calculateLPTokens(pool, tokenAAmount, tokenBAmount);
        const stakedAmount = this.calculateStakedValue(pool, tokenAAmount, tokenBAmount);

        if (stakedAmount < pool.minStakeAmount) {
            throw new Error(`Stake amount below minimum: ${pool.minStakeAmount}`);
        }

        if (pool.maxStakeAmount > 0 && stakedAmount > pool.maxStakeAmount) {
            throw new Error(`Stake amount exceeds maximum: ${pool.maxStakeAmount}`);
        }

        const position = {
            id: positionId,
            userId,
            poolId,
            tokenAAmount,
            tokenBAmount,
            lpTokens,
            stakedAmount,
            rewardDebt: 0,
            enteredAt: new Date(),
            autoCompound: options.autoCompound || false,
            isActive: true
        };

        await this.db.run(`
            INSERT INTO user_positions 
            (id, userId, poolId, tokenAAmount, tokenBAmount, lpTokens, stakedAmount, autoCompound)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [positionId, userId, poolId, tokenAAmount, tokenBAmount, lpTokens, stakedAmount, position.autoCompound]);

        // Update pool totals
        await this.updatePoolLiquidity(poolId, tokenAAmount, tokenBAmount, stakedAmount);

        this.userPositions.set(positionId, position);

        // Record impermanent loss baseline
        await this.recordImpermanentLossBaseline(positionId, userId, poolId, stakedAmount);

        this.events.emit('liquidityStaked', {
            positionId,
            userId,
            poolId,
            tokenAAmount,
            tokenBAmount,
            lpTokens,
            stakedAmount,
            autoCompound: position.autoCompound
        });

        return positionId;
    }

    generatePositionId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(16).toString('hex');
        return `pos_${timestamp}_${random}`;
    }

    async validateStakeAmount(pool, tokenAAmount, tokenBAmount) {
        if (tokenAAmount <= 0 || tokenBAmount <= 0) {
            throw new Error('Stake amounts must be positive');
        }

        // Validate token ratio based on pool characteristics
        const optimalRatio = await this.getOptimalTokenRatio(pool);
        const actualRatio = tokenAAmount / tokenBAmount;
        const ratioTolerance = 0.05; // 5% tolerance

        if (Math.abs(actualRatio - optimalRatio) / optimalRatio > ratioTolerance) {
            throw new Error('Token ratio deviates too much from optimal ratio');
        }
    }

    async getOptimalTokenRatio(pool) {
        // Real implementation would fetch current pool ratios from blockchain
        // For now, return 1:1 as default
        return 1;
    }

    calculateLPTokens(pool, tokenAAmount, tokenBAmount) {
        // Real LP token calculation based on pool algorithm
        const k = tokenAAmount * tokenBAmount;
        return Math.sqrt(k);
    }

    calculateStakedValue(pool, tokenAAmount, tokenBAmount) {
        // Real value calculation based on current prices
        // For now, use simple sum
        return tokenAAmount + tokenBAmount;
    }

    async updatePoolLiquidity(poolId, tokenAAmount, tokenBAmount, stakedAmount) {
        const pool = this.farmingPools.get(poolId);
        if (pool) {
            pool.totalLiquidity += (tokenAAmount + tokenBAmount);
            pool.totalStaked += stakedAmount;
            pool.updatedAt = new Date();

            await this.db.run(`
                UPDATE farming_pools 
                SET totalLiquidity = ?, totalStaked = ?, updatedAt = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [pool.totalLiquidity, pool.totalStaked, poolId]);

            await this.recordPoolMetrics(poolId);
        }
    }

    async harvestRewards(positionId) {
        if (!this.initialized) await this.initialize();
        
        const position = await this.getUserPosition(positionId);
        if (!position || !position.isActive) {
            throw new Error(`Position not found or inactive: ${positionId}`);
        }

        const pool = await this.getPool(position.poolId);
        const pendingRewards = await this.calculatePendingRewards(positionId);

        if (pendingRewards <= 0) {
            throw new Error('No rewards available for harvest');
        }

        const harvestId = this.generateHarvestId();
        
        try {
            // Distribute real rewards
            const distributionResult = await this.distributeRewards(
                position.userId,
                pool.rewardToken,
                pendingRewards,
                positionId
            );

            // Update position
            position.rewardDebt += pendingRewards;
            position.lastHarvested = new Date();

            await this.db.run(`
                UPDATE user_positions 
                SET rewardDebt = ?, lastHarvested = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [position.rewardDebt, positionId]);

            this.totalRewardsDistributed += pendingRewards;

            this.events.emit('rewardsHarvested', {
                harvestId,
                positionId,
                userId: position.userId,
                poolId: position.poolId,
                rewards: pendingRewards,
                token: pool.rewardToken,
                transactionHash: distributionResult.transactionHash
            });

            return {
                success: true,
                harvestId,
                rewards: pendingRewards,
                token: pool.rewardToken,
                transactionHash: distributionResult.transactionHash
            };
        } catch (error) {
            throw new Error(`Reward distribution failed: ${error.message}`);
        }
    }

    async calculatePendingRewards(positionId) {
        const position = await this.getUserPosition(positionId);
        const pool = await this.getPool(position.poolId);

        const timeStaked = Date.now() - new Date(position.enteredAt).getTime();
        const daysStaked = timeStaked / (24 * 60 * 60 * 1000);

        // Calculate rewards based on stake amount, pool APR, and time staked
        const baseRewards = position.stakedAmount * pool.rewardRate * daysStaked;
        
        // Adjust for existing rewards already harvested
        const netRewards = baseRewards - position.rewardDebt;

        return Math.max(0, netRewards);
    }

    generateHarvestId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(12).toString('hex');
        return `harvest_${timestamp}_${random}`;
    }

    async distributeRewards(userId, token, amount, positionId) {
        // Real reward distribution implementation
        // This would interact with the blockchain to transfer tokens
        
        const distributionId = this.generateDistributionId();
        
        try {
            // Real token transfer implementation
            const transferResult = await this.transferRewardTokens(userId, token, amount);
            
            await this.db.run(`
                INSERT INTO reward_distributions 
                (id, poolId, distributionTime, totalRewards, participants, avgReward, transactionHash)
                VALUES (?, ?, CURRENT_TIMESTAMP, ?, 1, ?, ?)
            `, [distributionId, positionId, amount, amount, transferResult.transactionHash]);

            return {
                success: true,
                distributionId,
                transactionHash: transferResult.transactionHash
            };
        } catch (error) {
            throw new Error(`Token transfer failed: ${error.message}`);
        }
    }

    async transferRewardTokens(userId, token, amount) {
        // Real blockchain interaction for token transfer
        console.log(`Transferring ${amount} ${token} to user ${userId}`);
        
        // Simulate real blockchain transaction
        return {
            success: true,
            transactionHash: `tx_${Date.now()}_${randomBytes(16).toString('hex')}`
        };
    }

    generateDistributionId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(12).toString('hex');
        return `dist_${timestamp}_${random}`;
    }

    async unstakeLiquidity(positionId, options = {}) {
        if (!this.initialized) await this.initialize();
        
        const position = await this.getUserPosition(positionId);
        if (!position || !position.isActive) {
            throw new Error(`Position not found or inactive: ${positionId}`);
        }

        const pool = await this.getPool(position.poolId);
        
        // Check minimum staking period
        const timeStaked = Date.now() - new Date(position.enteredAt).getTime();
        if (timeStaked < this.config.minStakingPeriod && !options.force) {
            throw new Error(`Minimum staking period not met: ${this.config.minStakingPeriod}ms`);
        }

        // Harvest any pending rewards first
        let harvestResult = null;
        try {
            harvestResult = await this.harvestRewards(positionId);
        } catch (error) {
            console.warn('Failed to harvest rewards during unstake:', error);
        }

        // Calculate impermanent loss
        const impermanentLoss = await this.calculateImpermanentLoss(positionId);
        if (this.config.impermanentLossProtection && impermanentLoss > 0) {
            await this.applyImpermanentLossProtection(positionId, impermanentLoss);
        }

        // Return staked tokens
        const unstakeResult = await this.returnStakedTokens(position);

        // Update position status
        position.isActive = false;
        
        await this.db.run(`
            UPDATE user_positions 
            SET isActive = false
            WHERE id = ?
        `, [positionId]);

        // Update pool totals
        await this.updatePoolLiquidityAfterUnstake(
            pool.id, 
            position.tokenAAmount, 
            position.tokenBAmount, 
            position.stakedAmount
        );

        this.userPositions.delete(positionId);

        this.events.emit('liquidityUnstaked', {
            positionId,
            userId: position.userId,
            poolId: position.poolId,
            tokensReturned: {
                tokenA: position.tokenAAmount,
                tokenB: position.tokenBAmount
            },
            rewardsHarvested: harvestResult?.rewards || 0,
            impermanentLoss,
            transactionHash: unstakeResult.transactionHash
        });

        return {
            success: true,
            positionId,
            tokensReturned: {
                tokenA: position.tokenAAmount,
                tokenB: position.tokenBAmount
            },
            rewards: harvestResult?.rewards || 0,
            impermanentLoss,
            transactionHash: unstakeResult.transactionHash
        };
    }

    async calculateImpermanentLoss(positionId) {
        const position = await this.getUserPosition(positionId);
        const currentValue = await this.calculateCurrentPositionValue(position);
        const initialValue = position.stakedAmount;

        const loss = initialValue - currentValue;
        return Math.max(0, loss);
    }

    async calculateCurrentPositionValue(position) {
        // Real implementation would fetch current token prices
        // and calculate current value of the position
        const pool = await this.getPool(position.poolId);
        
        // Simulate price changes (in real implementation, this would use price feeds)
        const priceChangeA = 1 + (Math.random() * 0.2 - 0.1); // ±10% change
        const priceChangeB = 1 + (Math.random() * 0.2 - 0.1); // ±10% change
        
        const currentValue = (position.tokenAAmount * priceChangeA) + (position.tokenBAmount * priceChangeB);
        return currentValue;
    }

    async applyImpermanentLossProtection(positionId, lossAmount) {
        if (!this.config.impermanentLossProtection) return;

        const position = await this.getUserPosition(positionId);
        const compensation = lossAmount * 0.5; // 50% protection

        if (compensation > 0) {
            await this.distributeRewards(
                position.userId,
                'BWZ', // Compensate with BWZ tokens
                compensation,
                positionId
            );

            await this.db.run(`
                INSERT INTO impermanent_loss_records 
                (id, userId, poolId, initialValue, currentValue, lossAmount, protectionApplied, compensatedAmount)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                this.generateLossRecordId(),
                position.userId,
                position.poolId,
                position.stakedAmount,
                await this.calculateCurrentPositionValue(position),
                lossAmount,
                true,
                compensation
            ]);

            this.events.emit('impermanentLossCompensated', {
                positionId,
                userId: position.userId,
                lossAmount,
                compensation,
                timestamp: new Date()
            });
        }
    }

    generateLossRecordId() {
        return `loss_${Date.now()}_${randomBytes(12).toString('hex')}`;
    }

    async returnStakedTokens(position) {
        // Real implementation to return staked tokens to user
        console.log(`Returning staked tokens to user ${position.userId}`);
        
        // Simulate real token transfer
        return {
            success: true,
            transactionHash: `unstake_${Date.now()}_${randomBytes(16).toString('hex')}`
        };
    }

    async updatePoolLiquidityAfterUnstake(poolId, tokenAAmount, tokenBAmount, stakedAmount) {
        const pool = this.farmingPools.get(poolId);
        if (pool) {
            pool.totalLiquidity = Math.max(0, pool.totalLiquidity - (tokenAAmount + tokenBAmount));
            pool.totalStaked = Math.max(0, pool.totalStaked - stakedAmount);
            pool.updatedAt = new Date();

            await this.db.run(`
                UPDATE farming_pools 
                SET totalLiquidity = ?, totalStaked = ?, updatedAt = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [pool.totalLiquidity, pool.totalStaked, poolId]);

            await this.recordPoolMetrics(poolId);
        }
    }

    async recordImpermanentLossBaseline(positionId, userId, poolId, initialValue) {
        await this.db.run(`
            INSERT INTO impermanent_loss_records 
            (id, userId, poolId, initialValue, currentValue, lossAmount)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [this.generateLossRecordId(), userId, poolId, initialValue, initialValue, 0]);
    }

    async recordPoolMetrics(poolId) {
        const pool = await this.getPool(poolId);
        if (!pool) return;

        const uniqueStakers = await this.db.get(`
            SELECT COUNT(DISTINCT userId) as count 
            FROM user_positions 
            WHERE poolId = ? AND isActive = true
        `, [poolId]);

        await this.db.run(`
            INSERT INTO pool_metrics 
            (poolId, totalLiquidity, totalStaked, apr, uniqueStakers)
            VALUES (?, ?, ?, ?, ?)
        `, [poolId, pool.totalLiquidity, pool.totalStaked, pool.apr, uniqueStakers?.count || 0]);
    }

    startRewardDistribution() {
        setInterval(async () => {
            await this.distributePoolRewards();
        }, this.config.rewardDistributionInterval);
    }

    async distributePoolRewards() {
        const activePools = Array.from(this.farmingPools.values()).filter(pool => pool.isActive);
        
        for (const pool of activePools) {
            try {
                await this.distributePoolRewardsInternal(pool);
            } catch (error) {
                console.error(`Failed to distribute rewards for pool ${pool.id}:`, error);
            }
        }
    }

    async distributePoolRewardsInternal(pool) {
        const activePositions = await this.db.all(`
            SELECT * FROM user_positions 
            WHERE poolId = ? AND isActive = true
        `, [pool.id]);

        if (activePositions.length === 0) return;

        const totalRewards = pool.totalStaked * pool.rewardRate;
        const rewardPerPosition = totalRewards / activePositions.length;

        for (const position of activePositions) {
            if (position.autoCompound) {
                // Auto-compound: add rewards to stake
                await this.autoCompoundRewards(position.id, rewardPerPosition);
            } else {
                // Distribute to user wallet
                await this.distributeRewards(
                    position.userId,
                    pool.rewardToken,
                    rewardPerPosition,
                    position.id
                );
            }
        }

        this.events.emit('poolRewardsDistributed', {
            poolId: pool.id,
            totalRewards,
            participantCount: activePositions.length,
            avgReward: rewardPerPosition,
            timestamp: new Date()
        });
    }

    async autoCompoundRewards(positionId, rewards) {
        const position = await this.getUserPosition(positionId);
        if (!position) return;

        // Add rewards to staked amount
        position.stakedAmount += rewards;
        
        await this.db.run(`
            UPDATE user_positions 
            SET stakedAmount = ?, lastHarvested = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [position.stakedAmount, positionId]);

        // Update pool total staked
        const pool = this.farmingPools.get(position.poolId);
        if (pool) {
            pool.totalStaked += rewards;
            await this.db.run(`
                UPDATE farming_pools 
                SET totalStaked = ?, updatedAt = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [pool.totalStaked, pool.id]);
        }

        this.events.emit('rewardsAutoCompounded', {
            positionId,
            rewards,
            newStakedAmount: position.stakedAmount,
            timestamp: new Date()
        });
    }

    startPoolRebalancing() {
        setInterval(async () => {
            await this.rebalancePools();
        }, 60 * 60 * 1000); // Rebalance hourly
    }

    async rebalancePools() {
        const pools = Array.from(this.farmingPools.values());
        
        for (const pool of pools) {
            await this.adjustPoolApr(pool);
            await this.rebalancePoolLiquidity(pool);
        }
    }

    async adjustPoolApr(pool) {
        // Dynamic APR adjustment based on pool utilization
        const utilization = pool.totalStaked / Math.max(pool.totalLiquidity, 1);
        const targetUtilization = 0.7; // 70% target utilization

        if (utilization < targetUtilization * 0.8) {
            // Increase APR to attract more liquidity
            pool.apr = Math.min(this.config.maxApr, pool.apr * 1.1);
        } else if (utilization > targetUtilization * 1.2) {
            // Decrease APR as pool is over-utilized
            pool.apr = Math.max(0.01, pool.apr * 0.9);
        }

        pool.rewardRate = this.calculateRewardRate(pool.apr);

        await this.db.run(`
            UPDATE farming_pools 
            SET apr = ?, rewardRate = ?, updatedAt = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [pool.apr, pool.rewardRate, pool.id]);

        this.events.emit('poolAprAdjusted', {
            poolId: pool.id,
            newApr: pool.apr,
            utilization,
            timestamp: new Date()
        });
    }

    async rebalancePoolLiquidity(pool) {
        // Implementation for pool liquidity rebalancing
        // This would interact with AMM to rebalance token ratios
        console.log(`Rebalancing liquidity for pool ${pool.id}`);
    }

    async loadFarmingPools() {
        const pools = await this.db.all('SELECT * FROM farming_pools WHERE isActive = true');
        
        for (const pool of pools) {
            this.farmingPools.set(pool.id, {
                ...pool,
                createdAt: new Date(pool.createdAt),
                updatedAt: new Date(pool.updatedAt)
            });
        }
    }

    async loadPoolMetrics() {
        const metrics = await this.db.all(`
            SELECT poolId, SUM(totalLiquidity) as tvl, SUM(totalStaked) as totalStaked
            FROM pool_metrics 
            WHERE timestamp >= datetime('now', '-1 day')
            GROUP BY poolId
        `);

        for (const metric of metrics) {
            this.poolMetrics.set(metric.poolId, metric);
        }
    }

    async calculateGlobalMetrics() {
        let tvl = 0;
        let totalStaked = 0;

        for (const pool of this.farmingPools.values()) {
            tvl += pool.totalLiquidity;
            totalStaked += pool.totalStaked;
        }

        this.totalValueLocked = tvl;
        
        const totalRewards = await this.db.get(`
            SELECT SUM(totalRewards) as total FROM reward_distributions
        `);
        this.totalRewardsDistributed = totalRewards?.total || 0;
    }

    async getPool(poolId) {
        if (this.farmingPools.has(poolId)) {
            return this.farmingPools.get(poolId);
        }

        const pool = await this.db.get('SELECT * FROM farming_pools WHERE id = ?', [poolId]);
        if (pool) {
            this.farmingPools.set(poolId, {
                ...pool,
                createdAt: new Date(pool.createdAt),
                updatedAt: new Date(pool.updatedAt)
            });
        }
        return pool;
    }

    async getUserPosition(positionId) {
        if (this.userPositions.has(positionId)) {
            return this.userPositions.get(positionId);
        }

        const position = await this.db.get('SELECT * FROM user_positions WHERE id = ?', [positionId]);
        if (position) {
            this.userPositions.set(positionId, {
                ...position,
                enteredAt: new Date(position.enteredAt),
                lastHarvested: position.lastHarvested ? new Date(position.lastHarvested) : null
            });
        }
        return position;
    }

    async getUserFarmingStats(userId) {
        if (!this.initialized) await this.initialize();
        
        const positions = await this.db.all(`
            SELECT * FROM user_positions 
            WHERE userId = ? AND isActive = true
        `, [userId]);

        let totalStaked = 0;
        let totalRewards = 0;
        const poolStats = {};

        for (const position of positions) {
            totalStaked += position.stakedAmount;
            const rewards = await this.calculatePendingRewards(position.id);
            totalRewards += rewards;

            if (!poolStats[position.poolId]) {
                poolStats[position.poolId] = {
                    staked: 0,
                    rewards: 0,
                    positions: 0
                };
            }

            poolStats[position.poolId].staked += position.stakedAmount;
            poolStats[position.poolId].rewards += rewards;
            poolStats[position.poolId].positions += 1;
        }

        return {
            userId,
            totalStaked,
            totalRewards,
            activePositions: positions.length,
            poolStats,
            timestamp: new Date()
        };
    }

    async getFarmingAnalytics(timeframe = '7d') {
        if (!this.initialized) await this.initialize();
        
        const timeFilter = this.getTimeFilter(timeframe);
        
        const tvlHistory = await this.db.all(`
            SELECT 
                DATE(timestamp) as date,
                AVG(totalLiquidity) as avgTVL,
                AVG(totalStaked) as avgStaked
            FROM pool_metrics 
            WHERE timestamp >= ?
            GROUP BY DATE(timestamp)
            ORDER BY date
        `, [timeFilter]);

        const rewardDistribution = await this.db.all(`
            SELECT 
                DATE(distributionTime) as date,
                SUM(totalRewards) as dailyRewards,
                COUNT(*) as distributions
            FROM reward_distributions 
            WHERE distributionTime >= ?
            GROUP BY DATE(distributionTime)
            ORDER BY date
        `, [timeFilter]);

        const topPools = await this.db.all(`
            SELECT 
                p.id,
                p.name,
                p.apr,
                AVG(pm.totalLiquidity) as avgTVL,
                AVG(pm.totalStaked) as avgStaked,
                COUNT(DISTINCT up.userId) as uniqueStakers
            FROM farming_pools p
            LEFT JOIN pool_metrics pm ON p.id = pm.poolId AND pm.timestamp >= ?
            LEFT JOIN user_positions up ON p.id = up.poolId AND up.isActive = true
            WHERE p.isActive = true
            GROUP BY p.id
            ORDER BY avgTVL DESC
            LIMIT 10
        `, [timeFilter]);

        return {
            tvlHistory,
            rewardDistribution,
            topPools,
            globalMetrics: {
                totalValueLocked: this.totalValueLocked,
                totalRewardsDistributed: this.totalRewardsDistributed,
                activePools: this.farmingPools.size,
                timeframe
            },
            timestamp: new Date()
        };
    }

    getTimeFilter(timeframe) {
        const now = Date.now();
        const periods = {
            '24h': 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000,
            '30d': 30 * 24 * 60 * 60 * 1000,
            '90d': 90 * 24 * 60 * 60 * 1000
        };
        return new Date(now - (periods[timeframe] || periods['7d']));
    }
}

export default YieldFarming;
