// backend/agents/cryptoAgent.js
import { BrianNwaezikeChain } from '../blockchain/BrianNwaezikeChain.js';
import { QuantumShield } from 'quantum-resistant-crypto';
import { AIThreatDetector } from 'ai-security-module';
import { CrossChainBridge } from 'omnichain-interoperability';
import { ShardingManager } from 'infinite-scalability-engine';
import { EnergyEfficientConsensus } from 'carbon-negative-consensus';
import { yourSQLite } from 'ariel-sqlite-engine';
import ccxt from 'ccxt';
import axios from 'axios';
import Web3 from 'web3';
import { ethers } from 'ethers';
import { Connection, PublicKey, LAMPORTS_PER_SOL, Keypair, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction } from '@solana/spl/token';

class EnhancedCryptoAgent {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.DRY_RUN = true; // ENABLE DRY RUN MODE - NO REAL TRADING
        this.blockchain = new BrianNwaezikeChain(config);
        this.quantumShield = new QuantumShield();
        this.threatDetector = new AIThreatDetector();
        this.exchanges = new Map();
        this.openPositions = new Map();
        this.lastExecutionTime = 'Never';
        this.lastStatus = 'idle';
        this.lastTotalTransactions = 0;
        this.lastConceptualEarnings = 0;
        this.lastGasBalance = 0;
        
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
        
