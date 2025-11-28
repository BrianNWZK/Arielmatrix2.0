// arielsql_suite/main.js - PRODUCTION FIXED SERVER
import express from 'express';
import cors from 'cors';
import { ProductionSovereignCore, SovereignError } from '../core/sovereign-brain.js';

// PRODUCTION CONFIG
const CONFIG = {
    PORT: process.env.PORT || 10000,
    RPC_URLS: ['https://eth.llamarpc.com', 'https://rpc.ankr.com/eth'],
    PRIVATE_KEY: process.env.PRIVATE_KEY,
    
    // Your actual deployed addresses
    SCW_ADDRESS: '0x5Ae673b4101c6FEC025C19215E1072C23Ec42A3C',
    BWAEZI_TOKEN: '0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da',
    EOA_ADDRESS: '0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA',
    UNISWAP_V3_ROUTER: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
    UNISWAP_V2_ROUTER: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
};

const app = express();
app.use(cors());
app.use(express.json());

// 🎯 SAFE INITIALIZATION
let sovereignCore;
let initializationError = null;

const initializeSovereignCore = async () => {
    try {
        console.log('🚀 Initializing Production Sovereign Core...');
        
        if (!CONFIG.PRIVATE_KEY) {
            throw new SovereignError('PRIVATE_KEY environment variable is required');
        }
        
        sovereignCore = new ProductionSovereignCore(CONFIG);
        console.log('✅ Production Sovereign Core Initialized Successfully');
        
        // Start revenue generation
        await sovereignCore.startRevenueGeneration();
        console.log('💰 Revenue Generation Engine Started');
        
        return true;
        
    } catch (error) {
        initializationError = error;
        console.error('❌ Initialization failed:', error.message);
        return false;
    }
};

// 📊 HEALTH CHECK ENDPOINT
app.get('/health', async (req, res) => {
    try {
        if (!sovereignCore) {
            return res.status(503).json({
                status: 'INITIALIZING',
                error: initializationError?.message || 'System starting up...',
                timestamp: new Date().toISOString()
            });
        }
        
        const health = await sovereignCore.healthCheck();
        res.json(health);
        
    } catch (error) {
        res.status(500).json({
            status: 'ERROR',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// 📈 REVENUE STATS ENDPOINT
app.get('/revenue-stats', (req, res) => {
    try {
        if (!sovereignCore) {
            return res.status(503).json({
                success: false,
                error: 'System initializing',
                timestamp: new Date().toISOString()
            });
        }
        
        const stats = sovereignCore.getStats();
        res.json({
            success: true,
            data: stats,
            infrastructure: {
                SCW: CONFIG.SCW_ADDRESS,
                BWAEZI: CONFIG.BWAEZI_TOKEN,
                status: 'LIVE_PRODUCTION'
            },
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// 🎯 MANUAL ARBITRAGE EXECUTION
app.post('/execute-arbitrage', async (req, res) => {
    try {
        if (!sovereignCore) {
            return res.status(503).json({
                success: false,
                error: 'System initializing'
            });
        }
        
        const result = await sovereignCore.findRealArbitrage();
        res.json({
            success: true,
            result: result,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// 🏠 ROOT ENDPOINT
app.get('/', (req, res) => {
    res.json({
        name: 'Sovereign MEV Brain',
        version: '2.0.0',
        status: sovereignCore ? 'ACTIVE' : 'INITIALIZING',
        endpoints: {
            health: '/health',
            stats: '/revenue-stats',
            arbitrage: '/execute-arbitrage (POST)'
        },
        timestamp: new Date().toISOString()
    });
});

// 🚀 START SERVER WITH GRACEFUL INITIALIZATION
const startServer = async () => {
    try {
        // Initialize core first
        const initialized = await initializeSovereignCore();
        
        if (!initialized) {
            console.log('⚠️ Starting server in degraded mode (core initialization failed)');
        }
        
        app.listen(CONFIG.PORT, () => {
            console.log('\n' + '='.repeat(60));
            console.log('🚀 SOVEREIGN MEV BRAIN - PRODUCTION SERVER');
            console.log(`🌐 Port: ${CONFIG.PORT}`);
            console.log(`📊 Health: http://localhost:${CONFIG.PORT}/health`);
            console.log(`💰 Stats: http://localhost:${CONFIG.PORT}/revenue-stats`);
            console.log('='.repeat(60) + '\n');
            
            if (!initialized) {
                console.log('❌ Core initialization failed - running in API-only mode');
                console.log('💡 Check PRIVATE_KEY environment variable and RPC endpoints');
            }
        });
        
    } catch (error) {
        console.error('❌ Server startup failed:', error.message);
        process.exit(1);
    }
};

// GRACEFUL SHUTDOWN
process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM - Shutting down gracefully...');
    if (sovereignCore && sovereignCore.provider) {
        sovereignCore.provider.removeAllListeners();
    }
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    // Continue running - system is resilient
});

process.on('unhandledRejection', (reason, promise) => {
    console.warn('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
    // Continue running - system is resilient
});

// 🚀 START THE SYSTEM
startServer();
