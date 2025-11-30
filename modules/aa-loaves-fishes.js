// modules/aa-loaves-fishes.js
import { ethers } from 'ethers';

// LIVE BLOCKCHAIN CONFIGURATION
const LIVE_CONFIG = {
    // FACTORY ADDRESSES (Live deployments)
    FACTORY_ADDRESS: '0x9406Cc6185a346906296840746125a0E44976454', // SimpleAccountFactory mainnet
    ENTRY_POINT_ADDRESS: '0x5FF137D4bEAA7036d654a88Ea898df565D304B88', // EntryPoint mainnet
    
    // BUNDLER RPC ENDPOINTS (Live connections)
    BUNDLER_RPC_URLS: [
        'https://bundler.etherspot.io/v1/1',
        'https://api.stackup.sh/v1/node/8b92cc6b17a3b8d9f3a4a5a6c7d8e9f0',
        'https://public.stackup.sh/api/v1/node/ethereum-mainnet'
    ],
    
    // PAYMASTER SERVICES (Live integrations)
    PAYMASTER_SERVICES: {
        STACKUP: 'https://api.stackup.sh/v1/paymaster/8b92cc6b17a3b8d9f3a4a5a6c7d8e9f0',
        ETHERSPOT: 'https://bundler.etherspot.io/v1/paymaster/1',
        PIMLICO: 'https://api.pimlico.io/v1/1/rpc'
    },
    
    // RPC PROVIDERS
    RPC_PROVIDERS: [
        'https://eth.llamarpc.com',
        'https://rpc.ankr.com/eth',
        'https://cloudflare-eth.com',
        'https://ethereum.publicnode.com'
    ]
};

// Global blockchain connection manager
class BlockchainConnectionManager {
    constructor() {
        this.providers = [];
        this.bundlers = [];
        this.currentProviderIndex = 0;
        this.currentBundlerIndex = 0;
        this.initializeConnections();
    }

    initializeConnections() {
        try {
            // Initialize multiple RPC providers for redundancy
            LIVE_CONFIG.RPC_PROVIDERS.forEach(url => {
                try {
                    const provider = new ethers.JsonRpcProvider(url);
                    this.providers.push(provider);
                    console.log(`✅ Connected to RPC: ${url}`);
                } catch (error) {
                    console.warn(`⚠️ Failed to connect to RPC: ${url}`, error.message);
                }
            });

            // Initialize bundler connections
            LIVE_CONFIG.BUNDLER_RPC_URLS.forEach(url => {
                try {
                    const bundler = new ethers.JsonRpcProvider(url);
                    this.bundlers.push(bundler);
                    console.log(`✅ Connected to Bundler: ${url}`);
                } catch (error) {
                    console.warn(`⚠️ Failed to connect to Bundler: ${url}`, error.message);
                }
            });

            if (this.providers.length === 0) {
                throw new Error('No RPC providers available');
            }
        } catch (error) {
            console.error('❌ Blockchain connection initialization failed:', error);
        }
    }

    getProvider() {
        if (this.providers.length === 0) {
            throw new Error('No blockchain providers available');
        }
        const provider = this.providers[this.currentProviderIndex];
        this.currentProviderIndex = (this.currentProviderIndex + 1) % this.providers.length;
        return provider;
    }

    getBundler() {
        if (this.bundlers.length === 0) {
            return this.getProvider(); // Fallback to regular provider
        }
        const bundler = this.bundlers[this.currentBundlerIndex];
        this.currentBundlerIndex = (this.currentBundlerIndex + 1) % this.bundlers.length;
        return bundler;
    }

    async getGasPrice() {
        const provider = this.getProvider();
        try {
            const feeData = await provider.getFeeData();
            return {
                maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits('30', 'gwei'),
                maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits('1', 'gwei')
            };
        } catch (error) {
            console.warn('⚠️ Gas price estimation failed, using defaults:', error.message);
            return {
                maxFeePerGas: ethers.parseUnits('30', 'gwei'),
                maxPriorityFeePerGas: ethers.parseUnits('1', 'gwei')
            };
        }
    }
}

// Global blockchain connection instance
const blockchainManager = new BlockchainConnectionManager();

// =========================================================================
// EXPORTED STANDALONE FUNCTION: getSCWAddress (LIVE VERSION)
// =========================================================================

