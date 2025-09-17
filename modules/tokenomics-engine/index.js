// modules/tokenomics-engine/index.js
import { ArielSQLiteEngine } from "../ariel-sqlite-engine/index.js";
import { QuantumResistantCrypto } from "../quantum-resistant-crypto/index.js";
import axios from 'axios';

class TokenomicsEngine {
    constructor(maxSupply, config = {}) {
        this.config = {
            maxSupply: maxSupply || 100000000, 
            founderAllocation: config.founderAllocation || 0.6,
            ecosystemAllocation: config.ecosystemAllocation || 0.4,
            inflationRate: config.inflationRate || 0.05,
            communityTax: config.communityTax || 0.02,
            blockReward: config.blockReward || 10,
            mainnet: config.mainnet || true,
            ...config
        };

        this.db = null;
        this.quantumCrypto = new QuantumResistantCrypto({ mainnet: this.config.mainnet });
        this.priceFeedInterval = null;
        this.emissionInterval = null;
    }

    async initialize() {
        try {
            this.db = new ArielSQLiteEngine('./data/tokenomics.db');
            await this.db.init();
            await this.createDatabaseSchema();
            await this.quantumCrypto.initialize();
            
            // Start real-time tokenomics monitoring
            await this.startTokenomicsMonitoring();
            
            console.log("✅ Tokenomics Engine Initialized");
            return true;
        } catch (error) {
            console.error("❌ Failed to initialize Tokenomics Engine:", error);
            throw error;
        }
    }

