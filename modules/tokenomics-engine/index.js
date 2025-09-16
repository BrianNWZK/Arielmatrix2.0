import { ArielSQLiteEngine } from "../ariel-sqlite-engine/index.js";

class TokenomicsEngine {
    constructor(maxSupply = 1000000000) {
        this.maxSupply = maxSupply;
        this.db = null;
        
        // REVISED: 60% Founder, 40% Ecosystem
        this.founderAllocation = 600000000; // 600M bwzC (60%) - Your permanent stake
        this.ecosystemAllocation = 400000000; // 400M bwzC (40%) - For distribution
        
        // Sub-allocation of ecosystem fund
        this.stakingRewardsAllocation = 300000000; // 300M (30% of total)
        this.liquidityMiningAllocation = 50000000; // 50M (5%)
        this.communityTreasuryAllocation = 50000000; // 50M (5%)
        
        this.founderVesting = {
            cliff: 365 * 24 * 60 * 60, // 1 year cliff (in seconds)
            duration: 4 * 365 * 24 * 60 * 60, // 4 year linear vesting
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
