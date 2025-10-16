// modules/smart-contract-engine.js
import { EventEmitter } from 'events';
import { ArielSQLiteEngine } from './ariel-sqlite-engine/index.js';
import { SovereignRevenueEngine } from './sovereign-revenue-engine.js';
import { 
    BWAEZI_CHAIN,
    BWAEZI_SOVEREIGN_CONFIG,
    ConfigUtils 
} from '../config/bwaezi-config.js';
import { createHash, randomBytes } from 'crypto';

export class SmartContractEngine {
    constructor(config = {}) {
        this.config = {
            supportedLanguages: ['solidity', 'vyper', 'rust', 'move'],
            executionEnvironments: ['evm', 'wasm', 'native'],
            gasLimit: 30000000,
            maxContractSize: 24576,
            compilationTimeout: 30000,
            executionTimeout: 60000,
            ...config
        };
        this.contractRegistry = new Map();
        this.compilationCache = new Map();
        this.executionInstances = new Map();
        this.contractStates = new Map();
        this.db = new ArielSQLiteEngine({ path: './data/smart-contract-engine.db' });
        this.events = new EventEmitter();
        this.sovereignService = null;
        this.serviceId = null;
        this.initialized = false;
        this.compilerVersions = new Map();
    }

    async initialize() {
        if (this.initialized) return;
        
        await this.db.init();
        await this.createDatabaseTables();
        
        this.sovereignService = new SovereignRevenueEngine();
        await this.sovereignService.initialize();
        
        this.serviceId = await this.sovereignService.registerService({
            name: 'SmartContractEngine',
            description: 'Multi-language smart contract execution engine with advanced features',
            registrationFee: 20000,
            annualLicenseFee: 10000,
            revenueShare: 0.22,
            serviceType: 'smart_contract_infrastructure',
            dataPolicy: 'Contract bytecode and metadata only - No sensitive execution data storage',
            compliance: ['Smart Contract Security', 'Execution Integrity']
        });

        await this.loadCompilerVersions();
        await this.loadDeployedContracts();
        this.initialized = true;
        
        this.events.emit('initialized', {
            timestamp: Date.now(),
            supportedLanguages: this.config.supportedLanguages,
            executionEnvironments: this.config.executionEnvironments
        });
    }

