// scripts/quantum-entrypoint.js
import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import path from 'path';

console.log("🚀 QRAF v6 Live Boot: " + new Date());
console.log("🧠 Node: " + process.version);

const runScript = async (scriptContent, scriptName) => {
    try {
        const tempPath = path.join('/tmp', scriptName);
        await fs.writeFile(tempPath, scriptContent, { mode: 0o755 });
        const child = spawn('/bin/bash', [tempPath], { stdio: 'inherit' });
        return new Promise((resolve, reject) => {
            child.on('close', (code) => {
                if (code === 0) {
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

const main = async () => {
    try {
        // Run fix scripts immediately
        console.log("Executing dynamic startup scripts...");
        await runScript('#!/bin/bash\nmkdir -p data public', 'prepare-build.sh');
        await runScript('#!/bin/bash\n[ -f package.json ] && echo "Package OK" || exit 1', 'verify-docker-build.sh');
        await runScript('#!/bin/bash\nmkdir -p arielsql_suite backend config data public scripts', 'fix-structure.sh');
        await runScript('#!/bin/bash\nrm -rf node_modules/.cache || true', 'cleanup-conflicts.sh');
        console.log("✅ Dynamic scripts executed successfully.");

        // We assume all dependencies are installed in the build stage, eliminating the EACCES issue
        // The checks below are for logic validation, not installation
        console.log("Validating core dependencies...");
        try { await import('express'); console.log('✅ express'); } catch (e) { console.warn('⚠️ express not found.'); }
        try { await import('ethers'); console.log('✅ ethers'); } catch (e) { console.warn('⚠️ ethers not found.'); }
        // ... (and so on for all your dependencies)
        
        // Blockchain validation
        console.log("⛓️ Validating Ethereum Mainnet...");
        try {
            const { ethers } = await import('ethers');
            const provider = new ethers.providers.JsonRpcProvider(`https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`);
            const blockNumber = await provider.getBlockNumber();
            console.log("✅ Block: " + blockNumber);
        } catch (e) {
            console.error("Error validating blockchain:", e.message);
        }

        // The core fix: always start the server.js file
        console.log("🌠 Activating Live Revenue Server...");
        const server = await import('./live-revenue-server.js');

        // Check if the original main.js exists and run it as a child process if it's not the same as the server
        if (server.default) {
            console.log("✅ Live Revenue Server is running.");
            const mainJsPath = path.join(process.cwd(), 'arielsql_suite', 'main.js');
            try {
                // Launch the main.js logic as a separate process or in-memory
                const mainApp = spawn('node', [mainJsPath], { stdio: 'inherit' });
                mainApp.on('close', (code) => {
                    if (code !== 0) {
                        console.error(`Main application exited with code ${code}.`);
                    }
                });
            } catch (e) {
                console.warn(`Could not start arielsql_suite/main.js: ${e.message}`);
            }
        } else {
            console.error("⛔ Could not start live-revenue-server.js. Exiting.");
            process.exit(1);
        }

    } catch (e) {
        console.error("A critical error occurred during startup:", e.message);
        process.exit(1);
    }
};

main();
