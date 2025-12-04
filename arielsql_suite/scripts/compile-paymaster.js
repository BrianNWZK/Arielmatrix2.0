// arielsql_suite/scripts/compile-paymaster.js
import * as fs from 'fs';
import * as path from 'path';
import solc from 'solc';

// --- File Paths ---
const contractSourcePath = path.resolve(process.cwd(), 'arielsql_suite/contracts/BWAEZIPaymaster.sol');
// ARTIFACT LOCATION: Forced into the same folder as the deploy script.
const artifactDir = path.resolve(process.cwd(), 'arielsql_suite/scripts');
const artifactFile = path.join(artifactDir, 'BWAEZIPaymaster.json');
const contractFileName = 'BWAEZIPaymaster.sol';
const contractName = 'BWAEZIPaymaster';

// --- Compilation Logic ---
try {
    console.log('--- COMPILATION START ---');
    console.log('🔍 Checking contract source at:', contractSourcePath);
    
    // Explicit check for contract source file
    if (!fs.existsSync(contractSourcePath)) {
        throw new Error(`CONTRACT SOURCE MISSING! Expected: ${contractSourcePath}`);
    }

    const contractSource = fs.readFileSync(contractSourcePath, 'utf8');
    console.log('📝 Contract source loaded successfully. (File size:', contractSource.length, 'bytes)');

    const input = {
        language: 'Solidity',
        sources: {
            [contractFileName]: {
                content: contractSource,
            },
        },
        settings: {
            // Ensure optimization is aggressive
            viaIR: true,
            optimizer: {
                enabled: true,
                runs: 200,
                details: {
                    yul: true
                }
            },
            outputSelection: {
                '*': {
                    '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'],
                },
            },
            // CRITICAL: Remappings must be correct to find imports like @openzeppelin
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
            process.exit(1); // Exit with failure code if compilation failed
        }
    }

    if (!output.contracts || !output.contracts[contractFileName] || !output.contracts[contractFileName][contractName]) {
        throw new Error('CONTRACT NOT IN OUTPUT: Compilation succeeded but artifact for BWAEZIPaymaster was not generated.');
    }

    const contract = output.contracts[contractFileName][contractName];

    const artifact = {
        abi: contract.abi,
        bytecode: '0x' + contract.evm.bytecode.object,
        deployedBytecode: '0x' + (contract.evm.deployedBytecode?.object || ''),
        contractName: contractName,
        sourceName: contractFileName
    };

    // Create directory (scripts/ exists, but defensive check)
    fs.mkdirSync(artifactDir, { recursive: true });

    // Write artifact
    fs.writeFileSync(artifactFile, JSON.stringify(artifact, null, 2));
    console.log(`✅ Artifact successfully written to: ${artifactFile}`);
    console.log(`--- COMPILATION END (SUCCESS) ---\n`);

} catch (e) {
    console.error(`\n❌ FATAL: Error in compile-paymaster.js:`, e.message);
    console.error(`Check dependencies (solc) and remappings in the script.`);
    process.exit(1);
}
