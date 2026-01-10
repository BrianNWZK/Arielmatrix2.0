// main.js - Flash Loan Arbitrage Receiver Deployer (ES Module)
// January 2026 - Ethereum Mainnet
// Deploys once and exits to avoid wasting ETH on repeated attempts.

import dotenv from "dotenv";
import { ethers } from "ethers";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY missing in .env");

// Multiple RPC endpoints (fallback order)
const RPC_URLS = [
  "https://ethereum-rpc.publicnode.com",
  "https://rpc.ankr.com/eth",
  "https://eth.llamarpc.com"
];

// ── ABI + Bytecode from patched contract ──
const ABI = [
  {
    "inputs": [{ "internalType": "address", "name": "_aavePool", "type": "address" }],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  { "inputs": [], "name": "AAVE_POOL", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "CHAINLINK_ETH_USD", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "MAX_SLIPPAGE_BPS", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "MIN_PROFIT_BPS", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "SUSHI_ROUTER", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "UNI_FEE_TIER", "outputs": [{ "internalType": "uint24", "name": "", "type": "uint24" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "UNI_ROUTER", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "USDC", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "WETH", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "internalType": "address", "name": "token", "type": "address" }], "name": "emergencyWithdraw", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  {
    "inputs": [
      { "internalType": "address", "name": "asset", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "internalType": "uint256", "name": "premium", "type": "uint256" },
      { "internalType": "address", "name": "initiator", "type": "address" },
      { "internalType": "bytes", "name": "", "type": "bytes" }
    ],
    "name": "executeOperation",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  { "inputs": [{ "internalType": "uint256", "name": "amount", "type": "uint256" }], "name": "executeFlashLoan", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [], "name": "owner", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }
];

// Full bytecode string from your file
const BYTECODE = "0x60806040523480156200001157600080fd5b5060405162003b96..." // keep full hex

// ── Helper: pick the first healthy RPC ──
async function getHealthyProvider() {
  for (const rpcUrl of RPC_URLS) {
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const blockNumber = await provider.getBlockNumber();
      if (blockNumber >= 0) {
        console.log(`✅ Using RPC: ${rpcUrl} (block ${blockNumber})`);
        return provider;
      }
    } catch (e) {
      console.warn(`⚠️ RPC failed: ${rpcUrl} → ${e?.message || e}`);
    }
  }
  throw new Error("No healthy RPC endpoint available");
}

// ── Deployment ───────────────────────────────────────────────────
async function deployContract() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║ UPDATED PATCHED ARB RECEIVER DEPLOY START ║");
  console.log("╚══════════════════════════════════════════╝\n");

  const provider = await getHealthyProvider();
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`Deployer address: ${wallet.address}`);
  console.log(`Balance: ${ethers.formatEther(await provider.getBalance(wallet.address))} ETH\n`);

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
    gasLimit: 4_000_000,
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

  // Exit after deployment
  process.exit(0);
}

// Run once
deployContract().catch(err => {
  console.error("Deployment failed:", err?.message || err);
  process.exit(1);
});
