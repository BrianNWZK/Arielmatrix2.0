/**
 * Backend Server Module - EnterpriseServer Class Only
 * 🚀 SINGLE EXPORT: Only exports EnterpriseServer class
 * 🔗 INTEGRATION READY: Designed for main.js integration
 * 📊 MODULAR: All functionality encapsulated in one class
 */

import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import cors from 'cors';
import express from 'express';
import 'dotenv/config';

// Import blockchain modules
import { BrianNwaezikeChain } from './blockchain/BrianNwaezikeChain.js';
import { createDatabase } from './database/BrianNwaezikeDB.js';

/**
 * EnterpriseServer - Main backend server class
 * Handles all backend functionality, RPC, blockchain, and analytics
 */
export class EnterpriseServer {
    constructor() {
        this.blockchainInstance = null;
        this.currentCredentials = null;
        this.backendInitialized = false;
        this.expressApp = null;
        this.graphQLServer = null;
    }

    // 🎯 SET CREDENTIALS FROM MAIN.JS
    setCredentials(credentials) {
        try {
            this.currentCredentials = credentials;
            console.log('✅ Backend credentials set from main.js');
            
            if (credentials) {
                console.log(`🔗 Chain ID: ${credentials.BWAEZI_CHAIN_ID || 'Not set'}`);
                console.log(`📝 Contract: ${credentials.BWAEZI_CONTRACT_ADDRESS || 'Not set'}`);
                console.log(`👑 God Mode: ${credentials.GOD_MODE_ACTIVE ? 'ACTIVE' : 'INACTIVE'}`);
            }
            
            return true;
        } catch (error) {
            console.error('❌ Failed to set backend credentials:', error);
            return false;
        }
    }

    // 🔗 CREATE BLOCKCHAIN INSTANCE
    async createBrianNwaezikeChain(config = {}) {
        try {
            console.log('🔗 Creating BrianNwaezikeChain instance...');
            const chain = new BrianNwaezikeChain({
                rpcUrl: config.rpcUrl || 'https://rpc.winr.games',
                network: config.network || 'mainnet',
                chainId: config.chainId || 777777,
                contractAddress: config.contractAddress || '0x00000000000000000000000000000000000a4b05',
                ...config
            });
            return chain;
        } catch (error) {
            console.error('❌ Failed to create BrianNwaezikeChain:', error);
            throw error;
        }
    }

    // 🚀 INITIALIZE ENTERPRISE SERVER
    async initialize() {
        console.log('🚀 Initializing Enterprise Server...');
        
        try {
            // Validate credentials first
            if (!this.currentCredentials) {
                console.warn('⚠️ No credentials set, using defaults');
                this.currentCredentials = {
                    BWAEZI_RPC_URL: 'https://rpc.winr.games',
                    BWAEZI_CHAIN_ID: 777777,
                    BWAEZI_CONTRACT_ADDRESS: '0x00000000000000000000000000000000000a4b05',
                    GOD_MODE_ACTIVE: false
                };
            }

            // Initialize blockchain
            if (!this.blockchainInstance) {
                console.log('🔗 Initializing Bwaezi Blockchain...');
                
                this.blockchainInstance = await this.createBrianNwaezikeChain({
                    rpcUrl: this.currentCredentials.BWAEZI_RPC_URL,
                    network: 'mainnet',
                    chainId: this.currentCredentials.BWAEZI_CHAIN_ID,
                    contractAddress: this.currentCredentials.BWAEZI_CONTRACT_ADDRESS
                });
                
                if (this.blockchainInstance && typeof this.blockchainInstance.init === 'function') {
                    await this.blockchainInstance.init();
                    console.log('✅ Blockchain instance initialized successfully');
                } else {
                    console.error('❌ Blockchain instance invalid or missing init method');
                    this.blockchainInstance = this.createFallbackBlockchainInstance();
                }
            }
            
            // Create Express app
            this.expressApp = this.createExpressApp();
            
            this.backendInitialized = true;
            console.log('✅ Enterprise Server initialized successfully');
            return true;
        } catch (error) {
            console.error('❌ Enterprise Server initialization failed:', error);
            this.backendInitialized = false;
            
            // Create fallback instances
            this.blockchainInstance = this.createFallbackBlockchainInstance();
            this.expressApp = this.createExpressApp();
            
            return false;
        }
    }

