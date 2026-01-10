// main.js - Flash Loan Arbitrage Receiver Deployer with Multi-RPC Fallback
// January 2026 - Ethereum Mainnet
// Features: 3000 fee tier + Chainlink oracle slippage protection + 0.2% profit min + emergency withdraw
// Uses multiple RPC endpoints with round‑robin fallback

require('dotenv').config();
const { ethers } = require("ethers");
const http = require('http');
const url = require('url');

const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY missing in .env");

// Multiple RPC endpoints
const RPC_URLS = [
  'https://ethereum-rpc.publicnode.com',
  'https://rpc.ankr.com/eth',
  'https://eth.llamarpc.com'
];

const PORT = process.env.PORT || 10000; // Render requires this

// ── Pre-compiled ABI + Bytecode (unchanged from your patched contract) ──
const ABI = [ /* ... keep ABI from your file ... */ ];
const BYTECODE = "0x6080..."; // keep full bytecode from your file

// ── Helper: pick first healthy RPC ──
async function getHealthyProvider() {
  for (const url of RPC_URLS) {
    try {
      const provider = new ethers.JsonRpcProvider(url);
      const blockNumber = await provider.getBlockNumber();
      if (blockNumber > 0) {
        console.log(`✅ Using RPC: ${url} (block ${blockNumber})`);
        return provider;
      }
    } catch (e) {
      console.warn(`⚠️ RPC failed: ${url} → ${e.message}`);
    }
  }
  throw new Error("No healthy RPC endpoint available");
}

// ── Deployment ──────────────────────────────────────────────────────────
async function deployContract() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║ UPDATED PATCHED ARB RECEIVER DEPLOY START ║");
  console.log("╚══════════════════════════════════════════╝\n");

  const provider = await getHealthyProvider();
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`Deployer address: ${wallet.address}`);
  console.log(`Balance: ${ethers.formatEther(await provider.getBalance(wallet.address))} ETH\n`);

  // Log updated pre-compiled data
  console.log("UPDATED ABI:");
  console.log(JSON.stringify(ABI, null, 2));
  console.log("\nUPDATED BYTECODE (starts with):");
  console.log(BYTECODE.substring(0, 100) + "...");
  console.log(`Bytecode full length: ${BYTECODE.length} characters\n`);

  // Fetch current Aave V3 Pool
  const PROVIDER_ADDRESS = "0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e";
  const providerAbi = ["function getPool() external view returns (address)"];
  const aaveProvider = new ethers.Contract(PROVIDER_ADDRESS, providerAbi, provider);
  const currentPool = await aaveProvider.getPool();
  console.log(`Current Aave V3 Pool (live): ${currentPool}\n`);

  // Deploy with updated bytecode/ABI
  const factory = new ethers.ContractFactory(ABI, BYTECODE, wallet);
  console.log("Sending deployment transaction...");
  const contract = await factory.deploy(currentPool, {
    gasLimit: 4000000,
    maxFeePerGas: ethers.parseUnits("45", "gwei"),
    maxPriorityFeePerGas: ethers.parseUnits("2.5", "gwei")
  });

  console.log(`Deploy tx hash: ${contract.deploymentTransaction().hash}`);
  await contract.waitForDeployment();

  const deployedAddress = await contract.getAddress();

  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║ UPDATED PATCHED CONTRACT DEPLOYED        ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log(`Deployed Address: ${deployedAddress}`);
  console.log(`Aave Pool Used:   ${currentPool}`);
  console.log(`Deployer:         ${wallet.address}`);
  console.log(`Etherscan: https://etherscan.io/address/${deployedAddress}`);
  console.log("\nFeatures: 3000 tier pool + Chainlink slippage guard + 0.2% min profit + emergency withdraw");
  console.log("Ready for safer testing!");
}

// ── Render Health Server ────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  if (parsed.pathname === '/health' || parsed.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'alive', 
      time: new Date().toISOString(),
      version: 'patched-3000-tier-oracle-safety-emergency'
    }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, () => {
  console.log(`Health server running on port ${PORT}`);
  // Kick off deployment once server is up
  deployContract().catch(err => {
    console.error("Fatal deploy error:", err.message || err);
    process.exit(1);
  });
});
