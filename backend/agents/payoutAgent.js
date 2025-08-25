// backend/agents/payoutAgent.js
import { BrianNwaezikeChain } from '../blockchain/BrianNwaezikeChain.js';
import { QuantumShield } from 'quantum-resistant-crypto';
import { yourSQLite } from 'ariel-sqlite-engine';

export class PayoutAgent {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.blockchain = new BrianNwaezikeChain(config);
        this.quantumShield = new QuantumShield();
        this.initialized = false;
        this.totalPayouts = 0;
        this.totalRevenue = 0;
        this.db = null;
    }

    async initialize() {
        try {
            await this.blockchain.initialize();
            await this._initializeDatabase();
            this.initialized = true;
            this.logger.success('✅ Payout Agent initialized successfully');
            return true;
        } catch (error) {
            this.logger.error('Failed to initialize Payout Agent:', error);
            throw error;
        }
    }

    async _initializeDatabase() {
        try {
            // Initialize ArielSQLite database
            this.db = yourSQLite.createDatabase('./data/payout_agent.db');
            
            // Create revenue tracking table
            this.db.run(yourSQLite.optimizedQuery(`
                CREATE TABLE IF NOT EXISTS agent_revenue (
                    id TEXT PRIMARY KEY,
                    agent_name TEXT,
                    amount REAL,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    quantum_signature TEXT
                ) WITH OPTIMIZATION=QUANTUM_COMPRESSION
            `));
            
            // Create accumulated revenue table
            this.db.run(yourSQLite.optimizedQuery(`
                CREATE TABLE IF NOT EXISTS accumulated_revenue (
                    id TEXT PRIMARY KEY,
                    amount REAL,
                    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                    quantum_signature TEXT
                ) WITH OPTIMIZATION=QUANTUM_COMPRESSION
            `));
            
            // Create payout history table
            this.db.run(yourSQLite.optimizedQuery(`
                CREATE TABLE IF NOT EXISTS payout_history (
                    id TEXT PRIMARY KEY,
                    amount REAL,
                    transaction_hash TEXT,
                    status TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    quantum_signature TEXT
                ) WITH INDEX=QUANTUM_FAST_LOOKUP
            `));
            
            // Initialize accumulated revenue if not exists
            const existingAccumulated = await this.db.get(`
                SELECT amount FROM accumulated_revenue ORDER BY last_updated DESC LIMIT 1
            `);
            
            if (!existingAccumulated) {
                const initId = `accum_${this.quantumShield.randomBytes(16)}`;
                const quantumSig = this.quantumShield.createProof({ amount: 0 });
                
                this.db.run(`
                    INSERT INTO accumulated_revenue (id, amount, quantum_signature)
                    VALUES (?, ?, ?)
                `, [initId, 0, quantumSig]);
            }
            
            this.logger.success('✅ ArielSQLite database initialized successfully');
            
        } catch (error) {
            this.logger.error('Failed to initialize database:', error);
            throw error;
        }
    }

    async runPayoutCycle() {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            this.logger.info('🚀 Starting payout cycle...');
            
            // Aggregate actual revenue from all agents (excluding API Scout Agent)
            const revenue = await this._aggregateActualRevenue();
            
            if (revenue > 0) {
                this.totalRevenue += revenue;
                
                if (revenue >= this.config.PAYOUT_THRESHOLD_USD) {
                    const payoutResult = await this._processPayout(revenue);
                    this.totalPayouts += revenue;
                    
                    return {
                        status: 'success',
                        message: `Payout of $${revenue} processed successfully`,
                        transactionHash: payoutResult.transactionHash,
                        amount: revenue
                    };
                } else {
                    return {
                        status: 'success',
                        message: `Revenue ($${revenue}) below threshold ($${this.config.PAYOUT_THRESHOLD_USD}). Accumulating funds.`,
                        amount: revenue
                    };
                }
            } else {
                return {
                    status: 'success',
                    message: 'No revenue generated in this cycle. No payout needed.',
                    amount: 0
                };
            }
        } catch (error) {
            this.logger.error('Payout cycle failed:', error);
            return {
                status: 'error',
                message: `Payout failed: ${error.message}`,
                error: error.message
            };
        }
    }

    async _aggregateActualRevenue() {
        try {
            this.logger.info('💰 Aggregating revenue from revenue-generating agents...');
            
            let totalRevenue = 0;
            
            // Get revenue from all agents EXCEPT API Scout Agent
            const agentRevenues = await this.db.all(`
                SELECT agent_name, SUM(amount) as total 
                FROM agent_revenue 
                WHERE timestamp > datetime('now', '-1 hour')
                AND agent_name != 'APIScoutAgent'
                GROUP BY agent_name
            `);
            
            for (const row of agentRevenues) {
                totalRevenue += row.total;
                this.logger.info(`📊 ${row.agent_name} revenue: $${row.total}`);
            }
            
            // Get accumulated revenue from previous cycles
            const accumulatedRevenue = await this._getAccumulatedRevenue();
            totalRevenue += accumulatedRevenue;
            
            // Clear recent agent revenues (they've been accounted for)
            await this.db.run(`
                DELETE FROM agent_revenue 
                WHERE timestamp > datetime('now', '-1 hour')
                AND agent_name != 'APIScoutAgent'
            `);
            
            this.logger.success(`💰 Total revenue aggregated: $${totalRevenue}`);
            
            return totalRevenue;
            
        } catch (error) {
            this.logger.error('Revenue aggregation failed:', error);
            return 0;
        }
    }

    async _getAccumulatedRevenue() {
        try {
            const result = await this.db.get(`
                SELECT amount FROM accumulated_revenue ORDER BY last_updated DESC LIMIT 1
            `);
            return result ? result.amount : 0;
        } catch (error) {
            this.logger.warn('Failed to get accumulated revenue:', error);
            return 0;
        }
    }

    async _processPayout(amount) {
        try {
            this.logger.info(`💸 Processing payout of $${amount} to company wallet...`);
            
            // Process payout through BrianNwaezikeChain
            const payoutResult = await this.blockchain.processRevenuePayout(
                this.config.COMPANY_WALLET_ADDRESS,
                amount,
                'USD',
                JSON.stringify({
                    type: 'revenue_payout',
                    amount: amount,
                    timestamp: new Date().toISOString(),
                    source: 'autonomous_revenue_system'
                })
            );

            if (payoutResult.success) {
                this.logger.success(`✅ Payout successful: $${amount} USD`);
                
                // Record the payout in database
                await this._recordPayout(amount, payoutResult.transactionId);
                
                return {
                    success: true,
                    transactionHash: payoutResult.transactionId,
                    amount: amount
                };
            } else {
                // If payout fails, accumulate the revenue for next cycle
                await this._accumulateRevenue(amount);
                throw new Error(`Blockchain payout failed: ${payoutResult.error}`);
            }
        } catch (error) {
            this.logger.error('Payout processing failed:', error);
            
            // Accumulate the revenue for next cycle if payout fails
            await this._accumulateRevenue(amount);
            
            throw error;
        }
    }

    async _accumulateRevenue(amount) {
        try {
            const currentAccumulated = await this._getAccumulatedRevenue();
            const newAccumulated = currentAccumulated + amount;
            
            const accumId = `accum_${this.quantumShield.randomBytes(16)}`;
            const quantumSig = this.quantumShield.createProof({ amount: newAccumulated });
            
            await this.db.run(`
                INSERT INTO accumulated_revenue (id, amount, quantum_signature)
                VALUES (?, ?, ?)
            `, [accumId, newAccumulated, quantumSig]);
            
            this.logger.info(`💰 Accumulated revenue: $${newAccumulated}`);
        } catch (error) {
            this.logger.error('Failed to accumulate revenue:', error);
        }
    }

    async _recordPayout(amount, transactionHash) {
        try {
            const payoutId = `payout_${this.quantumShield.randomBytes(16)}`;
            const quantumSig = this.quantumShield.createProof({
                amount: amount,
                transactionHash: transactionHash
            });
            
            await this.db.run(`
                INSERT INTO payout_history (id, amount, transaction_hash, status, quantum_signature)
                VALUES (?, ?, ?, ?, ?)
            `, [payoutId, amount, transactionHash, 'completed', quantumSig]);
            
        } catch (error) {
            this.logger.warn('Failed to record payout:', error);
        }
    }

    async getPayoutHistory(limit = 10) {
        try {
            const history = await this.db.all(`
                SELECT amount, transaction_hash, status, timestamp 
                FROM payout_history 
                ORDER BY timestamp DESC 
                LIMIT ?
            `, [limit]);
            
            return history;
        } catch (error) {
            this.logger.error('Failed to get payout history:', error);
            return [];
        }
    }

    // Method for other agents to report revenue
    async reportRevenue(agentName, amount) {
        // Skip revenue reporting for API Scout Agent since it's not a revenue agent
        if (agentName === 'APIScoutAgent') {
            this.logger.info(`⚠️ Skipping revenue report for APIScoutAgent (support agent, not revenue agent)`);
            return;
        }
        
        try {
            const revenueId = `rev_${this.quantumShield.randomBytes(16)}`;
            const quantumSig = this.quantumShield.createProof({
                agent: agentName,
                amount: amount,
                timestamp: new Date().toISOString()
            });
            
            await this.db.run(`
                INSERT INTO agent_revenue (id, agent_name, amount, quantum_signature)
                VALUES (?, ?, ?, ?)
            `, [revenueId, agentName, amount, quantumSig]);
            
            this.logger.info(`📊 ${agentName} reported revenue: $${amount}`);
            
        } catch (error) {
            this.logger.error(`Failed to report revenue for ${agentName}:`, error);
        }
    }

    // Get revenue statistics (excluding API Scout Agent)
    async getRevenueStats() {
        try {
            const stats = await this.db.all(`
                SELECT 
                    agent_name,
                    SUM(amount) as total_revenue,
                    COUNT(*) as transaction_count,
                    MAX(timestamp) as last_transaction
                FROM agent_revenue 
                WHERE agent_name != 'APIScoutAgent'
                GROUP BY agent_name
                ORDER BY total_revenue DESC
            `);
            
            return stats;
        } catch (error) {
            this.logger.error('Failed to get revenue stats:', error);
            return [];
        }
    }

    getStatus() {
        return {
            initialized: this.initialized,
            totalPayouts: this.totalPayouts,
            totalRevenue: this.totalRevenue,
            payoutThreshold: this.config.PAYOUT_THRESHOLD_USD,
            lastActivity: new Date().toISOString(),
            blockchainConnected: this.blockchain.isConnected(),
            databaseConnected: !!this.db
        };
    }

    // Cleanup method
    async cleanup() {
        try {
            if (this.db) {
                this.db.close();
            }
            await this.blockchain.cleanup();
        } catch (error) {
            this.logger.error('Cleanup failed:', error);
        }
    }
}

export default PayoutAgent;
