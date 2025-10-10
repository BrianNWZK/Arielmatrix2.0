// backend/agents/wallet.js - PRODUCTION READY v4.5 - BWAEZI CONFIG INTEGRATION
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, sendAndConfirmTransaction, Keypair } from '@solana/web3.js';
import { ethers } from 'ethers';
import axios from 'axios';
import crypto from 'crypto';
import { getDatabase, createDatabase, DatabaseError } from '../database/BrianNwaezikeDB.js';
import { BWAEZI_SOVEREIGN_CONFIG } from '../../config/bwaezi-config.js';

// Real RPC endpoints for production with BWAEZI sovereign configuration
const SOLANA_RPC_ENDPOINTS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-api.projectserum.com',
  'https://rpc.ankr.com/solana'
];

const ETHEREUM_RPC_ENDPOINTS = [
  'https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161',
  'https://rpc.ankr.com/eth',
  'https://eth-mainnet.public.blastapi.io'
];

// Global connection instances
let solanaConnections = [];
let ethereumProviders = [];
let connectionsInitialized = false;
let databaseInstance = null;

// BWAEZI Sovereign Economic Zone Configuration
const SOVEREIGN_CONFIG = BWAEZI_SOVEREIGN_CONFIG;

// Initialize all blockchain connections with BWAEZI sovereign parameters
async function initializeConnections() {
  if (connectionsInitialized) {
    console.log('✅ Blockchain connections already initialized');
    return;
  }

  console.log('🏛️ Initializing BWAEZI Sovereign Economic Zone Multi-Chain System...');
  console.log(`📊 Sovereign Owner: ${SOVEREIGN_CONFIG.SOVEREIGN_OWNER}`);
  console.log(`💰 Maximum Service Fee: ${(SOVEREIGN_CONFIG.AI_GOVERNANCE.MAX_TAX_RATE * 100).toFixed(1)}%`);
  console.log(`🔄 Reinvestment Rate: ${(SOVEREIGN_CONFIG.AI_GOVERNANCE.REINVESTMENT_RATE * 100).toFixed(1)}%`);

  try {
    // Initialize database first with sovereign schema
    await initializeDatabase();

    // Initialize Solana connections
    for (const endpoint of SOLANA_RPC_ENDPOINTS) {
      try {
        const connection = new Connection(endpoint, 'confirmed');
        const version = await connection.getVersion();
        solanaConnections.push(connection);
        console.log(`✅ Solana RPC connected: ${endpoint} (v${version['solana-core']})`);
      } catch (error) {
        console.warn(`⚠️ Solana RPC failed: ${endpoint}`, error.message);
      }
    }

    // Initialize Ethereum connections
    for (const endpoint of ETHEREUM_RPC_ENDPOINTS) {
      try {
        const provider = new ethers.JsonRpcProvider(endpoint);
        const network = await provider.getNetwork();
        ethereumProviders.push(provider);
        console.log(`✅ Ethereum RPC connected: ${endpoint} (Chain ID: ${network.chainId})`);
      } catch (error) {
        console.warn(`⚠️ Ethereum RPC failed: ${endpoint}`, error.message);
      }
    }

    if (solanaConnections.length === 0 && ethereumProviders.length === 0) {
      throw new Error('No blockchain connections could be established');
    }

    connectionsInitialized = true;
    console.log(`✅ BWAEZI Multi-chain Sovereign System Initialized: ${solanaConnections.length} Solana, ${ethereumProviders.length} Ethereum`);

  } catch (error) {
    console.error('❌ BWAEZI Sovereign System initialization failed:', error);
    throw error;
  }
}