/**
 * Calculates the deterministic smart contract wallet (SCW) address using the default salt (0).
 * This function is exported standalone to be used directly for address lookups.
 * @param {string} ownerAddress The EOA owner address.
 * @returns {Promise<string>} The deterministic smart account address.
 */
async function getSCWAddress(ownerAddress) {
    console.log(`🔍 SCWUtil: Calculating deterministic SCW address for owner ${ownerAddress.slice(0, 10)}...`);
    
    try {
        // Validate owner address
        if (!ethers.isAddress(ownerAddress)) {
            throw new Error(`Invalid owner address: ${ownerAddress}`);
        }

        const salt = ethers.zeroPadValue(ethers.toBeArray(0), 32);
        
        const initCodeData = ethers.AbiCoder.defaultAbiCoder().encode(
            ['address', 'uint256'],
            [ownerAddress, 0]
        );

        // Use the constant FACTORY_ADDRESS
        const initCodeWithFactory = ethers.concat([LIVE_CONFIG.FACTORY_ADDRESS, initCodeData]);
        const initCodeHash = ethers.keccak256(initCodeWithFactory);
        
        // Creation Code (SimpleAccountFactory proxy/deployer bytecode)
        const creationCode = `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${LIVE_CONFIG.FACTORY_ADDRESS.slice(2)}5af43d82803e903d91602b57fd5bf3`;
        const bytecodeHash = ethers.keccak256(creationCode);
        
        const deterministicAddress = ethers.getCreate2Address(
            LIVE_CONFIG.FACTORY_ADDRESS,
            salt,
            ethers.keccak256(ethers.concat([bytecodeHash, initCodeHash]))
        );
        
        console.log(`✅ SCW Address calculated: ${deterministicAddress}`);
        
        // Verify the address is valid and checksummed
        return ethers.getAddress(deterministicAddress);
    } catch (error) {
        console.error(`❌ SCW address calculation failed: ${error.message}`);
        throw new Error(`SCW address calculation failed: ${error.message}`);
    }
}

// =========================================================================
// LIVE BLOCKCHAIN INTERACTION FUNCTIONS
// =========================================================================

/**
 * Check if a smart account is deployed on-chain
 * @param {string} address The smart account address to check
 * @returns {Promise<boolean>} True if deployed, false otherwise
 */
async function isSmartAccountDeployed(address) {
    try {
        const provider = blockchainManager.getProvider();
        const code = await provider.getCode(address);
        return code !== '0x' && code !== '0x0';
    } catch (error) {
        console.error(`❌ Failed to check deployment status for ${address}:`, error.message);
        throw error;
    }
}

/**
 * Get the nonce for a smart account from the EntryPoint
 * @param {string} smartAccountAddress The smart account address
 * @returns {Promise<bigint>} The current nonce
 */
async function getSmartAccountNonce(smartAccountAddress) {
    try {
        const provider = blockchainManager.getProvider();
        
        // EntryPoint contract ABI for getNonce
        const entryPointABI = [
            'function getNonce(address sender, uint192 key) external view returns (uint256 nonce)'
        ];
        
        const entryPoint = new ethers.Contract(
            LIVE_CONFIG.ENTRY_POINT_ADDRESS,
            entryPointABI,
            provider
        );
        
        const nonce = await entryPoint.getNonce(smartAccountAddress, 0);
        console.log(`📈 Smart Account Nonce: ${nonce}`);
        return nonce;
    } catch (error) {
        console.error(`❌ Failed to get nonce for ${smartAccountAddress}:`, error.message);
        throw error;
    }
}

// COMPLETE AASDK implementation with LIVE blockchain interactions
class AASDK {
    constructor(signer, entryPointAddress = LIVE_CONFIG.ENTRY_POINT_ADDRESS) {
        // CRITICAL FIX: Validate signer parameter
        if (!signer) {
            throw new Error('AASDK: signer parameter is required but was not provided');
        }
        
        // CRITICAL FIX: Check if signer has required properties
        if (!signer.address) {
            throw new Error('AASDK: signer must have an address property');
        }
        
        this.signer = signer;
        this.entryPointAddress = entryPointAddress;
        this.factoryAddress = LIVE_CONFIG.FACTORY_ADDRESS;
        this.blockchainManager = blockchainManager;
        
        console.log(`🔧 AASDK LIVE initialized with signer: ${this.signer.address.slice(0, 10)}...`);
    }

    // =========================================================================
    // LIVE SMART ACCOUNT ADDRESS CALCULATION
    // =========================================================================
    
