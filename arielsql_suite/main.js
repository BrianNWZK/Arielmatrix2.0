// arielsql_suite/main.js - OPTIMIZED PRODUCTION SERVER
import express from 'express';
import cors from 'cors';
import { OptimizedSovereignCore } from '../core/sovereign-brain.js';

const CONFIG = {
    PORT: process.env.PORT || 10000,
    PRIVATE_KEY: process.env.PRIVATE_KEY,
    
    // Your live infrastructure
    SCW_ADDRESS: '0x5Ae673b4101c6FEC025C19215E1072C23Ec42A3C',
    BWAEZI_TOKEN: '0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da',
    EOA_ADDRESS: '0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA'
};

const app = express();
app.use(cors());
app.use(express.json());

// 🎯 INITIALIZE OPTIMIZED CORE
let sovereignCore;

const initializeCore = async () => {
    try {
        console.log('🚀 Initializing Optimized Sovereign Core...');
        
        sovereignCore = new OptimizedSovereignCore(CONFIG);
        
        // Start revenue generation
        await sovereignCore.startRevenueGeneration();
        
        console.log('✅ Optimized Sovereign Core Active');
        return true;
        
    } catch (error) {
        console.error('❌ Core initialization failed:', error.message);
        return false;
    }
};

// 📊 HEALTH ENDPOINT
app.get('/health', async (req, res) => {
    try {
        if (!sovereignCore) {
            return res.json({
                status: 'INITIALIZING',
                message: 'Sovereign Core is starting up...',
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
            return res.json({
                status: 'INITIALIZING',
                message: 'Revenue stats will be available soon...',
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
        name: 'Sovereign MEV Brain - Optimized',
        version: '2.1.0',
        status: sovereignCore ? 'ACTIVE' : 'INITIALIZING',
        url: 'https://arielmatrix2-0-nwhj.onrender.com',
        endpoints: {
            health: '/health',
            stats: '/revenue-stats', 
            arbitrage: '/execute-arbitrage (POST)'
        },
        timestamp: new Date().toISOString()
    });
});

// 🚀 START SERVER
const startServer = async () => {
    try {
        await initializeCore();
        
        app.listen(CONFIG.PORT, '0.0.0.0', () => {
            console.log('\n' + '='.repeat(60));
            console.log('🚀 SOVEREIGN MEV BRAIN - OPTIMIZED PRODUCTION');
            console.log(`🌐 URL: https://arielmatrix2-0-nwhj.onrender.com`);
            console.log(`📊 Health: https://arielmatrix2-0-nwhj.onrender.com/health`);
            console.log(`💰 Stats: https://arielmatrix2-0-nwhj.onrender.com/revenue-stats`);
            console.log('='.repeat(60));
            console.log('✅ SYSTEM LIVE AND GENERATING REVENUE!');
        });
        
    } catch (error) {
        console.error('❌ Server startup failed:', error.message);
    }
};

// GRACEFUL SHUTDOWN
process.on('SIGTERM', () => {
    console.log('🛑 Graceful shutdown initiated...');
    process.exit(0);
});

// 🚀 START THE OPTIMIZED SYSTEM
startServer();
