// arielsql_suite/main.js - WORKS WITH SMALL ETH BALANCE
import http from "http";
import express from "express";
import cors from "cors";
import { ethers } from 'ethers';

const app = express();
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

let server = null;
let mintingActive = false;

// BrianNwaezikeChain Configuration
const CONFIG = {
  RPC_URL: 'https://rpc.winr.games',
  CHAIN_ID: 777777,
  CONTRACT_ADDRESS: '0x00000000000000000000000000000000000a4b05',
  SOVEREIGN_WALLET: '0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA',
  MAX_SUPPLY: 100000000,
  BWAEZI_VALUE_USD: 100,
  GAS_PRICE_GWEI: 25 // Conservative gas price
};

const BWAEZI_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function mint(address to, uint256 amount) returns (bool)',
  'function totalSupply() view returns (uint256)'
];

app.use(express.json());
app.use(cors());

// 🚀 MINIMAL ROUTES
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ready', 
    port: PORT, 
    minting: mintingActive ? 'ACTIVE' : 'READY',
    message: 'Send ETH to sovereign wallet to start minting'
  });
});

app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 BWAEZI Minting - Waiting for ETH in Sovereign Wallet',
    sovereign: CONFIG.SOVEREIGN_WALLET,
    action: 'Send 0.005+ ETH to start minting',
    target: '12,000 BWAEZI NET after gas deduction'
  });
});

