/**
 * ArielSQL Server Entrypoint: Loads ServiceManager and GraphQL Server
 */

import { ServiceManager } from './serviceManager.js';
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { typeDefs } from './graphql/schema.js';
import { resolvers } from './graphql/resolvers.js';
import 'dotenv/config'; // Loads environment variables from .env file

// backend/server.js
import path from 'path';
import { fileURLToPath } from 'url';
import ServiceManager from '../arielsql_suite/ServiceManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  dbPath: path.join(__dirname, '..', 'data', 'bwaezi.db'),
};

const serviceManager = new ServiceManager(config);

(async () => {
  try {
    await serviceManager.init();
    serviceManager.start(); // This will bind correctly to PORT
  } catch (err) {
    console.error('❌ Failed to start service manager:', err);
    process.exit(1);
  }
})();

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
            port: parseInt(process.env.PORT, 10) || 10000, // Default to 10000
            host: '0.0.0.0' // Bind to all interfaces
        },
        blockchain: {
            ethereumRpc: process.env.ETHEREUM_RPC_URL,
            solanaRpc: process.env.SOLANA_RPC_URL
        },
        PAYOUT_THRESHOLD_USD: process.env.PAYOUT_THRESHOLD_USD,
        COMPANY_WALLET_ADDRESS: process.env.COMPANY_WALLET_ADDRESS,
        COMPANY_WALLET_PRIVATE_KEY: process.env.COMPANY_WALLET_PRIVATE_KEY,
        NEWS_API_KEY: process.env.NEWS_API_KEY,
        STORE_URL: process.env.STORE_URL,
        STORE_KEY: process.env.STORE_KEY,
        STORE_SECRET: process.env.STORE_SECRET,
        ADMIN_SHOP_SECRET: process.env.ADMIN_SHOP_SECRET,
        CYCLE_INTERVAL: 600000, // 10 minutes
    };
}

async function startServer() {
    console.log('🚀 Starting ArielSQL Server...');
    const config = getDefaultConfig();
    const serviceManager = new ServiceManager(config);

    try {
        await serviceManager.init();

        // Start Apollo GraphQL Server
        const apolloServer = new ApolloServer({ typeDefs, resolvers });
        await startStandaloneServer(apolloServer, {
            listen: { port: config.server.port, host: config.server.host } // Bind to specified host and port
        });

        console.log("✅ ArielSQL Alltimate Suite is now operational.");
    } catch (error) {
        console.error("❌ Failed to start ArielSQL Alltimate Suite:", error);
        try {
            await serviceManager.closeServices();
        } catch (closeError) {
            console.error("Error during shutdown:", closeError);
        }
        process.exit(1);
    }

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

startServer().catch(error => {
    console.error('💥 An unexpected error occurred during server startup:', error);
    process.exit(1);
});
