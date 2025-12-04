// arielsql_suite/scripts/compile-paymaster.js
import * as fs from 'fs';
import * as path from 'path';
import solc from 'solc';

// --- File Paths ---
const contractSourcePath = path.resolve(process.cwd(), 'arielsql_suite/contracts/BWAEZIPaymaster.sol');

// === ABSOLUTE PATH TO STANDARD ARTIFACT LOCATION ===
// This path: [PROJECT_ROOT]/artifacts/arielsql_suite/contracts/BWAEZIPaymaster.sol/
const ARTIFACT_ROOT_DIR = path.resolve(process.cwd(), 'artifacts');
const ARTIFACT_SUB_DIR = 'arielsql_suite/contracts/BWAEZIPaymaster.sol'; 
const artifactDir = path.join(ARTIFACT_ROOT_DIR, ARTIFACT_SUB_DIR);
const artifactFile = path.join(artifactDir, 'BWAEZIPaymaster.json');
const contractFileName = 'BWAEZIPaymaster.sol';
const contractName = 'BWAEZIPaymaster';

// --- Compilation Logic ---
try {
    console.log('--- COMPILATION START ---');
    console.log('📝 Contract source:', contractSourcePath);
    console.log('📦 Artifact target:', artifactFile);

    if (!fs.existsSync(contractSourcePath)) {
        throw new Error(`CONTRACT SOURCE MISSING! Expected: ${contractSourcePath}`);
    }

    const contractSource = fs.readFileSync(contractSourcePath, 'utf8');

    const input = {
        language: 'Solidity',
        sources: { [contractFileName]: { content: contractSource } },
        settings: {
            viaIR: true,
            optimizer: { enabled: true, runs: 200, details: { yul: true } },
            outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
            // CRITICAL: Remappings must be correct
            remappings: [
                '@account-abstraction/contracts/=node_modules/@account-abstraction/contracts/',
                '@openzeppelin/contracts/=node_modules/@openzeppelin/contracts/'
            ]
        },
    };

    console.log('🛠️ Compiling contract with solc...');
    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    
    // Detailed error/warning check
    if (output.errors) {
        const compilationErrors = output.errors.filter(e => e.severity === 'error');
        if (compilationErrors.length > 0) {
            console.error('\n❌ FATAL: SOLC Compilation Errors Found:');
            compilationErrors.forEach(err => console.error(err.formattedMessage));
            process.exit(1); 
        }
    }

    const contract = output.contracts[contractFileName][contractName];

    const artifact = {
        abi: contract.abi,
        bytecode: '0x' + contract.evm.bytecode.object,
        deployedBytecode: '0x' + (contract.evm.deployedBytecode?.object || ''),
        contractName: contractName,
        sourceName: contractFileName
    };

    // Ensure the full artifacts path exists
    fs.mkdirSync(artifactDir, { recursive: true });

    // Write artifact
    fs.writeFileSync(artifactFile, JSON.stringify(artifact, null, 2));
    console.log(`✅ Artifact successfully written to: ${artifactFile}`);
    console.log(`--- COMPILATION END (SUCCESS) ---\n`);

} catch (e) {
    console.error(`\n❌ FATAL: Error in compile-paymaster.js:`, e.message);
    process.exit(1);
}