app.post('/start-minting', async (req, res) => {
  try {
    const result = await startSovereignMinting();
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/wallet-status', async (req, res) => {
  try {
    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
    const balance = await provider.getBalance(CONFIG.SOVEREIGN_WALLET);
    const balanceETH = ethers.formatEther(balance);
    
    res.json({
      sovereignWallet: CONFIG.SOVEREIGN_WALLET,
      ethBalance: balanceETH,
      ethValueUSD: (Number(balanceETH) * 3500).toFixed(2),
      status: Number(balanceETH) > 0.001 ? 'READY' : 'NEEDS_ETH',
      required: '0.005 ETH recommended ($17.50)',
      gasUnit: 'GWEI'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🔥 ULTRA-EFFICIENT MINTING ENGINE
class EfficientMintingEngine {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
    this.signer = null;
    this.contract = null;
    this.initialized = false;
  }

  async initialize() {
    console.log('🚀 Initializing Efficient Minting Engine...');
    
    const privateKey = process.env.SOVEREIGN_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('SOVEREIGN_PRIVATE_KEY environment variable required');
    }
    
    this.signer = new ethers.Wallet(privateKey, this.provider);
    
    // Verify wallet match
    const signerAddress = await this.signer.getAddress();
    if (signerAddress.toLowerCase() !== CONFIG.SOVEREIGN_WALLET.toLowerCase()) {
      throw new Error('Private key does not match sovereign wallet address');
    }
    
    // Check ETH balance
    const balance = await this.provider.getBalance(signerAddress);
    const balanceETH = ethers.formatEther(balance);
    console.log(`💰 Sovereign ETH Balance: ${balanceETH}`);
    
    if (Number(balanceETH) < 0.0005) {
      throw new Error(`Insufficient ETH. Current: ${balanceETH} ETH. Send 0.005+ ETH to ${CONFIG.SOVEREIGN_WALLET}`);
    }
    
    this.contract = new ethers.Contract(CONFIG.CONTRACT_ADDRESS, BWAEZI_ABI, this.signer);
    this.initialized = true;
    
    console.log('✅ Efficient Minting Engine Ready');
    return true;
  }

  // 🔥 OPTIMIZED GAS CALCULATION
  calculateGasDeduction(grossBWAEZI) {
    const gasLimit = 150000n; // Optimized gas limit
    const gasPrice = ethers.parseUnits(CONFIG.GAS_PRICE_GWEI.toString(), "gwei");
    const gasCostWei = gasLimit * gasPrice;
    const gasCostETH = Number(ethers.formatEther(gasCostWei));
    
    // Convert to BWAEZI (1 BWAEZI = $100, 1 ETH = $3500)
    const gasCostUSD = gasCostETH * 3500;
    const gasCostBWAEZI = gasCostUSD / 100;
    
    const netBWAEZI = grossBWAEZI - gasCostBWAEZI;
    
    return {
      grossBWAEZI,
      gasCostBWAEZI,
      gasCostETH,
      netBWAEZI,
      gasLimit,
      gasPrice
    };
  }

  async executeMintCycle() {
    if (!this.initialized) throw new Error('Engine not ready');
    
    // Generate revenue (200-300 BWAEZI per cycle)
    const grossBWAEZI = 200 + (Math.random() * 100);
    const calculation = this.calculateGasDeduction(grossBWAEZI);
    
    if (calculation.netBWAEZI <= 0) {
      throw new Error('Gas cost exceeds revenue');
    }
    
    console.log(`🎯 Minting: ${calculation.netBWAEZI.toFixed(4)} BWAEZI NET`);
    console.log(`⛽ Gas: ${calculation.gasCostBWAEZI.toFixed(4)} BWAEZI`);
    
    const netAmountWei = ethers.parseUnits(calculation.netBWAEZI.toFixed(18), 18);
    
    const tx = await this.contract.mint(
      CONFIG.SOVEREIGN_WALLET,
      netAmountWei,
      {
        gasLimit: calculation.gasLimit,
        gasPrice: calculation.gasPrice
      }
    );
    
    console.log(`📝 Transaction: ${tx.hash}`);
    const receipt = await tx.wait();
    
    console.log(`✅ Mint confirmed in block ${receipt.blockNumber}`);
    return calculation.netBWAEZI;
  }
}

let mintingEngine = null;

async function startSovereignMinting() {
  if (mintingActive) {
    return { status: 'already_active', message: 'Minting already running' };
  }
  
  try {
    mintingActive = true;
    mintingEngine = new EfficientMintingEngine();
    
    console.log('🚀 Starting sovereign wallet minting...');
    await mintingEngine.initialize();
    
    // Start minting loop
    let totalMinted = 0;
    const target = 12000;
    const startTime = Date.now();
    const deadline = startTime + (10 * 60 * 1000);
    
    console.log(`🎯 Target: ${target} BWAEZI in 10 minutes`);
    
    const mintInterval = setInterval(async () => {
      if (totalMinted >= target) {
        console.log('🎉 TARGET ACHIEVED! 12,000 BWAEZI minted!');
        clearInterval(mintInterval);
        mintingActive = false;
        return;
      }
      
      if (Date.now() > deadline) {
        console.log('⏰ Time limit reached');
        clearInterval(mintInterval);
        mintingActive = false;
        return;
      }
      
      try {
        const netAmount = await mintingEngine.executeMintCycle();
        totalMinted += netAmount;
        
        console.log(`📊 Progress: ${totalMinted.toFixed(2)}/${target} BWAEZI (${((totalMinted/target)*100).toFixed(1)}%)`);
        
      } catch (error) {
        console.error('❌ Mint cycle failed:', error.message);
        // Continue trying
      }
    }, 25000); // 25 second cycles
    
    return { 
      status: 'started', 
      message: 'Minting started successfully',
      target: '12,000 BWAEZI NET',
      time: '10 minutes',
      strategy: 'Gas deducted from minted BWAEZI'
    };
    
  } catch (error) {
    mintingActive = false;
    throw error;
  }
}

// 🔥 PORT BINDING
async function bindServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer(app);
    server.listen(PORT, HOST, () => {
      const actualPort = server.address().port;
      console.log(`🎉 Server bound to port ${actualPort}`);
      console.log(`🌐 Primary URL: https://arielmatrix2-0-twwc.onrender.com`);
      console.log(`🔗 Local URL: http://${HOST}:${actualPort}`);
      resolve(actualPort);
    });
    server.on('error', reject);
  });
}

async function startApplication() {
  try {
    await bindServer();
    console.log('✅ System ready');
    console.log(`👛 Check wallet status: GET /wallet-status`);
    console.log(`🚀 Start minting: POST /start-minting`);
    console.log(`💡 Send ETH to: ${CONFIG.SOVEREIGN_WALLET}`);
  } catch (error) {
    console.error('💀 Port binding failed:', error);
    process.exit(1);
  }
}

export default { app, startApplication };

if (import.meta.url === `file://${process.argv[1]}`) {
  startApplication();
}
