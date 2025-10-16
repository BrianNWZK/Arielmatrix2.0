// modules/high-frequency-settlement.js
import { EventEmitter } from 'events';
import { ArielSQLiteEngine } from './ariel-sqlite-engine/index.js';
import { SovereignRevenueEngine } from './sovereign-revenue-engine.js';
import { 
    BWAEZI_CHAIN,
    BWAEZI_SOVEREIGN_CONFIG,
    ConfigUtils 
} from '../config/bwaezi-config.js';
import { createHash, randomBytes } from 'crypto';

export class HighFrequencySettlement {
    constructor(config = {}) {
        this.config = {
            settlementInterval: 1000,
            maxSettlementAmount: 1000000,
            nettingEnabled: true,
            riskLimits: {
                perCounterparty: 50000,
                perAsset: 100000,
                totalExposure: 1000000
            },
            collateralRequirements: 0.1,
            settlementCurrencies: ['USD', 'EUR', 'GBP', 'BWZ'],
            ...config
        };
        this.settlementQueue = new Map();
        this.nettingPositions = new Map();
        this.collateralAccounts = new Map();
        this.counterpartyRisk = new Map();
        this.db = new ArielSQLiteEngine({ path: './data/high-frequency-settlement.db' });
        this.events = new EventEmitter();
        this.sovereignService = null;
        this.serviceId = null;
        this.initialized = false;
        this.settlementCycles = 0;
        this.totalSettled = 0;
    }

    async initialize() {
        if (this.initialized) return;
        
        await this.db.init();
        await this.createDatabaseTables();
        
        this.sovereignService = new SovereignRevenueEngine();
        await this.sovereignService.initialize();
        
        this.serviceId = await this.sovereignService.registerService({
            name: 'HighFrequencySettlement',
            description: 'Real-time high-frequency settlement system with multi-currency support',
            registrationFee: 6000,
            annualLicenseFee: 3000,
            revenueShare: 0.12,
            serviceType: 'financial_settlement',
            dataPolicy: 'Encrypted settlement instructions only - No PII storage',
            compliance: ['Financial Compliance', 'Risk Management']
        });

        await this.loadRiskPositions();
        this.startSettlementCycle();
        this.initialized = true;
        
        this.events.emit('initialized', {
            timestamp: Date.now(),
            chain: BWAEZI_CHAIN.NAME,
            riskLimits: this.config.riskLimits,
            nettingEnabled: this.config.nettingEnabled
        });
    }

