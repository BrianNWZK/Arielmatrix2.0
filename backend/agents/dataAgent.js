import axios from 'axios';
import crypto from 'crypto';
import { ArielSQLiteEngine } from '../../modules/ariel-sqlite-engine/index.js'; 
import { QuantumBrowserManager } from './browserManager.js';
import { BrianNwaezikeChain } from '../blockchain/BrianNwaezikeChain.js';
import { createDatabase, BrianNwaezikeDB } from '../database/BrianNwaezikeDB.js';
import { Connection, PublicKey, LAMPORTS_PER_SOL, Keypair, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction } from '@solana/spl-token';
import apiScoutAgent from './apiScoutAgent.js';
import {
  initializeConnections,
    getWalletBalances,
    getWalletAddresses,
    sendSOL,
    sendETH,
    sendUSDT,
    processRevenuePayment,
    checkBlockchainHealth,
    validateAddress,
    formatBalance,
    testAllConnections,
} from './wallet.js';

export class apiScoutAgentExtension {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.apiScout = new apiScoutAgent(config, logger);
  }

  async initialize() {
    this.logger.info('🧠 Initializing apiScoutAgentExtension...');
    await this.apiScout.initialize();
  }

  async executeAcrossAllTargets() {
    const discoveredTargets = await this.apiScout.discoverAllAvailableTargets(); // Autonomous discovery

    for (const target of discoveredTargets) {
      try {
        const credentials = await this.apiScout.discoverCredentials(target.type, target.domain);

        if (credentials?.apiKey) {
          this.logger.info(`🔑 Retrieved API key for ${target.type}: ${credentials.apiKey}`);
          await this._executeTargetLogic(target, credentials.apiKey);
        } else {
          this.logger.warn(`⚠️ No valid API key retrieved for ${target.type}`);
        }
      } catch (error) {
        this.logger.error(`❌ Error executing ${target.type}: ${error.message}`);
      }
    }
  }

  async _executeTargetLogic(target, apiKey) {
    const handler = await this.apiScout.loadHandlerFor(target.type);
    if (!handler || typeof handler.execute !== 'function') {
      throw new Error(`No executable handler found for ${target.type}`);
    }

    const result = await handler.execute(apiKey);
    this.logger.info(`📊 Execution result for ${target.type}: ${JSON.stringify(result)}`);
  }
}

// Quantum jitter for anti-detection
const quantumDelay = (ms) => new Promise(resolve => {
    const jitter = crypto.randomInt(1000, 5000);
    setTimeout(resolve, ms + jitter);
});

// Data value constants
const DATA_POINT_VALUE = 0.02;
const QUALITY_MULTIPLIERS = {
    high: 1.5,
    medium: 1.0,
    low: 0.5
};

// Content categories for targeted content generation
const CONTENT_CATEGORIES = [
    'technology', 'finance', 'health', 'lifestyle', 'entertainment',
    'sports', 'politics', 'business', 'education', 'travel', 'science',
    'environment', 'global'
];

export default class dataAgent {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.db = createDatabase('./data/ariel_matrix.db');
        this.dataPointValue = DATA_POINT_VALUE;
        this.qualityMultipliers = QUALITY_MULTIPLIERS;
        this.initialized = false;
        this.mediumAuthorId = null;
        this.blockchainInitialized = false;
        this.paymentProcessor = null;
        
        // Wallet configuration
        this.ETHEREUM_RPC_URLS = [
            'https://rpc.ankr.com/multichain/43c6febde6850df38b14e31c2c5b293900a1ec693acf36108e43339cf57f8f97'
        ];
        this.SOLANA_RPC_URLS = [
            'https://solana-rpc.publicnode.com'
        ];
        this.USDT_CONTRACT_ADDRESS_ETH = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
        this.USDT_MINT_ADDRESS_SOL = 'Es9Kdd31Wq41G4R7s3M2wXq3T413d7tLg484e1t4t';
        
