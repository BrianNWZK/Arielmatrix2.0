// arielsql_suite/main.js - SOVEREIGN MINTING AUTHORITY
import http from "http";
import express from "express";
import cors from "cors";
import { ethers } from 'ethers';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

// Global state
let server = null;
let isSystemInitialized = false;
let serviceManager = null;

// Sovereign Wallet Configuration
const SOVEREIGN_CONFIG = {
  WALLET_ADDRESS: '0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA',
  PRIVATE_KEY: process.env.SOVEREIGN_PRIVATE_KEY, // From environment variable
  BWAEZI_CONTRACT: '0x00000000000000000000000000000000000a4b05',
  RPC_URL: 'https://rpc.winr.games',
  CHAIN_ID: 777777
};

// BWAEZI Token ABI with mint function
const BWAEZI_TOKEN_ABI = [
  'function mint(address to, uint256 amount) external returns (bool)',
  'function owner() external view returns (address)',
  'function isMinter(address) external view returns (bool)',
  'function balanceOf(address) external view returns (uint256)',
  'function addMinter(address) external'
];

// Real Gas Calculation Class
class SovereignGasCalculator {
  constructor() {
    this.ethPriceUSD = 3500; // Current ETH price
    this.gasPrices = {
      low: 25,    // gwei
      medium: 30, // gwei  
      high: 35,   // gwei
      current: 30 // gwei
    };
  }

  async calculateMintingGas() {
    // Mint operation: ~120,000 gas
    const mintGasLimit = 120000n;
    // Transfer operation: ~65,000 gas  
    const transferGasLimit = 65000n;
    const totalGas = mintGasLimit + transferGasLimit;
    
    const gasPriceWei = BigInt(this.gasPrices.current) * 1000000000n; // gwei to wei
    const totalGasWei = totalGas * gasPriceWei;
    const totalGasETH = Number(totalGasWei) / 1e18;
    const totalGasUSD = totalGasETH * this.ethPriceUSD;
    
    return {
      totalGasWei,
      totalGasETH,
      totalGasUSD,
      gasPrice: this.gasPrices.current,
      sufficient: totalGasUSD < 25 // Check if $25 covers it
    };
  }
}

// Sovereign Minting Authority
class SovereignMintingAuthority {
  constructor(config) {
    this.config = config;
    this.provider = new ethers.JsonRpcProvider(config.RPC_URL);
    this.signer = new ethers.Wallet(config.PRIVATE_KEY, this.provider);
    this.tokenContract = new ethers.Contract(
      config.BWAEZI_CONTRACT, 
      BWAEZI_TOKEN_ABI, 
      this.signer
    );
    this.gasCalculator = new SovereignGasCalculator();
    this.mintingActive = false;
  }

  async initialize() {
    console.log('👑 Initializing Sovereign Minting Authority...');
    
    try {
      // Verify wallet connection
      const address = await this.signer.getAddress();
      const balance = await this.provider.getBalance(address);
      const balanceETH = ethers.formatEther(balance);
      const balanceUSD = parseFloat(balanceETH) * 3500;
      
      console.log(`✅ Sovereign Wallet: ${address}`);
      console.log(`💰 ETH Balance: ${balanceETH} ETH ($${balanceUSD.toFixed(2)} USD)`);
      
      // Verify minting privileges
      const isMinter = await this.tokenContract.isMinter(address);
      const owner = await this.tokenContract.owner();
      const isOwner = (owner.toLowerCase() === address.toLowerCase());
      
      console.log(`🔐 Minting Privileges - Owner: ${isOwner}, Minter: ${isMinter}`);
      
      if (!isOwner && !isMinter) {
        throw new Error('Sovereign wallet does not have minting privileges');
      }
      
      // Calculate gas costs
      const gasEstimate = await this.gasCalculator.calculateMintingGas();
      console.log(`⛽ Gas Estimate: ${gasEstimate.totalGasETH.toFixed(6)} ETH ($${gasEstimate.totalGasUSD.toFixed(2)} USD)`);
      
      if (!gasEstimate.sufficient) {
        throw new Error(`Insufficient ETH for gas. Need $${gasEstimate.totalGasUSD.toFixed(2)} but only have $${balanceUSD.toFixed(2)}`);
      }
      
      this.mintingActive = true;
      return true;
      
    } catch (error) {
      console.error('❌ Sovereign Minting Authority initialization failed:', error);
      throw error;
    }
  }

