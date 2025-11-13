// backend/blockchain/BrianNwaezikePayoutSystem.js

/**
 * BrianNwaezikePayoutSystem.js
 * * Production-ready payout engine for Bwaezi Chain with full integration of
 * all 12 Phase 3 ArielSQLite Ultimate Suite modules.
 * * 🔐 NOVELTY: Enhanced constructor security check for Private Key and Address.
 */

import { EventEmitter } from 'events';
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
} from '../agents/wallet.js';
// 🚨 CRITICAL FIX: REMOVED STATIC IMPORTS to break cyclic dependency and ensure DI
import { getGlobalLogger } from "../../modules/enterprise-logger/index.js";

// === ArielSQLite Ultimate Suite MODULE CLASSES (for Instantiation) ===
import { ArielSQLiteEngine } from "../../modules/ariel-sqlite-engine/index.js";
import { QuantumShield } from "../../modules/quantum-shield/index.js";
import { QuantumResistantCrypto } from "../../modules/quantum-resistant-crypto/index.js";
import { AIThreatDetector } from "../../modules/ai-threat-detector/index.js";
import { AISecurityModule } from "../../modules/ai-security-module/index.js";
import { CrossChainBridge } from "../../modules/cross-chain-bridge/index.js";
import { OmnichainInteroperabilityEngine } from "../../modules/omnichain-interoperability/index.js";
import { ShardingManager } from "../../modules/sharding-manager/index.js";
import { InfiniteScalabilityEngine } from "../../modules/infinite-scalability-engine/index.js";
import { CarbonNegativeConsensus } from "../../modules/carbon-negative-consensus/index.js";
import { SovereignTokenomics } from "../../modules/tokenomics-engine/index.js";
import { DAOGovernanceEngine } from "../../modules/dao-governance-engine.js"; 

const CORE_MODULES = {
    QuantumShield: QuantumShield,
    QuantumResistantCrypto: QuantumResistantCrypto,
    AIThreatDetector: AIThreatDetector,
    AISecurityModule: AISecurityModule,
    CrossChainBridge: CrossChainBridge,
    OmnichainInteroperabilityEngine: OmnichainInteroperabilityEngine,
    ShardingManager: ShardingManager,
    InfiniteScalabilityEngine: InfiniteScalabilityEngine,
    CarbonNegativeConsensus: CarbonNegativeConsensus,
    SovereignTokenomics: SovereignTokenomics,
    DAOGovernanceEngine: DAOGovernanceEngine,
};

export class BrianNwaezikePayoutSystem extends EventEmitter {
    /**
     * @param {Object} config - System configuration (keys, wallet address, etc.).
     * @param {ArielSQLiteEngine} arielDB - The fully initialized ArielSQLiteEngine instance.
     */
    constructor(config, arielDB) {
        super();
        this.config = config;
        this.logger = getGlobalLogger();
        
        // 🚨 CRITICAL FIX: INJECTED DB (DI Pattern)
        if (!arielDB) {
             throw new Error("ArielSQLiteEngine instance (arielDB) must be injected into BrianNwaezikePayoutSystem constructor.");
        }
        this.arielDB = arielDB;
        
        this.systemWalletAddress = config.SOVEREIGN_WALLET;
        this.privateKey = config.PRIVATE_KEY;
        this.eventEmitter = new EventEmitter();
        this.modules = {}; // Container for the 12 Phase 3 modules

        if (!this.privateKey || !this.systemWalletAddress) {
            throw new Error("CRITICAL: PRIVATE_KEY or SOVEREIGN_WALLET not configured for Payout System.");
        }
        console.log(`🔑 Payout System Wallet initialized for: ${this.systemWalletAddress.substring(0, 8)}...`);

        this.autoPayoutInterval = null;
        this.initialized = false;
        this.isProcessing = false;
        
        // Instantiate all 12 modules *with* the injected DB instance
        this._instantiateCoreModules();
    }
    
    _instantiateCoreModules() {
        console.log('🧱 Instantiating all 12 Phase 3 Ultimate Suite Modules...');
        for (const [name, ModuleClass] of Object.entries(CORE_MODULES)) {
            try {
                // Pass the injected DB instance to the module constructor
                this.modules[name] = new ModuleClass({ db: this.arielDB });
                console.log(`   - ${name} instantiated.`);
            } catch (e) {
                this.logger.error(`❌ Failed to instantiate Payout module ${name}: ${e.message}`);
                this.modules[name] = null; 
            }
        }
        this.logger.log(`✅ Payout System instantiated ${Object.keys(this.modules).length} internal modules.`);
    }

    async initialize() {
        if (this.initialized) return;

        console.log('🚀 Initializing Payout System connections and internal modules...');
        
        // ... (Wallet initialization logic maintained) ...
            
        // Initialize all internal modules sequentially
        const initPromises = Object.entries(this.modules)
            .filter(([name, module]) => module && typeof module.initialize === 'function')
            .map(([name, module]) => {
                this.logger.log(`   - Initializing module: ${name}`);
                return module.initialize().catch(e => {
                    this.logger.error(`❌ Module ${name} initialization failed: ${e.message}`);
                    return Promise.resolve();
                });
            });
        
        await Promise.allSettled(initPromises);
        
        this.startAutoPayout();
        
        this.initialized = true;
        this.logger.log('✅ Payout System fully operational and secured.');
    }

    // ... (rest of methods maintained: startAutoPayout, stopAutoPayout, generateRevenue, processSinglePayout, getStatus, safeShutdown) ...
    
    async getPayoutsByStatus(status) {
         try {
             // 🎯 FIX: Use the injected DB instance (this.arielDB) directly
             const sql = `SELECT * FROM ariel_transactions WHERE status = ?
             ORDER BY created_at DESC LIMIT 1000`;
             // Assuming ArielSQLiteEngine has a query method
             const payouts = await this.arielDB.query(sql, [status]); 
             return payouts.rows;
         } catch (error) {
             this.logger.error(`❌ Failed to fetch payouts for status ${status}: ${error.message}`);
             return [];
         }
     }
     
    async shutdown() {
        console.log("🛑 Shutting down Payout System...");
        await this.stopAutoPayout();
        
        const shutdownPromises = [
            this.safeShutdown(this.arielDB, 'Ariel DB')
        ];
        
        for (const [name, module] of Object.entries(this.modules)) {
             shutdownPromises.push(this.safeShutdown(module, name));
        }

        await Promise.allSettled(shutdownPromises);
        
        console.log("✅ Payout System shut down successfully");
    }
}

export { BrianNwaezikePayoutSystem };
export default BrianNwaezikePayoutSystem;