// Initialize database connection with sovereign economic zone schema
async function initializeDatabase() {
  if (databaseInstance) {
    return databaseInstance;
  }

  try {
    databaseInstance = await createDatabase('./data/bwaezi_sovereign.db', (db) => {
      // Sovereign Economic Zone Core Tables
      db.exec(`
        CREATE TABLE IF NOT EXISTS sovereign_transactions (
          id TEXT PRIMARY KEY,
          transaction_hash TEXT UNIQUE NOT NULL,
          from_address TEXT NOT NULL,
          to_address TEXT NOT NULL,
          amount REAL NOT NULL,
          currency TEXT NOT NULL,
          network TEXT NOT NULL,
          status TEXT NOT NULL,
          sovereign_fee REAL DEFAULT 0,
          revenue_share REAL DEFAULT 0,
          gas_used INTEGER,
          transaction_fee REAL,
          block_number INTEGER,
          sovereign_service_type TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          confirmed_at DATETIME
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS sovereign_balances (
          address TEXT PRIMARY KEY,
          network TEXT NOT NULL,
          balance REAL DEFAULT 0,
          usdt_balance REAL DEFAULT 0,
          sovereign_fees_collected REAL DEFAULT 0,
          revenue_distributed REAL DEFAULT 0,
          last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS sovereign_treasury (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transaction_type TEXT NOT NULL,
          amount REAL NOT NULL,
          currency TEXT NOT NULL,
          description TEXT,
          balance_after REAL NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS sovereign_services (
          service_id TEXT PRIMARY KEY,
          service_type TEXT NOT NULL,
          provider_address TEXT NOT NULL,
          registration_fee_paid BOOLEAN DEFAULT FALSE,
          license_active BOOLEAN DEFAULT FALSE,
          total_revenue REAL DEFAULT 0,
          revenue_share_paid REAL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    });
    
    console.log('✅ BWAEZI Sovereign Database initialized');
    return databaseInstance;
  } catch (error) {
    console.error('❌ Sovereign Database initialization failed:', error);
    throw error;
  }
}

// Get best available Solana connection
function getSolanaConnection() {
  if (solanaConnections.length === 0) {
    throw new Error('No Solana connections available');
  }
  return solanaConnections[0];
}

// Get best available Ethereum provider
function getEthereumProvider() {
  if (ethereumProviders.length === 0) {
    throw new Error('No Ethereum connections available');
  }
  return ethereumProviders[0];
}

// Calculate sovereign fees based on BWAEZI configuration
function calculateSovereignFees(amount, serviceType = 'standard') {
  const baseFeeRate = SOVEREIGN_CONFIG.AI_GOVERNANCE.MAX_TAX_RATE;
  let feeRate = baseFeeRate;
  
  // Adjust fees based on service type
  switch (serviceType) {
    case 'registration':
      feeRate = SOVEREIGN_CONFIG.SOVEREIGN_SERVICES.registrationFee / amount;
      break;
    case 'license':
      feeRate = SOVEREIGN_CONFIG.SOVEREIGN_SERVICES.annualLicenseFee / amount;
      break;
    case 'revenue_share':
      feeRate = SOVEREIGN_CONFIG.SOVEREIGN_SERVICES.revenueShare;
      break;
    default:
      feeRate = baseFeeRate;
  }
  
  const fee = amount * Math.min(feeRate, SOVEREIGN_CONFIG.AI_GOVERNANCE.MAX_TAX_RATE);
  const netAmount = amount - fee;
  
  return {
    fee: parseFloat(fee.toFixed(6)),
    netAmount: parseFloat(netAmount.toFixed(6)),
    feeRate: feeRate,
    serviceType: serviceType
  };
}

// Get wallet balances across all chains with sovereign tracking
async function getWalletBalances() {
  if (!connectionsInitialized) {
    await initializeConnections();
  }

  const balances = {
    solana: {},
    ethereum: {},
    sovereign: {
      feesCollected: 0,
      revenueShared: 0,
      treasuryBalance: 0
    },
    timestamp: new Date().toISOString()
  };

  try {
    // Get Solana balances for company wallet
    if (solanaConnections.length > 0 && process.env.COMPANY_WALLET_ADDRESS) {
      try {
        const publicKey = new PublicKey(process.env.COMPANY_WALLET_ADDRESS);
        const connection = getSolanaConnection();
        const balance = await connection.getBalance(publicKey);
        balances.solana = {
          SOL: (balance / LAMPORTS_PER_SOL).toFixed(6),
          address: process.env.COMPANY_WALLET_ADDRESS,
          network: 'mainnet'
        };
      } catch (error) {
        console.error('Solana balance check failed:', error.message);
        balances.solana.error = error.message;
      }
    }

    // Get Ethereum balances for company wallet
    if (ethereumProviders.length > 0 && process.env.COMPANY_WALLET_ADDRESS) {
      try {
        const provider = getEthereumProvider();
        const balance = await provider.getBalance(process.env.COMPANY_WALLET_ADDRESS);
        balances.ethereum = {
          ETH: ethers.formatEther(balance),
          address: process.env.COMPANY_WALLET_ADDRESS,
          network: 'mainnet'
        };

        // Get USDT balance
        const usdtBalance = await getERC20Balance(
          process.env.COMPANY_WALLET_ADDRESS,
          '0xdAC17F958D2ee523a2206206994597C13D831ec7',
          provider
        );
        balances.ethereum.USDT = usdtBalance;

      } catch (error) {
        console.error('Ethereum balance check failed:', error.message);
        balances.ethereum.error = error.message;
      }
    }

    // Get sovereign treasury data
    await updateSovereignTreasuryData(balances);
    
    // Store balances in database
    await storeBalancesInDatabase(balances);
    
    console.log('💰 BWAEZI Sovereign Balances retrieved:', balances);
    return balances;

  } catch (error) {
    console.error('Sovereign balance retrieval failed:', error);
    throw error;
  }
}

// Update sovereign treasury data
async function updateSovereignTreasuryData(balances) {
  try {
    if (!databaseInstance) {
      await initializeDatabase();
    }

    const db = databaseInstance.getDatabase();
    
    // Calculate total fees collected
    const feesResult = db.prepare(`
      SELECT SUM(sovereign_fee) as total_fees, SUM(revenue_share) as total_revenue_share 
      FROM sovereign_transactions 
      WHERE status = 'confirmed'
    `).get();

    balances.sovereign.feesCollected = parseFloat(feesResult.total_fees || 0);
    balances.sovereign.revenueShared = parseFloat(feesResult.total_revenue_share || 0);
    
    // Get current treasury balance
    const treasuryResult = db.prepare(`
      SELECT balance_after FROM sovereign_treasury 
      ORDER BY created_at DESC LIMIT 1
    `).get();
    
    balances.sovereign.treasuryBalance = treasuryResult ? parseFloat(treasuryResult.balance_after) : 0;

  } catch (error) {
    console.error('Failed to update sovereign treasury data:', error);
  }
}

// Store balances in database with sovereign tracking
async function storeBalancesInDatabase(balances) {
  try {
    if (!databaseInstance) {
      await initializeDatabase();
    }

    const db = databaseInstance.getDatabase();
    const timestamp = new Date().toISOString();

    if (balances.solana.address) {
      db.prepare(`
        INSERT OR REPLACE INTO sovereign_balances 
        (address, network, balance, sovereign_fees_collected, revenue_distributed, last_updated)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        balances.solana.address,
        'solana',
        parseFloat(balances.solana.SOL || 0),
        balances.sovereign.feesCollected,
        balances.sovereign.revenueShared,
        timestamp
      );
    }

    if (balances.ethereum.address) {
      db.prepare(`
        INSERT OR REPLACE INTO sovereign_balances 
        (address, network, balance, usdt_balance, sovereign_fees_collected, revenue_distributed, last_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        balances.ethereum.address,
        'ethereum',
        parseFloat(balances.ethereum.ETH || 0),
        parseFloat(balances.ethereum.USDT?.balance || 0),
        balances.sovereign.feesCollected,
        balances.sovereign.revenueShared,
        timestamp
      );
    }
  } catch (error) {
    console.error('Failed to store sovereign balances in database:', error);
  }
}

// Get ERC-20 token balance
async function getERC20Balance(walletAddress, tokenContractAddress, provider) {
  try {
    const erc20Abi = [
      'function balanceOf(address) view returns (uint256)',
      'function decimals() view returns (uint8)',
      'function symbol() view returns (string)'
    ];

    const contract = new ethers.Contract(tokenContractAddress, erc20Abi, provider);
    const [balance, decimals, symbol] = await Promise.all([
      contract.balanceOf(walletAddress),
      contract.decimals(),
      contract.symbol()
    ]);

    return {
      balance: ethers.formatUnits(balance, decimals),
      symbol: symbol,
      decimals: decimals
    };
  } catch (error) {
    console.error(`ERC-20 balance check failed for ${tokenContractAddress}:`, error.message);
    return { error: error.message };
  }
}

// Send SOL transaction with sovereign fee calculation
async function sendSOL(toAddress, amount, fromPrivateKey = process.env.COMPANY_WALLET_PRIVATE_KEY, serviceType = 'standard') {
  if (!connectionsInitialized) {
    await initializeConnections();
  }

  try {
    const connection = getSolanaConnection();
    
    // Convert private key to keypair
    let fromKeypair;
    if (fromPrivateKey.startsWith('[')) {
      fromKeypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fromPrivateKey)));
    } else {
      fromKeypair = Keypair.fromSecretKey(new Uint8Array(Buffer.from(fromPrivateKey.replace(/^0x/, ''), 'hex')));
    }
    
    const toPublicKey = new PublicKey(toAddress);
    
    // Calculate sovereign fees
    const feeCalculation = calculateSovereignFees(amount, serviceType);
    const netAmount = feeCalculation.netAmount;

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: fromKeypair.publicKey,
        toPubkey: toPublicKey,
        lamports: Math.floor(netAmount * LAMPORTS_PER_SOL)
      })
    );

    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [fromKeypair]
    );

    // Record sovereign transaction in database
    await recordSovereignTransaction({
      transactionHash: signature,
      fromAddress: fromKeypair.publicKey.toString(),
      toAddress: toAddress,
      amount: amount,
      netAmount: netAmount,
      currency: 'SOL',
      network: 'solana',
      status: 'confirmed',
      sovereignFee: feeCalculation.fee,
      revenueShare: 0, // Only for revenue sharing transactions
      serviceType: serviceType
    });

    return {
      success: true,
      signature: signature,
      amount: amount,
      netAmount: netAmount,
      sovereignFee: feeCalculation.fee,
      currency: 'SOL',
      from: fromKeypair.publicKey.toString(),
      to: toAddress,
      network: 'solana',
      serviceType: serviceType
    };

  } catch (error) {
    console.error('SOL transfer failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Send ETH transaction with sovereign fee calculation
async function sendETH(toAddress, amount, fromPrivateKey = process.env.COMPANY_WALLET_PRIVATE_KEY, serviceType = 'standard') {
  if (!connectionsInitialized) {
    await initializeConnections();
  }

  try {
    const provider = getEthereumProvider();
    const wallet = new ethers.Wallet(fromPrivateKey, provider);
    
    // Calculate sovereign fees
    const feeCalculation = calculateSovereignFees(amount, serviceType);
    const netAmount = feeCalculation.netAmount;

    const transaction = await wallet.sendTransaction({
      to: toAddress,
      value: ethers.parseEther(netAmount.toString()),
      gasLimit: 21000
    });

    const receipt = await transaction.wait();

    // Record sovereign transaction in database
    await recordSovereignTransaction({
      transactionHash: transaction.hash,
      fromAddress: wallet.address,
      toAddress: toAddress,
      amount: amount,
      netAmount: netAmount,
      currency: 'ETH',
      network: 'ethereum',
      status: 'confirmed',
      sovereignFee: feeCalculation.fee,
      revenueShare: 0,
      serviceType: serviceType,
      gasUsed: receipt.gasUsed.toString(),
      blockNumber: receipt.blockNumber
    });

    return {
      success: true,
      hash: transaction.hash,
      amount: amount,
      netAmount: netAmount,
      sovereignFee: feeCalculation.fee,
      currency: 'ETH',
      from: wallet.address,
      to: toAddress,
      network: 'ethereum',
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      serviceType: serviceType
    };

  } catch (error) {
    console.error('ETH transfer failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Send USDT transaction with sovereign revenue sharing
async function sendUSDT(toAddress, amount, network = 'eth', fromPrivateKey = process.env.COMPANY_WALLET_PRIVATE_KEY, serviceType = 'revenue_share') {
  if (!connectionsInitialized) {
    await initializeConnections();
  }

  try {
    const provider = getEthereumProvider();
    const wallet = new ethers.Wallet(fromPrivateKey, provider);

    const usdtContracts = {
      eth: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      bsc: '0x55d398326f99059fF775485246999027B3197955',
      polygon: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
    };

    const contractAddress = usdtContracts[network];
    if (!contractAddress) {
      throw new Error(`Unsupported network for USDT: ${network}`);
    }

    const usdtAbi = [
      'function transfer(address to, uint256 value) returns (bool)',
      'function decimals() view returns (uint8)'
    ];

    const contract = new ethers.Contract(contractAddress, usdtAbi, wallet);
    const decimals = await contract.decimals();
    
    // Calculate sovereign revenue share
    const feeCalculation = calculateSovereignFees(amount, serviceType);
    const netAmount = feeCalculation.netAmount;
    const amountInWei = ethers.parseUnits(netAmount.toString(), decimals);

    const transaction = await contract.transfer(toAddress, amountInWei);
    const receipt = await transaction.wait();

    // Record sovereign transaction with revenue sharing
    await recordSovereignTransaction({
      transactionHash: transaction.hash,
      fromAddress: wallet.address,
      toAddress: toAddress,
      amount: amount,
      netAmount: netAmount,
      currency: 'USDT',
      network: network,
      status: 'confirmed',
      sovereignFee: 0, // No fee for revenue share, only revenue share amount
      revenueShare: feeCalculation.fee, // This is the revenue share amount
      serviceType: serviceType,
      gasUsed: receipt.gasUsed.toString(),
      blockNumber: receipt.blockNumber
    });

    return {
      success: true,
      hash: transaction.hash,
      amount: amount,
      netAmount: netAmount,
      revenueShare: feeCalculation.fee,
      currency: 'USDT',
      from: wallet.address,
      to: toAddress,
      network: network,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      serviceType: serviceType
    };

  } catch (error) {
    console.error('USDT transfer failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Record sovereign transaction in database with economic zone tracking
async function recordSovereignTransaction(transactionData) {
  try {
    if (!databaseInstance) {
      await initializeDatabase();
    }

    const db = databaseInstance.getDatabase();
    const transactionId = crypto.randomUUID();

    db.prepare(`
      INSERT INTO sovereign_transactions 
      (id, transaction_hash, from_address, to_address, amount, currency, network, status, 
       sovereign_fee, revenue_share, gas_used, block_number, sovereign_service_type, confirmed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      transactionId,
      transactionData.transactionHash,
      transactionData.fromAddress,
      transactionData.toAddress,
      transactionData.netAmount, // Store net amount after fees
      transactionData.currency,
      transactionData.network,
      transactionData.status,
      transactionData.sovereignFee,
      transactionData.revenueShare,
      transactionData.gasUsed || null,
      transactionData.blockNumber || null,
      transactionData.serviceType,
      transactionData.status === 'confirmed' ? new Date().toISOString() : null
    );

    // Update treasury balance
    if (transactionData.sovereignFee > 0 || transactionData.revenueShare > 0) {
      const totalInflow = transactionData.sovereignFee + transactionData.revenueShare;
      
      // Get current treasury balance
      const currentBalance = db.prepare(`
        SELECT balance_after FROM sovereign_treasury 
        ORDER BY created_at DESC LIMIT 1
      `).get();

      const previousBalance = currentBalance ? currentBalance.balance_after : 0;
      const newBalance = previousBalance + totalInflow;

      db.prepare(`
        INSERT INTO sovereign_treasury 
        (transaction_type, amount, currency, description, balance_after)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        'sovereign_income',
        totalInflow,
        transactionData.currency,
        `Sovereign ${transactionData.serviceType} transaction`,
        newBalance
      );
    }

    console.log(`✅ Sovereign transaction recorded: ${transactionData.transactionHash}`);
    console.log(`💰 Sovereign Fee: ${transactionData.sovereignFee} ${transactionData.currency}`);
    console.log(`📊 Revenue Share: ${transactionData.revenueShare} ${transactionData.currency}`);
  } catch (error) {
    console.error('Failed to record sovereign transaction in database:', error);
  }
}

// Process revenue payment with BWAEZI sovereign economic parameters
async function processRevenuePayment(amount, currency, recipient, paymentMethod = 'auto', serviceType = 'revenue_share') {
  try {
    let result;

    // Apply BWAEZI AI Governance parameters
    if (paymentMethod === 'auto') {
      if (currency === 'SOL' || currency === 'USD') {
        paymentMethod = 'solana';
      } else if (currency === 'ETH' || currency === 'EUR' || currency === 'GBP') {
        paymentMethod = 'ethereum';
      } else {
        paymentMethod = 'ethereum';
      }
    }

    switch (paymentMethod) {
      case 'solana':
        const solAmount = currency === 'USD' ? amount / 100 : amount;
        result = await sendSOL(recipient, solAmount, process.env.COMPANY_WALLET_PRIVATE_KEY, serviceType);
        break;

      case 'ethereum':
        if (currency === 'USDT') {
          result = await sendUSDT(recipient, amount, 'eth', process.env.COMPANY_WALLET_PRIVATE_KEY, serviceType);
        } else {
          const ethAmount = currency === 'USD' ? amount / 3000 : amount;
          result = await sendETH(recipient, ethAmount, process.env.COMPANY_WALLET_PRIVATE_KEY, serviceType);
        }
        break;

      default:
        throw new Error(`Unsupported payment method: ${paymentMethod}`);
    }

    if (result.success) {
      console.log(`✅ BWAEZI Sovereign Revenue Payment processed: ${amount} ${currency} to ${recipient}`);
      console.log(`🏛️ Service Type: ${serviceType}`);
      console.log(`💰 Sovereign Fee/Revenue Share: ${result.sovereignFee || result.revenueShare} ${currency}`);
    }

    return result;

  } catch (error) {
    console.error('BWAEZI Sovereign Revenue payment processing failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Register sovereign service provider
async function registerSovereignService(providerAddress, serviceType, paymentCurrency = 'USDT') {
  try {
    if (!databaseInstance) {
      await initializeDatabase();
    }

    const db = databaseInstance.getDatabase();
    const serviceId = crypto.randomUUID();
    const registrationFee = SOVEREIGN_CONFIG.SOVEREIGN_SERVICES.registrationFee;

    // Process registration fee payment
    const paymentResult = await processRevenuePayment(
      registrationFee, 
      paymentCurrency, 
      SOVEREIGN_CONFIG.SOVEREIGN_OWNER, 
      'auto', 
      'registration'
    );

    if (paymentResult.success) {
      // Register service in sovereign database
      db.prepare(`
        INSERT INTO sovereign_services 
        (service_id, service_type, provider_address, registration_fee_paid, license_active)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        serviceId,
        serviceType,
        providerAddress,
        true,
        true
      );

      console.log(`✅ Sovereign service registered: ${serviceId}`);
      console.log(`👤 Provider: ${providerAddress}`);
      console.log(`🛠️ Service Type: ${serviceType}`);
      console.log(`💰 Registration Fee: ${registrationFee} ${paymentCurrency}`);

      return {
        success: true,
        serviceId: serviceId,
        registrationFee: registrationFee,
        transaction: paymentResult
      };
    } else {
      throw new Error(`Registration fee payment failed: ${paymentResult.error}`);
    }

  } catch (error) {
    console.error('Sovereign service registration failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Get sovereign economic zone statistics
async function getSovereignStats() {
  try {
    if (!databaseInstance) {
      await initializeDatabase();
    }

    const db = databaseInstance.getDatabase();

    const stats = {
      treasury: db.prepare(`
        SELECT SUM(amount) as total_income, 
               AVG(balance_after) as avg_balance,
               COUNT(*) as transaction_count
        FROM sovereign_treasury 
        WHERE transaction_type = 'sovereign_income'
      `).get(),

      transactions: db.prepare(`
        SELECT COUNT(*) as total_transactions,
               SUM(amount) as total_volume,
               SUM(sovereign_fee) as total_fees,
               SUM(revenue_share) as total_revenue_share
        FROM sovereign_transactions 
        WHERE status = 'confirmed'
      `).get(),

      services: db.prepare(`
        SELECT COUNT(*) as total_services,
               COUNT(CASE WHEN license_active = 1 THEN 1 END) as active_services,
               SUM(total_revenue) as total_service_revenue
        FROM sovereign_services
      `).get(),

      configuration: SOVEREIGN_CONFIG
    };

    return stats;

  } catch (error) {
    console.error('Failed to get sovereign stats:', error);
    return { error: error.message };
  }
}

// Get wallet addresses for display
function getWalletAddresses() {
  return {
    solana: process.env.COMPANY_WALLET_ADDRESS,
    ethereum: process.env.COMPANY_WALLET_ADDRESS,
    sovereign_owner: SOVEREIGN_CONFIG.SOVEREIGN_OWNER,
    timestamp: new Date().toISOString()
  };
}

// Check blockchain health with sovereign system status
async function checkBlockchainHealth() {
  if (!connectionsInitialized) {
    await initializeConnections();
  }

  const health = {
    solana: { healthy: false, endpoints: [] },
    ethereum: { healthy: false, endpoints: [] },
    sovereign: {
      healthy: false,
      treasuryMinimumMet: false,
      servicesActive: 0
    },
    timestamp: new Date().toISOString()
  };

  // Check Solana endpoints
  for (const connection of solanaConnections) {
    try {
      const slot = await connection.getSlot();
      health.solana.endpoints.push({
        healthy: true,
        slot: slot,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      health.solana.endpoints.push({
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Check Ethereum endpoints
  for (const provider of ethereumProviders) {
    try {
      const blockNumber = await provider.getBlockNumber();
      health.ethereum.endpoints.push({
        healthy: true,
        blockNumber: blockNumber,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      health.ethereum.endpoints.push({
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  health.solana.healthy = health.solana.endpoints.some(e => e.healthy);
  health.ethereum.healthy = health.ethereum.endpoints.some(e => e.healthy);

  // Check sovereign system health
  try {
    const stats = await getSovereignStats();
    if (!stats.error) {
      health.sovereign.healthy = true;
      health.sovereign.treasuryMinimumMet = stats.treasury.avg_balance >= SOVEREIGN_CONFIG.AI_GOVERNANCE.MIN_RESERVES;
      health.sovereign.servicesActive = stats.services.active_services;
    }
  } catch (error) {
    health.sovereign.healthy = false;
    health.sovereign.error = error.message;
  }

  return health;
}

// Validate blockchain address
function validateAddress(address, network = 'auto') {
  try {
    if (network === 'solana' || network === 'auto') {
      try {
        new PublicKey(address);
        return { valid: true, network: 'solana', address: address };
      } catch (error) {
        // Not a Solana address
      }
    }

    if (network === 'ethereum' || network === 'auto') {
      if (ethers.isAddress(address)) {
        return { valid: true, network: 'ethereum', address: address };
      }
    }

    return { valid: false, error: 'Invalid address format' };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

// Format balance for display
function formatBalance(balance, currency, decimals = 4) {
  try {
    const numericBalance = parseFloat(balance);
    if (isNaN(numericBalance)) {
      return '0.0000';
    }

    return numericBalance.toFixed(decimals);
  } catch (error) {
    console.error('Balance formatting error:', error);
    return '0.0000';
  }
}

// Test all connections with sovereign system check
async function testAllConnections() {
  console.log('🧪 Testing BWAEZI Sovereign System Connections...');
  
  const results = {
    solana: [],
    ethereum: [],
    database: false,
    sovereign: false,
    overall: false
  };

  // Test database connection
  try {
    if (!databaseInstance) {
      await initializeDatabase();
    }
    results.database = true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    results.database = false;
  }

  // Test sovereign configuration
  try {
    if (SOVEREIGN_CONFIG.SOVEREIGN_OWNER && SOVEREIGN_CONFIG.AI_GOVERNANCE) {
      results.sovereign = true;
      console.log(`✅ Sovereign Configuration Valid: Owner ${SOVEREIGN_CONFIG.SOVEREIGN_OWNER}`);
    }
  } catch (error) {
    console.error('Sovereign configuration test failed:', error);
    results.sovereign = false;
  }

  // Test Solana connections
  for (const connection of solanaConnections) {
    try {
      const startTime = Date.now();
      const slot = await connection.getSlot();
      const latency = Date.now() - startTime;
      
      results.solana.push({
        healthy: true,
        latency: latency,
        slot: slot,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      results.solana.push({
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Test Ethereum connections
  for (const provider of ethereumProviders) {
    try {
      const startTime = Date.now();
      const blockNumber = await provider.getBlockNumber();
      const latency = Date.now() - startTime;
      
      results.ethereum.push({
        healthy: true,
        latency: latency,
        blockNumber: blockNumber,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      results.ethereum.push({
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  results.overall = 
    results.solana.some(c => c.healthy) && 
    results.ethereum.some(c => c.healthy) &&
    results.database &&
    results.sovereign;

  console.log(`✅ BWAEZI Sovereign System Test Completed: ${results.overall ? 'HEALTHY' : 'UNHEALTHY'}`);
  return results;
}

// Get sovereign transaction history
async function getSovereignTransactionHistory(limit = 50, offset = 0) {
  try {
    if (!databaseInstance) {
      await initializeDatabase();
    }

    const db = databaseInstance.getDatabase();
    const transactions = db.prepare(`
      SELECT * FROM sovereign_transactions 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    return transactions;
  } catch (error) {
    console.error('Failed to get sovereign transaction history:', error);
    return [];
  }
}

// Get sovereign service registry
async function getSovereignServices(activeOnly = true) {
  try {
    if (!databaseInstance) {
      await initializeDatabase();
    }

    const db = databaseInstance.getDatabase();
    let query = `SELECT * FROM sovereign_services`;
    let params = [];

    if (activeOnly) {
      query += ` WHERE license_active = ?`;
      params.push(true);
    }

    query += ` ORDER BY created_at DESC`;

    const services = db.prepare(query).all(...params);
    return services;
  } catch (error) {
    console.error('Failed to get sovereign services:', error);
    return [];
  }
}

// Cleanup function
async function cleanup() {
  solanaConnections = [];
  ethereumProviders = [];
  connectionsInitialized = false;
  
  if (databaseInstance) {
    await databaseInstance.close();
    databaseInstance = null;
  }
  
  console.log('🧹 BWAEZI Sovereign System connections and database cleaned up');
}

// Export all functions with sovereign enhancements
export {
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
  getSovereignTransactionHistory,
  getSovereignStats,
  registerSovereignService,
  getSovereignServices,
  calculateSovereignFees,
  cleanup
};

export default {
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
  getSovereignTransactionHistory,
  getSovereignStats,
  registerSovereignService,
  getSovereignServices,
  calculateSovereignFees,
  cleanup,
  SOVEREIGN_CONFIG
};
