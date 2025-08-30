import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import path from 'path';

console.log(`🚀 QRAF v6 Live Boot: ${new Date()}`);
console.log(`🧠 Node: ${process.version}`);
console.log(`🔧 SQLite: ${process.env.DATABASE_PATH || 'Ready'}`);

const runScript = async (scriptContent, scriptName) => {
    try {
        const tempPath = path.join('/tmp', scriptName);
        await fs.writeFile(tempPath, scriptContent, { mode: 0o755 });
        const child = spawn('/bin/bash', [tempPath], { stdio: 'inherit' });
        return new Promise((resolve, reject) => {
            child.on('close', (code) => {
                if (code === 0) {
                    console.log(`✅ ${scriptName} executed successfully`);
                    resolve();
                } else {
                    reject(new Error(`Script ${scriptName} failed with code ${code}`));
                }
            });
        });
    } catch (e) {
        console.error(`Error running script ${scriptName}:`, e.message);
        throw e;
    }
};

const validateDependency = async (dep) => {
    try {
        await import(dep);
        console.log(`✅ ${dep}`);
    } catch (e) {
        console.warn(`⚠️ ${dep} not found: ${e.message}`);
    }
};

const main = async () => {
    try {
        // Run fix scripts
        console.log("Executing dynamic startup scripts...");
        await runScript('#!/bin/bash\nmkdir -p data public', 'prepare-build.sh');
        await runScript('#!/bin/bash\n[ -f package.json ] && echo "Package OK" || exit 1', 'verify-docker-build.sh');
        await runScript('#!/bin/bash\nmkdir -p arielsql_suite backend config data public scripts', 'fix-structure.sh');
        await runScript('#!/bin/bash\nrm -rf node_modules/.cache || true', 'cleanup-conflicts.sh');
        console.log("✅ Dynamic scripts executed successfully.");

        // Validate dependencies (no runtime installs)
        console.log("Validating core dependencies...");
        await validateDependency('express');
        await validateDependency('ethers');
        await validateDependency('web3');
        await validateDependency('ccxt');
        await validateDependency('@tensorflow/tfjs-node');
        await validateDependency('googleapis');
        await validateDependency('better-sqlite3');
        await validateDependency('node-forge');
        await validateDependency('async-mutex');

        // Blockchain validation
        console.log("⛓️ Validating Ethereum Mainnet...");
        if (!process.env.INFURA_API_KEY && !process.env.ALCHEMY_API_KEY) {
            console.warn("⚠️ INFURA_API_KEY and ALCHEMY_API_KEY not set. Skipping blockchain validation.");
        } else {
            try {
                const { ethers } = await import('ethers');
                const providers = [
                    `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY || 'none'}`,
                    `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY || 'none'}`,
                    'https://rpc.ankr.com/eth'
                ];
                let provider;
                for (const url of providers) {
                    try {
                        provider = new ethers.providers.JsonRpcProvider(url);
                        await provider.getBlockNumber();
                        break;
                    } catch (e) {
                        console.error(`Provider failed: ${url}`);
                    }
                }
                if (provider) {
                    const blockNumber = await provider.getBlockNumber();
                    console.log(`✅ Block: ${blockNumber}`);
                } else {
                    console.error("Error: All providers failed.");
                }
            } catch (e) {
                console.error("Blockchain validation error:", e.message);
            }
        }

        // Start live-revenue-server.js to ensure port binding
        console.log("🌠 Activating Live Revenue Server...");
        try {
            await import('./live-revenue-server.js');
            console.log("✅ Live Revenue Server is running.");
        } catch (e) {
            console.error(`⛔ Failed to start live-revenue-server.js: ${e.message}`);
            process.exit(1);
        }

        // Run arielsql_suite/main.js as a child process
        const mainJsPath = path.join(process.cwd(), 'arielsql_suite', 'main.js');
        try {
            await fs.access(mainJsPath);
            console.log("🎯 Launching arielsql_suite/main.js as child process...");
            const mainApp = spawn('node', [mainJsPath], { stdio: 'inherit' });
            mainApp.on('close', (code) => {
                if (code !== 0) {
                    console.error(`Main application exited with code ${code}.`);
                }
            });
        } catch (e) {
            console.warn(`Could not start arielsql_suite/main.js: ${e.message}`);
        }
    } catch (e) {
        console.error("Critical error during startup:", e.message);
        process.exit(1);
    }
};

main();
