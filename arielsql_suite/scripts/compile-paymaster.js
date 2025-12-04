// scripts/compile-paymaster.js
import * as fs from 'fs';
import * as path from 'path';
import solc from 'solc';

// --- File Paths ---
// Path to your source contract
const contractSourcePath = path.resolve(process.cwd(), 'arielsql_suite/contracts/BWAEZIPaymaster.sol');

// Target directory and file name for the artifact (guaranteed path)
const artifactDir = path.resolve(process.cwd(), 'artifacts/arielsql_suite/contracts/BWAEZIPaymaster.sol');
const artifactFile = path.join(artifactDir, 'BWAEZIPaymaster.json');
const contractFileName = 'BWAEZIPaymaster.sol';
const contractName = 'BWAEZIPaymaster';

// --- Compilation Logic ---
try {
    const contractSource = fs.readFileSync(contractSourcePath, 'utf8');

    const input = {
        language: 'Solidity',
        sources: {
            [contractFileName]: {
                content: contractSource,
            },
        },
        settings: {
            outputSelection: {
                '*': {
                    '*': ['abi', 'evm.bytecode.object'],
                },
            },
            // Crucial: Remappings allow solc to find the imported files in node_modules
            remappings: [
                '@account-abstraction/contracts/=node_modules/@account-abstraction/contracts/',
                '@openzeppelin/contracts/=node_modules/@openzeppelin/contracts/'
            ],
            optimizer: {
                enabled: true,
                runs: 200
            }
        },
    };

    console.log('Starting direct Solidity compilation with solc...');
    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    
    // Check for compilation errors
    if (output.errors) {
        const compilationErrors = output.errors.filter(e => e.type === 'Error');
        if (compilationErrors.length > 0) {
            console.error('❌ Solidity Compilation Failed:');
            compilationErrors.forEach(err => console.error(err.formattedMessage));
            process.exit(1);
        }
    }

    const contract = output.contracts[contractFileName][contractName];

    const artifact = {
        abi: contract.abi,
        bytecode: '0x' + contract.evm.bytecode.object,
        contractName: contractName
    };

    // 1. Ensure the directory exists
    fs.mkdirSync(artifactDir, { recursive: true });

    // 2. Write the artifact file to the guaranteed location
    fs.writeFileSync(artifactFile, JSON.stringify(artifact, null, 2));

    console.log(`✅ Artifact successfully written to: ${artifactFile}`);

} catch (e) {
    console.error(`❌ Fatal error during compilation: ${e.message}`);
    process.exit(1);
}
