import express from 'express';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import cors from 'cors';
import 'dotenv/config';

// Import blockchain modules only - DataAgent removed
import { createBrianNwaezikeChain, getInitializedChain, isChainInitialized } from './blockchain/BrianNwaezikeChain.js';
import { createDatabase } from './database/BrianNwaezikeDB.js';

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 10000;
const HOST = '0.0.0.0';

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Global instances - DataAgent removed
let blockchainInstance = null;

// Initialize core systems - DataAgent initialization removed
async function initializeCoreSystems() {
    console.log('🚀 Initializing ArielMatrix 2.0 Core Systems...');
    
    try {
        // Initialize blockchain only
        console.log('🔗 Initializing Bwaezi Blockchain...');
        // 🔴 CREDENTIALS FIX: Remove hardcoded placeholder chainId and contractAddress.
        // The BrianNwaezikeChain class now dynamically loads these from the working RPC.
        blockchainInstance = await createBrianNwaezikeChain({
            rpcUrl: 'https://rpc.winr.games', // Use working RPC directly for initialization
            network: 'mainnet'
        });
        
        console.log('✅ Blockchain initialized successfully');

        return true;
    } catch (error) {
        console.error('❌ Core system initialization failed:', error);
        return false;
    }
}

// 🌐 Public RPC Broadcast Endpoint - Enhanced with real blockchain data
app.get('/bwaezi-rpc', async (req, res) => {
    try {
        if (!blockchainInstance) {
            return res.status(503).json({
                status: 'ERROR',
                message: 'Blockchain service initializing',
                timestamp: new Date().toISOString()
            });
        }

        const credentials = await blockchainInstance.getRealCredentials();
        const status = await blockchainInstance.getStatus();
        
        res.json({
            status: 'LIVE',
            rpcUrl: 'https://arielmatrix2-0-t2hc.onrender.com/bwaezi-rpc',
            chainId: credentials.BWAEZI_CHAIN_ID,
            chainName: 'Bwaezi Mainnet',
            blockNumber: status.lastBlockNumber,
            gasPrice: status.gasPrice,
            health: status.connected ? 'HEALTHY' : 'UNHEALTHY',
            peerCount: status.metrics?.peerCount || 0,
            timestamp: new Date().toISOString(),
            version: 'ArielMatrix 2.0',
            networkId: 777777,
            nativeCurrency: {
                name: 'Bwaezi',
                symbol: 'BWAEZI',
                decimals: 18
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'ERROR',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// 🔍 Blockchain Status Endpoint
app.get('/blockchain-status', async (req, res) => {
    try {
        if (!blockchainInstance) {
            return res.status(503).json({
                status: 'INITIALIZING',
                message: 'Blockchain service starting up',
                timestamp: new Date().toISOString()
            });
        }

        const status = await blockchainInstance.getStatus();
        res.json({
            status: 'SUCCESS',
            data: status,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            status: 'ERROR',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// 📊 Data Agent Status Endpoint - Updated to handle DataAgent separately
app.get('/data-agent-status', async (req, res) => {
    try {
        // Dynamic import to avoid circular dependencies
        const { getStatus } = await import('./agents/dataAgent.js');
        const status = getStatus();
        
        res.json({
            status: 'SUCCESS',
            data: status,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({
            status: 'ERROR',
            message: 'Data Agent service not available: ' + error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// 🎯 Start Data Collection Endpoint - Updated for DataAgent
app.post('/start-data-collection', async (req, res) => {
    try {
        // Dynamic import to avoid circular dependencies
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
        
        res.json({
            status: 'SUCCESS',
            data: result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            status: 'ERROR',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// 💰 Revenue Analytics Endpoint - Updated for DataAgent
app.get('/revenue-analytics', async (req, res) => {
    try {
        // Dynamic import to avoid circular dependencies
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
        
        const timeframe = req.query.timeframe || '7 days';
        const stats = await dataAgent.getDataCollectionStats(timeframe);
        const revenue = await dataAgent.getRevenueAnalytics(timeframe);
        
        res.json({
            status: 'SUCCESS',
            data: {
                timeframe,
                collectionStats: stats,
                revenueAnalytics: revenue,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'ERROR',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// 🔧 Health Check Endpoint - Simplified without DataAgent dependency
app.get('/health', async (req, res) => {
    const health = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        version: 'ArielMatrix 2.0',
        services: {
            blockchain: !!blockchainInstance && blockchainInstance.isConnected,
            server: true
        },
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development'
    };

    // Check Data Agent status separately without blocking
    try {
        const { getStatus } = await import('./agents/dataAgent.js');
        const dataAgentStatus = getStatus();
        health.services.dataAgent = dataAgentStatus.lastStatus !== 'error';
    } catch (error) {
        health.services.dataAgent = false;
        health.dataAgentError = error.message;
    }

    res.json(health);
});

// 🏠 Root Endpoint
app.get('/', (req, res) => {
    res.json({
        message: '🚀 ArielMatrix 2.0 - Global Enterprise Blockchain Gateway',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        endpoints: {
            rpc: '/bwaezi-rpc',
            status: '/blockchain-status',
            data: '/data-agent-status',
            health: '/health',
            revenue: '/revenue-analytics'
        },
        documentation: 'https://github.com/arielmatrix/arielmatrix2.0'
    });
});

// Simple GraphQL setup
const typeDefs = `#graphql
    type Query {
        health: String
        blockchainStatus: String
    }
`;

const resolvers = {
    Query: {
        health: () => 'OK',
        blockchainStatus: () => blockchainInstance ? 'CONNECTED' : 'DISCONNECTED'
    }
};

// Initialize and start server
async function startServer() {
    try {
        console.log('🚀 Starting ArielMatrix 2.0 Server...');
        
        // Initialize core systems (blockchain only)
        const coreInitialized = await initializeCoreSystems();
        if (!coreInitialized) {
            console.error('❌ Failed to initialize core systems');
            process.exit(1);
        }

        // Start Apollo Server
        const apolloServer = new ApolloServer({
            typeDefs,
            resolvers,
            introspection: true,
            playground: true
        });

        await apolloServer.start();
        
        // Apply GraphQL middleware
        app.use('/graphql', expressMiddleware(apolloServer, {
            context: async ({ req }) => ({ 
                blockchain: blockchainInstance
            })
        }));

        // Start HTTP server
        app.listen(PORT, HOST, () => {
            console.log(`✅ ArielMatrix 2.0 Server running at http://${HOST}:${PORT}`);
            console.log(`🌍 RPC Endpoint: http://${HOST}:${PORT}/bwaezi-rpc`);
            console.log(`📊 Status Dashboard: http://${HOST}:${PORT}/blockchain-status`);
            console.log(`🔧 Health Check: http://${HOST}:${PORT}/health`);
            console.log(`🎯 GraphQL: http://${HOST}:${PORT}/graphql`);
            console.log('🚀 Server fully operational and ready for production traffic');
        });

        // Graceful shutdown
        process.on('SIGINT', async () => {
            console.log('\n🔻 Shutting down gracefully...');
            if (blockchainInstance) {
                await blockchainInstance.disconnect();
            }
            console.log('✅ Graceful shutdown completed');
            process.exit(0);
        });

        process.on('SIGTERM', async () => {
            console.log('\n🔻 Received SIGTERM, shutting down...');
            if (blockchainInstance) {
                await blockchainInstance.disconnect();
            }
            console.log('✅ Graceful shutdown completed');
            process.exit(0);
        });

    } catch (error) {
        console.error('💀 Failed to start server:', error);
        process.exit(1);
    }
}

// Start the server
startServer();

export { app, blockchainInstance };