    async createDatabaseSchema() {
        const tables = [
            `CREATE TABLE IF NOT EXISTS token_supply (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                total_supply REAL NOT NULL CHECK(total_supply >= 0),
                circulating_supply REAL NOT NULL CHECK(circulating_supply >= 0 AND circulating_supply <= total_supply),
                staked_supply REAL NOT NULL CHECK(staked_supply >= 0),
                block_height INTEGER NOT NULL,
                timestamp INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            `CREATE TABLE IF NOT EXISTS inflation_schedule (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                start_block INTEGER NOT NULL,
                end_block INTEGER NOT NULL,
                inflation_rate REAL NOT NULL CHECK(inflation_rate >= 0),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            `CREATE TABLE IF NOT EXISTS emission_schedule (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                recipient_type TEXT NOT NULL CHECK(recipient_type IN ('validator', 'founder', 'ecosystem', 'community')),
                recipient_address TEXT,
                amount REAL NOT NULL CHECK(amount > 0),
                block_height INTEGER NOT NULL,
                vesting_start INTEGER,
                vesting_duration INTEGER,
                claimed_amount REAL DEFAULT 0 CHECK(claimed_amount >= 0),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_emission_recipient (recipient_address),
                INDEX idx_emission_block (block_height)
            )`,

            `CREATE TABLE IF NOT EXISTS founder_vesting (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                founder_address TEXT NOT NULL,
                total_amount REAL NOT NULL CHECK(total_amount > 0),
                vested_amount REAL DEFAULT 0 CHECK(vested_amount >= 0 AND vested_amount <= total_amount),
                cliff_period INTEGER NOT NULL, // Blocks until cliff
                vesting_period INTEGER NOT NULL, // Total vesting period in blocks
                start_block INTEGER NOT NULL,
                claimed_amount REAL DEFAULT 0 CHECK(claimed_amount >= 0 AND claimed_amount <= vested_amount),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_founder_vesting (founder_address)
            )`,

            `CREATE TABLE IF NOT EXISTS staking_rewards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                staker_address TEXT NOT NULL,
                validator_address TEXT,
                amount REAL NOT NULL CHECK(amount > 0),
                block_height INTEGER NOT NULL,
                claimable INTEGER DEFAULT 1 CHECK(claimable IN (0, 1)),
                claimed_block INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_staking_rewards (staker_address),
                INDEX idx_validator_rewards (validator_address)
            )`,

            `CREATE TABLE IF NOT EXISTS community_pool (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                total_funds REAL NOT NULL CHECK(total_funds >= 0),
                allocated_funds REAL DEFAULT 0 CHECK(allocated_funds >= 0 AND allocated_funds <= total_funds),
                distributed_funds REAL DEFAULT 0 CHECK(distributed_funds >= 0 AND distributed_funds <= allocated_funds),
                block_height INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            `CREATE TABLE IF NOT EXISTS token_burns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                amount REAL NOT NULL CHECK(amount > 0),
                from_address TEXT,
                transaction_hash TEXT,
                block_height INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            `CREATE TABLE IF NOT EXISTS price_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                price_usd REAL NOT NULL CHECK(price_usd > 0),
                price_btc REAL NOT NULL CHECK(price_btc > 0),
                price_eth REAL NOT NULL CHECK(price_eth > 0),
                market_cap REAL,
                volume_24h REAL,
                source TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_price_timestamp (timestamp)
            )`,

            `CREATE TABLE IF NOT EXISTS liquidity_pools (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pair_address TEXT NOT NULL,
                token0 TEXT NOT NULL,
                token1 TEXT NOT NULL,
                reserve0 REAL NOT NULL CHECK(reserve0 >= 0),
                reserve1 REAL NOT NULL CHECK(reserve1 >= 0),
                total_liquidity REAL NOT NULL CHECK(total_liquidity >= 0),
                exchange TEXT NOT NULL,
                block_height INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_liquidity_pools (pair_address)
            )`,

            `CREATE TABLE IF NOT EXISTS tokenomics_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                block_height INTEGER NOT NULL,
                inflation_rate REAL NOT NULL CHECK(inflation_rate >= 0),
                staking_apy REAL NOT NULL CHECK(staking_apy >= 0),
                circulating_supply REAL NOT NULL CHECK(circulating_supply >= 0),
                market_cap REAL,
                total_value_locked REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`
        ];

        for (const tableSql of tables) {
            await this.db.run(tableSql);
        }

        // Initialize token supply
        await this.initializeTokenSupply();
    }

    async initializeTokenSupply() {
        const existingSupply = await this.db.get("SELECT COUNT(*) as count FROM token_supply");
        
        if (existingSupply.count === 0) {
            // Initial token distribution
            const founderAllocation = this.config.maxSupply * this.config.founderAllocation;
            const ecosystemAllocation = this.config.maxSupply * this.config.ecosystemAllocation;

            await this.db.run(
                "INSERT INTO token_supply (total_supply, circulating_supply, staked_supply, block_height, timestamp) VALUES (?, ?, ?, ?, ?)",
                [this.config.maxSupply, ecosystemAllocation, 0, 0, Date.now()]
            );

            // Initialize founder vesting
            await this.initializeFounderVesting(founderAllocation);

            // Initialize ecosystem funds
            await this.initializeEcosystemFunds(ecosystemAllocation);

            // Set initial inflation schedule
            await this.setInflationSchedule(0, 1000000000, this.config.inflationRate);

            console.log("✅ Token supply initialized with founder vesting and ecosystem funds");
        }
    }

    async initializeFounderVesting(totalAmount) {
        // In a real implementation, this would use actual founder addresses
        const founderAddresses = [
            'bwaezi1founder1addressxxxxxxxxxxxxx',
            'bwaezi1founder2addressxxxxxxxxxxxxx',
            'bwaezi1founder3addressxxxxxxxxxxxxx'
        ];

        const amountPerFounder = totalAmount / founderAddresses.length;
        const cliffPeriod = 525600; // ~1 year in blocks (assuming 6s block time)
        const vestingPeriod = 2102400; // ~4 years in blocks

        for (const address of founderAddresses) {
            await this.db.run(
                `INSERT INTO founder_vesting (founder_address, total_amount, vested_amount, cliff_period, vesting_period, start_block) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [address, amountPerFounder, 0, cliffPeriod, vestingPeriod, 0]
            );
        }
    }

    async initializeEcosystemFunds(totalAmount) {
        // Distribute ecosystem funds to different categories
        const distributions = [
            { category: 'staking_rewards', allocation: 0.5 }, // 50% for staking rewards
            { category: 'liquidity_mining', allocation: 0.2 }, // 20% for liquidity mining
            { category: 'community_treasury', allocation: 0.2 }, // 20% for community treasury
            { category: 'development_fund', allocation: 0.1 } // 10% for development
        ];

        for (const dist of distributions) {
            const amount = totalAmount * dist.allocation;
            await this.db.run(
                "INSERT INTO community_pool (total_funds, allocated_funds, distributed_funds, block_height) VALUES (?, ?, ?, ?)",
                [amount, 0, 0, 0]
            );
        }
    }

    async setInflationSchedule(startBlock, endBlock, inflationRate) {
        await this.db.run(
            "INSERT INTO inflation_schedule (start_block, end_block, inflation_rate) VALUES (?, ?, ?)",
            [startBlock, endBlock, inflationRate]
        );
    }

    async calculateBlockReward(blockHeight, totalStaked) {
        // Get current inflation rate
        const inflationSchedule = await this.db.get(
            "SELECT inflation_rate FROM inflation_schedule WHERE start_block <= ? AND end_block >= ? ORDER BY id DESC LIMIT 1",
            [blockHeight, blockHeight]
        );

        const inflationRate = inflationSchedule ? inflationSchedule.inflation_rate : this.config.inflationRate;

        // Calculate block reward based on inflation rate and total supply
        const totalSupply = await this.getTotalSupply();
        const annualEmission = totalSupply * inflationRate;
        const blocksPerYear = 525600; // Assuming 6s block time
        const baseBlockReward = annualEmission / blocksPerYear;

        // Adjust based on staking participation
        const stakingRatio = totalStaked / totalSupply;
        const participationFactor = Math.min(1.0, stakingRatio * 2); // Reward higher staking participation

        return baseBlockReward * participationFactor;
    }

    async distributeBlockReward(blockHeight, validatorAddress, totalStaked) {
        try {
            const blockReward = await this.calculateBlockReward(blockHeight, totalStaked);
            
            // Calculate community tax
            const communityTax = blockReward * this.config.communityTax;
            const validatorReward = blockReward - communityTax;

            await this.db.run('BEGIN TRANSACTION');

            try {
                // Distribute to validator
                await this.db.run(
                    "INSERT INTO emission_schedule (recipient_type, recipient_address, amount, block_height) VALUES ('validator', ?, ?, ?)",
                    [validatorAddress, validatorReward, blockHeight]
                );

                // Add to community pool
                await this.db.run(
                    "UPDATE community_pool SET total_funds = total_funds + ? WHERE category = 'staking_rewards'",
                    [communityTax]
                );

                // Update token supply
                await this.updateTokenSupply(blockHeight, blockReward);

                await this.db.run('COMMIT');

                console.log(`💰 Block reward distributed: ${validatorReward} to validator, ${communityTax} to community pool`);
                return { validatorReward, communityTax, totalReward: blockReward };
            } catch (error) {
                await this.db.run('ROLLBACK');
                throw error;
            }
        } catch (error) {
            console.error("❌ Failed to distribute block reward:", error);
            throw error;
        }
    }

    async updateTokenSupply(blockHeight, newEmission) {
        const currentSupply = await this.db.get(
            "SELECT * FROM token_supply ORDER BY block_height DESC LIMIT 1"
        );

        const newTotalSupply = currentSupply.total_supply + newEmission;
        const newCirculatingSupply = currentSupply.circulating_supply + newEmission;

        await this.db.run(
            "INSERT INTO token_supply (total_supply, circulating_supply, staked_supply, block_height, timestamp) VALUES (?, ?, ?, ?, ?)",
            [newTotalSupply, newCirculatingSupply, currentSupply.staked_supply, blockHeight, Date.now()]
        );
    }

    async updateStakedSupply(amount, blockHeight) {
        const currentSupply = await this.db.get(
            "SELECT * FROM token_supply ORDER BY block_height DESC LIMIT 1"
        );

        const newStakedSupply = currentSupply.staked_supply + amount;

        await this.db.run(
            "INSERT INTO token_supply (total_supply, circulating_supply, staked_supply, block_height, timestamp) VALUES (?, ?, ?, ?, ?)",
            [currentSupply.total_supply, currentSupply.circulating_supply, newStakedSupply, blockHeight, Date.now()]
        );
    }

    async distributeStakingRewards(stakerAddress, validatorAddress, amount, blockHeight) {
        try {
            await this.db.run(
                "INSERT INTO staking_rewards (staker_address, validator_address, amount, block_height) VALUES (?, ?, ?, ?)",
                [stakerAddress, validatorAddress, amount, blockHeight]
            );

            console.log(`🎯 Staking reward distributed: ${amount} to ${stakerAddress} via ${validatorAddress}`);
            return { success: true, amount, blockHeight };
        } catch (error) {
            console.error("❌ Failed to distribute staking reward:", error);
            throw error;
        }
    }

    async claimStakingRewards(stakerAddress, blockHeight) {
        try {
            const unclaimedRewards = await this.db.all(
                "SELECT * FROM staking_rewards WHERE staker_address = ? AND claimable = 1 AND claimed_block IS NULL",
                [stakerAddress]
            );

            let totalClaimed = 0;
            await this.db.run('BEGIN TRANSACTION');

            try {
                for (const reward of unclaimedRewards) {
                    await this.db.run(
                        "UPDATE staking_rewards SET claimed_block = ? WHERE id = ?",
                        [blockHeight, reward.id]
                    );
                    totalClaimed += reward.amount;
                }

                // Update circulating supply (rewards become liquid)
                await this.updateCirculatingSupply(totalClaimed, blockHeight);

                await this.db.run('COMMIT');

                console.log(`💰 ${stakerAddress} claimed ${totalClaimed} in staking rewards`);
                return { success: true, amount: totalClaimed };
            } catch (error) {
                await this.db.run('ROLLBACK');
                throw error;
            }
        } catch (error) {
            console.error("❌ Failed to claim staking rewards:", error);
            throw error;
        }
    }

    async vestFounderTokens(blockHeight) {
        try {
            const founders = await this.db.all("SELECT * FROM founder_vesting");
            
            for (const founder of founders) {
                if (blockHeight < founder.start_block + founder.cliff_period) {
                    continue; // Still in cliff period
                }

                const elapsedBlocks = blockHeight - founder.start_block;
                const vestingProgress = Math.min(1.0, elapsedBlocks / founder.vesting_period);
                const newlyVested = founder.total_amount * vestingProgress - founder.vested_amount;

                if (newlyVested > 0) {
                    await this.db.run(
                        "UPDATE founder_vesting SET vested_amount = vested_amount + ? WHERE id = ?",
                        [newlyVested, founder.id]
                    );

                    // Add to emission schedule
                    await this.db.run(
                        "INSERT INTO emission_schedule (recipient_type, recipient_address, amount, block_height, vesting_start, vesting_duration) VALUES ('founder', ?, ?, ?, ?, ?)",
                        [founder.founder_address, newlyVested, blockHeight, founder.start_block, founder.vesting_period]
                    );

                    console.log(`👔 Founder ${founder.founder_address} vested ${newlyVested} tokens`);
                }
            }
        } catch (error) {
            console.error("❌ Failed to vest founder tokens:", error);
        }
    }

    async burnTokens(amount, fromAddress, transactionHash, blockHeight) {
        try {
            await this.db.run(
                "INSERT INTO token_burns (amount, from_address, transaction_hash, block_height) VALUES (?, ?, ?, ?)",
                [amount, fromAddress, transactionHash, blockHeight]
            );

            // Update token supply
            const currentSupply = await this.db.get(
                "SELECT * FROM token_supply ORDER BY block_height DESC LIMIT 1"
            );

            const newTotalSupply = currentSupply.total_supply - amount;
            const newCirculatingSupply = currentSupply.circulating_supply - amount;

            await this.db.run(
                "INSERT INTO token_supply (total_supply, circulating_supply, staked_supply, block_height, timestamp) VALUES (?, ?, ?, ?, ?)",
                [newTotalSupply, newCirculatingSupply, currentSupply.staked_supply, blockHeight, Date.now()]
            );

            console.log(`🔥 ${amount} tokens burned from ${fromAddress}`);
            return { success: true, amount, newTotalSupply };
        } catch (error) {
            console.error("❌ Failed to burn tokens:", error);
            throw error;
        }
    }

    async startTokenomicsMonitoring() {
        // Update price feeds regularly
        setInterval(async () => {
            await this.updatePriceFeeds();
        }, 30000); // Every 30 seconds

        // Update tokenomics metrics
        setInterval(async () => {
            await this.updateTokenomicsMetrics();
        }, 60000); // Every minute

        // Process vesting
        setInterval(async () => {
            const currentBlock = await this.getCurrentBlockHeight();
            await this.vestFounderTokens(currentBlock);
        }, 300000); // Every 5 minutes

        console.log("✅ Tokenomics monitoring started");
    }

    async updatePriceFeeds() {
        try {
            // Real price data from multiple exchanges
            const exchanges = [
                {
                    name: 'CoinGecko',
                    url: 'https://api.coingecko.com/api/v3/simple/price?ids=brian-nwaezike-chain&vs_currencies=usd,btc,eth',
                    parser: (data) => ({
                        price_usd: data['brian-nwaezike-chain']?.usd || 0,
                        price_btc: data['brian-nwaezike-chain']?.btc || 0,
                        price_eth: data['brian-nwaezike-chain']?.eth || 0
                    })
                },
                {
                    name: 'Binance',
                    url: 'https://api.binance.com/api/v3/ticker/price?symbol=BWZUSDT',
                    parser: (data) => ({
                        price_usd: parseFloat(data.price) || 0,
                        price_btc: 0, // Would need BTC pair
                        price_eth: 0  // Would need ETH pair
                    })
                }
            ];

            for (const exchange of exchanges) {
                try {
                    const response = await axios.get(exchange.url, { timeout: 5000 });
                    const prices = exchange.parser(response.data);
                    
                    if (prices.price_usd > 0) {
                        const circulatingSupply = await this.getCirculatingSupply();
                        const marketCap = circulatingSupply * prices.price_usd;

                        await this.db.run(
                            "INSERT INTO price_history (price_usd, price_btc, price_eth, market_cap, source, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
                            [prices.price_usd, prices.price_btc, prices.price_eth, marketCap, exchange.name, Date.now()]
                        );
                    }
                } catch (error) {
                    console.warn(`⚠️ Failed to fetch price from ${exchange.name}:`, error.message);
                }
            }
        } catch (error) {
            console.error("❌ Error updating price feeds:", error);
        }
    }

    async updateTokenomicsMetrics() {
        try {
            const currentBlock = await this.getCurrentBlockHeight();
            const circulatingSupply = await this.getCirculatingSupply();
            const stakedSupply = await this.getStakedSupply();
            const inflationRate = await this.getCurrentInflationRate();
            
            // Calculate staking APY
            const annualInflation = circulatingSupply * inflationRate;
            const stakingAPY = stakedSupply > 0 ? (annualInflation * 0.8) / stakedSupply : 0; // 80% of inflation to stakers

            // Get TVL from liquidity pools
            const tvl = await this.calculateTotalValueLocked();

            await this.db.run(
                "INSERT INTO tokenomics_metrics (block_height, inflation_rate, staking_apy, circulating_supply, market_cap, total_value_locked) VALUES (?, ?, ?, ?, ?, ?)",
                [currentBlock, inflationRate, stakingAPY, circulatingSupply, circulatingSupply * await getCurrentPrice(), tvl]
            );

            console.log("📊 Tokenomics metrics updated");
        } catch (error) {
            console.error("❌ Error updating tokenomics metrics:", error);
        }
    }

    async calculateTotalValueLocked() {
        // In a real implementation, this would query all liquidity pools
        const pools = await this.db.all("SELECT * FROM liquidity_pools ORDER BY block_height DESC LIMIT 10");
        return pools.reduce((total, pool) => total + pool.total_liquidity, 0);
    }

    // Helper methods
    async getTotalSupply() {
        const result = await this.db.get(
            "SELECT total_supply FROM token_supply ORDER BY block_height DESC LIMIT 1"
        );
        return result ? result.total_supply : this.config.maxSupply;
    }

    async getCirculatingSupply() {
        const result = await this.db.get(
            "SELECT circulating_supply FROM token_supply ORDER BY block_height DESC LIMIT 1"
        );
        return result ? result.circulating_supply : this.config.maxSupply * this.config.ecosystemAllocation;
    }

    async getStakedSupply() {
        const result = await this.db.get(
            "SELECT staked_supply FROM token_supply ORDER BY block_height DESC LIMIT 1"
        );
        return result ? result.staked_supply : 0;
    }

    async getCurrentInflationRate() {
        const currentBlock = await this.getCurrentBlockHeight();
        const result = await this.db.get(
            "SELECT inflation_rate FROM inflation_schedule WHERE start_block <= ? AND end_block >= ? ORDER BY id DESC LIMIT 1",
            [currentBlock, currentBlock]
        );
        return result ? result.inflation_rate : this.config.inflationRate;
    }

    async getCurrentBlockHeight() {
        // In a real implementation, this would query the blockchain
        return 1000; // Example block height
    }

    async updateCirculatingSupply(amount, blockHeight) {
        const currentSupply = await this.db.get(
            "SELECT * FROM token_supply ORDER BY block_height DESC LIMIT 1"
        );

        const newCirculatingSupply = currentSupply.circulating_supply + amount;

        await this.db.run(
            "INSERT INTO token_supply (total_supply, circulating_supply, staked_supply, block_height, timestamp) VALUES (?, ?, ?, ?, ?)",
            [currentSupply.total_supply, newCirculatingSupply, currentSupply.staked_supply, blockHeight, Date.now()]
        );
    }

    async getCurrentPrice() {
        const result = await this.db.get(
            "SELECT price_usd FROM price_history ORDER BY timestamp DESC LIMIT 1"
        );
        return result ? result.price_usd : 1.0; // Default to $1 if no price data
    }
}

import { ArielSQLiteEngine } from "../ariel-sqlite-engine/index.js";

class TokenomicsEngine {
  // your logic here
}

export { ArielSQLiteEngine };
export default TokenomicsEngine;


// ... existing code ...
class TokenomicsEngine {
    constructor(maxSupply, config = {}) {
        this.config = {
            maxSupply: maxSupply || 100000000, // CHANGED: 100M instead of 1B
            founderAllocation: config.founderAllocation || 0.6,
            ecosystemAllocation: config.ecosystemAllocation || 0.4,
            inflationRate: config.inflationRate || 0.05,
            communityTax: config.communityTax || 0.02,
            blockReward: config.blockReward || 10,
            mainnet: config.mainnet || true,
            ...config
        };

// AND in the second TokenomicsEngine class:
class TokenomicsEngine {
    constructor(maxSupply = 100000000) { // 100M 
        this.maxSupply = maxSupply;
        this.db = null;
        
        // REVISED: 60% Founder, 40% Ecosystem - UPDATED FOR 100M TOTAL
        this.founderAllocation = 60000000; // 60M bwzC (60%) - permanent stake
        this.ecosystemAllocation = 40000000; // 40M bwzC (40%) - for distribution
        
        // Sub-allocation of ecosystem fund - UPDATED FOR 100M TOTAL
        this.stakingRewardsAllocation = 30000000; // 30M (30% of total) 
        this.liquidityMiningAllocation = 5000000; // 5M (5%) 
        this.communityTreasuryAllocation = 5000000; // 5M (5%) 
        
        this.founderVesting = {
            cliff: 365 * 24 * 60 * 60,
            duration: 4 * 365 * 24 * 60 * 60,
            startTime: null
        };
    }

    async initialize() {
        console.log("✅ Tokenomics Engine initialized with 60% founder allocation");
        this.founderVesting.startTime = Date.now() / 1000; // Convert to Unix timestamp
    }

    async initializeGenesisSupply() {
        // Create founder allocation account
        await this.createFounderAllocation();
        
        // Initialize ecosystem funds
        await this.initializeEcosystemFunds();
        
        console.log(`✅ Genesis supply initialized: 600M to founder, 400M to ecosystem`);
    }

    async createFounderAllocation() {
        // Founder allocation address (should be multi-sig in production)
        const founderAddress = "bwz1founderxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
        
        // Create founder account with vested balance
        await this.db.run(
            `INSERT INTO accounts (address, balance, nonce, shard_id) 
             VALUES (?, ?, ?, ?)`,
            [founderAddress, 0, 0, 0] // Start with 0 balance (vested over time)
        );
        
        // Initialize vesting schedule
        await this.db.run(
            `INSERT INTO founder_vesting (
                address, total_amount, vested_amount, cliff_duration, 
                vesting_duration, start_time, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
            [
                founderAddress, 
                this.founderAllocation,
                0,
                this.founderVesting.cliff,
                this.founderVesting.duration,
                this.founderVesting.startTime
            ]
        );
    }

    async initializeEcosystemFunds() {
        const ecosystemAddress = "bwz1ecosystemxxxxxxxxxxxxxxxxxxxxxxxxxx";
        
        // Create ecosystem fund account
        await this.db.run(
            `INSERT INTO accounts (address, balance, nonce, shard_id) 
             VALUES (?, ?, ?, ?)`,
            [ecosystemAddress, this.ecosystemAllocation, 0, 0]
        );
        
        // Initialize ecosystem sub-allocations
        await this.db.run(
            `INSERT INTO ecosystem_funds (
                staking_rewards, liquidity_mining, community_treasury,
                total_amount, created_at
             ) VALUES (?, ?, ?, ?, datetime('now'))`,
            [
                this.stakingRewardsAllocation,
                this.liquidityMiningAllocation,
                this.communityTreasuryAllocation,
                this.ecosystemAllocation
            ]
        );
    }

    async calculateVestedFounderTokens() {
        const currentTime = Date.now() / 1000;
        const vestingInfo = await this.db.get(
            "SELECT * FROM founder_vesting WHERE address = ?",
            ["bwz1founderxxxxxxxxxxxxxxxxxxxxxxxxxxxx"]
        );
        
        if (!vestingInfo) return 0;
        
        const elapsed = currentTime - vestingInfo.start_time;
        
        if (elapsed < vestingInfo.cliff_duration) {
            return 0; // Still in cliff period
        }
        
        const vestingElapsed = elapsed - vestingInfo.cliff_duration;
        const totalVestingDuration = vestingInfo.vesting_duration;
        
        if (vestingElapsed >= totalVestingDuration) {
            return vestingInfo.total_amount; // Fully vested
        }
        
        // Linear vesting calculation
        const vestedAmount = (vestingInfo.total_amount * vestingElapsed) / totalVestingDuration;
        return Math.min(vestedAmount, vestingInfo.total_amount);
    }

    async releaseVestedTokens() {
        const vestedAmount = await this.calculateVestedFounderTokens();
        const founderAddress = "bwz1founderxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
        
        const currentVested = await this.db.get(
            "SELECT vested_amount FROM founder_vesting WHERE address = ?",
            [founderAddress]
        );
        
        if (vestedAmount > currentVested.vested_amount) {
            const tokensToRelease = vestedAmount - currentVested.vested_amount;
            
            // Update founder balance
            await this.db.run(
                "UPDATE accounts SET balance = balance + ? WHERE address = ?",
                [tokensToRelease, founderAddress]
            );
            
            // Update vesting record
            await this.db.run(
                "UPDATE founder_vesting SET vested_amount = ? WHERE address = ?",
                [vestedAmount, founderAddress]
            );
            
            console.log(`✅ Released ${tokensToRelease} bwzC to founder (${vestedAmount}/${this.founderAllocation} vested)`);
        }
    }

    // ... rest of the existing methods with updated calculations
    async calculateBlockReward(blockHeight, transactionCount, validatorStake) {
        // Calculate from ecosystem staking rewards pool
        const baseReward = this.calculateBaseReward(blockHeight);
        const transactionBonus = transactionCount * 0.001;
        const stakeFactor = Math.log1p(validatorStake / 1000000);
        
        const reward = baseReward + transactionBonus * stakeFactor;
        
        // Ensure we don't exceed ecosystem staking allocation
        const distributedRewards = await this.getDistributedStakingRewards();
        const remainingRewards = this.stakingRewardsAllocation - distributedRewards;
        
        return Math.min(reward, remainingRewards);
    }

    async getDistributedStakingRewards() {
        const result = await this.db.get(
            "SELECT SUM(amount) as total FROM reward_distributions"
        );
        return result.total || 0;
    }
}

export default TokenomicsEngine;
