// arielsql_suite/scripts/compile-paymaster.js
import * as fs from 'fs';
import * as path from 'path';
import solc from 'solc';
import { fileURLToPath } from 'url';

// Resolve directory name for robust pathing in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- File Paths ---
const contractSourcePath = path.resolve(__dirname, '..', 'contracts', 'BWAEZIPaymaster.sol');
const ARTIFACT_ROOT_DIR = path.resolve(process.cwd(), 'artifacts');
const ARTIFACT_SUB_DIR = 'arielsql_suite/contracts/BWAEZIPaymaster.sol'; 
const artifactDir = path.join(ARTIFACT_ROOT_DIR, ARTIFACT_SUB_DIR);
const artifactFile = path.join(artifactDir, 'BWAEZIPaymaster.json');
const contractFileName = 'BWAEZIPaymaster.sol';
const contractName = 'BWAEZIPaymaster';


// CRITICAL FIX: The findImports callback function required by solc for resolving external dependencies
function findImports(relativePath) {
    const nodeModulesPath = path.resolve(process.cwd(), 'node_modules');
    let resolvedPath;

    // 1. Check for standard @dependency imports (OpenZeppelin, Account-Abstraction)
    if (relativePath.startsWith('@')) {
        resolvedPath = path.join(nodeModulesPath, relativePath);
    } 
    // 2. Fallback check for dependency paths that solc itself might try to resolve
    else if (relativePath.startsWith('node_modules/')) {
        // Correct the path if it already includes 'node_modules/'
        // Example: node_modules/@openzeppelin/... should be searched directly from the root
        resolvedPath = path.resolve(process.cwd(), relativePath);
    } 
    // 3. Fallback for relative local imports (not common for this type of dependency)
    else {
        // Attempt to find it relative to the contract source file
        resolvedPath = path.resolve(path.dirname(contractSourcePath), relativePath);
    }

    if (fs.existsSync(resolvedPath)) {
        console.log(`\t✅ Resolved import: ${relativePath} to ${resolvedPath}`);
        return { contents: fs.readFileSync(resolvedPath, 'utf8') };
    }
    
    console.log(`\t❌ Failed to resolve import: ${relativePath}`);
    return { error: `File not found: ${relativePath}` };
}


export async function compilePaymasterContract() {
    try {
        console.log('--- COMPILATION START (In-Process) ---');
        
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
            },
        };

        console.log('🛠️ Compiling contract with solc...');
        
        // CRITICAL FIX: The second argument is a dictionary containing the callback,
        // not just the function itself.
        const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports })); 
        
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

        // Create directory and write file
        fs.mkdirSync(artifactDir, { recursive: true });
        fs.writeFileSync(artifactFile, JSON.stringify(artifact, null, 2));
        console.log(`✅ Artifact successfully written to: ${artifactFile}`);
        console.log(`--- COMPILATION END (SUCCESS) ---`);
        
        return artifactFile; 

    } catch (e) {
        console.error(`\n❌ FATAL: Error in compilePaymasterContract:`, e.message);
        throw e;
    }
}
