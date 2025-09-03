/**
 * ArielSQL Server Entrypoint: A lightweight loader for the ServiceManager
 */

import { ServiceManager } from './serviceManager.js';
import 'dotenv/config'; // Loads environment variables from .env file

/**
 * Provides a default configuration object using environment variables.
 * This ensures the application can be configured without a separate config file.
 * @returns {object} The default application configuration.
 */
function getDefaultConfig() {
    return {
        database: {
            path: process.env.DATABASE_PATH,
            passphrase: process.env.DB_PASSPHRASE,
            litestream: true,
            s3Bucket: process.env.S3_BUCKET,
            s3AccessKey: process.env.S3_ACCESS_KEY,
            s3SecretKey: process.env.S3_SECRET_KEY,
        },
        server: {
            port: process.env.PORT || 1000,
            host: '0.0.0.0'
        },
        blockchain: {
            ethereumRpc: process.env.ETHEREUM_RPC_URL,
            solanaRpc: process.env.SOLANA_RPC_URL
        },
        // All other agent-specific configs from the old server.js
        PAYOUT_THRESHOLD_USD: process.env.PAYOUT_THRESHOLD_USD,
        COMPANY_WALLET_ADDRESS: process.env.COMPANY_WALLET_ADDRESS,
        COMPANY_WALLET_PRIVATE_KEY: process.env.COMPANY_WALLET_PRIVATE_KEY,
        GOOGLE_ADS_API_KEY: process.env.GOOGLE_ADS_API_KEY,
        META_ADS_API_KEY: process.env.META_ADS_API_KEY,
        NEWS_API_KEY: process.env.NEWS_API_KEY,
        STORE_URL: process.env.STORE_URL,
        STORE_KEY: process.env.STORE_KEY,
        STORE_SECRET: process.env.STORE_SECRET,
        ADMIN_SHOP_SECRET: process.env.ADMIN_SHOP_SECRET,
        CYCLE_INTERVAL: 600000, // 10 minutes
    };
}

/**
 * Main entry point to start the ArielSQL server and all its services.
 */
async function startServer() {
    console.log('🚀 Starting ArielSQL Server...');
    const config = getDefaultConfig();
    const serviceManager = new ServiceManager(config);

    try {
        // Initialize all core services and agents
        await serviceManager.init();

        // Start the HTTP and WebSocket servers
        serviceManager.startServer(config.server.port);

        console.log("✅ ArielSQL Alltimate Suite is now operational.");

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

    // Set up graceful shutdown handlers
    const shutdown = async (signal) => {
        console.log(`\n${signal} received. Shutting down...`);
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
}

// Start the server with error handling
startServer().catch(error => {
    console.error('💥 An unexpected error occurred during server startup:', error);
    process.exit(1);
});
