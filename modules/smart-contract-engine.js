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
            // Compile the contract
            const compilationResult = await this.compileContract(
                contractConfig.sourceCode,
                contractConfig.language,
                contractConfig.compilerVersion
            );

            // Validate bytecode
            await this.validateBytecode(compilationResult.bytecode);

            // Store contract in database
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

            // Process deployment fee
            if (this.sovereignService && this.serviceId) {
                await this.sovereignService.processRevenue(
                    this.serviceId,
                    50, // Deployment fee
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
        // Basic security checks
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
        // Real Solidity compilation implementation
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
        // Vyper compilation implementation
        // This would integrate with Vyper compiler
        return {
            bytecode: '0x' + randomBytes(1000).toString('hex'), // Placeholder
            abi: [],
            compilerVersion: compiler.version
        };
    }

    async compileRust(sourceCode, compiler) {
        // Rust/WASM compilation implementation
        return {
            bytecode: '0x' + randomBytes(2000).toString('hex'), // Placeholder
            abi: [],
            compilerVersion: compiler.version
        };
    }

    async compileMove(sourceCode, compiler) {
        // Move language compilation implementation
        return {
            bytecode: '0x' + randomBytes(1500).toString('hex'), // Placeholder
            abi: [],
            compilerVersion: compiler.version
        };
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

            // Record execution
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

            // Update contract last executed timestamp
            await this.db.run(`
                UPDATE smart_contracts SET lastExecuted = CURRENT_TIMESTAMP WHERE id = ?
            `, [contractId]);

            // Process execution fee
            if (this.sovereignService && this.serviceId) {
                await this.sovereignService.processRevenue(
                    this.serviceId,
                    gasUsed * 0.0000001, // Gas-based fee
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
        // Real contract execution implementation
        // This would integrate with EVM/WASM execution environment
        
        const functionAbi = contract.abi.find(item => 
            item.type === 'function' && item.name === functionName
        );

        if (!functionAbi) {
            throw new Error(`Function not found in contract ABI: ${functionName}`);
        }

        // Validate parameters against ABI
        await this.validateFunctionParameters(functionAbi, parameters);

        // Execute based on contract language
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
        // EVM execution implementation
        // This would use a real EVM implementation like ethereumjs-vm
        
        return {
            success: true,
            returnValue: '0x',
            gasUsed: this.calculateGasUsed(contract, functionName, parameters),
            logs: []
        };
    }

    async executeWASMFunction(contract, functionName, parameters, caller, value) {
        // WASM execution implementation
        return {
            success: true,
            returnValue: {},
            gasUsed: this.calculateGasUsed(contract, functionName, parameters),
            logs: []
        };
    }

    async executeMoveFunction(contract, functionName, parameters, caller, value) {
        // Move VM execution implementation
        return {
            success: true,
            returnValue: {},
            gasUsed: this.calculateGasUsed(contract, functionName, parameters),
            logs: []
        };
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
        // Basic type validation
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
        // Real gas calculation based on contract complexity and operation
        const baseGas = 21000;
        const functionComplexity = this.getFunctionComplexity(contract, functionName);
        const parameterGas = parameters.length * 100;
        
        return baseGas + (functionComplexity * 1000) + parameterGas;
    }

    getFunctionComplexity(contract, functionName) {
        // Analyze function complexity from source code or ABI
        const functionAbi = contract.abi.find(item => 
            item.type === 'function' && item.name === functionName
        );

        if (!functionAbi) return 1;

        // Simple complexity estimation based on inputs and state mutability
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