        // Initialize databases
        this.initDatabases();
    }

    initDatabases() {
        // Trading history database
        this.db = yourSQLite.createDatabase('./data/crypto_agent.db');
        
        this.db.run(yourSQLite.optimizedQuery(`
            CREATE TABLE IF NOT EXISTS crypto_trades (
                id TEXT PRIMARY KEY,
                symbol TEXT,
                type TEXT,
                amount REAL,
                price REAL,
                exchange TEXT,
                tx_hash TEXT,
                profit_loss REAL,
                quantum_signature TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            ) WITH OPTIMIZATION=QUANTUM_COMPRESSION
        `));
        
        this.db.run(yourSQLite.optimizedQuery(`
            CREATE TABLE IF NOT EXISTS arbitrage_opportunities (
                id TEXT PRIMARY KEY,
                symbol TEXT,
                buy_exchange TEXT,
                sell_exchange TEXT,
                buy_price REAL,
                sell_price REAL,
                potential_profit REAL,
                executed BOOLEAN DEFAULT FALSE,
                actual_profit REAL,
                quantum_proof TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            ) WITH INDEX=QUANTUM_FAST_LOOKUP
        `));
        
        this.db.run(yourSQLite.optimizedQuery(`
            CREATE TABLE IF NOT EXISTS market_data (
                id TEXT PRIMARY KEY,
                symbol TEXT,
                price REAL,
                volume_24h REAL,
                change_24h REAL,
                source TEXT,
                quantum_seal TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            ) WITH OPTIMIZATION=QUANTUM_COMPRESSION
        `));
        
        // Wallet transactions table
        this.db.run(yourSQLite.optimizedQuery(`
            CREATE TABLE IF NOT EXISTS wallet_transactions (
                id TEXT PRIMARY KEY,
                chain TEXT,
                type TEXT,
                from_address TEXT,
                to_address TEXT,
                amount REAL,
                token TEXT,
                tx_hash TEXT,
                status TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            ) WITH OPTIMIZATION=QUANTUM_COMPRESSION
        `));
    }

    async initialize() {
        this.logger.info('🚀 Initializing Enhanced Crypto Agent with BrianNwaezikeChain Integration...');
        this.logger.warn('⚠️ DRY RUN MODE ENABLED - No real trades will be executed');
        
        // Initialize wallet connections
        await this.initializeWalletConnections();
        
        // Initialize multiple exchanges for arbitrage opportunities
        const exchangeConfigs = [
            { id: 'binance', class: ccxt.binance },
            { id: 'coinbase', class: ccxt.coinbasepro },
            { id: 'kraken', class: ccxt.kraken },
            { id: 'kucoin', class: ccxt.kucoin }
        ];

        for (const exchangeConfig of exchangeConfigs) {
            try {
                // In dry run mode, we'll create simulated exchange instances
                const exchange = new exchangeConfig.class({
                    apiKey: this.config[`${exchangeConfig.id.toUpperCase()}_API_KEY`] || 'dry-run-key',
                    secret: this.config[`${exchangeConfig.id.toUpperCase()}_API_SECRET`] || 'dry-run-secret',
                    enableRateLimit: true
                });
                
                // For dry run, we'll simulate market data instead of loading real markets
                if (this.DRY_RUN) {
                    this.logger.info(`✅ ${exchangeConfig.id} exchange initialized (Simulated - Dry Run)`);
                } else {
                    await exchange.loadMarkets();
                    this.logger.success(`✅ ${exchangeConfig.id} exchange initialized`);
                }
                
                this.exchanges.set(exchangeConfig.id, exchange);
            } catch (error) {
                this.logger.error(`Failed to initialize ${exchangeConfig.id}: ${error.message}`);
            }
        }

        // Initialize blockchain components
        await this.blockchain.initBlockchainTables();
        this.logger.success('✅ BrianNwaezikeChain integration initialized');
    }

    async initializeWalletConnections() {
        this.logger.info('🔗 Initializing multi-chain wallet connections...');
        
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
                this.logger.success('✅ Solana wallet initialized');
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
                this.logger.success('✅ Ethereum wallet initialized');
            }
            
            // Test connections
            await this.testAllConnections();
            
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
        this.logger.info("Testing all RPC connections:");
        
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

    // Wallet functions
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
        if (this.DRY_RUN) {
            this.logger.info(`[DRY RUN] Would send ${amount} SOL to ${toAddress}`);
            return { signature: 'dry-run-signature' };
        }

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
        if (this.DRY_RUN) {
            this.logger.info(`[DRY RUN] Would send ${amount} USDT on ${chain} to ${toAddress}`);
            return { hash: 'dry-run-hash' };
        }

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
        const transactionId = `wallet_${this.quantumShield.randomBytes(16)}`;
        
        await this.db.run(
            `INSERT INTO wallet_transactions (id, chain, type, from_address, to_address, amount, token, tx_hash, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [transactionId, chain, type, fromAddress, toAddress, amount, token, txHash, 'completed']
        );
    }

    async run() {
        this.lastExecutionTime = new Date().toISOString();
        this.lastStatus = 'running';
        this.lastTotalTransactions = 0;
        this.logger.info('💰 Enhanced Crypto Agent Activated: Managing on-chain assets...');
        
        if (this.DRY_RUN) {
            this.logger.warn('⚠️ DRY RUN MODE - Simulating trades only');
        }
        
        const startTime = process.hrtime.bigint();

        try {
            // Phase 1: Configuration & Remediation
            const newlyRemediatedKeys = await this._remediateAndValidateConfig();
            
            // Phase 2: Self-Funding Check (Skip in dry run for BSC)
            let hasSufficientFunds = true;
            if (!this.DRY_RUN) {
                hasSufficientFunds = await this._checkGasWalletBalance();
                if (!hasSufficientFunds) {
                    this.logger.error('🚨 Aborting crypto operations due to insufficient gas.');
                    throw { message: 'insufficient_capital_for_onchain_ops' };
                }
            }

            // Phase 3: Check multi-chain balances
            const walletBalances = await this.checkWalletBalances();
            this.logger.info(`💰 Multi-chain balances: ${JSON.stringify(walletBalances)}`);

            // Phase 4: Market Analysis
            const marketData = await this._analyzeCryptoMarkets();

            // Phase 5: Execute Multiple Revenue Strategies
            const results = [];
            
            // Execute arbitrage strategies
            const arbitrageResults = await this.executeArbitrageStrategy();
            results.push(...arbitrageResults);
            
            // Execute market making
            const marketMakingResults = await this.executeMarketMakingForMajorPairs();
            results.push(...marketMakingResults);
            
            // Execute cross-chain opportunities
            const crossChainResults = await this.executeCrossChainOpportunities(marketData);
            results.push(...crossChainResults);
            
            // Execute BrianNwaezikeChain native strategies
            const blockchainResults = await this.executeBlockchainStrategies();
            results.push(...blockchainResults);

            // Phase 6: Process Results and Trigger Payouts
            const totalTransactions = results.length;
            this.lastTotalTransactions = totalTransactions;

            let totalProfit = results.reduce((sum, result) => sum + (result.profit || 0), 0);
            this.lastConceptualEarnings = totalProfit;

            if (totalTransactions > 0) {
                this.logger.info(`🎯 Generated $${totalProfit.toFixed(2)} from ${totalTransactions} transactions`);
                
                // Convert profits to BWAEZI tokens on the blockchain
                if (totalProfit > 0) {
                    await this.convertProfitsToBWAEZI(totalProfit);
                }
            } else {
                this.logger.info('No profitable transactions executed');
            }

            const endTime = process.hrtime.bigint();
            const durationMs = Number(endTime - startTime) / 1_000_000;
            this.lastStatus = 'success';
            this.logger.success(`✅ Enhanced Crypto Agent Completed in ${durationMs.toFixed(0)}ms | Total TXs: ${totalTransactions} | Profit: $${totalProfit.toFixed(2)}`);
            
            return {
                status: 'success',
                transactions: results,
                totalProfit,
                durationMs,
                newlyRemediatedKeys,
                walletBalances
            };

        } catch (error) {
            const endTime = process.hrtime.bigint();
            const durationMs = Number(endTime - startTime) / 1_000_000;
            this.lastStatus = 'failed';
            this.logger.error(`🚨 Enhanced Crypto Agent Critical Failure: ${error.message} in ${durationMs.toFixed(0)}ms`);
            throw { message: error.message, duration: durationMs };
        }
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

    // ... rest of the existing methods (executeArbitrageStrategy, _findArbitrageOpportunities, etc.)
    // These remain unchanged from your original code

    async _checkGasWalletBalance() {
        try {
            if (!this.config.BSC_NODE || !this.config.GAS_WALLET) {
                throw new Error('Missing BSC node or gas wallet configuration');
            }

            const provider = new ethers.providers.JsonRpcProvider(this.config.BSC_NODE);
            const balance = await provider.getBalance(this.config.GAS_WALLET);
            const bnbBalance = parseFloat(ethers.utils.formatEther(balance));
            this.lastGasBalance = bnbBalance;
            this.logger.info(`Current GAS_WALLET balance: ${bnbBalance} BNB`);

            const MIN_BNB_THRESHOLD = 0.05;
            if (bnbBalance < MIN_BNB_THRESHOLD) {
                this.logger.warn(`⚠️ CRITICAL: Low gas: ${bnbBalance} BNB. Required: ${MIN_BNB_THRESHOLD} BNB.`);
                
                // Attempt to fund from Ethereum wallet if available
                if (this.ethWallet) {
                    const ethBalance = await this.ethProvider.getBalance(this.ethWallet.address);
                    if (parseFloat(ethers.formatEther(ethBalance)) > 0.01) {
                        this.logger.info('Attempting to fund BSC wallet from Ethereum wallet...');
                        // This would require a cross-chain bridge implementation
                    }
                }
                
                return false;
            }
            this.logger.success(`✅ Sufficient gas: ${bnbBalance} BNB`);
            return true;
        } catch (error) {
            this.logger.error(`🚨 Error checking gas balance: ${error.message}`);
            return false;
        }
    }

    getStatus() {
        return {
            agent: 'EnhancedCryptoAgent',
            lastExecution: this.lastExecutionTime,
            lastStatus: this.lastStatus,
            lastTotalTransactions: this.lastTotalTransactions,
            lastConceptualEarnings: this.lastConceptualEarnings,
            lastGasBalance: this.lastGasBalance,
            dryRun: this.DRY_RUN,
            walletInitialized: !!(this.ethWallet || this.solWallet)
        };
    }
}

export default EnhancedCryptoAgent;
