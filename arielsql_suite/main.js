// arielmatrix2.0/arielsql_suite/main.js
import { ServiceManager } from './serviceManager.js';
import bwaeziConfig from '../config/bwaezi-config.js';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * Main entry point for the ArielSQL Alltimate Suite.
 * Initializes the ServiceManager and all its components.
 */
async function startArielSQLSuite() {
    const serviceManager = new ServiceManager(bwaeziConfig);
    // Make the service manager globally accessible for other parts of ArielMatrix2.0
    global.arielSQLServiceManager = serviceManager;

    try {
        await serviceManager.init();
        console.log("ArielSQL Alltimate Suite started successfully and is ready.");
    } catch (error) {
        console.error("Failed to start ArielSQL Alltimate Suite:", error);
        // Attempt to gracefully close services if init fails
        if (global.arielSQLServiceManager) {
            await global.arielSQLServiceManager.closeServices();
        }
        process.exit(1); // Exit with an error code
    }

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log('SIGINT received. Shutting down ArielSQL Alltimate Suite...');
        if (global.arielSQLServiceManager) {
            await global.arielSQLServiceManager.closeServices();
        }
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        console.log('SIGTERM received. Shutting down ArielSQL Alltimate Suite...');
        if (global.arielSQLServiceManager) {
            await global.arielSQLServiceManager.closeServices();
        }
        process.exit(0);
    });
}

// Start the ArielSQL Suite
startArielSQLSuite();