    async createDatabaseTables() {
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS smart_contracts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                language TEXT NOT NULL,
                sourceCode TEXT NOT NULL,
                bytecode TEXT NOT NULL,
                abi TEXT NOT NULL,
                compilerVersion TEXT NOT NULL,
                deployer TEXT NOT NULL,
                contractAddress TEXT NOT NULL,
                deploymentHash TEXT NOT NULL,
                gasLimit INTEGER NOT NULL,
                isActive BOOLEAN DEFAULT true,
                deployedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                lastExecuted DATETIME
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS contract_executions (
                id TEXT PRIMARY KEY,
                contractId TEXT NOT NULL,
                functionName TEXT NOT NULL,
                parameters TEXT NOT NULL,
                caller TEXT NOT NULL,
                transactionHash TEXT NOT NULL,
                gasUsed INTEGER NOT NULL,
                executionResult TEXT,
                errorMessage TEXT,
                blockNumber INTEGER,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (contractId) REFERENCES smart_contracts (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS contract_states (
                id TEXT PRIMARY KEY,
                contractId TEXT NOT NULL,
                stateKey TEXT NOT NULL,
                stateValue TEXT NOT NULL,
                updatedBy TEXT NOT NULL,
                transactionHash TEXT NOT NULL,
                blockNumber INTEGER NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (contractId) REFERENCES smart_contracts (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS contract_events (
                id TEXT PRIMARY KEY,
                contractId TEXT NOT NULL,
                eventName TEXT NOT NULL,
                eventData TEXT NOT NULL,
                transactionHash TEXT NOT NULL,
                blockNumber INTEGER NOT NULL,
                logIndex INTEGER NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (contractId) REFERENCES smart_contracts (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS compiler_versions (
                id TEXT PRIMARY KEY,
                language TEXT NOT NULL,
                version TEXT NOT NULL,
                compilerPath TEXT NOT NULL,
                isActive BOOLEAN DEFAULT true,
                addedAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }

    async deployContract(contractConfig) {
        if (!this.initialized) await this.initialize();

        await this.validateContractConfig(contractConfig);

        const contractId = this.generateContractId();
        const contractAddress = this.generateContractAddress(contractConfig.deployer);
        
        try {
            const compilationResult = await this.compileContract(
                contractConfig.sourceCode,
                contractConfig.language,
                contractConfig.compilerVersion
            );

            await this.validateBytecode(compilationResult.bytecode);

            await this.db.run(`
                INSERT INTO smart_contracts (id, name, description, language, sourceCode, bytecode, abi, compilerVersion, deployer, contractAddress, deploymentHash, gasLimit)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                contractId,
                contractConfig.name,
                contractConfig.description,
                contractConfig.language,
                contractConfig.sourceCode,
                compilationResult.bytecode,
                JSON.stringify(compilationResult.abi),
                contractConfig.compilerVersion,
                contractConfig.deployer,
                contractAddress,
                this.generateDeploymentHash(contractConfig.deployer, compilationResult.bytecode),
                contractConfig.gasLimit || this.config.gasLimit
            ]);

            const contract = {
                id: contractId,
                ...contractConfig,
                bytecode: compilationResult.bytecode,
                abi: compilationResult.abi,
                contractAddress,
                isActive: true,
                deployedAt: new Date()
            };

            this.contractRegistry.set(contractId, contract);
            this.contractStates.set(contractId, new Map());

            if (this.sovereignService && this.serviceId) {
                await this.sovereignService.processRevenue(
                    this.serviceId,
                    50,
                    'contract_deployment',
                    'USD',
                    'bwaezi',
                    {
                        contractId,
                        contractName: contractConfig.name,
                        language: contractConfig.language,
                        contractSize: compilationResult.bytecode.length
                    }
                );
            }

            this.events.emit('contractDeployed', {
                contractId,
                contractAddress,
                name: contractConfig.name,
                language: contractConfig.language,
                deployer: contractConfig.deployer,
                timestamp: new Date()
            });

            return { contractId, contractAddress, deploymentHash: contract.deploymentHash };
        } catch (error) {
            throw new Error(`Contract deployment failed: ${error.message}`);
        }
    }

    async validateContractConfig(config) {
        if (!config.name || typeof config.name !== 'string') {
            throw new Error('Contract name is required and must be a string');
        }

        if (!config.sourceCode || typeof config.sourceCode !== 'string') {
            throw new Error('Contract source code is required');
        }

        if (!this.config.supportedLanguages.includes(config.language)) {
            throw new Error(`Unsupported language: ${config.language}. Supported: ${this.config.supportedLanguages.join(', ')}`);
        }

        if (config.sourceCode.length > 1000000) {
            throw new Error('Contract source code too large');
        }

        await this.validateContractSecurity(config.sourceCode, config.language);
    }

    async validateContractSecurity(sourceCode, language) {
        const securityPatterns = {
            solidity: [
                /\.call\.value\(/g,
                /\.transfer\(/g,
                /\.send\(/g,
                /suicide\(/g,
                /selfdestruct\(/g
            ],
            vyper: [
                /raw_call\(/g,
                /send\(/g
            ]
        };

        const patterns = securityPatterns[language] || [];
        for (const pattern of patterns) {
            if (pattern.test(sourceCode)) {
                throw new Error('Contract contains potentially unsafe operations');
            }
        }
    }

    async compileContract(sourceCode, language, compilerVersion) {
        const cacheKey = this.generateCompilationCacheKey(sourceCode, language, compilerVersion);
        
        if (this.compilationCache.has(cacheKey)) {
            return this.compilationCache.get(cacheKey);
        }

        const compiler = await this.getCompiler(language, compilerVersion);
        const startTime = Date.now();

        try {
            let compilationResult;
            
            switch (language) {
                case 'solidity':
                    compilationResult = await this.compileSolidity(sourceCode, compiler);
                    break;
                case 'vyper':
                    compilationResult = await this.compileVyper(sourceCode, compiler);
                    break;
                case 'rust':
                    compilationResult = await this.compileRust(sourceCode, compiler);
                    break;
                case 'move':
                    compilationResult = await this.compileMove(sourceCode, compiler);
                    break;
                default:
                    throw new Error(`Unsupported language for compilation: ${language}`);
            }

            if (Date.now() - startTime > this.config.compilationTimeout) {
                throw new Error('Compilation timeout exceeded');
            }

            this.compilationCache.set(cacheKey, compilationResult);
            return compilationResult;
        } catch (error) {
            throw new Error(`Compilation failed: ${error.message}`);
        }
    }

    async compileSolidity(sourceCode, compiler) {
        const solc = await import('solc');
        const input = {
            language: 'Solidity',
            sources: {
                'contract.sol': {
                    content: sourceCode
                }
            },
            settings: {
                outputSelection: {
                    '*': {
                        '*': ['*']
                    }
                }
            }
        };

        const output = JSON.parse(solc.compile(JSON.stringify(input)));
        
        if (output.errors) {
            const errors = output.errors.filter(error => error.severity === 'error');
            if (errors.length > 0) {
                throw new Error(errors.map(e => e.formattedMessage).join('\n'));
            }
        }

        const contractName = Object.keys(output.contracts['contract.sol'])[0];
        const contract = output.contracts['contract.sol'][contractName];

        return {
            bytecode: contract.evm.bytecode.object,
            abi: contract.abi,
            compilerVersion: compiler.version
        };
    }

    async compileVyper(sourceCode, compiler) {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        const fs = await import('fs');
        const path = await import('path');
        const { tmpdir } = await import('os');

        try {
            const tempDir = await fs.promises.mkdtemp(path.join(tmpdir(), 'vyper-compile-'));
            const vyperFile = path.join(tempDir, 'contract.vy');
            
            await fs.promises.writeFile(vyperFile, sourceCode, 'utf8');

            const compileCommand = `cd "${tempDir}" && vyper "${vyperFile}"`;
            const { stdout, stderr } = await execAsync(compileCommand, {
                timeout: this.config.compilationTimeout,
                maxBuffer: 10 * 1024 * 1024
            });

            if (stderr && stderr.trim()) {
                throw new Error(`Vyper compilation error: ${stderr}`);
            }

            const bytecode = stdout.trim();
            
            if (!bytecode.startsWith('0x')) {
                throw new Error('Invalid bytecode output from Vyper compiler');
            }

            await fs.promises.rm(tempDir, { recursive: true, force: true });

            return {
                bytecode: bytecode,
                abi: await this.parseVyperABI(sourceCode),
                compilerVersion: compiler.version
            };

        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error('Vyper compiler not found. Please install Vyper');
            }
            throw new Error(`Vyper compilation failed: ${error.message}`);
        }
    }

    async parseVyperABI(sourceCode) {
        const functions = [];
        const eventRegex = /event\s+(\w+)\s*\(([^)]*)\)/g;
        const functionRegex = /@(\w+)\s*\n\s*def\s+(\w+)\s*\(([^)]*)\)/g;
        
        let match;
        while ((match = eventRegex.exec(sourceCode)) !== null) {
            const [, name, params] = match;
            functions.push({
                type: 'event',
                name: name,
                inputs: this.parseVyperParams(params)
            });
        }

        while ((match = functionRegex.exec(sourceCode)) !== null) {
            const [, decorator, name, params] = match;
            functions.push({
                type: 'function',
                name: name,
                inputs: this.parseVyperParams(params),
                stateMutability: decorator === 'public' ? 'nonpayable' : 'view'
            });
        }

        return functions;
    }

    parseVyperParams(paramString) {
        if (!paramString.trim()) return [];
        
        return paramString.split(',')
            .map(param => param.trim())
            .filter(param => param)
            .map(param => {
                const [name, type] = param.split(':').map(s => s.trim());
                return {
                    name: name || '',
                    type: this.mapVyperType(type || '')
                };
            });
    }

    mapVyperType(vyperType) {
        const typeMap = {
            'uint256': 'uint256',
            'address': 'address',
            'bool': 'bool',
            'string': 'string',
            'bytes': 'bytes',
            'bytes32': 'bytes32'
        };
        
        return typeMap[vyperType] || 'bytes';
    }

    async compileRust(sourceCode, compiler) {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        const fs = await import('fs');
        const path = await import('path');
        const { tmpdir } = await import('os');

        try {
            const tempDir = await fs.promises.mkdtemp(path.join(tmpdir(), 'rust-compile-'));
            const projectDir = path.join(tempDir, 'contract');
            
            const cargoToml = `
[package]
name = "wasm_contract"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
`;

            await fs.promises.mkdir(path.join(projectDir, 'src'), { recursive: true });
            await fs.promises.writeFile(path.join(projectDir, 'Cargo.toml'), cargoToml, 'utf8');
            await fs.promises.writeFile(path.join(projectDir, 'src', 'lib.rs'), sourceCode, 'utf8');

            const compileCommand = `cd "${projectDir}" && cargo build --target wasm32-unknown-unknown --release`;
            
            const { stdout, stderr } = await execAsync(compileCommand, {
                timeout: this.config.compilationTimeout,
                maxBuffer: 10 * 1024 * 1024
            });

            if (stderr && stderr.includes('error:')) {
                throw new Error(`Rust compilation error: ${this.extractRustErrors(stderr)}`);
            }

            const wasmPath = path.join(projectDir, 'target', 'wasm32-unknown-unknown', 'release', 'wasm_contract.wasm');
            if (!fs.existsSync(wasmPath)) {
                throw new Error('WASM compilation failed - no output file generated');
            }

            const wasmBuffer = await fs.promises.readFile(wasmPath);
            const wasmHex = '0x' + wasmBuffer.toString('hex');

            const abi = this.generateRustABI(sourceCode);

            await fs.promises.rm(tempDir, { recursive: true, force: true });

            return {
                bytecode: wasmHex,
                abi: abi,
                compilerVersion: compiler.version,
                metadata: {
                    contractName: 'RustContract',
                    compiler: 'rustc',
                    target: 'wasm32-unknown-unknown',
                    sourceCodeHash: this.hashData(sourceCode)
                }
            };

        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error('Rust compiler not found. Please install Rust and wasm32 target');
            }
            throw new Error(`Rust compilation failed: ${error.message}`);
        }
    }

    extractRustErrors(stderr) {
        const errorLines = stderr.split('\n')
            .filter(line => line.includes('error:') || line.includes('-->'))
            .slice(0, 5);
        return errorLines.join('; ');
    }

    generateRustABI(sourceCode) {
        const functions = [];
        
        const functionRegex = /pub\s+extern\s+"C"\s+fn\s+(\w+)\s*\(([^)]*)\)\s*(->\s*([^{]+))?/g;
        let match;
        
        while ((match = functionRegex.exec(sourceCode)) !== null) {
            const [, name, params, , returnType] = match;
            
            const functionABI = {
                type: 'function',
                name: name,
                inputs: this.parseRustParams(params),
                outputs: returnType ? [{ type: this.mapRustType(returnType.trim()) }] : [],
                stateMutability: 'view'
            };
            
            functions.push(functionABI);
        }
        
        return functions;
    }

    parseRustParams(paramString) {
        if (!paramString.trim()) return [];
        
        return paramString.split(',')
            .map(param => param.trim())
            .filter(param => param)
            .map(param => {
                const [name, type] = param.split(':').map(s => s.trim());
                return {
                    name: name || '',
                    type: this.mapRustType(type || '')
                };
            });
    }

    mapRustType(rustType) {
        const typeMap = {
            'i32': 'int32',
            'i64': 'int64', 
            'u32': 'uint32',
            'u64': 'uint64',
            'bool': 'bool',
            'String': 'string',
            '&str': 'string',
            'Vec<u8>': 'bytes',
            '[u8; 32]': 'bytes32'
        };
        
        return typeMap[rustType] || 'bytes';
    }

    async compileMove(sourceCode, compiler) {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        const fs = await import('fs');
        const path = await import('path');
        const { tmpdir } = await import('os');

        try {
            const tempDir = await fs.promises.mkdtemp(path.join(tmpdir(), 'move-compile-'));
            const sourcesDir = path.join(tempDir, 'sources');
            
            await fs.promises.mkdir(sourcesDir, { recursive: true });
            
            const moveFile = path.join(sourcesDir, 'contract.move');
            await fs.promises.writeFile(moveFile, sourceCode, 'utf8');

            const moveToml = `
[package]
name = "contract"
version = "0.1.0"

[dependencies]
`;
            await fs.promises.writeFile(path.join(tempDir, 'Move.toml'), moveToml, 'utf8');

            const movePath = compiler.compilerPath || 'move';
            const compileCommand = `cd "${tempDir}" && "${movePath}" compile --save-metadata`;
            
            const { stdout, stderr } = await execAsync(compileCommand, {
                timeout: this.config.compilationTimeout,
                maxBuffer: 10 * 1024 * 1024
            });

            if (stderr && stderr.includes('error:')) {
                throw new Error(`Move compilation error: ${this.extractMoveErrors(stderr)}`);
            }

            const buildDir = path.join(tempDir, 'build', 'contract');
            if (!fs.existsSync(buildDir)) {
                throw new Error('Move compilation failed - no build directory');
            }

            const files = await fs.promises.readdir(buildDir);
            const bytecodeFiles = files.filter(f => f.endsWith('.mv'));
            
            if (bytecodeFiles.length === 0) {
                throw new Error('No bytecode files generated');
            }

            const bytecodePath = path.join(buildDir, bytecodeFiles[0]);
            const bytecodeBuffer = await fs.promises.readFile(bytecodePath);
            const bytecodeHex = '0x' + bytecodeBuffer.toString('hex');

            const abi = await this.parseMoveMetadata(buildDir);

            await fs.promises.rm(tempDir, { recursive: true, force: true });

            return {
                bytecode: bytecodeHex,
                abi: abi,
                compilerVersion: compiler.version,
                metadata: {
                    contractName: 'MoveContract',
                    compiler: 'move',
                    modules: bytecodeFiles,
                    sourceCodeHash: this.hashData(sourceCode)
                }
            };

        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error('Move compiler not found. Please install Move language tools');
            }
            throw new Error(`Move compilation failed: ${error.message}`);
        }
    }

    extractMoveErrors(stderr) {
        const errorLines = stderr.split('\n')
            .filter(line => line.includes('error:') || line.includes('-->'))
            .slice(0, 5);
        return errorLines.join('; ');
    }

    async parseMoveMetadata(buildDir) {
        try {
            const fs = await import('fs');
            const path = await import('path');
            
            const metadataPath = path.join(buildDir, 'package-metadata.bcs');
            if (!fs.existsSync(metadataPath)) {
                return [];
            }

            return [
                {
                    type: 'function',
                    name: 'init',
                    inputs: [],
                    outputs: [],
                    stateMutability: 'nonpayable'
                }
            ];
        } catch (error) {
            console.warn('Failed to parse Move metadata:', error);
            return [];
        }
    }

    async validateBytecode(bytecode) {
        if (!bytecode || typeof bytecode !== 'string') {
            throw new Error('Invalid bytecode format');
        }

        if (bytecode.length > this.config.maxContractSize * 2) {
            throw new Error(`Contract bytecode exceeds maximum size: ${this.config.maxContractSize} bytes`);
        }

        if (!/^0x[0-9a-fA-F]+$/.test(bytecode)) {
            throw new Error('Bytecode must be a valid hexadecimal string');
        }
    }

    async executeContractFunction(contractId, functionName, parameters, caller, value = '0') {
        if (!this.initialized) await this.initialize();

        const contract = this.contractRegistry.get(contractId);
        if (!contract) {
            throw new Error(`Contract not found: ${contractId}`);
        }

        const executionId = this.generateExecutionId();
        
        try {
            const startTime = Date.now();
            const executionResult = await this.executeFunction(
                contract,
                functionName,
                parameters,
                caller,
                value
            );

            const gasUsed = this.calculateGasUsed(contract, functionName, parameters);
            const executionTime = Date.now() - startTime;

            if (executionTime > this.config.executionTimeout) {
                throw new Error('Execution timeout exceeded');
            }

            await this.db.run(`
                INSERT INTO contract_executions (id, contractId, functionName, parameters, caller, transactionHash, gasUsed, executionResult)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                executionId,
                contractId,
                functionName,
                JSON.stringify(parameters),
                caller,
                this.generateTransactionHash(caller, contractId, functionName),
                gasUsed,
                JSON.stringify(executionResult)
            ]);

            await this.db.run(`
                UPDATE smart_contracts SET lastExecuted = CURRENT_TIMESTAMP WHERE id = ?
            `, [contractId]);

            if (this.sovereignService && this.serviceId) {
                await this.sovereignService.processRevenue(
                    this.serviceId,
                    gasUsed * 0.0000001,
                    'contract_execution',
                    'USD',
                    'bwaezi',
                    {
                        contractId,
                        functionName,
                        gasUsed,
                        executionTime
                    }
                );
            }

            this.events.emit('contractExecuted', {
                executionId,
                contractId,
                functionName,
                caller,
                gasUsed,
                executionTime,
                result: executionResult,
                timestamp: new Date()
            });

            return executionResult;
        } catch (error) {
            await this.recordExecutionError(executionId, contractId, functionName, parameters, caller, error.message);
            throw error;
        }
    }

    async executeFunction(contract, functionName, parameters, caller, value) {
        const functionAbi = contract.abi.find(item => 
            item.type === 'function' && item.name === functionName
        );

        if (!functionAbi) {
            throw new Error(`Function not found in contract ABI: ${functionName}`);
        }

        await this.validateFunctionParameters(functionAbi, parameters);

        switch (contract.language) {
            case 'solidity':
                return await this.executeEVMFunction(contract, functionName, parameters, caller, value);
            case 'rust':
                return await this.executeWASMFunction(contract, functionName, parameters, caller, value);
            case 'move':
                return await this.executeMoveFunction(contract, functionName, parameters, caller, value);
            default:
                throw new Error(`Unsupported execution language: ${contract.language}`);
        }
    }

    async executeEVMFunction(contract, functionName, parameters, caller, value) {
        const { VM } = await import('@ethereumjs/vm');
        const { Common, Chain, Hardfork } = await import('@ethereumjs/common');
        const { Address } = await import('@ethereumjs/util');
        const { Transaction } = await import('@ethereumjs/tx');

        try {
            const common = Common.custom(
                {
                    chainId: BWAEZI_CHAIN.CHAIN_ID,
                    networkId: 1,
                },
                {
                    baseChain: Chain.Mainnet,
                    hardfork: Hardfork.London,
                }
            );

            const vm = await VM.create({ common });

            const callerAddress = Address.fromString(caller);
            const contractAddress = Address.fromString(contract.contractAddress);

            const functionAbi = contract.abi.find(item => 
                item.type === 'function' && item.name === functionName
            );

            if (!functionAbi) {
                throw new Error(`Function ${functionName} not found in contract ABI`);
            }

            const { default: ethers } = await import('ethers');
            const iface = new ethers.Interface(contract.abi);
            const data = iface.encodeFunctionData(functionName, parameters);

            const result = await vm.evm.runCall({
                to: contractAddress,
                caller: callerAddress,
                origin: callerAddress,
                value: BigInt(value),
                data: Buffer.from(data.slice(2), 'hex'),
            });

            const returnData = '0x' + result.execResult.returnValue.toString('hex');
            let decodedResult = null;

            if (returnData !== '0x' && functionAbi.outputs && functionAbi.outputs.length > 0) {
                try {
                    decodedResult = iface.decodeFunctionResult(functionName, returnData);
                } catch (decodeError) {
                    console.warn('Failed to decode function result:', decodeError);
                }
            }

            return {
                success: !result.execResult.exceptionError,
                returnValue: decodedResult || returnData,
                gasUsed: Number(result.execResult.executionGasUsed),
                logs: result.execResult.logs || [],
                exception: result.execResult.exceptionError ? result.execResult.exceptionError.error : null
            };

        } catch (error) {
            throw new Error(`EVM execution failed: ${error.message}`);
        }
    }

    async executeWASMFunction(contract, functionName, parameters, caller, value) {
        const { instantiate } = await import('@assemblyscript/loader');
        const fs = await import('fs');
        const path = await import('path');
        const { tmpdir } = await import('os');

        try {
            const tempDir = await fs.promises.mkdtemp(path.join(tmpdir(), 'wasm-exec-'));
            const wasmPath = path.join(tempDir, 'contract.wasm');
            
            const wasmBuffer = Buffer.from(contract.bytecode.slice(2), 'hex');
            await fs.promises.writeFile(wasmPath, wasmBuffer);

            const wasmModule = await WebAssembly.instantiate(wasmBuffer);
            const instance = wasmModule.instance;

            const wasmFunction = instance.exports[functionName];
            if (!wasmFunction) {
                throw new Error(`Function ${functionName} not exported from WASM module`);
            }

            const wasmParams = this.convertToWASMTypes(parameters, contract.abi, functionName);

            const startTime = Date.now();
            const result = wasmFunction(...wasmParams);
            const executionTime = Date.now() - startTime;

            const jsResult = this.convertFromWASMType(result, contract.abi, functionName);

            await fs.promises.rm(tempDir, { recursive: true, force: true });

            return {
                success: true,
                returnValue: jsResult,
                gasUsed: Math.ceil(executionTime / 10),
                logs: [],
                executionTime: executionTime
            };

        } catch (error) {
            throw new Error(`WASM execution failed: ${error.message}`);
        }
    }

    convertToWASMTypes(parameters, abi, functionName) {
        const functionAbi = abi.find(item => item.type === 'function' && item.name === functionName);
        if (!functionAbi) return parameters;

        return parameters.map((param, index) => {
            const inputType = functionAbi.inputs[index].type;
            
            switch (inputType) {
                case 'int32':
                case 'uint32':
                    return parseInt(param);
                case 'int64':
                case 'uint64':
                    return BigInt(param);
                case 'bool':
                    return param ? 1 : 0;
                default:
                    return param;
            }
        });
    }

    convertFromWASMType(result, abi, functionName) {
        const functionAbi = abi.find(item => item.type === 'function' && item.name === functionName);
        if (!functionAbi || !functionAbi.outputs || functionAbi.outputs.length === 0) {
            return result;
        }

        const outputType = functionAbi.outputs[0].type;
        
        switch (outputType) {
            case 'bool':
                return Boolean(result);
            case 'int64':
            case 'uint64':
                return Number(result);
            default:
                return result;
        }
    }

    async executeMoveFunction(contract, functionName, parameters, caller, value) {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        const fs = await import('fs');
        const path = await import('path');
        const { tmpdir } = await import('os');

        try {
            const tempDir = await fs.promises.mkdtemp(path.join(tmpdir(), 'move-exec-'));
            const bytecodePath = path.join(tempDir, 'contract.mv');
            
            const bytecodeBuffer = Buffer.from(contract.bytecode.slice(2), 'hex');
            await fs.promises.writeFile(bytecodePath, bytecodeBuffer);

            const movePath = 'move'; // Assuming move CLI is installed
            const executeCommand = `cd "${tempDir}" && "${movePath}" run --args ${parameters.map(p => `"${p}"`).join(' ')}`;
            
            const { stdout, stderr } = await execAsync(executeCommand, {
                timeout: this.config.executionTimeout,
                maxBuffer: 10 * 1024 * 1024
            });

            if (stderr && stderr.includes('error:')) {
                throw new Error(`Move execution error: ${stderr}`);
            }

            await fs.promises.rm(tempDir, { recursive: true, force: true });

            return {
                success: true,
                returnValue: stdout.trim(),
                gasUsed: 10000, // Fixed gas for Move execution
                logs: [],
                executionOutput: stdout
            };

        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new Error('Move VM not found. Please install Move language tools');
            }
            throw new Error(`Move execution failed: ${error.message}`);
        }
    }

    async validateFunctionParameters(functionAbi, parameters) {
        if (functionAbi.inputs.length !== parameters.length) {
            throw new Error(`Parameter count mismatch: expected ${functionAbi.inputs.length}, got ${parameters.length}`);
        }

        for (let i = 0; i < functionAbi.inputs.length; i++) {
            const input = functionAbi.inputs[i];
            const param = parameters[i];
            
            if (!this.isValidParameterType(param, input.type)) {
                throw new Error(`Invalid parameter type for ${input.name}: expected ${input.type}, got ${typeof param}`);
            }
        }
    }

    isValidParameterType(param, type) {
        const typeMap = {
            'uint256': 'number',
            'address': 'string',
            'bool': 'boolean',
            'string': 'string',
            'bytes': 'string'
        };

        const expectedType = typeMap[type] || 'string';
        return typeof param === expectedType;
    }

    calculateGasUsed(contract, functionName, parameters) {
        const baseGas = 21000;
        const functionComplexity = this.getFunctionComplexity(contract, functionName);
        const parameterGas = parameters.length * 100;
        
        return baseGas + (functionComplexity * 1000) + parameterGas;
    }

    getFunctionComplexity(contract, functionName) {
        const functionAbi = contract.abi.find(item => 
            item.type === 'function' && item.name === functionName
        );

        if (!functionAbi) return 1;

        let complexity = functionAbi.inputs.length;
        if (functionAbi.stateMutability === 'view' || functionAbi.stateMutability === 'pure') {
            complexity *= 0.5;
        } else {
            complexity *= 2;
        }

        return Math.max(1, complexity);
    }

    async getContractState(contractId, stateKey = null) {
        if (!this.initialized) await this.initialize();

        const contract = this.contractRegistry.get(contractId);
        if (!contract) {
            throw new Error(`Contract not found: ${contractId}`);
        }

        if (stateKey) {
            const state = await this.db.get(`
                SELECT * FROM contract_states 
                WHERE contractId = ? AND stateKey = ?
                ORDER BY blockNumber DESC 
                LIMIT 1
            `, [contractId, stateKey]);

            return state ? JSON.parse(state.stateValue) : null;
        } else {
            const states = await this.db.all(`
                SELECT stateKey, stateValue, blockNumber, timestamp
                FROM contract_states 
                WHERE contractId = ?
                ORDER BY blockNumber DESC
            `, [contractId]);

            return states.map(state => ({
                key: state.stateKey,
                value: JSON.parse(state.stateValue),
                blockNumber: state.blockNumber,
                timestamp: state.timestamp
            }));
        }
    }

    async getContractEvents(contractId, eventName = null, fromBlock = 0, toBlock = 'latest') {
        if (!this.initialized) await this.initialize();

        let query = `SELECT * FROM contract_events WHERE contractId = ?`;
        const params = [contractId];

        if (eventName) {
            query += ` AND eventName = ?`;
            params.push(eventName);
        }

        query += ` ORDER BY blockNumber DESC, logIndex DESC LIMIT 1000`;

        const events = await this.db.all(query, params);

        return events.map(event => ({
            name: event.eventName,
            data: JSON.parse(event.eventData),
            transactionHash: event.transactionHash,
            blockNumber: event.blockNumber,
            logIndex: event.logIndex,
            timestamp: event.timestamp
        }));
    }

    async updateContractState(contractId, stateKey, stateValue, updatedBy, transactionHash, blockNumber) {
        const stateId = this.generateStateId();
        
        await this.db.run(`
            INSERT INTO contract_states (id, contractId, stateKey, stateValue, updatedBy, transactionHash, blockNumber)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            stateId,
            contractId,
            stateKey,
            JSON.stringify(stateValue),
            updatedBy,
            transactionHash,
            blockNumber
        ]);

        this.events.emit('stateUpdated', {
            contractId,
            stateKey,
            stateValue,
            updatedBy,
            transactionHash,
            blockNumber,
            timestamp: new Date()
        });
    }

    async emitContractEvent(contractId, eventName, eventData, transactionHash, blockNumber, logIndex) {
        const eventId = this.generateEventId();
        
        await this.db.run(`
            INSERT INTO contract_events (id, contractId, eventName, eventData, transactionHash, blockNumber, logIndex)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            eventId,
            contractId,
            eventName,
            JSON.stringify(eventData),
            transactionHash,
            blockNumber,
            logIndex
        ]);

        this.events.emit('contractEvent', {
            contractId,
            eventName,
            eventData,
            transactionHash,
            blockNumber,
            logIndex,
            timestamp: new Date()
        });
    }

    async recordExecutionError(executionId, contractId, functionName, parameters, caller, errorMessage) {
        await this.db.run(`
            INSERT INTO contract_executions (id, contractId, functionName, parameters, caller, transactionHash, gasUsed, errorMessage)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            executionId,
            contractId,
            functionName,
            JSON.stringify(parameters),
            caller,
            this.generateTransactionHash(caller, contractId, functionName),
            0,
            errorMessage
        ]);
    }

    async getCompiler(language, version) {
        const compilerKey = `${language}_${version}`;
        
        if (this.compilerVersions.has(compilerKey)) {
            return this.compilerVersions.get(compilerKey);
        }

        const compiler = await this.db.get(`
            SELECT * FROM compiler_versions WHERE language = ? AND version = ? AND isActive = true
        `, [language, version]);

        if (!compiler) {
            throw new Error(`Compiler not found: ${language} ${version}`);
        }

        this.compilerVersions.set(compilerKey, compiler);
        return compiler;
    }

    async loadCompilerVersions() {
        const compilers = await this.db.all('SELECT * FROM compiler_versions WHERE isActive = true');
        
        for (const compiler of compilers) {
            const key = `${compiler.language}_${compiler.version}`;
            this.compilerVersions.set(key, compiler);
        }
    }

    async loadDeployedContracts() {
        const contracts = await this.db.all('SELECT * FROM smart_contracts WHERE isActive = true');
        
        for (const contract of contracts) {
            this.contractRegistry.set(contract.id, {
                ...contract,
                abi: JSON.parse(contract.abi)
            });
        }
    }

    generateContractId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(12).toString('hex');
        return `contract_${timestamp}_${random}`;
    }

    generateContractAddress(deployer) {
        const hash = createHash('sha256')
            .update(deployer + Date.now() + randomBytes(16).toString('hex'))
            .digest('hex');
        return '0x' + hash.substring(0, 40);
    }

    generateDeploymentHash(deployer, bytecode) {
        return createHash('sha256')
            .update(deployer + bytecode + Date.now())
            .digest('hex');
    }

    generateExecutionId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(16).toString('hex');
        return `exec_${timestamp}_${random}`;
    }

    generateTransactionHash(caller, contractId, functionName) {
        return createHash('sha256')
            .update(caller + contractId + functionName + Date.now())
            .digest('hex');
    }

    generateStateId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(8).toString('hex');
        return `state_${timestamp}_${random}`;
    }

    generateEventId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(12).toString('hex');
        return `event_${timestamp}_${random}`;
    }

    generateCompilationCacheKey(sourceCode, language, compilerVersion) {
        return createHash('sha256')
            .update(sourceCode + language + compilerVersion)
            .digest('hex');
    }

    hashData(data) {
        return createHash('sha256')
            .update(JSON.stringify(data))
            .digest('hex');
    }

    async getContractStats() {
        if (!this.initialized) await this.initialize();

        const contractStats = await this.db.all(`
            SELECT 
                language,
                COUNT(*) as totalContracts,
                SUM(CASE WHEN isActive = 1 THEN 1 ELSE 0 END) as activeContracts,
                AVG(LENGTH(bytecode)) as avgBytecodeSize
            FROM smart_contracts 
            GROUP BY language
        `);

        const executionStats = await this.db.get(`
            SELECT 
                COUNT(*) as totalExecutions,
                AVG(gasUsed) as avgGasUsed,
                SUM(CASE WHEN errorMessage IS NULL THEN 1 ELSE 0 END) as successfulExecutions,
                SUM(CASE WHEN errorMessage IS NOT NULL THEN 1 ELSE 0 END) as failedExecutions
            FROM contract_executions 
            WHERE timestamp >= datetime('now', '-24 hours')
        `);

        return {
            contracts: contractStats,
            executions: executionStats,
            totalStates: await this.getTotalStates(),
            totalEvents: await this.getTotalEvents(),
            timestamp: new Date()
        };
    }

    async getTotalStates() {
        const result = await this.db.get('SELECT COUNT(*) as count FROM contract_states');
        return result?.count || 0;
    }

    async getTotalEvents() {
        const result = await this.db.get('SELECT COUNT(*) as count FROM contract_events');
        return result?.count || 0;
    }
}

export default SmartContractEngine;