        // Wallet connections
        this.ethProvider = null;
        this.solConnection = null;
        this.ethWallet = null;
        this.solWallet = null;
        this.walletInitialized = false;
    }

    async initialize() {
        if (this.initialized) return;
        
        try {
            await this.db.connect();
            await this._initializeDataTables();
            
            // Initialize blockchain components
            await this._initializeBlockchain();
            
            // Initialize wallet connections
            await this.initializeWalletConnections();
            
            if (this.config.MEDIUM_ACCESS_TOKEN) {
                this.mediumAuthorId = await this.getMediumAuthorId();
            }
            
            this.initialized = true;
            this.logger.success('✅ Data Agent fully initialized with SQLite database, blockchain, and wallet integration');
        } catch (error) {
            this.logger.error('Failed to initialize Data Agent:', error);
            throw error;
        }
    }

    async initializeWalletConnections() {
        this.logger.info('🔗 Initializing multi-chain wallet connections for Data Agent...');
        
        try {
            // Solana Initialization
            const solanaRpcUrl = await this.getFastestRPC(this.SOLANA_RPC_URLS, 'Solana');
            this.solConnection = new Connection(solanaRpcUrl, 'confirmed');
            
            // Check if private key is provided
            if (!this.config.SOLANA_COLLECTION_WALLET_PRIVATE_KEY) {
                this.logger.warn("Solana private key is missing from configuration. Wallet functions will be limited.");
            } else {
                this.solWallet = Keypair.fromSecretKey(
                    Uint8Array.from(JSON.parse(this.config.SOLANA_COLLECTION_WALLET_PRIVATE_KEY))
                );
                this.logger.success('✅ Solana wallet initialized for Data Agent');
            }

            // Ethereum Initialization
            const ethereumRpcUrl = await this.getFastestRPC(this.ETHEREUM_RPC_URLS, 'Ethereum');
            this.ethProvider = new ethers.JsonRpcProvider(ethereumRpcUrl);

            // Check if private key is provided
            if (!this.config.ETHEREUM_COLLECTION_WALLET_PRIVATE_KEY) {
                this.logger.warn("Ethereum private key is missing from configuration. Wallet functions will be limited.");
            } else {
                this.ethWallet = new ethers.Wallet(
                    this.config.ETHEREUM_COLLECTION_WALLET_PRIVATE_KEY, 
                    this.ethProvider
                );
                this.logger.success('✅ Ethereum wallet initialized for Data Agent');
            }
            
            // Test connections
            await this.testAllConnections();
            this.walletInitialized = true;
            
        } catch (error) {
            this.logger.error(`Failed to initialize wallet connections: ${error.message}`);
        }
    }

    async getFastestRPC(rpcUrls, chainName) {
        this.logger.info(`Testing ${chainName} RPC endpoints to find the fastest connection...`);
        
        const connectionPromises = rpcUrls.map(url => {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error(`Timeout connecting to ${url}`));
                }, 5000);

                fetch(url, { 
                    method: 'POST', 
                    body: JSON.stringify({ 
                        jsonrpc: '2.0', 
                        id: 1, 
                        method: 'eth_blockNumber', 
                        params: [] 
                    }), 
                    headers: { 'Content-Type': 'application/json' } 
                })
                    .then(res => {
                        clearTimeout(timeout);
                        if (res.ok) {
                            this.logger.info(`✅ Connected to ${chainName} via: ${url}`);
                            resolve(url);
                        } else {
                            reject(new Error(`Failed to connect to ${url}`));
                        }
                    })
                    .catch(err => {
                        clearTimeout(timeout);
                        reject(new Error(`Network error for ${url}: ${err.message}`));
                    });
            });
        });

        try {
            const fastestUrl = await Promise.any(connectionPromises);
            return fastestUrl;
        } catch (error) {
            this.logger.warn(`All ${chainName} RPC connections failed. Using the first URL as fallback.`);
            return rpcUrls[0];
        }
    }

    async testAllConnections() {
        this.logger.info("Testing all RPC connections for Data Agent:");
        
        const ethPromises = this.ETHEREUM_RPC_URLS.map(async url => {
            try {
                const provider = new ethers.JsonRpcProvider(url);
                await provider.getBlockNumber();
                this.logger.info(`✅ Ethereum RPC connected: ${url}`);
            } catch (error) {
                this.logger.warn(`❌ Ethereum RPC failed: ${url} (${error.message})`);
            }
        });

        const solPromises = this.SOLANA_RPC_URLS.map(async url => {
            try {
                const connection = new Connection(url, 'confirmed');
                await connection.getLatestBlockhash();
                this.logger.info(`✅ Solana RPC connected: ${url}`);
            } catch (error) {
                this.logger.warn(`❌ Solana RPC failed: ${url} (${error.message})`);
            }
        });

        await Promise.allSettled([...ethPromises, ...solPromises]);
    }

    // Wallet functions for Data Agent
    async getSolanaBalance() {
        if (!this.solWallet || !this.solConnection) {
            throw new Error("Solana wallet not initialized");
        }
        
        try {
            const balance = await this.solConnection.getBalance(this.solWallet.publicKey);
            return balance / LAMPORTS_PER_SOL;
        } catch (error) {
            this.logger.error("Error fetching Solana balance:", error);
            return 0;
        }
    }

    async sendSOL(toAddress, amount) {
        if (!this.solWallet || !this.solConnection) {
            throw new Error("Solana wallet not initialized");
        }
        
        try {
            const toPublicKey = new PublicKey(toAddress);
            const lamports = amount * LAMPORTS_PER_SOL;
            const transaction = new Transaction().add(
                SystemProgram.transfer({ 
                    fromPubkey: this.solWallet.publicKey, 
                    toPubkey: toPublicKey, 
                    lamports 
                })
            );
            
            const { blockhash, lastValidBlockHeight } = await this.solConnection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.lastValidBlockHeight = lastValidBlockHeight;
            transaction.feePayer = this.solWallet.publicKey;
            
            const signature = await sendAndConfirmTransaction(this.solConnection, transaction, [this.solWallet]);
            
            // Record transaction
            await this.recordWalletTransaction(
                'sol', 'transfer', this.solWallet.publicKey.toString(), toAddress, amount, 'SOL', signature
            );
            
            return { signature };
        } catch (error) {
            this.logger.error("Error sending SOL:", error);
            return { error: error.message };
        }
    }

    async getUSDTBalance(chain = 'eth') {
        if (chain === 'eth') {
            if (!this.ethWallet || !this.ethProvider) {
                throw new Error("Ethereum wallet not initialized");
            }
            
            const usdtContract = new ethers.Contract(
                this.USDT_CONTRACT_ADDRESS_ETH, 
                ["function balanceOf(address owner) view returns (uint256)"], 
                this.ethProvider
            );
            
            const balance = await usdtContract.balanceOf(this.ethWallet.address);
            return ethers.formatUnits(balance, 6);
            
        } else if (chain === 'sol') {
            if (!this.solWallet || !this.solConnection) {
                throw new Error("Solana wallet not initialized");
            }
            
            try {
                const usdtMintAddress = new PublicKey(this.USDT_MINT_ADDRESS_SOL);
                const associatedTokenAddress = await getAssociatedTokenAddress(
                    usdtMintAddress, 
                    this.solWallet.publicKey
                );
                
                const tokenBalance = await this.solConnection.getTokenAccountBalance(associatedTokenAddress);
                return tokenBalance.value.uiAmount;
            } catch (error) {
                this.logger.error("Error fetching Solana USDT balance:", error);
                return 0;
            }
        }
        return 0;
    }

    async sendUSDT(toAddress, amount, chain) {
        if (chain === 'eth') {
            if (!this.ethWallet) {
                throw new Error("Ethereum wallet not initialized");
            }
            
            try {
                if (!ethers.isAddress(toAddress)) { 
                    throw new Error("Invalid Ethereum address."); 
                }
                
                const usdtContract = new ethers.Contract(
                    this.USDT_CONTRACT_ADDRESS_ETH, 
                    ["function transfer(address to, uint256 amount) returns (bool)"], 
                    this.ethWallet
                );
                
                const amountInWei = ethers.parseUnits(amount.toString(), 6);
                const tx = await usdtContract.transfer(toAddress, amountInWei);
                
                // Record transaction
                await this.recordWalletTransaction(
                    'eth', 'transfer', this.ethWallet.address, toAddress, amount, 'USDT', tx.hash
                );
                
                return { hash: tx.hash };
            } catch (ethError) {
                this.logger.error("Error sending USDT on Ethereum:", ethError);
                return { error: ethError.message };
            }
            
        } else if (chain === 'sol') {
            if (!this.solWallet || !this.solConnection) {
                throw new Error("Solana wallet not initialized");
            }
            
            try {
                const toPublicKey = new PublicKey(toAddress);
                const usdtMintAddress = new PublicKey(this.USDT_MINT_ADDRESS_SOL);
                const fromTokenAccount = await getAssociatedTokenAddress(
                    usdtMintAddress, 
                    this.solWallet.publicKey
                );
                
                const toTokenAccount = await getAssociatedTokenAddress(
                    usdtMintAddress, 
                    toPublicKey
                );
                
                const transaction = new Transaction().add(
                    createTransferInstruction(
                        fromTokenAccount, 
                        toTokenAccount, 
                        this.solWallet.publicKey, 
                        amount * 10 ** 6
                    )
                );
                
                const { blockhash, lastValidBlockHeight } = await this.solConnection.getLatestBlockhash();
                transaction.recentBlockhash = blockhash;
                transaction.lastValidBlockHeight = lastValidBlockHeight;
                transaction.feePayer = this.solWallet.publicKey;
                
                const signature = await sendAndConfirmTransaction(this.solConnection, transaction, [this.solWallet]);
                
                // Record transaction
                await this.recordWalletTransaction(
                    'sol', 'transfer', this.solWallet.publicKey.toString(), toAddress, amount, 'USDT', signature
                );
                
                return { signature };
            } catch (solError) {
                this.logger.error("Error sending USDT on Solana:", solError);
                return { error: solError.message };
            }
        } else {
            return { error: "Invalid chain specified. Please use 'eth' or 'sol'." };
        }
    }

    async recordWalletTransaction(chain, type, fromAddress, toAddress, amount, token, txHash) {
        const transactionId = `wallet_${crypto.randomBytes(8).toString('hex')}`;
        
        await this.db.run(
            `INSERT INTO wallet_transactions (id, chain, type, from_address, to_address, amount, token, tx_hash, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [transactionId, chain, type, fromAddress, toAddress, amount, token, txHash, 'completed']
        );
    }

    async checkWalletBalances() {
        const balances = {};
        
        try {
            // Check Ethereum balances
            if (this.ethWallet) {
                const ethBalance = await this.ethProvider.getBalance(this.ethWallet.address);
                balances.ethereum = {
                    ETH: parseFloat(ethers.formatEther(ethBalance)),
                    USDT: parseFloat(await this.getUSDTBalance('eth'))
                };
            }
            
            // Check Solana balances
            if (this.solWallet) {
                balances.solana = {
                    SOL: await this.getSolanaBalance(),
                    USDT: parseFloat(await this.getUSDTBalance('sol')) || 0
                };
            }
            
        } catch (error) {
            this.logger.error(`Error checking wallet balances: ${error.message}`);
        }
        
        return balances;
    }

    async _initializeBlockchain() {
        try {
            this.paymentProcessor = new EnterprisePaymentProcessor(this.config);
            await this.paymentProcessor.initialize();
            this.blockchainInitialized = true;
            this.logger.success('✅ BrianNwaezikeChain payment processor initialized');
        } catch (error) {
            this.logger.error('Failed to initialize blockchain:', error);
            throw error;
        }
    }

    async getMediumAuthorId() {
        const { data } = await axios.get('https://api.medium.com/v1/me', {
            headers: {
                'Authorization': `Bearer ${this.config.MEDIUM_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        return data.data.id;
    }

    async _initializeDataTables() {
        // Additional tables for enhanced data operations
        const additionalTables = [
            `CREATE TABLE IF NOT EXISTS blockchain_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                transaction_hash TEXT UNIQUE,
                amount REAL NOT NULL,
                currency TEXT DEFAULT 'USD',
                from_address TEXT,
                to_address TEXT,
                type TEXT,
                status TEXT DEFAULT 'pending',
                block_number INTEGER,
                gas_used REAL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS content_distribution (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                platform TEXT NOT NULL,
                content_id TEXT,
                post_url TEXT,
                impressions INTEGER DEFAULT 0,
                clicks INTEGER DEFAULT 0,
                revenue_generated REAL DEFAULT 0,
                blockchain_tx_hash TEXT,
                status TEXT DEFAULT 'published',
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS ai_generated_content (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT,
                category TEXT,
                tags TEXT,
                sentiment_score REAL,
                engagement_score REAL DEFAULT 0,
                revenue_potential REAL DEFAULT 0,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS ad_placements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content_id INTEGER,
                placement_type TEXT,
                position TEXT,
                networks TEXT,
                estimated_rpm REAL,
                actual_rpm REAL,
                revenue_generated REAL DEFAULT 0,
                blockchain_tx_hash TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (content_id) REFERENCES ai_generated_content (id)
            )`,
            `CREATE TABLE IF NOT EXISTS wallet_transactions (
                id TEXT PRIMARY KEY,
                chain TEXT NOT NULL,
                type TEXT NOT NULL,
                from_address TEXT,
                to_address TEXT,
                amount REAL NOT NULL,
                token TEXT NOT NULL,
                tx_hash TEXT,
                status TEXT DEFAULT 'completed',
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            "CREATE INDEX IF NOT EXISTS idx_blockchain_tx_hash ON blockchain_transactions(transaction_hash)",
            "CREATE INDEX IF NOT EXISTS idx_content_category ON ai_generated_content(category)",
            "CREATE INDEX IF NOT EXISTS idx_distribution_platform ON content_distribution(platform)",
            "CREATE INDEX IF NOT EXISTS idx_ad_content ON ad_placements(content_id)",
            "CREATE INDEX IF NOT EXISTS idx_wallet_chain ON wallet_transactions(chain)",
            "CREATE INDEX IF NOT EXISTS idx_wallet_token ON wallet_transactions(token)"
        ];

        for (const tableSql of additionalTables) {
            await this.db.run(tableSql);
        }
    }

    async processDataOperation(userId, dataPackage) {
        try {
            if (!this.initialized) await this.initialize();

            const baseReward = dataPackage.dataPoints * this.dataPointValue;
            const qualityMultiplier = this.qualityMultipliers[dataPackage.quality] || 1.0;
            
            const finalReward = await this.calculateAutonomousPayout(baseReward, {
                userLoyalty: await this.getUserLoyaltyMultiplier(userId),
                dataQuality: qualityMultiplier,
                dataValue: await this.assessDataValue(dataPackage),
                marketDemand: await this.getDataMarketDemand(dataPackage.type)
            });

            // Process multi-chain payout based on user preference
            const payoutResult = await this.processMultiChainPayout(
                userId,
                finalReward,
                'data_contribution_reward',
                {
                    data_points: dataPackage.dataPoints,
                    data_type: dataPackage.type,
                    data_quality: dataPackage.quality,
                    operation_id: `op_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
                }
            );

            // Save to database with transaction tracking
            const result = await this.db.run(
                `INSERT INTO user_data_operations 
                 (user_id, data_points, data_type, data_quality, base_reward, final_reward, status, transaction_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [userId, dataPackage.dataPoints, dataPackage.type, dataPackage.quality, 
                 baseReward, finalReward, payoutResult.success ? 'completed' : 'failed', 
                 payoutResult.transactionHash || `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`]
            );

            if (payoutResult.success && finalReward > 0) {
                // Record blockchain transaction
                await this.db.run(
                    `INSERT INTO blockchain_transactions 
                     (transaction_hash, amount, currency, from_address, to_address, type, status, block_number, gas_used)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [payoutResult.transactionHash, finalReward, 'USD', 
                     this.config.COMPANY_WALLET_ADDRESS, userId, 'data_reward', 
                     'confirmed', payoutResult.blockNumber, payoutResult.gasUsed]
                );

                // Record revenue transaction
                await this.db.run(
                    `INSERT INTO revenue_transactions (amount, source, campaign_id, blockchain_tx_hash, status)
                     VALUES (?, 'user_data_contribution', ?, ?, 'completed')`,
                    [finalReward, `user_${userId}_${result.id}`, payoutResult.transactionHash]
                );
            }

            this.logger.success(`✅ Processed ${dataPackage.dataPoints} data points for user ${userId}. Reward: $${finalReward.toFixed(6)}`);

            return {
                success: payoutResult.success,
                userId,
                dataPoints: dataPackage.dataPoints,
                reward: finalReward,
                transactionId: result.id,
                blockchainTxHash: payoutResult.transactionHash,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            this.logger.error('Data processing reward failed:', error);
            return { success: false, error: error.message };
        }
    }

    async processMultiChainPayout(userId, amount, payoutType, metadata = {}) {
        try {
            // Determine payout chain based on user preference or optimal network
            const payoutChain = await this.determineOptimalPayoutChain(amount);
            
            let payoutResult;
            
            if (payoutChain === 'solana') {
                // Convert USD amount to SOL based on current price
                const solAmount = await this.convertUsdToSol(amount);
                payoutResult = await this.sendSOL(userId, solAmount);
                
            } else if (payoutChain === 'ethereum') {
                // Convert USD amount to USDT
                payoutResult = await this.sendUSDT(userId, amount, 'eth');
                
            } else {
                // Fallback to blockchain payout
                payoutResult = await this.paymentProcessor.processRevenuePayout(
                    userId,
                    amount,
                    'USD',
                    JSON.stringify({
                        type: payoutType,
                        timestamp: new Date().toISOString(),
                        ...metadata
                    })
                );
            }

            return {
                success: payoutResult.success || !!payoutResult.hash || !!payoutResult.signature,
                transactionHash: payoutResult.transactionHash || payoutResult.hash || payoutResult.signature,
                blockNumber: payoutResult.blockNumber,
                gasUsed: payoutResult.gasUsed,
                timestamp: new Date().toISOString(),
                chain: payoutChain
            };

        } catch (error) {
            this.logger.error('Multi-chain payout failed:', error);
            return { success: false, error: error.message };
        }
    }

    async determineOptimalPayoutChain(amount) {
        // Check wallet balances to determine optimal payout chain
        const balances = await this.checkWalletBalances();
        
        // Prefer Solana for smaller amounts due to lower fees
        if (amount < 10 && balances.solana && balances.solana.SOL > 0.01) {
            return 'solana';
        }
        
        // Prefer Ethereum for larger amounts or if Solana balance is low
        if (balances.ethereum && balances.ethereum.USDT > amount) {
            return 'ethereum';
        }
        
        // Fallback to native blockchain
        return 'native';
    }

    async convertUsdToSol(usdAmount) {
        try {
            // Fetch current SOL price from CoinGecko or similar
            const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
            const solPrice = response.data.solana.usd;
            return usdAmount / solPrice;
        } catch (error) {
            // Fallback conversion rate
            this.logger.warn('Failed to fetch SOL price, using fallback rate');
            return usdAmount / 100; // Approximate $100 per SOL
        }
    }

    // ... rest of your existing methods remain unchanged
    // (assessDataValue, calculateRelevanceScore, getMarketTrendScore, etc.)

    async executeMarketDataCollection() {
        try {
            if (!this.initialized) await this.initialize();

            this.logger.info('📊 Starting comprehensive market data collection...');

            const [newsData, weatherData, socialTrends] = await Promise.all([
                this.fetchNewsData(),
                this.fetchWeatherData(),
                this.fetchSocialTrends()
            ]);

            const aiContent = await this.generateAIContent(newsData, weatherData, socialTrends);
            const signals = await this.generateMarketSignals(newsData, weatherData, socialTrends, aiContent);
            const distributionResults = await this.distributeContent(aiContent, signals);
            const totalRevenue = await this.calculateTotalRevenue(distributionResults);

            // Process multi-chain settlement for total revenue
            if (totalRevenue > 0) {
                await this.processMultiChainRevenueSettlement(totalRevenue, 'market_data_collection');
            }

            await this.saveComprehensiveMarketData(newsData, weatherData, socialTrends, aiContent, signals, distributionResults, totalRevenue);

            this.logger.success(`✅ Market data collection completed. Total Revenue: $${totalRevenue.toFixed(2)}`);
            
            return { 
                success: true, 
                revenue: totalRevenue, 
                signals: signals.length,
                contentGenerated: aiContent.length,
                distributions: distributionResults.length
            };

        } catch (error) {
            this.logger.error('Market data collection failed:', error);
            return { success: false, error: error.message };
        }
    }

    async processMultiChainRevenueSettlement(amount, source) {
        try {
            // Determine optimal settlement chain
            const settlementChain = await this.determineOptimalSettlementChain(amount);
            let settlementResult;

            if (settlementChain === 'solana') {
                // Convert to SOL and send to company wallet
                const solAmount = await this.convertUsdToSol(amount);
                settlementResult = await this.sendSOL(this.config.COMPANY_WALLET_ADDRESS, solAmount);
                
            } else if (settlementChain === 'ethereum') {
                // Send USDT to company wallet
                settlementResult = await this.sendUSDT(this.config.COMPANY_WALLET_ADDRESS, amount, 'eth');
                
            } else {
                // Use native blockchain settlement
                settlementResult = await this.paymentProcessor.processRevenuePayout(
                    this.config.COMPANY_WALLET_ADDRESS,
                    amount,
                    'USD',
                    JSON.stringify({
                        source: source,
                        type: 'revenue_settlement',
                        timestamp: new Date().toISOString()
                    })
                );
            }

            if (settlementResult.success || settlementResult.hash || settlementResult.signature) {
                await this.db.run(
                    `INSERT INTO blockchain_transactions 
                     (transaction_hash, amount, currency, from_address, to_address, type, status)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [settlementResult.transactionHash || settlementResult.hash || settlementResult.signature, 
                     amount, 'USD', 'revenue_pool', this.config.COMPANY_WALLET_ADDRESS, 
                     'revenue_settlement', 'confirmed']
                );

                this.logger.success(`✅ Multi-chain revenue settlement processed: $${amount} USD on ${settlementChain}`);
            }

            return settlementResult;

        } catch (error) {
            this.logger.error('Multi-chain revenue settlement failed:', error);
            throw error;
        }
    }

    async determineOptimalSettlementChain(amount) {
        // Check gas fees and balances to determine optimal settlement chain
        const balances = await this.checkWalletBalances();
        
        // Prefer Solana for smaller settlements
        if (amount < 50 && balances.solana && balances.solana.SOL > 0.01) {
            return 'solana';
        }
        
        // Prefer Ethereum for larger settlements
        if (balances.ethereum && balances.ethereum.USDT > amount) {
            return 'ethereum';
        }
        
        // Fallback to native blockchain
        return 'native';
    }

    // ... rest of your existing methods remain unchanged

    async close() {
        if (this.initialized) {
            await this.db.close();
            this.initialized = false;
        }
        if (this.paymentProcessor) {
            await this.paymentProcessor.cleanup();
        }
    }
}

        // Export agent and status
        export { dataAgent };  
