// arielsql_suite/main.js - WITH DASHBOARD SUPPORT
import http from "http";
import express from "express";
import cors from "cors";
import { ethers } from 'ethers';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

let server = null;
let mintingActive = false;
let mintingProgress = {
  totalMinted: 0,
  target: 12000,
  cyclesCompleted: 0
};

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

// 🎯 SERVE DASHBOARD
app.get('/', async (req, res) => {
  try {
    const dashboardPath = join(__dirname, 'dashboard.html');
    const html = await fs.readFile(dashboardPath, 'utf8');
    res.send(html);
  } catch (error) {
    res.json({ 
      message: '🚀 BWAEZI Minting API',
      dashboard: 'Dashboard not available',
      endpoints: {
        balance: 'GET /balance',
        start: 'POST /start',
        stop: 'POST /stop',
        status: 'GET /mint-status'
      }
    });
  }
});

// 📊 API ENDPOINTS
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

app.post('/start', async (req, res) => {
  if (mintingActive) {
    return res.json({ status: 'already_running', message: 'Minting already active' });
  }
  
  try {
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

app.post('/stop', (req, res) => {
  mintingActive = false;
  res.json({ status: 'stopped', message: 'Minting stopped' });
});

app.get('/mint-status', (req, res) => {
  res.json({
    mintingActive,
    totalMinted: mintingProgress.totalMinted,
    target: mintingProgress.target,
    progress: (mintingProgress.totalMinted / mintingProgress.target) * 100,
    cyclesCompleted: mintingProgress.cyclesCompleted
  });
});

// 🔥 MINTING ENGINE
async function startMinting() {
  if (mintingActive) return;
  
  mintingActive = true;
  mintingProgress = { totalMinted: 0, target: 12000, cyclesCompleted: 0 };
  
  console.log('🚀 STARTING MINTING PROCESS...');
  
  try {
    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
    const privateKey = process.env.SOVEREIGN_PRIVATE_KEY;
    
    if (!privateKey) {
      throw new Error('SOVEREIGN_PRIVATE_KEY not set');
    }
    
    const signer = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(CONFIG.CONTRACT_ADDRESS, BWAEZI_ABI, signer);
    
    console.log(`🎯 Target: 12,000 BWAEZI`);
    console.log(`👛 Using wallet: ${await signer.getAddress()}`);
    
    const mintInterval = setInterval(async () => {
      if (!mintingActive) {
        clearInterval(mintInterval);
        console.log('🛑 Minting stopped');
        return;
      }
      
      if (mintingProgress.totalMinted >= mintingProgress.target) {
        clearInterval(mintInterval);
        mintingActive = false;
        console.log('🎉 MINTING COMPLETED! 12,000 BWAEZI');
        return;
      }
      
      try {
        // Calculate gas-deducted amount (250 BWAEZI gross, ~0.5 BWAEZI gas cost)
        const netBWAEZI = 249.5;
        const amount = ethers.parseUnits(netBWAEZI.toFixed(18), 18);
        
        const tx = await contract.mint(CONFIG.SOVEREIGN_WALLET, amount, {
          gasLimit: 150000,
          gasPrice: ethers.parseUnits("25", "gwei")
        });
        
        console.log(`📝 Minted ${netBWAEZI} BWAEZI: ${tx.hash}`);
        
        mintingProgress.totalMinted += netBWAEZI;
        mintingProgress.cyclesCompleted++;
        
        console.log(`📊 Progress: ${mintingProgress.totalMinted.toFixed(2)}/12000 BWAEZI`);
        
      } catch (error) {
        console.error('❌ Mint error:', error.message);
      }
    }, 30000);
    
  } catch (error) {
    console.error('❌ Failed to start minting:', error);
    mintingActive = false;
  }
}

// 🚀 START SERVER
async function startServer() {
  // Create dashboard.html if it doesn't exist
  try {
    const dashboardHTML = `<!DOCTYPE html>...`; // Use the full HTML from above
    await fs.writeFile(join(__dirname, 'dashboard.html'), dashboardHTML);
  } catch (error) {
    console.log('Note: Could not create dashboard file');
  }
  
  return new Promise((resolve, reject) => {
    server = http.createServer(app);
    server.listen(PORT, HOST, () => {
      console.log(`🎉 Server running on port ${PORT}`);
      console.log(`🌐 Dashboard: https://arielmatrix2-0-twwc.onrender.com`);
      console.log(`🔍 API: https://arielmatrix2-0-twwc.onrender.com/balance`);
      resolve();
    });
    server.on('error', reject);
  });
}

startServer().catch(console.error);

export default app;
