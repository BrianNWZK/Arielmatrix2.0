/**
 * wallet.js - Unified Blockchain Wallet Manager
 * Integrated with Autonomous AI Engine for multi-chain operations
 * Now with BWAEZI Chain support and automated revenue consolidation
 */

import 'dotenv/config';
import { ethers } from 'ethers';
import { Connection, PublicKey, LAMPORTS_PER_SOL, Keypair, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import Web3 from 'web3';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import path from 'path';
import cron from 'node-cron';

// Get current directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// =========================================================================
// 1. CONFIGURATION
// =========================================================================
const ETHEREUM_RPC_URLS = [
    process.env.ETHEREUM_RPC_URL || 'https://rpc.ankr.com/eth',
    'https://eth-mainnet.public.blastapi.io',
    'https://rpc.ankr.com/multichain/43c6febde6850df38b14e31c2c5b293900a1ec693acf36108e43339cf57f8f97'
];

const SOLANA_RPC_URLS = [
    process.env.SOLANA_RPC_URL || 'https://solana-rpc.publicnode.com',
    'https://api.mainnet-beta.solana.com',
    'https://solana-mainnet.rpc.extrnode.com'
];

// BWAEZI Chain Configuration
const BWAEZI_RPC_URLS = [
    process.env.BWAEZI_RPC_URL || 'https://rpc.winr.games',
    'https://rpc.bwaezi.com',
    'https://mainnet.bwaezi-rpc.io'
];

// Contract addresses
const USDT_CONTRACT_ADDRESS_ETH = process.env.USDT_CONTRACT_ADDRESS_ETH || '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const USDT_MINT_ADDRESS_SOL = process.env.USDT_MINT_ADDRESS_SOL || 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const BWAEZI_CONTRACT_ADDRESS = process.env.BWAEZI_CONTRACT_ADDRESS || '0x00000000000000000000000000000000000a4b05';

// Trust wallet addresses for consolidation
const SOLANA_TRUST_WALLET_ADDRESS = process.env.SOLANA_TRUST_WALLET_ADDRESS;
const ETHEREUM_TRUST_WALLET_ADDRESS = process.env.ETHEREUM_TRUST_WALLET_ADDRESS;

// BWAEZI conversion rate
const BWAEZI_TO_USDT_RATE = 10000; // 1 BWAEZI = 10,000 USDT

// =========================================================================
// 2. GLOBAL VARIABLES
// =========================================================================
let ethProvider, solConnection, bwaeziProvider;
let ethWallet, solWallet, bwaeziWallet;
let ethWeb3; // For legacy Web3 compatibility

// =========================================================================
// 3. CORE INITIALIZATION FUNCTIONS
// =========================================================================

/**
 * Initializes all blockchain connections including BWAEZI Chain
 */
export async function initializeConnections() {
    console.log("🔄 Initializing blockchain connections...");
    
    try {
        // Try each Ethereum RPC URL until one works
        let ethConnected = false;
        for (const url of ETHEREUM_RPC_URLS) {
            try {
                ethProvider = new ethers.JsonRpcProvider(url);
                await ethProvider.getBlockNumber(); // Test connection
                console.log(`✅ Ethereum connected to: ${url}`);
                ethConnected = true;
                break;
            } catch (error) {
                console.warn(`❌ Failed to connect to Ethereum RPC: ${url}`, error.message);
                continue;
            }
        }
        
        if (!ethConnected) {
            throw new Error("All Ethereum RPC connections failed");
        }
        
        // Initialize Ethereum wallet if private key is available
        if (process.env.ETHEREUM_COLLECTION_WALLET_PRIVATE_KEY) {
            try {
                ethWallet = new ethers.Wallet(process.env.ETHEREUM_COLLECTION_WALLET_PRIVATE_KEY, ethProvider);
                console.log(`✅ Ethereum wallet connected: ${ethWallet.address}`);
            } catch (error) {
                console.error("❌ Failed to initialize Ethereum wallet:", error.message);
            }
        } else {
            console.warn("⚠️ Ethereum private key not set");
        }

        // Ethereum initialization with Web3 (for legacy compatibility)
        ethWeb3 = new Web3(new Web3.providers.HttpProvider(ETHEREUM_RPC_URLS[0]));

        // Try each Solana RPC URL until one works
        let solConnected = false;
        for (const url of SOLANA_RPC_URLS) {
            try {
                solConnection = new Connection(url, 'confirmed');
                await solConnection.getVersion(); // Test connection
                console.log(`✅ Solana connected to: ${url}`);
                solConnected = true;
                break;
            } catch (error) {
                console.warn(`❌ Failed to connect to Solana RPC: ${url}`, error.message);
                continue;
            }
        }
        
        if (!solConnected) {
            throw new Error("All Solana RPC connections failed");
        }
        
        // Initialize Solana wallet if private key is available
        if (process.env.SOLANA_COLLECTION_WALLET_PRIVATE_KEY) {
            try {
                // Handle different private key formats
                let privateKey;
                const pk = process.env.SOLANA_COLLECTION_WALLET_PRIVATE_KEY;
                
                if (pk.startsWith('[')) {
                    // JSON array format
                    privateKey = new Uint8Array(JSON.parse(pk));
                } else {
                    // Hex string format
                    privateKey = new Uint8Array(Buffer.from(pk.replace(/^0x/, ''), 'hex'));
                }
                
                solWallet = Keypair.fromSecretKey(privateKey);
                console.log(`✅ Solana wallet connected: ${solWallet.publicKey.toString()}`);
            } catch (error) {
                console.error("❌ Failed to initialize Solana wallet:", error.message);
            }
        } else {
            console.warn("⚠️ Solana private key not set");
        }

        // Initialize BWAEZI Chain connection
        let bwaeziConnected = false;
        for (const url of BWAEZI_RPC_URLS) {
            try {
                bwaeziProvider = new ethers.JsonRpcProvider(url);
                await bwaeziProvider.getBlockNumber(); // Test connection
                console.log(`✅ BWAEZI Chain connected to: ${url}`);
                bwaeziConnected = true;
                break;
            } catch (error) {
                console.warn(`❌ Failed to connect to BWAEZI RPC: ${url}`, error.message);
                continue;
            }
        }
        
        if (!bwaeziConnected) {
            throw new Error("All BWAEZI Chain RPC connections failed");
        }
        
        // Initialize BWAEZI wallet if private key is available
        if (process.env.BWAEZI_COLLECTION_WALLET_PRIVATE_KEY) {
            try {
                bwaeziWallet = new ethers.Wallet(process.env.BWAEZI_COLLECTION_WALLET_PRIVATE_KEY, bwaeziProvider);
                console.log(`✅ BWAEZI wallet connected: ${bwaeziWallet.address}`);
            } catch (error) {
                console.error("❌ Failed to initialize BWAEZI wallet:", error.message);
            }
        } else {
            console.warn("⚠️ BWAEZI private key not set");
        }

        console.log("✅ All blockchain connections initialized successfully");
        
        // Start autonomous revenue consolidation scheduler
        startRevenueConsolidationScheduler();
        
        return true;
    } catch (error) {
        console.error("❌ Failed to initialize connections:", error.message);
        return false;
    }
}

// =========================================================================
// 4. WALLET BALANCE FUNCTIONS
// =========================================================================

export async function getWalletBalances() {
    try {
        const balances = {
            ethereum: { native: 0, usdt: 0, address: ethWallet?.address || '' },
            solana: { native: 0, usdt: 0, address: solWallet?.publicKey?.toString() || '' },
            bwaezi: { native: 0, usdt: 0, address: bwaeziWallet?.address || '' },
            timestamp: Date.now()
        };

        // Ethereum balances
        if (ethWallet) {
            try {
                const ethBalance = await ethProvider.getBalance(ethWallet.address);
                balances.ethereum.native = parseFloat(ethers.formatEther(ethBalance));
                
                // Only try to get USDT balance if we have the contract address
                if (USDT_CONTRACT_ADDRESS_ETH) {
                    try {
                        const usdtContract = new ethers.Contract(
                            USDT_CONTRACT_ADDRESS_ETH, 
                            ["function balanceOf(address owner) view returns (uint256)"], 
                            ethProvider
                        );
                        const usdtBalance = await usdtContract.balanceOf(ethWallet.address);
                        balances.ethereum.usdt = parseFloat(ethers.formatUnits(usdtBalance, 6));
                    } catch (error) {
                        console.warn("⚠️ Could not fetch USDT balance on Ethereum:", error.message);
                    }
                }
            } catch (error) {
                console.error("❌ Error fetching Ethereum balances:", error.message);
            }
        }

        // Solana balances
        if (solWallet) {
            try {
                const solBalance = await solConnection.getBalance(solWallet.publicKey);
                balances.solana.native = solBalance / LAMPORTS_PER_SOL;
                
                // Only try to get USDT balance if we have the mint address
                if (USDT_MINT_ADDRESS_SOL) {
                    try {
                        const usdtMintAddress = new PublicKey(USDT_MINT_ADDRESS_SOL);
                        const associatedTokenAddress = await getAssociatedTokenAddress(usdtMintAddress, solWallet.publicKey);
                        
                        // Check if token account exists
                        const tokenAccountInfo = await solConnection.getAccountInfo(associatedTokenAddress);
                        if (tokenAccountInfo) {
                            const tokenBalance = await solConnection.getTokenAccountBalance(associatedTokenAddress);
                            balances.solana.usdt = tokenBalance.value.uiAmount || 0;
                        } else {
                            balances.solana.usdt = 0;
                        }
                    } catch (error) {
                        console.warn("⚠️ Could not fetch USDT balance on Solana:", error.message);
                    }
                }
            } catch (error) {
                console.error("❌ Error fetching Solana balances:", error.message);
            }
        }

        // BWAEZI Chain balances
        if (bwaeziWallet) {
            try {
                const bwaeziBalance = await bwaeziProvider.getBalance(bwaeziWallet.address);
                balances.bwaezi.native = parseFloat(ethers.formatEther(bwaeziBalance));
                
                // Calculate USDT equivalent for BWAEZI
                balances.bwaezi.usdt = balances.bwaezi.native * BWAEZI_TO_USDT_RATE;
            } catch (error) {
                console.error("❌ Error fetching BWAEZI balances:", error.message);
            }
        }

        return balances;
    } catch (error) {
        console.error("❌ Error in getWalletBalances:", error.message);
        return {
            ethereum: { native: 0, usdt: 0, address: '' },
            solana: { native: 0, usdt: 0, address: '' },
            bwaezi: { native: 0, usdt: 0, address: '' },
            error: error.message,
            timestamp: Date.now()
        };
    }
}

export function getWalletAddresses() {
    return {
        ethereum: ethWallet?.address || '',
        solana: solWallet?.publicKey?.toString() || '',
        bwaezi: bwaeziWallet?.address || '',
        timestamp: Date.now()
    };
}

// =========================================================================
// 5. TRANSACTION FUNCTIONS
// =========================================================================

export async function sendSOL(toAddress, amount) {
    try {
        if (!solWallet) throw new Error("Solana wallet not initialized");
        if (!solConnection) throw new Error("Solana connection not initialized");
        
        const toPublicKey = new PublicKey(toAddress);
        const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
        
        const transaction = new Transaction().add(
            SystemProgram.transfer({ 
                fromPubkey: solWallet.publicKey, 
                toPubkey: toPublicKey, 
                lamports 
            })
        );
        
        const { blockhash, lastValidBlockHeight } = await solConnection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = solWallet.publicKey;
        
        const signature = await sendAndConfirmTransaction(
            solConnection, 
            transaction, 
            [solWallet],
            {
                commitment: 'confirmed',
                preflightCommitment: 'confirmed'
            }
        );
        
        return { success: true, signature };
    } catch (error) {
        console.error("❌ Error sending SOL:", error);
        return { success: false, error: error.message };
    }
}

export async function sendETH(toAddress, amount) {
    try {
        if (!ethWallet) throw new Error("Ethereum wallet not initialized");
        if (!ethers.isAddress(toAddress)) throw new Error("Invalid Ethereum address");
        
        const tx = await ethWallet.sendTransaction({
            to: toAddress,
            value: ethers.parseEther(amount.toString()),
            gasLimit: 21000
        });
        
        return { success: true, hash: tx.hash };
    } catch (error) {
        console.error("❌ Error sending ETH:", error);
        return { success: false, error: error.message };
    }
}

export async function sendBwaezi(toAddress, amount) {
    try {
        if (!bwaeziWallet) throw new Error("BWAEZI wallet not initialized");
        if (!ethers.isAddress(toAddress)) throw new Error("Invalid BWAEZI address");
        
        const tx = await bwaeziWallet.sendTransaction({
            to: toAddress,
            value: ethers.parseEther(amount.toString()),
            gasLimit: 21000
        });
        
        return { success: true, hash: tx.hash };
    } catch (error) {
        console.error("❌ Error sending BWAEZI:", error);
        return { success: false, error: error.message };
    }
}

export async function sendUSDT(toAddress, amount, chain) {
    if (chain === 'eth') {
        try {
            if (!ethWallet) throw new Error("Ethereum wallet not initialized");
            if (!ethers.isAddress(toAddress)) throw new Error("Invalid Ethereum address");
            if (!USDT_CONTRACT_ADDRESS_ETH) throw new Error("USDT contract address not configured");
            
            const usdtContract = new ethers.Contract(
                USDT_CONTRACT_ADDRESS_ETH, 
                [
                    "function transfer(address to, uint256 amount) returns (bool)",
                    "function decimals() view returns (uint8)"
                ], 
                ethWallet
            );
            
            // Get token decimals
            const decimals = await usdtContract.decimals();
            const amountInWei = ethers.parseUnits(amount.toString(), decimals);
            
            const tx = await usdtContract.transfer(toAddress, amountInWei);
            return { success: true, hash: tx.hash };
        } catch (error) {
            console.error("❌ Error sending USDT on Ethereum:", error);
            return { success: false, error: error.message };
        }
    } else if (chain === 'sol') {
        try {
            if (!solWallet) throw new Error("Solana wallet not initialized");
            if (!solConnection) throw new Error("Solana connection not initialized");
            if (!USDT_MINT_ADDRESS_SOL) throw new Error("USDT mint address not configured");
            
            const toPublicKey = new PublicKey(toAddress);
            const usdtMintAddress = new PublicKey(USDT_MINT_ADDRESS_SOL);
            
            const fromTokenAccount = await getAssociatedTokenAddress(usdtMintAddress, solWallet.publicKey);
            const toTokenAccount = await getAssociatedTokenAddress(usdtMintAddress, toPublicKey);
            
            // Check if recipient token account exists, create if not
            const transaction = new Transaction();
            const toAccountInfo = await solConnection.getAccountInfo(toTokenAccount);
            
            if (!toAccountInfo) {
                transaction.add(
                    createAssociatedTokenAccountInstruction(
                        solWallet.publicKey,
                        toTokenAccount,
                        toPublicKey,
                        usdtMintAddress
                    )
                );
            }
            
            transaction.add(
                createTransferInstruction(
                    fromTokenAccount, 
                    toTokenAccount, 
                    solWallet.publicKey, 
                    BigInt(Math.floor(amount * 10 ** 6)) // USDT on Solana has 6 decimals
                )
            );
            
            const { blockhash, lastValidBlockHeight } = await solConnection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = solWallet.publicKey;
            
            const signature = await sendAndConfirmTransaction(
                solConnection, 
                transaction, 
                [solWallet],
                {
                    commitment: 'confirmed',
                    preflightCommitment: 'confirmed'
                }
            );
            
            return { success: true, signature };
        } catch (error) {
            console.error("❌ Error sending USDT on Solana:", error);
            return { success: false, error: error.message };
        }
    }
    return { success: false, error: "Invalid chain specified" };
}

// =========================================================================
// 6. AUTONOMOUS REVENUE CONSOLIDATION
// =========================================================================

/**
 * Autonomous revenue consolidation - moves all revenue every hour
 * Leaves 5-10% for operational costs
 */
async function consolidateRevenue() {
    console.log("🔄 Starting autonomous revenue consolidation...");
    
    try {
        const balances = await getWalletBalances();
        const results = [];
        
        // Calculate amounts to transfer (90-95% of balance)
        const operationalCostPercentage = 0.05 + (Math.random() * 0.05); // 5-10% for operational costs
        const transferPercentage = 1 - operationalCostPercentage;
        
        // Consolidate Ethereum
        if (balances.ethereum.native > 0.001 && ETHEREUM_TRUST_WALLET_ADDRESS) { // Minimum threshold
            const amountToTransfer = balances.ethereum.native * transferPercentage;
            if (amountToTransfer > 0.0001) { // Ensure meaningful amount
                try {
                    const result = await sendETH(ETHEREUM_TRUST_WALLET_ADDRESS, amountToTransfer);
                    results.push({
                        chain: 'ethereum',
                        asset: 'ETH',
                        amount: amountToTransfer,
                        success: result.success,
                        tx: result.success ? result.hash : null,
                        error: result.error
                    });
                } catch (error) {
                    results.push({
                        chain: 'ethereum',
                        asset: 'ETH',
                        amount: amountToTransfer,
                        success: false,
                        error: error.message
                    });
                }
            }
        }
        
        // Consolidate Ethereum USDT
        if (balances.ethereum.usdt > 1 && ETHEREUM_TRUST_WALLET_ADDRESS) { // Minimum 1 USDT
            const amountToTransfer = balances.ethereum.usdt * transferPercentage;
            if (amountToTransfer > 0.1) { // Ensure meaningful amount
                try {
                    const result = await sendUSDT(ETHEREUM_TRUST_WALLET_ADDRESS, amountToTransfer, 'eth');
                    results.push({
                        chain: 'ethereum',
                        asset: 'USDT',
                        amount: amountToTransfer,
                        success: result.success,
                        tx: result.success ? result.hash : null,
                        error: result.error
                    });
                } catch (error) {
                    results.push({
                        chain: 'ethereum',
                        asset: 'USDT',
                        amount: amountToTransfer,
                        success: false,
                        error: error.message
                    });
                }
            }
        }
        
        // Consolidate Solana
        if (balances.solana.native > 0.001 && SOLANA_TRUST_WALLET_ADDRESS) { // Minimum threshold
            const amountToTransfer = balances.solana.native * transferPercentage;
            if (amountToTransfer > 0.0001) { // Ensure meaningful amount
                try {
                    const result = await sendSOL(SOLANA_TRUST_WALLET_ADDRESS, amountToTransfer);
                    results.push({
                        chain: 'solana',
                        asset: 'SOL',
                        amount: amountToTransfer,
                        success: result.success,
                        tx: result.success ? result.signature : null,
                        error: result.error
                    });
                } catch (error) {
                    results.push({
                        chain: 'solana',
                        asset: 'SOL',
                        amount: amountToTransfer,
                        success: false,
                        error: error.message
                    });
                }
            }
        }
        
        // Consolidate Solana USDT
        if (balances.solana.usdt > 1 && SOLANA_TRUST_WALLET_ADDRESS) { // Minimum 1 USDT
            const amountToTransfer = balances.solana.usdt * transferPercentage;
            if (amountToTransfer > 0.1) { // Ensure meaningful amount
                try {
                    const result = await sendUSDT(SOLANA_TRUST_WALLET_ADDRESS, amountToTransfer, 'sol');
                    results.push({
                        chain: 'solana',
                        asset: 'USDT',
                        amount: amountToTransfer,
                        success: result.success,
                        tx: result.success ? result.signature : null,
                        error: result.error
                    });
                } catch (error) {
                    results.push({
                        chain: 'solana',
                        asset: 'USDT',
                        amount: amountToTransfer,
                        success: false,
                        error: error.message
                    });
                }
            }
        }
        
        // Note: BWAEZI conversion to USDT would happen through external DEX/swap service
        // For now, we track the USDT equivalent but don't auto-transfer BWAEZI
        if (balances.bwaezi.usdt > 100) { // Only if significant amount (>100 USDT equivalent)
            console.log(`ℹ️ BWAEZI balance equivalent to ${balances.bwaezi.usdt} USDT - requires manual DEX conversion`);
            results.push({
                chain: 'bwaezi',
                asset: 'BWAEZI',
                amount: balances.bwaezi.native,
                usdtEquivalent: balances.bwaezi.usdt,
                note: 'Requires manual conversion via DEX',
                success: true
            });
        }
        
        console.log("✅ Revenue consolidation completed:", results);
        return results;
        
    } catch (error) {
        console.error("❌ Error in revenue consolidation:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Starts the autonomous revenue consolidation scheduler
 */
function startRevenueConsolidationScheduler() {
    console.log("⏰ Starting autonomous revenue consolidation scheduler (runs every hour)...");
    
    // Schedule to run every hour
    cron.schedule('0 * * * *', async () => {
        console.log(`🕐 Scheduled revenue consolidation started at ${new Date().toISOString()}`);
        await consolidateRevenue();
    });
    
    // Also run immediately on startup
    setTimeout(() => {
        console.log("🚀 Initial revenue consolidation running...");
        consolidateRevenue();
    }, 30000); // Wait 30 seconds after startup
}

// =========================================================================
// 7. INTEGRATION FUNCTIONS FOR AUTONOMOUS AI ENGINE
// =========================================================================

export async function processRevenuePayment(payment) {
    const { type, amount, toAddress, token = 'native' } = payment;
    
    try {
        let result;
        
        if (token === 'native') {
            if (type === 'sol') {
                result = await sendSOL(toAddress, amount);
            } else if (type === 'eth') {
                result = await sendETH(toAddress, amount);
            } else if (type === 'bwaezi') {
                result = await sendBwaezi(toAddress, amount);
            } else {
                return { success: false, error: `Unsupported chain for native token: ${type}` };
            }
        } else if (token === 'usdt') {
            result = await sendUSDT(toAddress, amount, type);
        } else {
            return { success: false, error: `Unsupported token: ${token}` };
        }
        
        return {
            success: result.success,
            transaction: result,
            paymentDetails: payment,
            timestamp: Date.now()
        };
        
    } catch (error) {
        console.error("❌ Error processing revenue payment:", error);
        return {
            success: false,
            error: error.message,
            paymentDetails: payment,
            timestamp: Date.now()
        };
    }
}

export async function checkBlockchainHealth() {
    try {
        const [ethHealth, solHealth, bwaeziHealth, walletBalances] = await Promise.allSettled([
            ethProvider?.getBlockNumber() || Promise.resolve(false),
            solConnection?.getLatestBlockhash() || Promise.resolve(false),
            bwaeziProvider?.getBlockNumber() || Promise.resolve(false),
            getWalletBalances()
        ]);
        
        return {
            healthy: ethHealth.status === 'fulfilled' && solHealth.status === 'fulfilled' && bwaeziHealth.status === 'fulfilled',
            ethereum: ethHealth.status === 'fulfilled' ? { connected: true, block: ethHealth.value } : { connected: false },
            solana: solHealth.status === 'fulfilled' ? { connected: true, blockhash: solHealth.value } : { connected: false },
            bwaezi: bwaeziHealth.status === 'fulfilled' ? { connected: true, block: bwaeziHealth.value } : { connected: false },
            wallets: walletBalances.status === 'fulfilled' ? walletBalances.value : null,
            timestamp: Date.now()
        };
    } catch (error) {
        return {
            healthy: false,
            error: error.message,
            timestamp: Date.now()
        };
    }
}

// =========================================================================
// 8. LEGACY COMPATIBILITY FUNCTIONS
// =========================================================================

// For compatibility with autonomous-ai-engine.js
export function getEthereumWeb3() {
    return ethWeb3;
}

export function getSolanaConnection() {
    return solConnection;
}

export function getBwaeziProvider() {
    return bwaeziProvider;
}

export function getEthereumAccount() {
    return { 
        address: ethWallet?.address || '0x0000000000000000000000000000000000000000',
        privateKey: ethWallet?.privateKey || ''
    };
}

export function getSolanaKeypair() {
    return solWallet || { 
        publicKey: { 
            toBase58: () => '11111111111111111111111111111111' 
        } 
    };
}

export function getBwaeziAccount() {
    return { 
        address: bwaeziWallet?.address || '0x0000000000000000000000000000000000000000',
        privateKey: bwaeziWallet?.privateKey || ''
    };
}

// =========================================================================
// 9. UTILITY FUNCTIONS
// =========================================================================

export function validateAddress(address, chain) {
    try {
        if (chain === 'eth' || chain === 'bwaezi') {
            return ethers.isAddress(address);
        } else if (chain === 'sol') {
            new PublicKey(address); // This will throw if invalid
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

export function formatBalance(balance, decimals = 6) {
    return parseFloat(balance.toFixed(decimals));
}

export async function testAllConnections() {
    console.log("Testing all RPC connections...");
    return await checkBlockchainHealth();
}

// Manual trigger for revenue consolidation
export async function triggerRevenueConsolidation() {
    console.log("🚀 Manually triggering revenue consolidation...");
    return await consolidateRevenue();
}

// =========================================================================
// 10. DEFAULT EXPORT
// =========================================================================

export default {
    initializeConnections,
    getWalletBalances,
    getWalletAddresses,
    sendSOL,
    sendETH,
    sendBwaezi,
    sendUSDT,
    processRevenuePayment,
    checkBlockchainHealth,
    validateAddress,
    formatBalance,
    testAllConnections,
    triggerRevenueConsolidation,
    
    // Legacy compatibility
    getEthereumWeb3,
    getSolanaConnection,
    getBwaeziProvider,
    getEthereumAccount,
    getSolanaKeypair,
    getBwaeziAccount
};
