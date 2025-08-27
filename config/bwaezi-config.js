const bwaeziConfig = {
    // Database Configuration
    dbPath: process.env.DB_PATH || './data/arielmatrix.db',
    
    // Blockchain Configuration
    NODE_ID: process.env.NODE_ID || 'arielmatrix-node-1',
    NATIVE_TOKEN: process.env.NATIVE_TOKEN || 'BWAEZI',
    BLOCK_TIME: parseInt(process.env.BLOCK_TIME) || 100,
    
    // System Accounts
    SYSTEM_ACCOUNT: process.env.SYSTEM_ACCOUNT || 'system-bwaezi-account',
    SYSTEM_PRIVATE_KEY: process.env.SYSTEM_PRIVATE_KEY,
    
    // Network Configuration
    VALIDATORS: [
        process.env.VALIDATOR_1,
        process.env.VALIDATOR_2,
        process.env.VALIDATOR_3
    ].filter(Boolean),
    
    // Performance Settings
    MAX_TRANSACTIONS_PER_BLOCK: 1000,
    SHARD_COUNT: 4
};

export default bwaeziConfig;