    // 🛡️ CREATE FALLBACK BLOCKCHAIN INSTANCE
    createFallbackBlockchainInstance() {
        console.log('🔄 Creating fallback blockchain instance...');
        
        return {
            isConnected: false,
            isFallback: true,
            getStatus: async () => ({
                connected: false,
                isFallback: true,
                lastBlockNumber: 0,
                gasPrice: '0',
                metrics: { peerCount: 0 },
                error: 'Using fallback instance - blockchain not available'
            }),
            disconnect: async () => {
                console.log('🔻 Fallback blockchain instance disconnected');
            },
            init: async () => {
                console.log('✅ Fallback blockchain instance initialized');
                return true;
            }
        };
    }

    // 🌐 CREATE EXPRESS APPLICATION
    createExpressApp() {
        const app = express();
        
        // Middleware
        app.use(cors());
        app.use(express.json({ limit: '50mb' }));
        app.use(express.urlencoded({ extended: true, limit: '50mb' }));
        
        // Security headers
        app.use((req, res, next) => {
            res.setHeader('X-Powered-By', 'Enterprise Server');
            res.setHeader('X-Enterprise-Server', 'Active');
            next();
        });
        
        // Register routes
        this.registerRoutes(app);
        
        return app;
    }

    // 📍 REGISTER ALL ROUTES
    registerRoutes(app) {
        // Root endpoint
        app.get('/', (req, res) => {
            res.json(this.getRootEndpointData());
        });
        
        // Health endpoint
        app.get('/health', async (req, res) => {
            try {
                const health = await this.getHealth();
                res.json(health);
            } catch (error) {
                res.status(500).json({
                    status: 'ERROR',
                    message: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });
        
        // RPC endpoint
        app.get('/bwaezi-rpc', async (req, res) => {
            try {
                const rpcData = await this.getBwaeziRPCData();
                res.json(rpcData);
            } catch (error) {
                res.status(500).json({
                    status: 'ERROR',
                    message: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });
        
        // Blockchain status
        app.get('/blockchain-status', async (req, res) => {
            try {
                const status = await this.getBlockchainStatus();
                res.json(status);
            } catch (error) {
                res.status(503).json({
                    status: 'ERROR',
                    message: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });
        
        // Data Agent status
        app.get('/data-agent-status', async (req, res) => {
            try {
                const status = await this.getDataAgentStatus();
                res.json(status);
            } catch (error) {
                res.status(503).json({
                    status: 'ERROR',
                    message: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });
        
        // Revenue analytics
        app.get('/revenue-analytics', async (req, res) => {
            try {
                const timeframe = req.query.timeframe || '7 days';
                const analytics = await this.getRevenueAnalytics(timeframe);
                res.json(analytics);
            } catch (error) {
                res.status(500).json({
                    status: 'ERROR',
                    message: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });
        
        // Diagnostic endpoint
        app.get('/diagnostic', async (req, res) => {
            try {
                const diagnostics = await this.getDiagnostics();
                res.json(diagnostics);
            } catch (error) {
                res.status(500).json({
                    error: 'Diagnostic failed',
                    message: error.message
                });
            }
        });
        
        console.log('✅ All routes registered successfully');
    }

    // 🌐 GET RPC DATA
    async getBwaeziRPCData() {
        try {
            if (!this.currentCredentials) {
                console.warn('⚠️ Using fallback credentials for RPC data');
                this.currentCredentials = {
                    BWAEZI_CHAIN_ID: 777777,
                    BWAEZI_CONTRACT_ADDRESS: '0x00000000000000000000000000000000000a4b05'
                };
            }

            let status = { 
                connected: false, 
                lastBlockNumber: 0, 
                gasPrice: '0',
                metrics: { peerCount: 0 }
            };
            
            if (this.blockchainInstance && typeof this.blockchainInstance.getStatus === 'function') {
                try {
                    status = await this.blockchainInstance.getStatus();
                } catch (blockchainError) {
                    console.warn('⚠️ Blockchain status check failed, using fallback data');
                }
            }
            
            return {
                status: status.connected ? 'LIVE' : 'DEGRADED',
                rpcUrl: 'https://arielmatrix2-0-t2hc.onrender.com/bwaezi-rpc',
                chainId: this.currentCredentials.BWAEZI_CHAIN_ID || 777777,
                chainName: 'BWAEZI Sovereign Chain',
                blockNumber: status.lastBlockNumber || 65880300,
                gasPrice: status.gasPrice || '0.01 Gwei',
                health: status.connected ? 'HEALTHY' : 'DEGRADED',
                peerCount: status.metrics?.peerCount || 0,
                timestamp: new Date().toISOString(),
                version: 'ArielSQL Ultimate Suite v4.4',
                networkId: 777777,
                nativeCurrency: {
                    name: 'Bwaezi',
                    symbol: 'bwzC',
                    decimals: 18
                },
                credentialSource: this.currentCredentials ? 'Centralized from main.js' : 'Fallback defaults',
                blockchainAvailable: !!this.blockchainInstance && !this.blockchainInstance.isFallback,
                usingFallback: this.blockchainInstance?.isFallback || false
            };
        } catch (error) {
            console.error('❌ RPC data error:', error);
            
            return {
                status: 'DEGRADED',
                rpcUrl: 'https://arielmatrix2-0-t2hc.onrender.com/bwaezi-rpc',
                chainId: 777777,
                chainName: 'BWAEZI Sovereign Chain',
                blockNumber: 65880300,
                gasPrice: '0.01 Gwei',
                health: 'DEGRADED',
                peerCount: 0,
                timestamp: new Date().toISOString(),
                version: 'ArielSQL Ultimate Suite v4.4',
                error: error.message,
                credentialSource: 'Error fallback'
            };
        }
    }

    // 🔗 GET BLOCKCHAIN STATUS
    async getBlockchainStatus() {
        try {
            if (!this.blockchainInstance) {
                throw new Error('Blockchain service starting up');
            }

            const status = await this.blockchainInstance.getStatus();
            return {
                status: 'SUCCESS',
                data: status,
                timestamp: new Date().toISOString(),
                credentialSource: 'Centralized from main.js'
            };
        } catch (error) {
            throw new Error(`Blockchain status error: ${error.message}`);
        }
    }

    // 📊 GET DATA AGENT STATUS
    async getDataAgentStatus() {
        try {
            const { getStatus } = await import('./agents/dataAgent.js');
            const status = getStatus();
            
            return {
                status: 'SUCCESS',
                data: status,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            throw new Error(`Data Agent status error: ${error.message}`);
        }
    }

    // 🚀 START DATA COLLECTION
    async startDataCollection() {
        try {
            const DataAgent = await import('./agents/dataAgent.js');
            
            const logger = {
                info: (...args) => console.log('📊 [DataAgent]', ...args),
                error: (...args) => console.error('❌ [DataAgent]', ...args),
                success: (...args) => console.log('✅ [DataAgent]', ...args),
                warn: (...args) => console.warn('⚠️ [DataAgent]', ...args)
            };
            
            const dataAgent = new DataAgent.default({
                ANALYTICS_WRITE_KEY: process.env.ANALYTICS_WRITE_KEY,
                COMPANY_WALLET_ADDRESS: process.env.COMPANY_WALLET_ADDRESS,
                COMPANY_WALLET_PRIVATE_KEY: process.env.COMPANY_WALLET_PRIVATE_KEY
            }, logger);
            
            await dataAgent.initialize();
            const result = await dataAgent.run();
            
            return {
                status: 'SUCCESS',
                data: result,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            throw new Error(`Data collection error: ${error.message}`);
        }
    }

    // 💰 GET REVENUE ANALYTICS
    async getRevenueAnalytics(timeframe = '7 days') {
        try {
            const DataAgent = await import('./agents/dataAgent.js');
            
            const logger = {
                info: (...args) => console.log('📊 [DataAgent]', ...args),
                error: (...args) => console.error('❌ [DataAgent]', ...args),
                success: (...args) => console.log('✅ [DataAgent]', ...args),
                warn: (...args) => console.warn('⚠️ [DataAgent]', ...args)
            };
            
            const dataAgent = new DataAgent.default({
                ANALYTICS_WRITE_KEY: process.env.ANALYTICS_WRITE_KEY,
                COMPANY_WALLET_ADDRESS: process.env.COMPANY_WALLET_ADDRESS,
                COMPANY_WALLET_PRIVATE_KEY: process.env.COMPANY_WALLET_PRIVATE_KEY
            }, logger);
            
            await dataAgent.initialize();
            
            const stats = await dataAgent.getDataCollectionStats(timeframe);
            const revenue = await dataAgent.getRevenueAnalytics(timeframe);
            
            return {
                status: 'SUCCESS',
                data: {
                    timeframe,
                    collectionStats: stats,
                    revenueAnalytics: revenue,
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            throw new Error(`Revenue analytics error: ${error.message}`);
        }
    }

    // 🏠 GET ROOT ENDPOINT DATA
    getRootEndpointData() {
        return {
            message: '🚀 ArielMatrix 2.0 - Global Enterprise Blockchain Gateway',
            version: '2.0.0',
            timestamp: new Date().toISOString(),
            endpoints: {
                rpc: '/bwaezi-rpc',
                status: '/blockchain-status',
                data: '/data-agent-status',
                health: '/health',
                revenue: '/revenue-analytics',
                diagnostic: '/diagnostic'
            },
            documentation: 'https://github.com/arielmatrix/arielmatrix2.0',
            server: 'EnterpriseServer',
            credentialSource: 'Centralized from main.js'
        };
    }

    // 🔧 GET HEALTH STATUS
    async getHealth() {
        const health = {
            status: 'OK',
            timestamp: new Date().toISOString(),
            version: 'ArielMatrix 2.0',
            backendInitialized: this.backendInitialized,
            services: {
                blockchain: !!this.blockchainInstance && (this.blockchainInstance.isConnected || this.blockchainInstance.isFallback),
                credentials: !!this.currentCredentials,
                server: true,
                enterpriseServer: true
            },
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            environment: process.env.NODE_ENV || 'development',
            credentialInfo: this.currentCredentials ? {
                hasCredentials: true,
                chainId: this.currentCredentials.BWAEZI_CHAIN_ID,
                godMode: this.currentCredentials.GOD_MODE_ACTIVE || false,
                source: 'Centralized from main.js'
            } : {
                hasCredentials: false,
                source: 'Fallback defaults'
            },
            blockchainInfo: {
                instanceExists: !!this.blockchainInstance,
                isFallback: this.blockchainInstance?.isFallback || false,
                isConnected: this.blockchainInstance?.isConnected || false
            }
        };

        // Check Data Agent status
        try {
            const { getStatus } = await import('./agents/dataAgent.js');
            const dataAgentStatus = getStatus();
            health.services.dataAgent = dataAgentStatus.lastStatus !== 'error';
            health.dataAgentStatus = dataAgentStatus.lastStatus || 'unknown';
        } catch (error) {
            health.services.dataAgent = false;
            health.dataAgentError = error.message;
            health.dataAgentStatus = 'error';
        }

        // Check blockchain connection status
        if (this.blockchainInstance && typeof this.blockchainInstance.getStatus === 'function') {
            try {
                const blockchainStatus = await this.blockchainInstance.getStatus();
                health.services.blockchain = blockchainStatus.connected;
                health.blockchainStatus = blockchainStatus;
            } catch (error) {
                health.services.blockchain = false;
                health.blockchainError = error.message;
            }
        }

        return health;
    }

    // 🔍 GET DIAGNOSTICS
    async getDiagnostics() {
        return {
            timestamp: new Date().toISOString(),
            process: {
                pid: process.pid,
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                version: process.version,
                platform: process.platform
            },
            environment: {
                NODE_ENV: process.env.NODE_ENV,
                PORT: process.env.PORT,
                hasDotEnv: !!process.env.ANALYTICS_WRITE_KEY
            },
            backend: {
                initialized: this.backendInitialized,
                blockchainInstance: !!this.blockchainInstance,
                credentials: !!this.currentCredentials,
                blockchainIsFallback: this.blockchainInstance?.isFallback || false
            },
            credentials: this.currentCredentials ? {
                chainId: this.currentCredentials.BWAEZI_CHAIN_ID,
                contract: this.currentCredentials.BWAEZI_CONTRACT_ADDRESS,
                godMode: this.currentCredentials.GOD_MODE_ACTIVE,
                source: 'main.js'
            } : 'No credentials set'
        };
    }

    // 🛑 STOP SERVER
    async stop() {
        console.log('\n🔻 Stopping Enterprise Server...');
        
        if (this.blockchainInstance) {
            await this.blockchainInstance.disconnect();
        }
        
        if (this.graphQLServer) {
            await this.graphQLServer.stop();
        }
        
        this.backendInitialized = false;
        console.log('✅ Enterprise Server stopped successfully');
    }

    // 🔄 GET EXPRESS APP FOR INTEGRATION
    getExpressApp() {
        return this.expressApp;
    }

    // 🔗 GET BLOCKCHAIN INSTANCE
    getBlockchainInstance() {
        return this.blockchainInstance;
    }

    // ✅ CHECK INITIALIZATION STATUS
    isInitialized() {
        return this.backendInitialized;
    }
}

// Graceful shutdown handlers
process.on('SIGINT', async () => {
    // Note: Individual instances should handle their own shutdown
    console.log('🔻 SIGINT received - EnterpriseServer should be stopped by main.js');
});

process.on('SIGTERM', async () => {
    console.log('🔻 SIGTERM received - EnterpriseServer should be stopped by main.js');
});

// ✅ SINGLE EXPORT - EnterpriseServer class only
export default EnterpriseServer;
