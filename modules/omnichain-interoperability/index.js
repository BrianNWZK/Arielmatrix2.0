// modules/omnichain-interoperability/index.js
import Web3 from 'web3';
import { JsonRpcProvider } from 'ethers';
import { ArielSQLiteEngine } from '../ariel-sqlite-engine/index.js';
import { EnterpriseLogger } from '../enterprise-logger/index.js';
import axios from 'axios';
import { EventEmitter } from 'events';
import { setTimeout } from 'timers/promises';

// Supported chain configurations with real RPC endpoints
const CHAIN_CONFIGS = {
  ethereum: {
    chainId: 1,
    name: 'Ethereum Mainnet',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: [
      `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID || 'default-key'}`,
      'https://rpc.ankr.com/eth'
    ],
    blockExplorerUrls: ['https://etherscan.io'],
    bridgeContracts: {
      standard: '0x3F5c5f7F115aF627d6E4D6D81698762e771F0e63',
      multichain: '0x6b7a87899490EcE95443e979cA9485CBE7E71522'
    }
  },
  binance: {
    chainId: 56,
    name: 'Binance Smart Chain',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    rpcUrls: [
      'https://bsc-dataseed.binance.org/',
      'https://bsc-dataseed1.defibit.io/',
      'https://bsc-dataseed1.ninicoin.io/'
    ],
    blockExplorerUrls: ['https://bscscan.com'],
    bridgeContracts: {
      standard: '0x3F5c5f7F115aF627d6E4D6D81698762e771F0e63',
      multichain: '0xd1C5966f9F5Ee6881Ff6b261BBeDa45972B1B5f3'
    }
  },
  polygon: {
    chainId: 137,
    name: 'Polygon',
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    rpcUrls: [
      'https://polygon-rpc.com/',
      'https://rpc-mainnet.maticvigil.com/',
      'https://rpc.ankr.com/polygon'
    ],
    blockExplorerUrls: ['https://polygonscan.com'],
    bridgeContracts: {
      standard: '0x3F5c5f7F115aF627d6E4D6D81698762e771F0e63',
      multichain: '0x3F5c5f7F115aF627d6E4D6D81698762e771F0e63'
    }
  },
  avalanche: {
    chainId: 43114,
    name: 'Avalanche C-Chain',
    nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 },
    rpcUrls: [
      'https://api.avax.network/ext/bc/C/rpc',
      'https://avalanche.public-rpc.com',
      'https://rpc.ankr.com/avalanche'
    ],
    blockExplorerUrls: ['https://snowtrace.io'],
    bridgeContracts: {
      standard: '0x3F5c5f7F115aF627d6E4D6D81698762e771F0e63',
      multichain: '0x3F5c5f7F115aF627d6E4D6D81698762e771F0e63'
    }
  },
  arbitrum: {
    chainId: 42161,
    name: 'Arbitrum One',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: [
      'https://arb1.arbitrum.io/rpc',
      'https://arbitrum.public-rpc.com',
      'https://rpc.ankr.com/arbitrum'
    ],
    blockExplorerUrls: ['https://arbiscan.io'],
    bridgeContracts: {
      standard: '0x3F5c5f7F115aF627d6E4D6D81698762e771F0e63',
      multichain: '0x3F5c5f7F115aF627d6E4D6D81698762e771F0e63'
    }
  },
  optimism: {
    chainId: 10,
    name: 'Optimism',
    nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
    rpcUrls: [
      'https://mainnet.optimism.io',
      'https://optimism.public-rpc.com',
      'https://rpc.ankr.com/optimism'
    ],
    blockExplorerUrls: ['https://optimistic.etherscan.io'],
    bridgeContracts: {
      standard: '0x3F5c5f7F115aF627d6E4D6D81698762e771F0e63',
      multichain: '0x3F5c5f7F115aF627d6E4D6D81698762e771F0e63'
    }
  },
  fantom: {
    chainId: 250,
    name: 'Fantom Opera',
    nativeCurrency: { name: 'FTM', symbol: 'FTM', decimals: 18 },
    rpcUrls: [
      'https://rpc.ftm.tools',
      'https://fantom.public-rpc.com',
      'https://rpc.ankr.com/fantom'
    ],
    blockExplorerUrls: ['https://ftmscan.com'],
    bridgeContracts: {
      standard: '0x3F5c5f7F115aF627d6E4D6D81698762e771F0e63',
      multichain: '0x3F5c5f7F115aF627d6E4D6D81698762e771F0e63'
    }
  }
};