    async createDatabaseTables() {
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS settlement_instructions (
                id TEXT PRIMARY KEY,
                fromParty TEXT NOT NULL,
                toParty TEXT NOT NULL,
                asset TEXT NOT NULL,
                amount REAL NOT NULL,
                currency TEXT NOT NULL,
                valueDate DATETIME NOT NULL,
                status TEXT DEFAULT 'pending',
                instructionType TEXT NOT NULL,
                reference TEXT,
                nettingApplied BOOLEAN DEFAULT false,
                nettingAmount REAL DEFAULT 0,
                settlementHash TEXT,
                blockchainTransactionHash TEXT,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                settledAt DATETIME,
                errorMessage TEXT
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS netting_positions (
                id TEXT PRIMARY KEY,
                partyA TEXT NOT NULL,
                partyB TEXT NOT NULL,
                asset TEXT NOT NULL,
                netAmount REAL NOT NULL,
                currency TEXT NOT NULL,
                lastSettlementDate DATETIME,
                totalSettled REAL DEFAULT 0,
                settlementCount INTEGER DEFAULT 0,
                lastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS collateral_accounts (
                party TEXT PRIMARY KEY,
                totalCollateral REAL DEFAULT 0,
                usedCollateral REAL DEFAULT 0,
                availableCollateral REAL DEFAULT 0,
                collateralCurrency TEXT DEFAULT 'USD',
                marginCallLevel REAL DEFAULT 0.8,
                lastMarginCall DATETIME,
                lastCollateralUpdate DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS risk_exposures (
                party TEXT NOT NULL,
                counterparty TEXT NOT NULL,
                asset TEXT NOT NULL,
                exposureAmount REAL NOT NULL,
                currency TEXT NOT NULL,
                lastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (party, counterparty, asset)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS settlement_cycles (
                id TEXT PRIMARY KEY,
                startTime DATETIME NOT NULL,
                endTime DATETIME,
                totalInstructions INTEGER DEFAULT 0,
                settledInstructions INTEGER DEFAULT 0,
                totalAmount REAL DEFAULT 0,
                nettingEfficiency REAL DEFAULT 0,
                status TEXT DEFAULT 'running'
            )
        `);
    }

    async createSettlementInstruction(fromParty, toParty, asset, amount, currency, valueDate, instructionType = 'DVP', reference = '', metadata = {}) {
        if (!this.initialized) await this.initialize();
        
        await this.validateSettlementInstruction(fromParty, toParty, amount, currency);
        await this.performRiskChecks(fromParty, toParty, amount, currency);

        const instructionId = this.generateInstructionId();
        const nettingApplied = this.config.nettingEnabled;
        let nettingAmount = 0;

        if (nettingApplied) {
            nettingAmount = await this.calculateNettingAmount(fromParty, toParty, asset, amount);
        }

        const settlementHash = this.generateSettlementHash(fromParty, toParty, asset, amount, currency);
        
        await this.db.run(`
            INSERT INTO settlement_instructions (id, fromParty, toParty, asset, amount, currency, valueDate, instructionType, reference, nettingApplied, nettingAmount, settlementHash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [instructionId, fromParty, toParty, asset, amount, currency, valueDate, instructionType, reference, nettingApplied, nettingAmount, settlementHash]);

        const instruction = {
            id: instructionId,
            fromParty,
            toParty,
            asset,
            amount,
            currency,
            valueDate: new Date(valueDate),
            instructionType,
            reference,
            nettingApplied,
            nettingAmount,
            settlementHash,
            status: 'pending',
            createdAt: new Date(),
            metadata
        };

        this.settlementQueue.set(instructionId, instruction);

        if (this.config.nettingEnabled) {
            await this.updateNettingPosition(fromParty, toParty, asset, amount, currency);
        }

        await this.updateRiskExposure(fromParty, toParty, asset, amount, currency);

        this.events.emit('settlementInstructionCreated', { 
            instructionId, 
            fromParty, 
            toParty, 
            asset, 
            amount,
            currency,
            nettingApplied,
            nettingAmount
        });

        return instructionId;
    }

    generateInstructionId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(16).toString('hex');
        return `settle_${timestamp}_${random}`;
    }

    generateSettlementHash(fromParty, toParty, asset, amount, currency) {
        const data = `${fromParty}-${toParty}-${asset}-${amount}-${currency}-${Date.now()}`;
        return createHash('sha256').update(data).digest('hex');
    }

    async validateSettlementInstruction(fromParty, toParty, amount, currency) {
        if (amount <= 0) {
            throw new Error('Settlement amount must be positive');
        }

        if (amount > this.config.maxSettlementAmount) {
            throw new Error(`Settlement amount exceeds maximum: ${this.config.maxSettlementAmount}`);
        }

        if (!this.config.settlementCurrencies.includes(currency)) {
            throw new Error(`Unsupported settlement currency: ${currency}`);
        }

        if (!this.isValidParty(fromParty) || !this.isValidParty(toParty)) {
            throw new Error('Invalid party identifier');
        }
    }

    isValidParty(party) {
        return typeof party === 'string' && 
               party.length >= 8 && 
               party.length <= 64 &&
               /^[0-9a-zA-Z_-]+$/.test(party);
    }

    async performRiskChecks(fromParty, toParty, amount, currency) {
        await this.checkRiskLimits(fromParty, toParty, amount, currency);
        await this.verifyCollateral(fromParty, amount, currency);
        await this.validateCounterparty(fromParty, toParty);
    }

    async checkRiskLimits(fromParty, toParty, amount, currency) {
        const counterpartyExposure = await this.getCounterpartyExposure(fromParty, toParty, currency);
        if (counterpartyExposure + amount > this.config.riskLimits.perCounterparty) {
            throw new Error(`Counterparty exposure limit exceeded: ${counterpartyExposure + amount} > ${this.config.riskLimits.perCounterparty}`);
        }

        const assetExposure = await this.getAssetExposure(fromParty, currency);
        if (assetExposure + amount > this.config.riskLimits.perAsset) {
            throw new Error(`Asset exposure limit exceeded: ${assetExposure + amount} > ${this.config.riskLimits.perAsset}`);
        }

        const totalExposure = await this.getTotalExposure(fromParty);
        if (totalExposure + amount > this.config.riskLimits.totalExposure) {
            throw new Error(`Total exposure limit exceeded: ${totalExposure + amount} > ${this.config.riskLimits.totalExposure}`);
        }
    }

    async getCounterpartyExposure(partyA, partyB, currency) {
        const result = await this.db.get(`
            SELECT exposureAmount 
            FROM risk_exposures 
            WHERE party = ? AND counterparty = ? AND currency = ?
        `, [partyA, partyB, currency]);

        return result?.exposureAmount || 0;
    }

    async getAssetExposure(party, currency) {
        const result = await this.db.get(`
            SELECT SUM(exposureAmount) as totalExposure 
            FROM risk_exposures 
            WHERE party = ? AND currency = ?
        `, [party, currency]);

        return result?.totalExposure || 0;
    }

    async getTotalExposure(party) {
        const result = await this.db.get(`
            SELECT SUM(exposureAmount) as totalExposure 
            FROM risk_exposures 
            WHERE party = ?
        `, [party]);

        return result?.totalExposure || 0;
    }

    async updateRiskExposure(partyA, partyB, asset, amount, currency) {
        const exposureId = `${partyA}_${partyB}_${asset}_${currency}`;
        const currentExposure = this.counterpartyRisk.get(exposureId) || 0;
        const newExposure = currentExposure + amount;

        this.counterpartyRisk.set(exposureId, newExposure);

        await this.db.run(`
            INSERT OR REPLACE INTO risk_exposures (party, counterparty, asset, exposureAmount, currency, lastUpdated)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [partyA, partyB, asset, newExposure, currency]);
    }

    async calculateNettingAmount(partyA, partyB, asset, amount) {
        const nettingId = this.generateNettingId(partyA, partyB, asset);
        const currentPosition = this.nettingPositions.get(nettingId) || 0;
        const newPosition = currentPosition + amount;

        this.nettingPositions.set(nettingId, newPosition);

        await this.db.run(`
            INSERT OR REPLACE INTO netting_positions (id, partyA, partyB, asset, netAmount, currency, lastUpdated)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [nettingId, partyA, partyB, asset, newPosition, 'USD']);

        return newPosition;
    }

    generateNettingId(partyA, partyB, asset) {
        const parties = [partyA, partyB].sort().join('_');
        return `netting_${parties}_${asset}`;
    }

    async updateNettingPosition(partyA, partyB, asset, amount, currency) {
        const nettingId = this.generateNettingId(partyA, partyB, asset);
        const currentPosition = this.nettingPositions.get(nettingId) || 0;
        const newPosition = currentPosition + amount;

        this.nettingPositions.set(nettingId, newPosition);

        await this.db.run(`
            INSERT OR REPLACE INTO netting_positions (id, partyA, partyB, asset, netAmount, currency, lastUpdated)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [nettingId, partyA, partyB, asset, newPosition, currency]);
    }

    async verifyCollateral(party, amount, currency) {
        const collateral = await this.getCollateral(party);
        const requiredCollateral = amount * this.config.collateralRequirements;

        if (collateral.availableCollateral < requiredCollateral) {
            await this.triggerMarginCall(party, requiredCollateral, collateral.availableCollateral);
            throw new Error(`Insufficient collateral: ${collateral.availableCollateral} < ${requiredCollateral}`);
        }

        await this.allocateCollateral(party, requiredCollateral);
    }

    async getCollateral(party) {
        const collateral = await this.db.get('SELECT * FROM collateral_accounts WHERE party = ?', [party]);
        if (!collateral) {
            return {
                party,
                totalCollateral: 0,
                usedCollateral: 0,
                availableCollateral: 0,
                collateralCurrency: 'USD',
                marginCallLevel: 0.8
            };
        }
        return collateral;
    }

    async allocateCollateral(party, amount) {
        await this.db.run(`
            UPDATE collateral_accounts 
            SET usedCollateral = usedCollateral + ?, 
                availableCollateral = availableCollateral - ?,
                lastCollateralUpdate = CURRENT_TIMESTAMP
            WHERE party = ? AND availableCollateral >= ?
        `, [amount, amount, party, amount]);
    }

    async triggerMarginCall(party, requiredAmount, availableAmount) {
        const marginCallAmount = requiredAmount - availableAmount;
        
        this.events.emit('marginCall', {
            party,
            requiredAmount,
            availableAmount,
            marginCallAmount,
            timestamp: new Date()
        });

        await this.db.run(`
            UPDATE collateral_accounts 
            SET lastMarginCall = CURRENT_TIMESTAMP
            WHERE party = ?
        `, [party]);

        console.warn(`🚨 Margin call for party ${party}: ${marginCallAmount} required`);
    }

    async validateCounterparty(fromParty, toParty) {
        // Implement sophisticated counterparty validation
        const validCounterparties = await this.getValidCounterparties(fromParty);
        if (!validCounterparties.includes(toParty)) {
            throw new Error(`Counterparty not authorized: ${toParty}`);
        }
    }

    async getValidCounterparties(party) {
        const result = await this.db.all(`
            SELECT DISTINCT counterparty 
            FROM risk_exposures 
            WHERE party = ?
        `, [party]);
        
        return result.map(row => row.counterparty);
    }

    startSettlementCycle() {
        setInterval(async () => {
            await this.processSettlementCycle();
        }, this.config.settlementInterval);
    }

    async processSettlementCycle() {
        if (this.settlementQueue.size === 0) return;

        const cycleId = this.generateCycleId();
        const instructions = Array.from(this.settlementQueue.values());
        
        this.settlementQueue.clear();

        try {
            await this.db.run(`
                INSERT INTO settlement_cycles (id, startTime, totalInstructions)
                VALUES (?, CURRENT_TIMESTAMP, ?)
            `, [cycleId, instructions.length]);

            const settlementResults = await this.executeSettlementBatch(cycleId, instructions);
            await this.updateSettlementCycle(cycleId, 'completed', settlementResults);

            for (const instruction of instructions) {
                await this.updateInstructionStatus(instruction.id, 'settled', cycleId);
                await this.finalizeSettlement(instruction);
            }

            if (this.sovereignService && this.serviceId) {
                const totalFees = this.calculateSettlementFees(instructions);
                await this.sovereignService.processRevenue(
                    this.serviceId, 
                    totalFees, 
                    'settlement_processing',
                    'USD',
                    'bwaezi',
                    {
                        cycleId,
                        instructionCount: instructions.length,
                        totalAmount: settlementResults.totalAmount,
                        nettingEfficiency: settlementResults.nettingEfficiency
                    }
                );
            }

            this.settlementCycles++;
            this.totalSettled += settlementResults.totalAmount;

            this.events.emit('settlementCycleCompleted', { 
                cycleId, 
                instructionCount: instructions.length, 
                totalAmount: settlementResults.totalAmount,
                nettingEfficiency: settlementResults.nettingEfficiency,
                timestamp: new Date()
            });
        } catch (error) {
            await this.updateSettlementCycle(cycleId, 'failed', { error: error.message });
            
            for (const instruction of instructions) {
                await this.updateInstructionStatus(instruction.id, 'failed', cycleId, error.message);
                this.settlementQueue.set(instruction.id, instruction);
            }

            this.events.emit('settlementCycleFailed', { 
                cycleId, 
                error: error.message,
                instructionCount: instructions.length
            });
        }
    }

    generateCycleId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(8).toString('hex');
        return `cycle_${timestamp}_${random}`;
    }

    async executeSettlementBatch(cycleId, instructions) {
        console.log(`Executing settlement cycle ${cycleId} with ${instructions.length} instructions`);

        const totalAmount = instructions.reduce((sum, inst) => sum + inst.amount, 0);
        let nettingEfficiency = 0;

        if (this.config.nettingEnabled) {
            nettingEfficiency = await this.calculateNettingEfficiency(instructions);
        }

        const blockchainHash = this.generateBlockchainSettlementHash(instructions);

        for (const instruction of instructions) {
            await this.db.run(`
                UPDATE settlement_instructions 
                SET status = 'settled', 
                    settledAt = CURRENT_TIMESTAMP,
                    blockchainTransactionHash = ?
                WHERE id = ?
            `, [blockchainHash, instruction.id]);
        }

        return { 
            totalAmount, 
            nettingEfficiency,
            blockchainHash 
        };
    }

    async calculateNettingEfficiency(instructions) {
        const nettingAmounts = instructions.filter(inst => inst.nettingApplied)
                                          .reduce((sum, inst) => sum + inst.nettingAmount, 0);
        const totalAmount = instructions.reduce((sum, inst) => sum + inst.amount, 0);
        
        return totalAmount > 0 ? nettingAmounts / totalAmount : 0;
    }

    generateBlockchainSettlementHash(instructions) {
        const instructionData = instructions.map(inst => 
            `${inst.fromParty}-${inst.toParty}-${inst.asset}-${inst.amount}-${inst.currency}`
        ).join('|');
        
        return createHash('sha256')
            .update(instructionData + Date.now())
            .digest('hex');
    }

    async updateSettlementCycle(cycleId, status, results = {}) {
        const updateFields = ['status = ?', 'endTime = CURRENT_TIMESTAMP'];
        const params = [status];

        if (status === 'completed') {
            updateFields.push('settledInstructions = ?');
            updateFields.push('totalAmount = ?');
            updateFields.push('nettingEfficiency = ?');
            params.push(results.totalAmount, results.totalAmount, results.nettingEfficiency);
        }

        params.push(cycleId);
        await this.db.run(`UPDATE settlement_cycles SET ${updateFields.join(', ')} WHERE id = ?`, params);
    }

    async updateInstructionStatus(instructionId, status, cycleId = null, errorMessage = null) {
        const updateFields = ['status = ?'];
        const params = [status];

        if (cycleId) {
            updateFields.push('settlementHash = ?');
            params.push(cycleId);
        }
        if (status === 'settled') {
            updateFields.push('settledAt = CURRENT_TIMESTAMP');
        }
        if (errorMessage) {
            updateFields.push('errorMessage = ?');
            params.push(errorMessage);
        }

        params.push(instructionId);
        await this.db.run(`UPDATE settlement_instructions SET ${updateFields.join(', ')} WHERE id = ?`, params);
    }

    async finalizeSettlement(instruction) {
        await this.releaseCollateral(instruction.fromParty, instruction.amount * this.config.collateralRequirements);
        await this.updateRiskExposureAfterSettlement(instruction);
    }

    async releaseCollateral(party, amount) {
        await this.db.run(`
            UPDATE collateral_accounts 
            SET usedCollateral = usedCollateral - ?, 
                availableCollateral = availableCollateral + ?,
                lastCollateralUpdate = CURRENT_TIMESTAMP
            WHERE party = ?
        `, [amount, amount, party]);
    }

    async updateRiskExposureAfterSettlement(instruction) {
        const exposureId = `${instruction.fromParty}_${instruction.toParty}_${instruction.asset}_${instruction.currency}`;
        const currentExposure = this.counterpartyRisk.get(exposureId) || 0;
        const newExposure = Math.max(0, currentExposure - instruction.amount);

        this.counterpartyRisk.set(exposureId, newExposure);

        await this.db.run(`
            UPDATE risk_exposures 
            SET exposureAmount = ?, lastUpdated = CURRENT_TIMESTAMP
            WHERE party = ? AND counterparty = ? AND asset = ? AND currency = ?
        `, [newExposure, instruction.fromParty, instruction.toParty, instruction.asset, instruction.currency]);
    }

    calculateSettlementFees(instructions) {
        const baseFee = 0.5;
        const percentageFee = 0.001;
        
        return instructions.reduce((total, inst) => {
            return total + baseFee + (inst.amount * percentageFee);
        }, 0);
    }

    async getSettlementStats(timeframe = '24h') {
        if (!this.initialized) await this.initialize();
        
        const timeFilter = this.getTimeFilter(timeframe);
        const stats = await this.db.all(`
            SELECT 
                COUNT(*) as totalInstructions,
                SUM(amount) as totalVolume,
                AVG(amount) as averageAmount,
                COUNT(DISTINCT fromParty) as uniqueParties,
                SUM(CASE WHEN nettingApplied = 1 THEN nettingAmount ELSE 0 END) as nettingSavings
            FROM settlement_instructions 
            WHERE createdAt >= ? AND status = 'settled'
        `, [timeFilter]);

        return stats[0] || {};
    }

    async getRiskDashboard() {
        if (!this.initialized) await this.initialize();
        
        const topExposures = await this.db.all(`
            SELECT party, counterparty, currency, exposureAmount
            FROM risk_exposures 
            ORDER BY exposureAmount DESC 
            LIMIT 20
        `);

        const collateralSummary = await this.db.get(`
            SELECT 
                SUM(totalCollateral) as totalCollateral,
                SUM(usedCollateral) as usedCollateral,
                SUM(availableCollateral) as availableCollateral,
                COUNT(*) as totalParties
            FROM collateral_accounts
        `);

        const nettingEfficiency = await this.db.get(`
            SELECT AVG(nettingEfficiency) as avgNettingEfficiency
            FROM settlement_cycles 
            WHERE status = 'completed' AND createdAt >= datetime('now', '-24 hours')
        `);

        return {
            topExposures,
            collateralSummary,
            nettingEfficiency: nettingEfficiency?.avgNettingEfficiency || 0,
            riskLimits: this.config.riskLimits,
            timestamp: new Date()
        };
    }

    async addCollateral(party, amount, currency = 'USD') {
        if (!this.initialized) await this.initialize();
        
        await this.db.run(`
            INSERT OR REPLACE INTO collateral_accounts (party, totalCollateral, availableCollateral, collateralCurrency, lastCollateralUpdate)
            VALUES (?, COALESCE((SELECT totalCollateral FROM collateral_accounts WHERE party = ?), 0) + ?, 
                   COALESCE((SELECT availableCollateral FROM collateral_accounts WHERE party = ?), 0) + ?, ?, CURRENT_TIMESTAMP)
        `, [party, party, amount, party, amount, currency]);

        this.events.emit('collateralAdded', {
            party,
            amount,
            currency,
            timestamp: new Date()
        });
    }

    async getPartySettlementHistory(party, limit = 100) {
        if (!this.initialized) await this.initialize();
        
        return await this.db.all(`
            SELECT * FROM settlement_instructions 
            WHERE (fromParty = ? OR toParty = ?) 
            ORDER BY createdAt DESC 
            LIMIT ?
        `, [party, party, limit]);
    }

    async optimizeSettlementParameters() {
        if (!this.initialized) await this.initialize();

        const recentPerformance = await this.db.get(`
            SELECT 
                AVG(totalInstructions) as avgInstructions,
                AVG(nettingEfficiency) as avgNettingEfficiency,
                AVG(totalAmount) as avgAmount
            FROM settlement_cycles 
            WHERE createdAt >= datetime('now', '-1 hour')
        `);

        if (recentPerformance.avgInstructions > 50 && recentPerformance.avgNettingEfficiency < 0.3) {
            this.config.settlementInterval = Math.max(500, this.config.settlementInterval - 100);
        } else if (recentPerformance.avgInstructions < 10) {
            this.config.settlementInterval = Math.min(5000, this.config.settlementInterval + 500);
        }

        this.events.emit('parametersOptimized', {
            newSettlementInterval: this.config.settlementInterval,
            timestamp: new Date()
        });
    }
}

export default HighFrequencySettlement;
