// arielsql_suite/scripts/compile-paymaster.js
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import solc from 'solc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const contractSourcePath = path.resolve(__dirname, '..', 'contracts', 'BWAEZIPaymaster.sol');
const ARTIFACT_ROOT_DIR = path.resolve(process.cwd(), 'artifacts');
const artifactDir = path.join(ARTIFACT_ROOT_DIR, 'contracts');
const artifactFile = path.join(artifactDir, 'BWAEZIPaymaster.json');

function findImports(importPath) {
    // Support: @openzeppelin, @account-abstraction, etc.
    if (importPath.startsWith('@')) {
        const resolved = path.join(process.cwd(), 'node_modules', importPath);
        if (fs.existsSync(resolved)) {
            console.log(`Resolved import: ${importPath} → ${resolved}`);
            return { contents: fs.readFileSync(resolved, 'utf8') };
        }
    }

    // Fallback: local relative paths
    const localPath = path.resolve(path.dirname(contractSourcePath), importPath);
    if (fs.existsSync(localPath)) {
        console.log(`Resolved local import: ${importPath} → ${localPath}`);
        return { contents: fs.readFileSync(localPath, 'utf8') };
    }

    console.error(`Import failed: ${importPath}`);
    return { error: 'File not found: ' + importPath };
}

export async function compilePaymasterContract() {
    console.log('--- Starting Paymaster contract compilation ---');

    if (!fs.existsSync(contractSourcePath)) {
        throw new Error(`BWAEZIPaymaster.sol not found at: ${contractSourcePath}`);
    }

    const source = fs.readFileSync(contractSourcePath, 'utf8');

    const input = {
        language: 'Solidity',
        sources: {
            'BWAEZIPaymaster.sol': { content: source }
        },
        settings: {
            viaIR: true, // Required for complex contracts in 0.8.24+
            optimizer: {
                enabled: true,
                runs: 1000000,
                details: { yul: true }
            },
            outputSelection: {
                '*': {
                    '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode', 'metadata']
                }
            },
            evmVersion: 'paris'
        }
    };

    console.log('Compiling with solc...');
    const output = JSON.parse(
        solc.compile(JSON.stringify(input), { import: findImports })
    );

    // Print warnings but don't fail
    if (output.errors) {
        output.errors.forEach(err => {
            if (err.severity === 'error') {
                console.error('SOLC ERROR:', err.formattedMessage);
            } else {
                console.warn('SOLC WARNING:', err.formattedMessage);
            }
        });
        if (output.errors.some(e => e.severity === 'error')) {
            process.exit(1);
        }
    }

    const contract = output.contracts['BWAEZIPaymaster.sol'].BWAEZIPaymaster;

    const artifact = {
        _format: 'hh-sol-artifact-1',
        contractName: 'BWAEZIPaymaster',
        sourceName: 'contracts/BWAEZIPaymaster.sol',
        abi: contract.abi,
        bytecode: contract.evm.bytecode.object,
        deployedBytecode: contract.evm.deployedBytecode.object,
        linkReferences: {},
        deployedLinkReferences: {}
    };

    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(artifactFile, JSON.stringify(artifact, null, 2));

    console.log(`Artifact saved to: ${artifactFile`);
    console.log(`--- COMPILATION SUCCESSFUL ---`);
    return artifactFile;
}