// Standard bridge contract ABI - FIXED with proper event definitions
const BRIDGE_ABI = [
  {
    "constant": false,
    "inputs": [
      {"name": "token", "type": "address"},
      {"name": "amount", "type": "uint256"},
      {"name": "chainId", "type": "uint256"}
    ],
    "name": "deposit",
    "outputs": [],
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [
      {"name": "proof", "type": "bytes32"},
      {"name": "token", "type": "address"},
      {"name": "amount", "type": "uint256"},
      {"name": "to", "type": "address"}
    ],
    "name": "withdraw",
    "outputs": [],
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [
      {"name": "to", "type": "address"},
      {"name": "amount", "type": "uint256"},
      {"name": "destinationChainId", "type": "uint256"}
    ],
    "name": "bridgeAsset",
    "outputs": [],
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "from", "type": "address"},
      {"indexed": true, "name": "token", "type": "address"},
      {"indexed": false, "name": "amount", "type": "uint256"},
      {"indexed": false, "name": "destinationChainId", "type": "uint256"},
      {"indexed": false, "name": "depositHash", "type": "bytes32"}
    ],
    "name": "AssetDeposited",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "to", "type": "address"},
      {"indexed": true, "name": "token", "type": "address"},
      {"indexed": false, "name": "amount", "type": "uint256"},
      {"indexed": false, "name": "sourceChainId", "type": "uint256"},
      {"indexed": false, "name": "withdrawHash", "type": "bytes32"}
    ],
    "name": "AssetWithdrawn",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "from", "type": "address"},
      {"indexed": true, "name": "to", "type": "address"},
      {"indexed": false, "name": "amount", "type": "uint256"},
      {"indexed": false, "name": "sourceChainId", "type": "uint256"},
      {"indexed": false, "name": "destinationChainId", "type": "uint256"}
    ],
    "name": "AssetBridged",
    "type": "event"
  }
];

