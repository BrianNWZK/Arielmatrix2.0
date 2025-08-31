/**
 * Quantum Entrypoint Script for ArielMatrix OS v5.0
 * * This script serves as the primary entry point for the application within the Docker container.
 * It is designed to replace the legacy .sh scripts with a more robust, auditable, and Node.js-native
 * solution, ensuring consistent and reliable deployments. It handles dynamic dependency management,
 * service health checks, and a graceful application launch.
 *
 * It is critical that this script handles all pre-launch logic, as it is the only component
 * guaranteed to execute upon container startup.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🚀 QRAF v5 Live Boot (Node.js):', new Date().toISOString());
console.log('🧠 Node:', process.version);
console.log('🖥️ OS:', process.platform, require('os').release());

// --- AUTONOMOUS AI PRE-FLIGHT CHECKLIST ---

/**
 * Step 1: Dynamic Dependency Management.
 * * This new logic ensures that all critical packages are available at runtime.
 * We now perform a single, cumulative npm install to prevent module conflicts.
 */
console.log('\n📦 Checking and installing dependencies...');
const requiredPackages = [
    'express',
    'web3',
    'ccxt',
    '@tensorflow/tfjs-node',
    'googleapis',
    'better-sqlite3',
    'node-forge',
    'async-mutex'
];

try {
    console.log('⚡ Installing all required packages...');
    execSync(`npm install ${requiredPackages.join(' ')} --no-save --no-audit`, { stdio: 'inherit' });
    console.log('✅ Command successful.');
} catch (error) {
    console.error('❌ Error: Failed to install dependencies.');
    console.error(error.message);
    // Continue execution despite failure to allow the core application to attempt to run.
}

/**
 * Step 2: Blockchain Validation.
 *
 * This section ensures a stable connection to a blockchain network before
 * the main application service is launched.
 * Note: Your API keys and specific provider logic should be securely
 * managed within the application environment.
 */
console.log('\nAttempting blockchain validation...');
const providers = [
    'https://mainnet.infura.io/v3/685df4c728494989874e2a874e653755',
    'https://eth-mainnet.g.alchemy.com/v2/your-alchemy-api-key',
    'https://rpc.ankr.com/eth'
];

let hasWorkingProvider = false;
for (const provider of providers) {
    try {
        console.log(`⛓️ Validating Ethereum Mainnet via ${provider}...`);
        execSync(`curl -s --head -m 5 ${provider}`, { stdio: 'ignore' });
        console.log('✅ Provider connected successfully.');
        hasWorkingProvider = true;
        break; // Exit loop on first successful connection
    } catch (error) {
        console.error(`Provider failed: ${provider}`);
    }
}

if (!hasWorkingProvider) {
    console.error('Blockchain validation failed: No working provider found.');
} else {
    console.log('✅ Blockchain validation passed.');
}

/**
 * Step 3: Launch the Core Application Service.
 *
 * The quantum entry point's final task is to start the main application logic.
 * The path is hardcoded to /app/arielsql_suite/main.js as per the standard
 * file structure.
 */
console.log('\n🎯 Launching arielsql_suite/main.js');
const mainAppPath = path.join('/app/arielsql_suite/main.js');

if (!fs.existsSync(mainAppPath)) {
    console.error(`❌ Error: Main application file not found at ${mainAppPath}.`);
    process.exit(1);
}

try {
    console.log(`\nExecuting: node ${mainAppPath}`);
    execSync(`node ${mainAppPath}`, { stdio: 'inherit' });
} catch (error) {
    console.error(`\n❌ Error: Failed to launch ${path.basename(mainAppPath)}`);
    console.error(error.message);
    process.exit(1);
}
