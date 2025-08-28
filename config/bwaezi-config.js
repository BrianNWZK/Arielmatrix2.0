// config/bwaezi-config.js

// IMPORTANT: For production, ALL sensitive information (private keys, RPC URLs)
// MUST be loaded from environment variables (e.g., process.env.BWAEZI_PRIVATE_KEY)
// and NOT hardcoded here. This file provides default placeholders for development.

const bwaeziConfig = {
    // Passphrase for CredentialManager to encrypt/decrypt local credentials (if used)
    // In production, this should always be an environment variable.
    passphrase: process.env.CREDENTIAL_PASSPHRASE || 'your-strong-secret-passphrase-here',

    // Path for CredentialManager's ephemeral storage (Render's disk)
    credentialStoragePath: process.env.CREDENTIALS_FILE || './.ariel_credentials',

    // Core timing parameters for ArielSQL Alltimate Suite
    blockTime: parseInt(process.env.BWAEZI_BLOCK_TIME || '3000'), // milliseconds
    auditPublishInterval: parseInt(process.env.BWAEZI_AUDIT_PUBLISH_INTERVAL || '10000'), // milliseconds
    rebalanceInterval: parseInt(process.env.BWAEZI_REBALANCE_INTERVAL || '60000'), // milliseconds

    // Web3 Configuration for connecting to the Brian Nwaezike Chain (Deployed Smart Contract)
    web3Config: {
        // RPC URL for the Bwaezi Chain (or an Ethereum-compatible testnet/mainnet where it's deployed)
        // This will be overridden by process.env.BWAEZI_RPC_URL in Render.
        provider: process.env.BWAEZI_RPC_URL || 'http://localhost:8545', // e.g., for local Hardhat/Ganache

        // Address of your deployed Bwaezi Smart Contract (e.g., ShardManager, SchemaSync, BlockPublisher)
        // This will be overridden by process.env.BWAEZI_CONTRACT_ADDRESS in Render.
        contractAddress: process.env.BWAEZI_CONTRACT_ADDRESS || '0x6C4F3F7f2c6B8C2B3F0eD0C1d8A5C1F7C5B2D3E4', // Placeholder address

        // Wallet address used by the ArielSQL Suite instance to sign transactions to the Bwaezi Chain
        // This will be overridden by process.env.BWAEZI_WALLET_ADDRESS in Render.
        walletAddress: process.env.BWAEZI_WALLET_ADDRESS || '0x666eD9C31e7fA7F2c3bF0C1D8A5C1F7C5B2D3E4F', // Placeholder address

        // Private key for the walletAddress. CRITICAL: NEVER HARDCODE IN PRODUCTION.
        // This will be overridden by process.env.BWAEZI_PRIVATE_KEY in Render.
        privateKey: process.env.BWAEZI_PRIVATE_KEY || '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef', // Placeholder key

        // ABI (Application Binary Interface) of your Bwaezi Smart Contract.
        // This ABI should contain all the methods and events for ShardManager,
        // SchemaSyncService, BlockchainAuditSystem, and BrianNwaezikeChain interactions.
        abi: [
            // RebalanceEvent from ShardManager
            { "anonymous": false, "inputs": [{ "indexed": false, "internalType": "string", "name": "shardId", "type": "string" }, { "indexed": false, "internalType": "string", "name": "newLoad", "type": "string" }, { "indexed": false, "internalType": "address", "name": "targetNode", "type": "address" }], "name": "RebalanceEvent", "type": "event" },
            // SchemaChange event from SchemaSyncService
            { "anonymous": false, "inputs": [{ "indexed": false, "internalType": "string", "name": "proposalHash", "type": "string" }, { "indexed": false, "internalType": "string", "name": "proposalText", "type": "string" }], "name": "SchemaChange", "type": "event" },
            // BlockAdded event from BrianNwaezikeChain
            { "anonymous": false, "inputs": [{ "indexed": false, "internalType": "string", "name": "blockHash", "type": "string" }, { "indexed": false, "internalType": "string", "name": "transactions", "type": "string" }, { "indexed": false, "internalType": "string", "name": "previousHash", "type": "string" }, { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }, { "indexed": false, "internalType": "address", "name": "validator", "type": "address" }, { "indexed": false, "internalType": "string", "name": "signature", "type": "string" }], "name": "BlockAdded", "type": "event" },
            // registerShard function for ShardManager
            { "inputs": [{ "internalType": "string", "name": "shardId", "type": "string" }, { "internalType": "address", "name": "nodeAddress", "type": "address" }], "name": "registerShard", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
            // triggerRebalance function for ShardManager
            { "inputs": [], "name": "triggerRebalance", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
            // proposeSchemaChange function for SchemaSyncService
            { "inputs": [{ "internalType": "string", "name": "proposalHash", "type": "string" }, { "internalType": "string", "name": "proposalText", "type": "string" }], "name": "proposeSchemaChange", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
            // publishAudit function for BlockchainAuditSystem
            { "inputs": [{ "internalType": "string", "name": "batchHash", "type": "string" }, { "internalType": "string[]", "name": "auditHashes", "type": "string[]" }], "name": "publishAudit", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
            // addBlock function for BrianNwaezikeChain
            { "inputs": [{ "internalType": "string", "name": "blockHash", "type": "string" }, { "internalType": "string", "name": "transactions", "type": "string" }, { "internalType": "string", "name": "previousHash", "type": "string" }, { "internalType": "uint256", "name": "timestamp", "type": "uint256" }, { "internalType": "address", "name": "validator", "type": "address" }, { "internalType": "string", "name": "signature", "type": "string" }], "name": "addBlock", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
            // proposeBlock function for CarbonNegativeConsensusService (light client proposal)
            { "inputs": [{ "internalType": "string", "name": "blockHash", "type": "string" }, { "internalType": "string", "name": "transactions", "type": "string" }, { "internalType": "string", "name": "previousHash", "type": "string" }], "name": "proposeBlock", "outputs": [], "stateMutability": "nonpayable", "type": "function" }
        ]
    },

    // Configuration for the Omnichain Interoperability Service
    omnichainConfig: {
        // API URL for an external bridge service
        bridgeApiUrl: process.env.OMNICHAIN_BRIDGE_API || 'https://mock-bridge-api.example.com/api',
        // Other chain RPCs, contract addresses etc. can be configured here if needed.
    },

    // Specific configurations for the Brian Nwaezike Chain
    bwaeziChainConfig: {
        NATIVE_TOKEN: 'BWAEZI', // Native token ticker
        // Other chain-specific parameters can go here.
    },

    // Path to the lightweight AI model (if using TensorFlow.js)
    // If not set, AISecurityService will fall back to rule-based analysis.
    AI_MODEL_PATH: process.env.AI_MODEL_PATH || null // e.g., 'file://./models/tiny_anomaly_model.json'
};

export default bwaeziConfig;
