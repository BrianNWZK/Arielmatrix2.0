// arielsql_suite/main.js
import { ServiceManager } from './serviceManager.js';

/**
 * Main entry point for the ArielSQL Alltimate Suite.
 * Initializes the ServiceManager and all its components.
 */
async function startArielSQLSuite() {
    console.log('🚀 Starting ArielSQL Ultimate Suite...');
    console.log('📦 Node.js version:', process.version);
    
    // Try to load environment variables
    let dotenvLoaded = false;
    try {
        const dotenv = await import('dotenv');
        dotenv.config();
        dotenvLoaded = true;
        console.log('✅ Environment variables loaded');
    } catch (error) {
        console.warn('⚠️ dotenv not available, using default environment');
    }

    // Try to load configuration
    let config = {};
    try {
        // Try multiple possible config locations
        const configPaths = [
            './config/bwaezi-config.js',
            '../config/bwaezi-config.js',
            '/app/config/bwaezi-config.js'
        ];
        
        for (const path of configPaths) {
            try {
                const configModule = await import(path);
                config = configModule.default || configModule;
                console.log(`✅ Configuration loaded from: ${path}`);
                break;
            } catch (e) {
                // Continue to next path
            }
        }
        
        if (Object.keys(config).length === 0) {
            console.warn('⚠️ No configuration file found, using defaults');
            config = getDefaultConfig();
        }
    } catch (error) {
        console.warn('⚠️ Failed to load configuration, using defaults:', error.message);
        config = getDefaultConfig();
    }

    const serviceManager = new ServiceManager(config);
    
    // Make the service manager globally accessible
    global.arielSQLServiceManager = serviceManager;

    try {
        await serviceManager.init();
        console.log("✅ ArielSQL Alltimate Suite started successfully");
        
        // Start health check endpoint
        startHealthServer();
        
    } catch (error) {
        console.error("❌ Failed to start ArielSQL Alltimate Suite:", error);
        
        // Attempt to gracefully close services if init fails
        try {
            await serviceManager.closeServices();
        } catch (closeError) {
            console.error("Error during shutdown:", closeError);
        }
        process.exit(1);
    }

    // Handle graceful shutdown
    setupGracefulShutdown(serviceManager);
}

function getDefaultConfig() {
    return {
        database: {
            path: process.env.DATABASE_PATH || './data/arielsql.db'
        },
        server: {
            port: process.env.PORT || 3000,
            host: process.env.HOST || '0.0.0.0'
        },
        blockchain: {
            ethereumRpc: process.env.ETHEREUM_RPC_URL || 'https://mainnet.infura.io/v3/',
            solanaRpc: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
        },
        // Add other default configuration values as needed
    };
}

function startHealthServer() {
    try {
        const http = require('http');
        const port = process.env.HEALTH_PORT || 8080;
        
        const server = http.createServer((req, res) => {
            if (req.url === '/health') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'healthy',
                    service: 'ArielSQL Ultimate',
                    timestamp: new Date().toISOString()
                }));
            } else {
                res.writeHead(404);
                res.end('Not found');
            }
        });

        server.listen(port, '0.0.0.0', () => {
            console.log(`🏥 Health server running on port ${port}`);
        });
    } catch (error) {
        console.warn('⚠️ Could not start health server:', error.message);
    }
}

function setupGracefulShutdown(serviceManager) {
    // Handle graceful shutdown
    const shutdown = async (signal) => {
        console.log(`\n${signal} received. Shutting down ArielSQL Alltimate Suite...`);
        
        try {
            await serviceManager.closeServices();
            console.log('✅ All services shut down gracefully');
            process.exit(0);
        } catch (error) {
            console.error('❌ Error during shutdown:', error);
            process.exit(1);
        }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGQUIT', () => shutdown('SIGQUIT'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
        console.error('💥 Uncaught Exception:', error);
        try {
            await serviceManager.closeServices();
        } catch (e) {
            console.error('Error during emergency shutdown:', e);
        }
        process.exit(1);
    });

    process.on('unhandledRejection', async (reason, promise) => {
        console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
        try {
            await serviceManager.closeServices();
        } catch (e) {
            console.error('Error during emergency shutdown:', e);
        }
        process.exit(1);
    });
}

// Start the ArielSQL Suite with error handling
startArielSQLSuite().catch(async (error) => {
    console.error('💥 Failed to start ArielSQL Suite:', error);
    
    // Try to close services if they were partially initialized
    if (global.arielSQLServiceManager) {
        try {
            await global.arielSQLServiceManager.closeServices();
        } catch (closeError) {
            console.error('Error during emergency shutdown:', closeError);
        }
    }
    
    process.exit(1);
});