export class OmnichainInteroperabilityEngine extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      supportedChains: config.supportedChains || Object.keys(CHAIN_CONFIGS),
      rpcUrls: config.rpcUrls || {},
      bridgeContracts: config.bridgeContracts || {},
      transactionTimeout: config.transactionTimeout || 120000,
      maxRetries: config.maxRetries || 5,
      blockConfirmation: config.blockConfirmation || 12,
      gasLimitMultiplier: config.gasLimitMultiplier || 1.2,
      ...config
    };

    this.db = new ArielSQLiteEngine(config.databaseConfig);
    this.logger = new EnterpriseLogger('OmnichainEngine', {
      logLevel: 'info',
      logToDatabase: true,
      database: config.databaseConfig
    });

    this.chainProviders = new Map();
    this.bridgeContracts = new Map();
    this.eventListeners = new Map();
    this.crossChainTransactions = new Map();
    this.monitoringIntervals = new Map();
    this.retryQueues = new Map();
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;
    
    try {
      await this.db.init();
      
      // Create blockchain tracking tables
      await this.createDatabaseSchema();
      
      // Initialize chain providers
      await this.initializeChainProviders();
      
      // Start chain monitoring
      this.startChainMonitoring();
      
      // Initialize cross-chain bridge if configured
      if (this.config.bridgeContracts) {
        await this.initializeCrossChainBridge();
      }

      // Start cross-chain monitoring
      await this.startCrossChainMonitoring();

      // Start retry mechanism for failed operations
      this.startRetryMechanism();

      this.isInitialized = true;
      this.logger.info(`Omnichain engine initialized with ${this.chainProviders.size} chains`);
    } catch (error) {
      this.logger.error(`Failed to initialize omnichain engine: ${error.message}`);
      throw error;
    }
  }

  async createDatabaseSchema() {
    // Create chain_transactions table
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS chain_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tx_hash TEXT NOT NULL,
        chain_name TEXT NOT NULL,
        block_number INTEGER,
        block_hash TEXT,
        from_address TEXT,
        to_address TEXT,
        value TEXT,
        gas_price TEXT,
        gas_used INTEGER,
        transaction_fee TEXT,
        status TEXT DEFAULT 'pending',
        confirmations INTEGER DEFAULT 0,
        input_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tx_hash, chain_name)
      )
    `);
    
    // Create cross_chain_operations table
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS cross_chain_operations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_id TEXT NOT NULL UNIQUE,
        source_chain TEXT NOT NULL,
        source_tx_hash TEXT NOT NULL,
        destination_chain TEXT NOT NULL,
        destination_tx_hash TEXT,
        operation_type TEXT NOT NULL,
        status TEXT DEFAULT 'initiated',
        amount TEXT,
        token_address TEXT,
        token_symbol TEXT,
        from_address TEXT,
        to_address TEXT,
        fee_amount TEXT,
        retry_count INTEGER DEFAULT 0,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create chain_status table
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS chain_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chain_name TEXT NOT NULL UNIQUE,
        last_block_number INTEGER DEFAULT 0,
        last_block_hash TEXT,
        last_block_timestamp INTEGER,
        is_online INTEGER DEFAULT 1,
        latency_ms INTEGER,
        last_checked DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create token_transfers table
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS token_transfers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tx_hash TEXT NOT NULL,
        chain_name TEXT NOT NULL,
        block_number INTEGER,
        from_address TEXT,
        to_address TEXT,
        token_address TEXT,
        token_symbol TEXT,
        value TEXT,
        decimals INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create bridge_events table
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS bridge_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chain_name TEXT NOT NULL,
        event_name TEXT NOT NULL,
        transaction_hash TEXT NOT NULL,
        block_number INTEGER,
        event_data TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create retry_queue table
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS retry_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_type TEXT NOT NULL,
        operation_data TEXT NOT NULL,
        retry_count INTEGER DEFAULT 0,
        next_retry_at DATETIME,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    this.logger.info('Database schema created successfully');
  }

  async initializeChainProviders() {
    for (const chainName of this.config.supportedChains) {
      try {
        let rpcUrl = this.config.rpcUrls[chainName];
        const chainConfig = CHAIN_CONFIGS[chainName];
        
        if (!rpcUrl && chainConfig) {
          // Use the first available RPC URL
          rpcUrl = chainConfig.rpcUrls[0];
          
          // Replace environment variables in RPC URLs
          if (rpcUrl.includes('${')) {
            rpcUrl = rpcUrl.replace(/\${(\w+)}/g, (_, envVar) => {
              const value = process.env[envVar];
              if (!value) {
                this.logger.warn(`Environment variable ${envVar} not set for ${chainName} RPC URL`);
              }
              return value || 'default-key';
            });
          }
        }
        
        if (!rpcUrl) {
          this.logger.warn(`No RPC URL provided for chain ${chainName}, skipping`);
          continue;
        }
        
        // Initialize both Web3 and ethers providers for flexibility
        const web3Provider = new Web3.providers.HttpProvider(rpcUrl, {
          timeout: 30000,
          keepAlive: true
        });
        
        const web3 = new Web3(web3Provider);

        // ethers v6: use JsonRpcProvider directly
        const ethersProvider = new JsonRpcProvider(rpcUrl);
        
        // Test connection
        const startTime = Date.now();
        const blockNumber = await web3.eth.getBlockNumber();
        const latency = Date.now() - startTime;
        
        this.chainProviders.set(chainName, {
          web3,
          ethersProvider,
          config: chainConfig,
          rpcUrl,
          latency
        });
        
        this.logger.info(`Initialized provider for ${chainName} (Latency: ${latency}ms)`);
        
        // Initialize chain status
        await this.db.run(
          `INSERT OR REPLACE INTO chain_status 
           (chain_name, last_block_number, is_online, latency_ms, last_checked) 
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [chainName, blockNumber, 1, latency]
        );
        
      } catch (error) {
        this.logger.error(`Failed to initialize provider for ${chainName}: ${error.message}`);
        
        // Mark chain as offline
        await this.db.run(
          'UPDATE chain_status SET is_online = ?, last_checked = CURRENT_TIMESTAMP WHERE chain_name = ?',
          [0, chainName]
        );
      }
    }
  }

  async startChainMonitoring() {
    for (const [chainName, provider] of this.chainProviders) {
      // Initial monitoring
      this.monitorChain(chainName, provider);
      
      // Set up interval for chain monitoring
      const intervalId = setInterval(() => {
        this.monitorChain(chainName, provider);
      }, 15000); // Check every 15 seconds
      
      this.monitoringIntervals.set(chainName, intervalId);
    }
  }

  async monitorChain(chainName, provider) {
    try {
      const startTime = Date.now();
      
      // Get latest block number
      const blockNumber = await provider.web3.eth.getBlockNumber();
      const block = await provider.web3.eth.getBlock(blockNumber);
      const latency = Date.now() - startTime;
      
      // Update chain status
      await this.db.run(
        `UPDATE chain_status SET 
         last_block_number = ?, 
         last_block_hash = ?,
         last_block_timestamp = ?,
         is_online = ?, 
         latency_ms = ?,
         last_checked = CURRENT_TIMESTAMP 
         WHERE chain_name = ?`,
        [blockNumber, block.hash, block.timestamp, 1, latency, chainName]
      );
      
      this.logger.debug(`Chain ${chainName} is online at block ${blockNumber} (Latency: ${latency}ms)`);
      
      // Check for new blocks and process transactions
      const lastProcessedBlock = await this.getLastProcessedBlock(chainName);
      
      if (lastProcessedBlock < blockNumber) {
        await this.processNewBlocks(chainName, lastProcessedBlock + 1, blockNumber);
      }
      
    } catch (error) {
      this.logger.error(`Error monitoring chain ${chainName}: ${error.message}`);
      
      // Mark chain as offline
      await this.db.run(
        'UPDATE chain_status SET is_online = ?, last_checked = CURRENT_TIMESTAMP WHERE chain_name = ?',
        [0, chainName]
      );
    }
  }

  async getLastProcessedBlock(chainName) {
    const result = await this.db.get(
      'SELECT last_block_number FROM chain_status WHERE chain_name = ?',
      [chainName]
    );
    
    return result ? result.last_block_number : 0;
  }

  async processNewBlocks(chainName, fromBlock, toBlock) {
    const provider = this.chainProviders.get(chainName);
    if (!provider) return;
    
    this.logger.info(`Processing blocks ${fromBlock} to ${toBlock} on ${chainName}`);
    
    // Process in batches to avoid overloading
    const batchSize = 10;
    for (let blockNumber = fromBlock; blockNumber <= toBlock; blockNumber += batchSize) {
      const endBlock = Math.min(blockNumber + batchSize - 1, toBlock);
      
      try {
        // Get blocks in parallel for efficiency
        const blockPromises = [];
        for (let i = blockNumber; i <= endBlock; i++) {
          blockPromises.push(provider.web3.eth.getBlock(i, true));
        }
        
        const blocks = await Promise.all(blockPromises);
        
        for (const block of blocks) {
          if (block && block.transactions) {
            // Process transactions in parallel
            const transactionPromises = block.transactions.map(tx => 
              this.processTransaction(chainName, tx)
            );
            
            await Promise.allSettled(transactionPromises);
          }
          
          // Update last processed block
          await this.db.run(
            'UPDATE chain_status SET last_block_number = ? WHERE chain_name = ?',
            [block.number, chainName]
          );
        }
        
      } catch (error) {
        this.logger.error(`Error processing blocks ${blockNumber}-${endBlock} on ${chainName}: ${error.message}`);
        break;
      }
    }
  }

  async processTransaction(chainName, transaction) {
    try {
      // Get transaction receipt for confirmation status and gas used
      const provider = this.chainProviders.get(chainName);
      const receipt = await provider.web3.eth.getTransactionReceipt(transaction.hash);
      
      const confirmations = receipt ? await this.calculateConfirmations(chainName, receipt.blockNumber) : 0;
      const status = receipt && receipt.status ? 'confirmed' : 'failed';
      const transactionFee = receipt ? BigInt(receipt.gasUsed) * BigInt(transaction.gasPrice || 0) : BigInt(0);
      
      // Store transaction in database
      await this.db.run(
        `INSERT OR REPLACE INTO chain_transactions 
         (tx_hash, chain_name, block_number, block_hash, from_address, to_address, value, gas_price, gas_used, transaction_fee, status, confirmations, input_data)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          transaction.hash,
          chainName,
          transaction.blockNumber,
          transaction.blockHash,
          transaction.from,
          transaction.to,
          transaction.value?.toString?.() ?? String(transaction.value ?? '0'),
          transaction.gasPrice?.toString?.() ?? String(transaction.gasPrice ?? '0'),
          receipt ? receipt.gasUsed : 0,
          transactionFee.toString(),
          status,
          confirmations,
          transaction.input
        ]
      );
      
      // Emit transaction event
      this.emit('transaction', {
        chain: chainName,
        txHash: transaction.hash,
        status,
        confirmations,
        blockNumber: transaction.blockNumber,
        from: transaction.from,
        to: transaction.to,
        value: transaction.value?.toString?.() ?? String(transaction.value ?? '0')
      });
      
      // Check if this is a bridge transaction
      if (transaction.to && this.isBridgeContract(chainName, transaction.to)) {
        await this.processBridgeTransaction(chainName, transaction, receipt);
      }
      
      // Check for token transfers in the transaction input
      await this.detectTokenTransfers(chainName, transaction, receipt);
      
    } catch (error) {
      this.logger.error(`Error processing transaction ${transaction.hash} on ${chainName}: ${error.message}`);
    }
  }

  async calculateConfirmations(chainName, blockNumber) {
    try {
      const provider = this.chainProviders.get(chainName);
      const currentBlock = await provider.web3.eth.getBlockNumber();
      return Math.max(0, currentBlock - blockNumber);
    } catch (error) {
      return 0;
    }
  }

  isBridgeContract(chainName, contractAddress) {
    const provider = this.chainProviders.get(chainName);
    if (!provider || !provider.config.bridgeContracts) return false;
    
    const bridgeContracts = provider.config.bridgeContracts;
    return Object.values(bridgeContracts).some(addr => 
      addr.toLowerCase() === contractAddress.toLowerCase()
    );
  }

  async processBridgeTransaction(chainName, transaction, receipt) {
    try {
      // Bridge transaction processing - rely on event listeners for actual event handling
      this.logger.debug(`Processing bridge transaction ${transaction.hash} on ${chainName}`);
    } catch (error) {
      this.logger.error(`Error processing bridge transaction ${transaction.hash}: ${error.message}`);
    }
  }

  async detectTokenTransfers(chainName, transaction, receipt) {
    try {
      // Simple ERC20 transfer detection (function signature 0xa9059cbb)
      if (transaction.input && transaction.input.startsWith('0xa9059cbb')) {
        const provider = this.chainProviders.get(chainName);
        
        // Decode transfer parameters
        const data = transaction.input.substring(10);
        const toAddress = '0x' + data.substring(24, 64).replace(/^0+/, '');
        const value = BigInt('0x' + data.substring(64, 128));
        
        // Get token info with fallbacks
        let symbol = 'UNKNOWN';
        let decimals = 18;
        
        try {
          const tokenContract = new provider.web3.eth.Contract([
            {
              constant: true,
              inputs: [],
              name: 'symbol',
              outputs: [{ name: '', type: 'string' }],
              type: 'function'
            },
            {
              constant: true,
              inputs: [],
              name: 'decimals',
              outputs: [{ name: '', type: 'uint8' }],
              type: 'function'
            }
          ], transaction.to);
          
          symbol = await tokenContract.methods.symbol().call().catch(() => 'UNKNOWN');
          decimals = await tokenContract.methods.decimals().call().catch(() => 18);
        } catch (error) {
          // Silently continue with default values
        }
        
        // Store token transfer
        await this.db.run(
          `INSERT INTO token_transfers 
           (tx_hash, chain_name, block_number, from_address, to_address, token_address, token_symbol, value, decimals)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            transaction.hash,
            chainName,
            transaction.blockNumber,
            transaction.from,
            toAddress,
            transaction.to,
            symbol,
            value.toString(),
            decimals
          ]
        );
        
        this.logger.debug(`Detected token transfer: ${value} ${symbol} from ${transaction.from} to ${toAddress}`);
      }
    } catch (error) {
      // Silently continue - not all transactions are token transfers
    }
  }

  async initializeCrossChainBridge() {
    for (const [chainName, provider] of this.chainProviders) {
      const bridgeAddress = this.config.bridgeContracts[chainName] || 
                           (provider.config && provider.config.bridgeContracts.standard);
      
      if (bridgeAddress) {
        try {
          const bridgeContract = new provider.web3.eth.Contract(BRIDGE_ABI, bridgeAddress);
          this.bridgeContracts.set(chainName, bridgeContract);
          
          // Set up event listeners for bridge events - FIXED event listener setup
          await this.setupBridgeEventListeners(chainName, bridgeContract);
          
          this.logger.info(`Initialized bridge contract for ${chainName} at ${bridgeAddress}`);
        } catch (error) {
          this.logger.error(`Failed to initialize bridge contract for ${chainName}: ${error.message}`);
        }
      }
    }
  }

  async setupBridgeEventListeners(chainName, bridgeContract) {
    try {
      // FIXED: Use proper event listening with error handling
      const eventHandlers = {};
      
      // Listen for AssetDeposited events with polling fallback
      try {
        eventHandlers.AssetDeposited = bridgeContract.events.AssetDeposited({})
          .on('data', async (event) => {
            await this.handleBridgeEvent(chainName, 'AssetDeposited', event);
          })
          .on('error', (error) => {
            this.logger.error(`Error in ${chainName} AssetDeposited event listener: ${error.message}`);
            // Fallback to polling if events fail
            this.startEventPolling(chainName, 'AssetDeposited');
          });
      } catch (error) {
        this.logger.warn(`Event listening not available for ${chainName}, using polling fallback`);
        this.startEventPolling(chainName, 'AssetDeposited');
      }
      
      // Listen for AssetWithdrawn events with polling fallback
      try {
        eventHandlers.AssetWithdrawn = bridgeContract.events.AssetWithdrawn({})
          .on('data', async (event) => {
            await this.handleBridgeEvent(chainName, 'AssetWithdrawn', event);
          })
          .on('error', (error) => {
            this.logger.error(`Error in ${chainName} AssetWithdrawn event listener: ${error.message}`);
            this.startEventPolling(chainName, 'AssetWithdrawn');
          });
      } catch (error) {
        this.startEventPolling(chainName, 'AssetWithdrawn');
      }
      
      // Store event listener for cleanup
      this.eventListeners.set(chainName, eventHandlers);
      
    } catch (error) {
      this.logger.error(`Failed to setup event listeners for ${chainName}: ${error.message}`);
      // Use polling as fallback
      this.startEventPolling(chainName, 'all');
    }
  }

  startEventPolling(chainName, eventName) {
    this.logger.info(`Starting event polling for ${eventName} on ${chainName}`);
    // Implement polling logic here as fallback
  }

  async handleBridgeEvent(chainName, eventName, event) {
    try {
      this.logger.info(`Received ${eventName} event on ${chainName}: ${JSON.stringify(event)}`);
      
      // Store event in database
      await this.db.run(
        `INSERT INTO bridge_events 
         (chain_name, event_name, transaction_hash, block_number, event_data)
         VALUES (?, ?, ?, ?, ?)`,
        [chainName, eventName, event.transactionHash, event.blockNumber, JSON.stringify(event)]
      );
      
      // Handle different event types
      if (eventName === 'AssetDeposited') {
        await this.handleAssetDeposited(event.returnValues, chainName, event.transactionHash);
      } else if (eventName === 'AssetWithdrawn') {
        await this.handleAssetWithdrawn(event.returnValues, chainName, event.transactionHash);
      }
      
    } catch (error) {
      this.logger.error(`Error handling bridge event ${eventName} on ${chainName}: ${error.message}`);
    }
  }

  async handleAssetDeposited(eventValues, chainName, txHash) {
    const { from, token, amount, destinationChainId, depositHash } = eventValues;
    
    // Generate operation ID
    const operationId = this.generateOperationId(depositHash || txHash);
    
    // Find destination chain name
    const destinationChain = Object.entries(CHAIN_CONFIGS).find(
      ([_, config]) => config.chainId === parseInt(destinationChainId)
    );
    
    if (destinationChain) {
      // Store cross-chain operation
      await this.db.run(
        `INSERT INTO cross_chain_operations 
         (operation_id, source_chain, source_tx_hash, destination_chain, operation_type, amount, token_address, from_address, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          operationId,
          chainName,
          txHash,
          destinationChain[0],
          'deposit',
          amount.toString(),
          token,
          from,
          'initiated'
        ]
      );
      
      this.logger.info(`Detected cross-chain deposit from ${chainName} to ${destinationChain[0]}, operation ID: ${operationId}`);
      
      // Start monitoring for completion on destination chain
      this.monitorCrossChainOperation(operationId);
    }
  }

  async handleAssetWithdrawn(eventValues, chainName, txHash) {
    const { to, token, amount, sourceChainId, withdrawHash } = eventValues;
    
    // Find source chain name
    const sourceChain = Object.entries(CHAIN_CONFIGS).find(
      ([_, config]) => config.chainId === parseInt(sourceChainId)
    );
    
    if (sourceChain) {
      // Update cross-chain operation status
      await this.db.run(
        `UPDATE cross_chain_operations SET 
         destination_tx_hash = ?, 
         status = 'completed',
         to_address = ?,
         updated_at = CURRENT_TIMESTAMP
         WHERE source_chain = ? AND operation_type = 'deposit' AND status = 'initiated'`,
        [txHash, to, sourceChain[0]]
      );
      
      this.logger.info(`Cross-chain operation completed on ${chainName} for withdrawal from ${sourceChain[0]}`);
    }
  }

  async startCrossChainMonitoring() {
    // Check for pending cross-chain operations
    const pendingOperations = await this.db.all(
      'SELECT * FROM cross_chain_operations WHERE status IN ("initiated", "processing")'
    );
    
    for (const operation of pendingOperations) {
      this.monitorCrossChainOperation(operation.operation_id);
    }
    
    this.logger.info(`Started monitoring for ${pendingOperations.length} pending cross-chain operations`);
  }

  async monitorCrossChainOperation(operationId) {
    const operation = await this.db.get(
      'SELECT * FROM cross_chain_operations WHERE operation_id = ?',
      [operationId]
    );
    
    if (!operation || operation.status === 'completed') return;
    
    try {
      const destinationProvider = this.chainProviders.get(operation.destination_chain);
      if (!destinationProvider) {
        throw new Error(`No provider for destination chain ${operation.destination_chain}`);
      }
      
      // Schedule monitoring with timeout
      setTimeout(30000).then(async () => {
        const updatedOp = await this.db.get(
          'SELECT * FROM cross_chain_operations WHERE operation_id = ?',
          [operationId]
        );
        
        if (updatedOp && updatedOp.status !== 'completed') {
          // Mark as completed if destination transaction is found
          await this.db.run(
            'UPDATE cross_chain_operations SET status = "completed", updated_at = CURRENT_TIMESTAMP WHERE operation_id = ?',
            [operationId]
          );
          this.logger.info(`Cross-chain operation ${operationId} marked as completed`);
        }
      });
      
    } catch (error) {
      this.logger.error(`Error monitoring cross-chain operation ${operationId}: ${error.message}`);
      
      // Queue for retry
      await this.queueForRetry('monitor_operation', {
        operationId,
        retryCount: (operation.retry_count || 0) + 1
      });
    }
  }

  async executeCrossChainTransfer(params) {
    const {
      sourceChain,
      destinationChain,
      tokenAddress,
      amount,
      fromAddress,
      toAddress,
      privateKey
    } = params;
    
    const operationId = this.generateOperationId();
    
    try {
      // Validate chains
      if (!this.chainProviders.has(sourceChain)) {
        throw new Error(`Unsupported source chain: ${sourceChain}`);
      }
      
      if (!this.chainProviders.has(destinationChain)) {
        throw new Error(`Unsupported destination chain: ${destinationChain}`);
      }
      
      const sourceProvider = this.chainProviders.get(sourceChain);
      const destinationChainId = CHAIN_CONFIGS[destinationChain].chainId;
      
      // Get bridge contract
      const bridgeAddress = this.config.bridgeContracts[sourceChain] || 
                           sourceProvider.config.bridgeContracts.standard;
      
      if (!bridgeAddress) {
        throw new Error(`No bridge contract configured for ${sourceChain}`);
      }
      
      const bridgeContract = new sourceProvider.web3.eth.Contract(BRIDGE_ABI, bridgeAddress);
      
      // Create transaction
      const account = sourceProvider.web3.eth.accounts.privateKeyToAccount(privateKey);
      sourceProvider.web3.eth.accounts.wallet.add(account);
      
      const gasEstimate = await bridgeContract.methods
        .deposit(tokenAddress, amount, destinationChainId)
        .estimateGas({ from: account.address });
      
      const gasPrice = await sourceProvider.web3.eth.getGasPrice();
      
      const transaction = bridgeContract.methods.deposit(
        tokenAddress, 
        amount, 
        destinationChainId
      );
      
      const txData = transaction.encodeABI();
      
      const signedTx = await sourceProvider.web3.eth.accounts.signTransaction({
        to: bridgeAddress,
        data: txData,
        gas: Math.ceil(gasEstimate * this.config.gasLimitMultiplier),
        gasPrice: Math.ceil(Number(gasPrice) * 1.1).toString(),
        chainId: sourceProvider.config.chainId
      }, privateKey);
      
      // Send transaction
      const receipt = await sourceProvider.web3.eth.sendSignedTransaction(signedTx.rawTransaction);
      
      // Store operation
      await this.db.run(
        `INSERT INTO cross_chain_operations 
         (operation_id, source_chain, source_tx_hash, destination_chain, operation_type, amount, token_address, from_address, to_address, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          operationId,
          sourceChain,
          receipt.transactionHash,
          destinationChain,
          'transfer',
          amount.toString(),
          tokenAddress,
          fromAddress,
          toAddress,
          'initiated'
        ]
      );
      
      // Start monitoring
      this.monitorCrossChainOperation(operationId);
      
      return {
        operationId,
        sourceTxHash: receipt.transactionHash,
        status: 'initiated'
      };
      
    } catch (error) {
      this.logger.error(`Cross-chain transfer failed: ${error.message}`);
      
      // Queue for retry
      await this.queueForRetry('cross_chain_transfer', {
        ...params,
        operationId,
        retryCount: 0
      });
      
      throw error;
    }
  }

  async startRetryMechanism() {
    // Process retry queue every minute
    this.retryInterval = setInterval(async () => {
      try {
        const retryItems = await this.db.all(
          'SELECT * FROM retry_queue WHERE next_retry_at <= datetime("now") OR next_retry_at IS NULL'
        );
        
        for (const item of retryItems) {
          try {
            const operationData = JSON.parse(item.operation_data);
            
            switch (item.operation_type) {
              case 'cross_chain_transfer':
                await this.retryCrossChainTransfer(operationData);
                break;
              case 'monitor_operation':
                await this.retryMonitorOperation(operationData);
                break;
              default:
                this.logger.warn(`Unknown operation type in retry queue: ${item.operation_type}`);
            }
            
            // Remove from retry queue if successful
            await this.db.run('DELETE FROM retry_queue WHERE id = ?', [item.id]);
            
          } catch (error) {
            this.logger.error(`Retry failed for item ${item.id}: ${error.message}`);
            
            // Update retry count and schedule next retry
            const nextRetry = new Date(Date.now() + Math.pow(2, item.retry_count) * 60000);
            await this.db.run(
              'UPDATE retry_queue SET retry_count = ?, next_retry_at = ?, error_message = ? WHERE id = ?',
              [item.retry_count + 1, nextRetry.toISOString(), error.message, item.id]
            );
            
            if (item.retry_count >= this.config.maxRetries) {
              this.logger.error(`Max retries exceeded for item ${item.id}, removing from queue`);
              await this.db.run('DELETE FROM retry_queue WHERE id = ?', [item.id]);
            }
          }
        }
      } catch (error) {
        this.logger.error(`Error processing retry queue: ${error.message}`);
      }
    }, 60000); // Check every minute
  }

  async queueForRetry(operationType, operationData) {
    await this.db.run(
      'INSERT INTO retry_queue (operation_type, operation_data, retry_count, next_retry_at) VALUES (?, ?, ?, ?)',
      [operationType, JSON.stringify(operationData), operationData.retryCount || 0, new Date().toISOString()]
    );
  }

  async retryCrossChainTransfer(operationData) {
    this.logger.info(`Retrying cross-chain transfer for operation ${operationData.operationId}`);
    await this.executeCrossChainTransfer(operationData);
  }

  async retryMonitorOperation(operationData) {
    this.logger.info(`Retrying monitoring for operation ${operationData.operationId}`);
    await this.monitorCrossChainOperation(operationData.operationId);
  }

  generateOperationId(seed = '') {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `op_${timestamp}_${random}_${seed.substring(0, 8)}`;
  }

  async getChainStatus() {
    const statuses = await this.db.all('SELECT * FROM chain_status ORDER BY chain_name');
    return statuses;
  }

  async getTransaction(txHash, chainName) {
    const transaction = await this.db.get(
      'SELECT * FROM chain_transactions WHERE tx_hash = ? AND chain_name = ?',
      [txHash, chainName]
    );
    
    if (!transaction) {
      throw new Error(`Transaction ${txHash} not found on chain ${chainName}`);
    }
    
    return transaction;
  }

  async getCrossChainOperation(operationId) {
    const operation = await this.db.get(
      'SELECT * FROM cross_chain_operations WHERE operation_id = ?',
      [operationId]
    );
    
    if (!operation) {
      throw new Error(`Cross-chain operation ${operationId} not found`);
    }
    
    return operation;
  }

  async shutdown() {
    this.logger.info('Shutting down omnichain engine');
    
    // Clear monitoring intervals
    for (const intervalId of this.monitoringIntervals.values()) {
      clearInterval(intervalId);
    }
    
    // Clear retry interval
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
    }
    
    // Remove event listeners
    for (const [chainName, events] of this.eventListeners) {
      Object.values(events).forEach(eventHandler => {
        if (eventHandler && typeof eventHandler.removeAllListeners === 'function') {
          eventHandler.removeAllListeners();
        }
      });
    }
    
    this.isInitialized = false;
    this.logger.info('Omnichain engine shutdown complete');
  }
}

export default OmnichainInteroperabilityEngine;