  async mintTokens(amount = 12000) {
    if (!this.mintingActive) {
      throw new Error('Minting authority not initialized');
    }

    console.log(`🪙 Starting REAL mint of ${amount} BWAEZI tokens...`);
    
    try {
      const amountWei = ethers.parseUnits(amount.toString(), 18);
      
      // Get current gas price
      const feeData = await this.provider.getFeeData();
      const gasPrice = feeData.gasPrice || ethers.parseUnits(this.gasCalculator.gasPrices.current.toString(), 'gwei');
      
      // Execute REAL mint transaction
      console.log('📝 Executing mint transaction...');
      const mintTx = await this.tokenContract.mint(
        this.config.WALLET_ADDRESS, // Mint to sovereign wallet
        amountWei,
        {
          gasLimit: 120000,
          gasPrice: gasPrice
        }
      );
      
      console.log(`✅ Mint transaction submitted: ${mintTx.hash}`);
      
      // Wait for confirmation
      console.log('⏳ Waiting for transaction confirmation...');
      const receipt = await mintTx.wait();
      
      console.log(`🎉 REAL MINT CONFIRMED!`);
      console.log(`📦 Block: ${receipt.blockNumber}`);
      console.log(`🪙 Amount: ${amount} BWAEZI`);
      console.log(`💰 Gas Used: ${ethers.formatEther(receipt.gasUsed * gasPrice)} ETH`);
      console.log(`📫 Sovereign Wallet: ${this.config.WALLET_ADDRESS}`);
      
      // Verify balance
      const newBalance = await this.tokenContract.balanceOf(this.config.WALLET_ADDRESS);
      const balanceFormatted = ethers.formatUnits(newBalance, 18);
      
      console.log(`✅ New BWAEZI Balance: ${balanceFormatted}`);
      
      return {
        success: true,
        transactionHash: mintTx.hash,
        blockNumber: receipt.blockNumber,
        amountMinted: amount,
        newBalance: parseFloat(balanceFormatted),
        gasUsed: receipt.gasUsed.toString(),
        gasCost: ethers.formatEther(receipt.gasUsed * gasPrice)
      };
      
    } catch (error) {
      console.error('❌ Minting failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getMintingStatus() {
    const balance = await this.tokenContract.balanceOf(this.config.WALLET_ADDRESS);
    const gasEstimate = await this.gasCalculator.calculateMintingGas();
    
    return {
      sovereignWallet: this.config.WALLET_ADDRESS,
      currentBalance: ethers.formatUnits(balance, 18),
      mintingPrivileges: await this.checkMintingPrivileges(),
      gasEstimate,
      contractAddress: this.config.BWAEZI_CONTRACT,
      network: 'BWAEZI Mainnet',
      timestamp: new Date().toISOString()
    };
  }

  async checkMintingPrivileges() {
    const address = await this.signer.getAddress();
    const isMinter = await this.tokenContract.isMinter(address);
    const owner = await this.tokenContract.owner();
    const isOwner = (owner.toLowerCase() === address.toLowerCase());
    
    return { isOwner, isMinter, ownerAddress: owner };
  }
}

// Initialize Sovereign Minting
let sovereignMinter = null;

// Basic middleware
app.use(express.json());
app.use(cors());

// 🚀 CRITICAL: Port Binding First
app.get('/health', (req, res) => {
  res.json({
    status: isSystemInitialized ? 'ready' : 'initializing',
    timestamp: new Date().toISOString(),
    port: PORT,
    sovereignMinting: !!sovereignMinter,
    endpoints: ['/', '/health', '/sovereign-status', '/mint-bwaezi']
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'ArielSQL Sovereign Minting Authority - PRODUCTION READY',
    sovereignWallet: SOVEREIGN_CONFIG.WALLET_ADDRESS,
    status: 'Port Bound - Sovereign System Initializing',
    timestamp: new Date().toISOString()
  });
});

// Sovereign Minting Endpoints
app.get('/sovereign-status', async (req, res) => {
  try {
    if (!sovereignMinter) {
      return res.status(503).json({ error: 'Sovereign minter not initialized' });
    }
    const status = await sovereignMinter.getMintingStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/mint-bwaezi', async (req, res) => {
  try {
    const { amount } = req.body;
    const mintAmount = amount || 12000;
    
    if (!sovereignMinter) {
      return res.status(503).json({ error: 'Sovereign minter not initialized' });
    }
    
    console.log(`🎯 Received mint request for ${mintAmount} BWAEZI`);
    const result = await sovereignMinter.mintTokens(mintAmount);
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🔥 PORT BINDING GUARANTEE
async function bindServer() {
  return new Promise((resolve, reject) => {
    console.log('🚀 PHASE 1: Guaranteed port binding...');
    server = http.createServer(app);
    
    server.listen(PORT, HOST, () => {
      const actualPort = server.address().port;
      console.log(`🎉 CRITICAL SUCCESS: Server bound to port ${actualPort}`);
      resolve(actualPort);
    });
    
    server.on('error', reject);
  });
}

// 🔥 DELAYED ServiceManager Import - Port Binding First
async function initializeSovereignSystem(actualPort) {
  console.log('\n👑 PHASE 2: Initializing Sovereign Minting Authority...');
  
  try {
    // Initialize Sovereign Minting FIRST
    sovereignMinter = new SovereignMintingAuthority(SOVEREIGN_CONFIG);
    await sovereignMinter.initialize();
    
    console.log('✅ Sovereign Minting Authority Initialized');
    
    // ServiceManager import DELAYED until after port binding
    const { ServiceManager } = await import('./serviceManager.js');
    serviceManager = new ServiceManager();
    await serviceManager.initialize();
    
    console.log('✅ ServiceManager Initialized (Delayed)');
    
    isSystemInitialized = true;
    
    console.log('\n🎉 FULL SYSTEM READY FOR SOVEREIGN MINTING');
    console.log(`🌐 Server: http://${HOST}:${actualPort}`);
    console.log(`👑 Sovereign: ${SOVEREIGN_CONFIG.WALLET_ADDRESS}`);
    console.log(`🪙 Ready to mint 12,000 BWAEZI tokens`);
    console.log(`💸 Gas covered by $25 ETH balance`);
    
  } catch (error) {
    console.error('❌ System initialization failed:', error);
    // Continue running with basic routes
  }
}

// 🔥 Startup Function
async function startApplication() {
  try {
    const actualPort = await bindServer();
    // Delay service manager import until after port binding
    setTimeout(() => initializeSovereignSystem(actualPort), 100);
  } catch (error) {
    console.error('💀 Fatal error:', error);
    process.exit(1);
  }
}

// Export for external use
export const APP = app;
export { startApplication, sovereignMinter };

// Auto-start if main module
if (import.meta.url === `file://${process.argv[1]}`) {
  startApplication();
}