    /**
     * Calculates the deterministic smart account address using CREATE2 based on the EIP-4337 standard.
     * @param {string} ownerAddress The EOA owner address.
     * @param {Uint8Array | string} salt The salt used for creation.
     * @returns {Promise<string>} The deterministic smart account address.
     */
    async getSmartAccountAddress(ownerAddress, salt) {
        console.log(`🔍 AASDK: Calculating Smart Account address for owner ${ownerAddress.slice(0, 10)}...`);
        
        try {
            // Use the same logic as getSCWAddress but with provided salt
            const saltBytes = ethers.zeroPadValue(ethers.toBeArray(salt ? ethers.hexlify(salt) : 0), 32);
            
            // 1. Get the initialization code data (e.g., encoded owner and salt=0)
            const initCodeData = ethers.AbiCoder.defaultAbiCoder().encode(
                ['address', 'uint256'],
                [ownerAddress, 0]
            );

            // 2. Concatenate Factory Address and Init Code Data
            const initCodeWithFactory = ethers.concat([this.factoryAddress, initCodeData]);
            
            // 3. Hash the Init Code (used in the CREATE2 hash input)
            const initCodeHash = ethers.keccak256(initCodeWithFactory);
            
            // 4. Creation Code (SimpleAccountFactory proxy/deployer bytecode)
            const creationCode = `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${this.factoryAddress.slice(2)}5af43d82803e903d91602b57fd5bf3`;
            const bytecodeHash = ethers.keccak256(creationCode);
            
            // 5. Calculate the final CREATE2 address
            const deterministicAddress = ethers.getCreate2Address(
                this.factoryAddress,
                saltBytes,
                ethers.keccak256(ethers.concat([bytecodeHash, initCodeHash]))
            );
            
            console.log(`✅ Smart Account Address calculated: ${deterministicAddress}`);
            return deterministicAddress;
        } catch (error) {
            console.error(`❌ Smart Account address calculation failed: ${error.message}`);
            throw error;
        }
    }

    // =========================================================================
    // LIVE INIT CODE GENERATION
    // =========================================================================

    /**
     * Generates the initialization code needed for UserOperations that deploy a new account.
     * @param {string} ownerAddress The EOA owner address.
     * @returns {Promise<string>} The concatenated factory address and encoded function call.
     */
    async getInitCode(ownerAddress) {
        console.log(`🔧 AASDK: Generating init code for owner ${ownerAddress.slice(0,10)}...`);
        
        try {
            const initInterface = new ethers.Interface([
                'function createAccount(address owner, uint256 salt) returns (address)'
            ]);
            
            // Assuming salt = 0 for default deployment
            const initCallData = initInterface.encodeFunctionData('createAccount', [ownerAddress, 0]);
            
            // Return factory address + init call data
            const initCode = ethers.concat([this.factoryAddress, initCallData]);
            console.log(`✅ Init code generated (${initCode.length} bytes)`);
            return initCode;
        } catch (error) {
            console.error(`❌ Init code generation failed: ${error.message}`);
            throw error;
        }
    }

    async getAccountInitCode(ownerAddress) {
        return this.getInitCode(ownerAddress);
    }

    // =========================================================================
    // LIVE USER OPERATION CREATION AND MANAGEMENT
    // =========================================================================

