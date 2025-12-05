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
    if (importPath.startsWith('@')) {
        const resolved = path.join(process.cwd(), 'node_modules', importPath);
        if (fs.existsSync(resolved)) {
            console.log(`\t✅ Resolved import: ${importPath} to ${resolved}`);
            return { contents: fs.readFileSync(resolved, 'utf8') };
        }
    }
    const localPath = path.resolve(path.dirname(contractSourcePath), importPath);
    if (fs.existsSync(localPath)) {
        console.log(`\t✅ Resolved local import: ${importPath} to ${localPath}`);
        return { contents: fs.readFileSync(localPath, 'utf8') };
    }
    console.log(`\t❌ Failed to resolve import: ${importPath}`);
    return { error: `File not found: ${importPath}` };
}

export async function compilePaymasterContract() {
    console.log('--- Starting Paymaster contract compilation ---');
    console.log('🛠️ Compiling contract with solc...');

    if (!fs.existsSync(contractSourcePath)) {
        throw new Error(`Contract source missing: ${contractSourcePath}`);
    }

    const source = fs.readFileSync(contractSourcePath, 'utf8');

    const input = {
        language: 'Solidity',
        sources: { 'BWAEZIPaymaster.sol': { content: source } },
        settings: {
            viaIR: true,
            optimizer: { enabled: true, runs: 1000000, details: { yul: true } },
            outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'metadata'] } },
            evmVersion: 'paris'
        }
    };

    const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

    if (output.errors) {
        const errors = output.errors.filter(e => e.severity === 'error');
        if (errors.length > 0) {
            console.error('\n❌ FATAL: SOLC Compilation Errors Found:');
            errors.forEach(err => console.error(err.formattedMessage));
            process.exit(1);
        }
        // Warnings OK
        output.errors.filter(e => e.severity === 'warning').forEach(err => console.warn('Warning:', err.formattedMessage));
    }

    const contract = output.contracts['BWAEZIPaymaster.sol'].BWAEZIPaymaster;

    const artifact = {
        _format: 'hh-sol-artifact-1',
        contractName: 'BWAEZIPaymaster',
        sourceName: 'BWAEZIPaymaster.sol',
        abi: contract.abi,
        bytecode: '0x' + contract.evm.bytecode.object,
        deployedBytecode: '0x' + (contract.evm.deployedBytecode?.object || ''),
        linkReferences: {},
        deployedLinkReferences: {}
    };

    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(artifactFile, JSON.stringify(artifact, null, 2));
    console.log(`✅ Artifact written to: ${artifactFile}`);
    console.log('--- COMPILATION SUCCESS ---');
    return artifactFile;
}
