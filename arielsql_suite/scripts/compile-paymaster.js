// arielsql_suite/scripts/compile-paymaster.js
import * as fs from 'fs';
import * as path from 'path';
import solc from 'solc';

// --- File Paths ---
const contractSourcePath = path.resolve(process.cwd(), 'arielsql_suite/contracts/BWAEZIPaymaster.sol');

// === NEW SIMPLE ARTIFACT PATH ===
// We are forcing the artifact to be created right next to the deploy script.
const artifactDir = path.resolve(process.cwd(), 'arielsql_suite/scripts');
const artifactFile = path.join(artifactDir, 'BWAEZIPaymaster.json');
const contractFileName = 'BWAEZIPaymaster.sol';
const contractName = 'BWAEZIPaymaster';

// --- Compilation Logic ---
try {
    console.log('🔍 Checking contract source at:', contractSourcePath);
    
    if (!fs.existsSync(contractSourcePath)) {
        throw new Error(`Contract source not found at: ${contractSourcePath}`);
    }

    const contractSource = fs.readFileSync(contractSourcePath, 'utf8');
    console.log('📝 Contract source loaded successfully');

    const input = {
        language: 'Solidity',
        sources: {
            [contractFileName]: {
                content: contractSource,
            },
        },
        settings: {
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
            remappings: [
                '@account-abstraction/contracts/=node_modules/@account-abstraction/contracts/',
                '@openzeppelin/contracts/=node_modules/@openzeppelin/contracts/'
            ]
        },
    };

    console.log('🛠️ Compiling contract with solc...');
    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    
    // Check for compilation errors
    if (output.errors) {
        const compilationErrors = output.errors.filter(e => e.severity === 'error');
        const warnings = output.errors.filter(e => e.severity === 'warning');
        
        if (compilationErrors.length > 0) {
            console.error('❌ Solidity Compilation Failed:');
            compilationErrors.forEach(err => console.error(err.formattedMessage));
            process.exit(1);
        }
        
        if (warnings.length > 0) {
            console.warn('⚠️ Compilation Warnings:');
            warnings.forEach(warn => console.warn(warn.formattedMessage));
        }
    }

    if (!output.contracts || !output.contracts[contractFileName] || !output.contracts[contractFileName][contractName]) {
        throw new Error('Contract not found in compilation output. Check contract name matches file.');
    }

    const contract = output.contracts[contractFileName][contractName];

    const artifact = {
        abi: contract.abi,
        bytecode: '0x' + contract.evm.bytecode.object,
        deployedBytecode: '0x' + (contract.evm.deployedBytecode?.object || ''),
        contractName: contractName,
        sourceName: contractFileName
    };

    // Create directory if it doesn't exist
    fs.mkdirSync(artifactDir, { recursive: true });

    // Write artifact
    fs.writeFileSync(artifactFile, JSON.stringify(artifact, null, 2));
    console.log(`✅ Artifact successfully written to: ${artifactFile}`);
    console.log(`📦 Bytecode size: ${Math.floor(artifact.bytecode.length / 2)} bytes`);

} catch (e) {
    console.error(`❌ Fatal error during compilation:`, e.message);
    console.error(e.stack);
    process.exit(1);
}
