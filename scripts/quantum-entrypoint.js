const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

console.log("🚀 QRAF v5 Live Boot (Node.js): " + new Date().toISOString());
console.log("🧠 Node: " + process.version);
console.log("🖥️ OS: " + os.type() + " " + os.release());

// Helper function to safely execute shell commands
const runCommand = (command, errorMessage) => {
    try {
        console.log(`\nExecuting: ${command}`);
        execSync(command, { stdio: 'inherit' });
        console.log('✅ Command successful.');
    } catch (e) {
        console.error(`\n❌ Error: ${errorMessage}`);
        console.error(e.message);
        // We will proceed on non-critical errors.
    }
};

// Check for and install dependencies using a more robust method
const checkDependencies = async () => {
    const dependencies = [
        'express',
        'ethers',
        'web3',
        'ccxt',
        '@tensorflow/tfjs-node',
        'googleapis',
        'better-sqlite3',
        'node-forge',
        'async-mutex',
    ];

    console.log("\n📦 Checking and installing dependencies...");
    for (const dep of dependencies) {
        try {
            // Check if the dependency is resolvable, which means it's installed
            require.resolve(dep);
            console.log(`✅ ${dep} is installed.`);
        } catch (e) {
            console.error(`⚡ Installing ${dep}...`);
            // Use npm install --no-save in case it's a dev dependency
            runCommand(`npm install ${dep} --no-save --no-audit`, `Failed to install ${dep}`);
        }
    }
};

// Main function to run the application logic
const main = async () => {
    console.log("Ensuring all scripts are executable...");
    runCommand('chmod -R +x ./scripts/*.sh', 'Failed to set script permissions, proceeding...');

    // Dependency check
    await checkDependencies();

    // Enhanced blockchain validation (Node.js friendly)
    console.log("Attempting blockchain validation...");
    const blockchainFile = path.join(__dirname, '../backend/blockchain/BrianNwaezikeChain.js');
    if (fs.existsSync(blockchainFile)) {
        console.log("⛓️ Validating Ethereum Mainnet...");
        const infuraKey = process.env.INFURA_API_KEY;
        const alchemyKey = process.env.ALCHEMY_API_KEY;

        if (!infuraKey && !alchemyKey) {
            console.warn("⚠️ Warning: INFURA_API_KEY and ALCHEMY_API_KEY not set. Skipping blockchain validation.");
        } else {
            try {
                // This is a more robust way to check provider status without a shell command
                const { ethers } = require('ethers');
                const providers = [
                    infuraKey ? `https://mainnet.infura.io/v3/${infuraKey}` : null,
                    alchemyKey ? `https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}` : null,
                    'https://rpc.ankr.com/eth'
                ].filter(p => p);

                let provider;
                for (const url of providers) {
                    try {
                        provider = new ethers.providers.JsonRpcProvider(url);
                        await provider.getBlockNumber();
                        console.log(`✅ Blockchain provider is responsive at ${url}.`);
                        break;
                    } catch (e) {
                        console.error(`Provider failed: ${url}`);
                    }
                }
                if (!provider) {
                    console.error("Blockchain validation failed: No working provider found.");
                }
            } catch (e) {
                console.error("Blockchain validation failed with an error.", e);
            }
        }
    }

    // Run cleanup and setup scripts if they exist
    const tempScripts = ['prepare-build.sh', 'verify-docker-build.sh', 'fix-structure.sh', 'cleanup-conflicts.sh'];
    for (const script of tempScripts) {
        const scriptPath = path.join('/tmp', script);
        if (fs.existsSync(scriptPath)) {
            runCommand(`chmod +x ${scriptPath}`, `Failed to set permissions on ${scriptPath}`);
            runCommand(scriptPath, `Execution of ${script} failed.`);
        }
    }

    // Launch the core application
    const entryPoints = ["arielsql_suite/main.js", "server.js", "scripts/live-revenue-server.js"];
    let launched = false;
    for (const ep of entryPoints) {
        if (fs.existsSync(ep)) {
            console.log(`🎯 Launching ${ep}`);
            runCommand(`node ${ep}`, `Failed to launch ${ep}`);
            launched = true;
            // The script will now exit if the application fails, ensuring a proper error state.
            break;
        }
    }

    if (!launched) {
      console.error("❌ No primary entry point found. Exiting with error.");
      process.exit(1);
    }
};

main();