    /**
     * Creates a UserOperation structure with live blockchain data.
     * @param {string} callData The encoded function call data.
     * @param {object} options Optional parameters for gas and paymaster.
     * @returns {Promise<object>} The partial UserOperation.
     */
    async createUserOperation(callData, options = {}) {
        console.log(`🔧 AASDK: Creating LIVE UserOperation...`);
        
        try {
            const smartAccountAddress = await this.getSCWAddress(this.signer.address);
            
            // Check if account is deployed
            const isDeployed = await isSmartAccountDeployed(smartAccountAddress);
            
            // Get initCode only if account is not deployed
            let initCode = '0x';
            if (!isDeployed) {
                console.log(`🆕 Smart Account not deployed, including initCode`);
                initCode = await this.getInitCode(this.signer.address);
            }

            // Get live nonce from blockchain
            const nonce = options.nonce || await getSmartAccountNonce(smartAccountAddress);
            
            // Get live gas prices from blockchain
            const gasPrices = await this.blockchainManager.getGasPrice();
            
            const userOp = {
                sender: smartAccountAddress,
                nonce: nonce,
                initCode: options.initCode || initCode,
                callData: callData,
                callGasLimit: options.callGasLimit || 100000n,
                verificationGasLimit: options.verificationGasLimit || 200000n,
                preVerificationGas: options.preVerificationGas || 21000n,
                maxFeePerGas: options.maxFeePerGas || gasPrices.maxFeePerGas,
                maxPriorityFeePerGas: options.maxPriorityFeePerGas || gasPrices.maxPriorityFeePerGas,
                paymasterAndData: options.paymasterAndData || '0x',
                signature: '0x' // Will be filled later
            };
            
            console.log(`✅ LIVE UserOperation created for sender: ${userOp.sender}`);
            console.log(`   Nonce: ${userOp.nonce}, Deployed: ${isDeployed}`);
            return userOp;
        } catch (error) {
            console.error(`❌ LIVE UserOperation creation failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * LIVE signing of the UserOperation using EIP-4337 standards.
     * @param {object} userOp The UserOperation object.
     * @returns {Promise<object>} The signed UserOperation.
     */
    async signUserOperation(userOp) {
        console.log(`🔏 AASDK: LIVE Signing UserOperation...`);
        
        try {
            // Remove signature for hashing
            const userOpWithoutSig = { ...userOp };
            delete userOpWithoutSig.signature;

            // Calculate userOpHash according to EIP-4337
            const userOpHash = await this.calculateUserOpHash(userOpWithoutSig);
            
            // Sign the userOpHash with the EOA signer
            const signature = await this.signer.signMessage(ethers.getBytes(userOpHash));
            
            userOp.signature = signature;
            
            console.log(`✅ UserOperation LIVE signed with hash: ${userOpHash.slice(0, 20)}...`);
            return userOp;
        } catch (error) {
            console.error(`❌ UserOperation LIVE signing failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Calculate UserOperation hash according to EIP-4337
     * @param {object} userOp UserOperation without signature
     * @returns {Promise<string>} The userOpHash
     */
    async calculateUserOpHash(userOp) {
        const packedUserOp = ethers.AbiCoder.defaultAbiCoder().encode([
            'address', 'uint256', 'bytes32', 'bytes32', 'uint256', 'uint256', 'uint256', 'uint256', 'uint256', 'bytes32'
        ], [
            userOp.sender,
            userOp.nonce,
            ethers.keccak256(userOp.initCode),
            ethers.keccak256(userOp.callData),
            userOp.callGasLimit,
            userOp.verificationGasLimit,
            userOp.preVerificationGas,
            userOp.maxFeePerGas,
            userOp.maxPriorityFeePerGas,
            ethers.keccak256(userOp.paymasterAndData)
        ]);

        const enc = ethers.AbiCoder.defaultAbiCoder().encode(
            ['bytes32', 'address', 'uint256'],
            [ethers.keccak256(packedUserOp), this.entryPointAddress, await this.getChainId()]
        );

        return ethers.keccak256(enc);
    }

    /**
     * LIVE estimation of UserOperation gas fields using bundler RPC.
     * @param {object} userOp The UserOperation object.
     * @returns {Promise<object>} The estimated gas fields.
     */
    async estimateUserOperationGas(userOp) {
        console.log(`⛽ AASDK: LIVE Estimating UserOperation gas via bundler...`);
        
        try {
            const bundler = this.blockchainManager.getBundler();
            
            // Use eth_estimateUserOperationGas RPC method
            const gasEstimate = await bundler.send('eth_estimateUserOperationGas', [
                {
                    sender: userOp.sender,
                    nonce: ethers.toBeHex(userOp.nonce),
                    initCode: userOp.initCode,
                    callData: userOp.callData,
                    callGasLimit: ethers.toBeHex(userOp.callGasLimit || 0),
                    verificationGasLimit: ethers.toBeHex(userOp.verificationGasLimit || 0),
                    preVerificationGas: ethers.toBeHex(userOp.preVerificationGas || 0),
                    maxFeePerGas: ethers.toBeHex(userOp.maxFeePerGas || 0),
                    maxPriorityFeePerGas: ethers.toBeHex(userOp.maxPriorityFeePerGas || 0),
                    paymasterAndData: userOp.paymasterAndData
                },
                this.entryPointAddress
            ]);

            const estimatedGas = {
                callGasLimit: BigInt(gasEstimate.callGasLimit),
                verificationGasLimit: BigInt(gasEstimate.verificationGasLimit),
                preVerificationGas: BigInt(gasEstimate.preVerificationGas)
            };
            
            console.log(`✅ LIVE Gas estimated:`, estimatedGas);
            return estimatedGas;
        } catch (error) {
            console.warn(`⚠️ Bundler gas estimation failed, using fallback: ${error.message}`);
            // Fallback to conservative estimates
            return {
                callGasLimit: 100000n,
                verificationGasLimit: 250000n,
                preVerificationGas: 21000n
            };
        }
    }

    // =========================================================================
    // LIVE BUNDLER INTERACTIONS
    // =========================================================================

    /**
     * Submit a signed UserOperation to the bundler network
     * @param {object} userOp The signed UserOperation
     * @returns {Promise<string>} The userOpHash
     */
    async sendUserOperation(userOp) {
        console.log(`📤 AASDK: Sending UserOperation to bundler...`);
        
        try {
            const bundler = this.blockchainManager.getBundler();
            
            const result = await bundler.send('eth_sendUserOperation', [
                {
                    sender: userOp.sender,
                    nonce: ethers.toBeHex(userOp.nonce),
                    initCode: userOp.initCode,
                    callData: userOp.callData,
                    callGasLimit: ethers.toBeHex(userOp.callGasLimit),
                    verificationGasLimit: ethers.toBeHex(userOp.verificationGasLimit),
                    preVerificationGas: ethers.toBeHex(userOp.preVerificationGas),
                    maxFeePerGas: ethers.toBeHex(userOp.maxFeePerGas),
                    maxPriorityFeePerGas: ethers.toBeHex(userOp.maxPriorityFeePerGas),
                    paymasterAndData: userOp.paymasterAndData,
                    signature: userOp.signature
                },
                this.entryPointAddress
            ]);

            console.log(`✅ UserOperation submitted to bundler, userOpHash: ${result}`);
            return result;
        } catch (error) {
            console.error(`❌ Failed to send UserOperation to bundler: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get UserOperation receipt from bundler
     * @param {string} userOpHash The userOpHash from sendUserOperation
     * @returns {Promise<object>} The transaction receipt
     */
    async getUserOperationReceipt(userOpHash) {
        console.log(`📋 AASDK: Getting UserOperation receipt...`);
        
        try {
            const bundler = this.blockchainManager.getBundler();
            const receipt = await bundler.send('eth_getUserOperationReceipt', [userOpHash]);
            
            if (receipt) {
                console.log(`✅ UserOperation mined in tx: ${receipt.transactionHash}`);
            } else {
                console.log(`⏳ UserOperation not yet mined...`);
            }
            
            return receipt;
        } catch (error) {
            console.error(`❌ Failed to get UserOperation receipt: ${error.message}`);
            throw error;
        }
    }

    // =========================================================================
    // LIVE PAYMASTER INTEGRATIONS
    // =========================================================================

    /**
     * Get paymaster sponsorship data from live paymaster service
     * @param {object} userOp The UserOperation to sponsor
     * @param {string} paymasterService The paymaster service to use
     * @returns {Promise<string>} The paymasterAndData field
     */
    async getPaymasterData(userOp, paymasterService = 'STACKUP') {
        console.log(`🔧 AASDK: Getting LIVE paymaster data from ${paymasterService}...`);
        
        try {
            const serviceUrl = LIVE_CONFIG.PAYMASTER_SERVICES[paymasterService];
            if (!serviceUrl) {
                throw new Error(`Paymaster service ${paymasterService} not found`);
            }

            // For Stackup paymaster API
            const response = await fetch(serviceUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'pm_sponsorUserOperation',
                    params: [userOp, this.entryPointAddress],
                    id: 1
                })
            });

            const data = await response.json();
            
            if (data.error) {
                throw new Error(`Paymaster error: ${data.error.message}`);
            }

            console.log(`✅ LIVE Paymaster data obtained`);
            return data.result.paymasterAndData;
        } catch (error) {
            console.warn(`⚠️ Paymaster service failed, continuing without sponsorship: ${error.message}`);
            return '0x'; // Continue without paymaster
        }
    }

    // =========================================================================
    // LIVE BLOCKCHAIN UTILITIES
    // =========================================================================

    /**
     * Get current chain ID from connected network
     * @returns {Promise<bigint>} The chain ID
     */
    async getChainId() {
        try {
            const provider = this.blockchainManager.getProvider();
            const network = await provider.getNetwork();
            return network.chainId;
        } catch (error) {
            console.warn(`⚠️ Failed to get chain ID: ${error.message}`);
            return 1n; // Default to Ethereum mainnet
        }
    }

    /**
     * Get ETH balance for an address
     * @param {string} address The address to check
     * @returns {Promise<bigint>} The balance in wei
     */
    async getBalance(address) {
        try {
            const provider = this.blockchainManager.getProvider();
            const balance = await provider.getBalance(address);
            console.log(`💰 Balance for ${address.slice(0, 10)}: ${ethers.formatEther(balance)} ETH`);
            return balance;
        } catch (error) {
            console.error(`❌ Failed to get balance: ${error.message}`);
            throw error;
        }
    }

    /**
     * Check transaction status
     * @param {string} txHash The transaction hash
     * @returns {Promise<object>} The transaction receipt
     */
    async getTransactionReceipt(txHash) {
        try {
            const provider = this.blockchainManager.getProvider();
            const receipt = await provider.getTransactionReceipt(txHash);
            return receipt;
        } catch (error) {
            console.error(`❌ Failed to get transaction receipt: ${error.message}`);
            throw error;
        }
    }

    // =========================================================================
    // HEALTH CHECK & UTILITIES (LIVE VERSION)
    // =========================================================================

    /**
     * Performs a LIVE health check on the AASDK configuration and blockchain connections.
     * @returns {Promise<object>} Status of the checks.
     */
    async healthCheck() {
        console.log(`❤️ AASDK: Performing LIVE health check...`);
        
        try {
            const provider = this.blockchainManager.getProvider();
            const network = await provider.getNetwork();
            const blockNumber = await provider.getBlockNumber();
            const signerAddress = this.signer.address;
            const smartAccountAddress = await this.getSCWAddress(signerAddress);
            const isDeployed = await isSmartAccountDeployed(smartAccountAddress);
            const balance = await this.getBalance(signerAddress);
            
            const checks = {
                status: 'HEALTHY',
                signerConnected: !!signerAddress,
                signerAddress: signerAddress,
                smartAccountAddress: smartAccountAddress,
                smartAccountDeployed: isDeployed,
                network: {
                    chainId: network.chainId,
                    name: network.name,
                    blockNumber: blockNumber
                },
                balance: ethers.formatEther(balance),
                entryPointAddress: this.entryPointAddress,
                factoryAddress: this.factoryAddress,
                providers: {
                    rpc: this.blockchainManager.providers.length,
                    bundlers: this.blockchainManager.bundlers.length
                },
                timestamp: new Date().toISOString()
            };
            
            console.log(`✅ AASDK LIVE Health Check PASSED`);
            return checks;
        } catch (error) {
            console.error(`❌ AASDK LIVE Health Check FAILED: ${error.message}`);
            throw error;
        }
    }

    getVersion() {
        return '2.0.0-LIVE';
    }

    getSupportedEntryPoints() {
        return [this.entryPointAddress];
    }

    // =========================================================================
    // COMPLETE WORKFLOW METHOD
    // =========================================================================

    /**
     * Complete workflow: create, estimate, sign, and send UserOperation
     * @param {string} target The target contract address
     * @param {string} data The encoded function call data
     * @param {object} options Additional options
     * @returns {Promise<string>} The userOpHash
     */
    async executeUserOperation(target, data, options = {}) {
        console.log(`🚀 AASDK: Executing complete UserOperation workflow...`);
        
        try {
            // 1. Create UserOperation
            const userOp = await this.createUserOperation(data, options);
            
            // 2. Estimate gas (optional, can use provided values)
            if (!options.skipGasEstimation) {
                const gasEstimate = await this.estimateUserOperationGas(userOp);
                Object.assign(userOp, gasEstimate);
            }
            
            // 3. Get paymaster data (optional)
            if (options.usePaymaster) {
                userOp.paymasterAndData = await this.getPaymasterData(userOp, options.paymasterService);
            }
            
            // 4. Sign UserOperation
            const signedUserOp = await this.signUserOperation(userOp);
            
            // 5. Send to bundler
            const userOpHash = await this.sendUserOperation(signedUserOp);
            
            console.log(`✅ UserOperation execution workflow completed`);
            return userOpHash;
        } catch (error) {
            console.error(`❌ UserOperation execution failed: ${error.message}`);
            throw error;
        }
    }
}

// Export the class and the standalone function for maximum compatibility
export { AASDK, getSCWAddress, isSmartAccountDeployed, getSmartAccountNonce, blockchainManager };
export default AASDK;
