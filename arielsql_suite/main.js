// arielsql_suite/main.js - CLEAN WORKING VERSION
import http from "http";
import express from "express";
import cors from "cors";
import { ethers } from 'ethers';

const app = express();
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

let server = null;
let mintingActive = false;

// Simple Configuration
const CONFIG = {
  RPC_URL: 'https://rpc.winr.games',
  CONTRACT_ADDRESS: '0x00000000000000000000000000000000000a4b05',
  SOVEREIGN_WALLET: '0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA'
};

const BWAEZI_ABI = [
  'function mint(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)'
];

app.use(express.json());
app.use(cors());

// 🎯 SIMPLE ROUTES
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 BWAEZI Minting - Ready',
    wallet: CONFIG.SOVEREIGN_WALLET,
    action: 'Check /balance then POST /start'
  });
});

// 🔍 CHECK BALANCE (NO SIGNER NEEDED)
app.get('/balance', async (req, res) => {
  try {
    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
    const balance = await provider.getBalance(CONFIG.SOVEREIGN_WALLET);
    const balanceETH = ethers.formatEther(balance);
    
    res.json({
      wallet: CONFIG.SOVEREIGN_WALLET,
      balanceETH: balanceETH,
      status: Number(balanceETH) > 0 ? 'HAS_ETH' : 'NO_ETH',
      ready: Number(balanceETH) >= 0.005
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🚀 START MINTING
app.post('/start', async (req, res) => {
  if (mintingActive) {
    return res.json({ status: 'already_running', message: 'Minting already active' });
  }
  
  try {
    // Quick balance check
    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
    const balance = await provider.getBalance(CONFIG.SOVEREIGN_WALLET);
    const balanceETH = ethers.formatEther(balance);
    
    if (Number(balanceETH) < 0.005) {
      return res.status(400).json({
        error: 'Need more ETH',
        current: balanceETH,
        required: '0.005 ETH',
        action: `Send ETH to: ${CONFIG.SOVEREIGN_WALLET}`
      });
    }
    
    // Start minting
    startMinting();
    
    res.json({
      status: 'started',
      message: 'Minting 12,000 BWAEZI started!',
      balance: balanceETH,
      time: '10-15 minutes estimated'
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ SIMPLE MINTING FUNCTION
async function startMinting() {
  if (mintingActive) return;
  
  mintingActive = true;
  console.log('🚀 STARTING MINTING PROCESS...');
  
  try {
    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
    const privateKey = process.env.SOVEREIGN_PRIVATE_KEY;
    
    if (!privateKey) {
      throw new Error('SOVEREIGN_PRIVATE_KEY not set');
    }
    
    const signer = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(CONFIG.CONTRACT_ADDRESS, BWAEZI_ABI, signer);
    
    let totalMinted = 0;
    const target = 12000;
    
    console.log(`🎯 Target: ${target} BWAEZI`);
    console.log(`👛 Using wallet: ${await signer.getAddress()}`);
    
    // Simple minting loop
    const interval = setInterval(async () => {
      if (totalMinted >= target || !mintingActive) {
        console.log('✅ MINTING COMPLETED:', totalMinted, 'BWAEZI');
        clearInterval(interval);
        return;
      }
      
      try {
        // Mint 250 BWAEZI per cycle (adjust gas deducted)
        const amount = ethers.parseUnits("250", 18);
        const tx = await contract.mint(CONFIG.SOVEREIGN_WALLET, amount, {
          gasLimit: 150000,
          gasPrice: ethers.parseUnits("25", "gwei")
        });
        
        console.log(`📝 Minted 250 BWAEZI: ${tx.hash}`);
        totalMinted += 250;
        console.log(`📊 Progress: ${totalMinted}/${target}`);
        
      } catch (error) {
        console.error('❌ Mint error:', error.message);
      }
    }, 30000); // Every 30 seconds
    
  } catch (error) {
    console.error('❌ Failed to start minting:', error);
    mintingActive = false;
  }
}

// 🛑 STOP MINTING
app.post('/stop', (req, res) => {
  mintingActive = false;
  res.json({ status: 'stopped', message: 'Minting stopped' });
});

// 🔥 STATUS
app.get('/status', (req, res) => {
  res.json({
    mintingActive,
    endpoints: {
      balance: 'GET /balance',
      start: 'POST /start', 
      stop: 'POST /stop'
    }
  });
});

// 🚀 START SERVER
async function startServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer(app);
    server.listen(PORT, HOST, () => {
      console.log(`🎉 Server running on port ${PORT}`);
      console.log(`🌐 URL: https://arielmatrix2-0-twwc.onrender.com`);
      resolve();
    });
    server.on('error', reject);
  });
}

startServer().catch(console.error);

export default app;
