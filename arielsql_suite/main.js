// main.js
// Standalone compile + deploy for WarehouseBalancerArb (MEV v17/v18 compatible)
// Requires: npm i ethers solc dotenv dotenv-expand
// Usage: node main.js

import fs from "fs";
import path from "path";
import solc from "solc";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";
import { ethers } from "ethers";

dotenvExpand.expand(dotenv.config());

// --- ENV ---
const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");

// === Exact addresses from your logs (update as needed) ===

// Core wiring
const SCW                 = "0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2"; // Smart Contract Wallet
const BALANCER_VAULT      = "0xba12222222228d8ba445958a75a0704d566bf2c8";
const BWAEZI              = "0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2";
const USDC                = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WETH                = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const UNIV3_ROUTER        = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
const UNIV2_ROUTER        = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const SUSHI_ROUTER        = "0xd9e1CE17f2641f24AE83637ab66a2cca9C378B9F";
const QUOTER_V2           = "0xb27308f9F90d607463bb33eA1BeBb41C27CE5AB6";
const ENTRYPOINT          = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
const CHAINLINK_ETHUSD    = "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419";

// Pools wiring
const UNIV3_BW_USDC       = "0x261c64d4d96EBfa14398B52D93C9d063E3a619f8";
const UNIV3_BW_WETH       = "0x142C3dce0a5605Fb385fAe7760302fab761022aa";
const UNIV2_BW_USDC       = "0xb3911905f8a6160eF89391442f85ecA7c397859c";
const UNIV2_BW_WETH       = "0x6dF6F882ED69918349F75Fe397b37e62C04515b6";
const SUSHI_BW_USDC       = "0x9d2f8F9A2E3C240dECbbE23e9B3521E6ca2489D1";
const SUSHI_BW_WETH       = "0xE9E62C8Cc585C21Fb05fd82Fb68e0129711869f9";
const BAL_BW_USDC         = "0x6659Db7c55c701bC627fA2855BFBBC6D75D6fD7A";
const BAL_BW_WETH         = "0x9B143788f52Daa8C91cf5162fb1b981663a8a1eF";

// Balancer pool IDs (bytes32) — REQUIRED by constructor
// Replace with the actual pool IDs for your Balancer pools.
const BAL_BW_USDC_ID      = "0x0000000000000000000000006659db7c55c701bc627fa2855bfbbc6d75d6fd7a00020000000000000000000000";
const BAL_BW_WETH_ID      = "0x0000000000000000000000009b143788f52daa8c91cf5162fb1b981663a8a1ef00020000000000000000000000";

// Uniswap V3 NonfungiblePositionManager — REQUIRED by constructor
const POSITION_MANAGER    = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";

// --- CONTRACT SOURCE PATH (robust to non-ASCII hyphen) ---
const baseDir = "arielsql_suite/scripts";

// The filename in the system uses a non-standard hyphen. We’ll locate it dynamically.
function findContractFile() {
  const files = fs.readdirSync(baseDir);
  const target = files.find(f =>
    f.endsWith(".sol") &&
    f.toLowerCase().includes("warehouse") &&
    f.toLowerCase().includes("centricbalancerarb")
  );
  if (!target) {
    throw new Error(
      `Solidity file not found in ${baseDir}. Ensure the file exists (e.g., Warehouse‑centricBalancerArb.sol).`
    );
  }
  return target;
}

const contractFile = findContractFile();
const contractPath = path.join(baseDir, contractFile);
const contractSource = fs.readFileSync(contractPath, "utf8");

// --- COMPILE ---
function compile(source) {
  const input = {
    language: "Solidity",
    sources: { [contractFile]: { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 500 }, // moderate runs to balance size/gas
      // viaIR can bloat bytecode; disable unless you need it.
      viaIR: false,
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } }
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  if (output.errors) {
    const errs = output.errors.filter(e => e.severity === "error");
    if (errs.length) {
      errs.forEach(e => console.error(e.formattedMessage));
      throw new Error("Compilation failed");
    }
    output.errors
      .filter(e => e.severity === "warning")
      .forEach(w => console.warn("Warning:", w.formattedMessage));
  }

  // The contract name must match the Solidity source (WarehouseBalancerArb)
  const compiled = output.contracts[contractFile]?.WarehouseBalancerArb;
  if (!compiled) {
    const available = Object.keys(output.contracts[contractFile] || {});
    throw new Error(
      `Contract "WarehouseBalancerArb" not found in ${contractFile}. Found: ${available.join(", ")}`
    );
  }
  return { abi: compiled.abi, bytecode: "0x" + compiled.evm.bytecode.object };
}

// --- DEPLOY ---
async function main() {
  console.log("=== Compile + Deploy WarehouseBalancerArb (MEV v17) ===");
  console.log("Source file:", contractPath);

  const { abi, bytecode } = compile(contractSource);

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("Deployer:", wallet.address);
  console.log("Balance:", ethers.formatEther(await provider.getBalance(wallet.address)), "ETH");

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);

  // IMPORTANT: v17/v18 constructor expects 22 arguments:
  // SCW, BALANCER_VAULT, BWAEZI, USDC, WETH,
  // UNIV3_ROUTER, UNIV2_ROUTER, SUSHI_ROUTER, QUOTER_V2, ENTRYPOINT, CHAINLINK_ETHUSD,
  // UNIV3_BW_USDC, UNIV3_BW_WETH, UNIV2_BW_USDC, UNIV2_BW_WETH, SUSHI_BW_USDC, SUSHI_BW_WETH,
  // BAL_BW_USDC, BAL_BW_WETH, BAL_BW_USDC_ID, BAL_BW_WETH_ID, POSITION_MANAGER
  const contract = await factory.deploy(
    SCW,
    BALANCER_VAULT,
    BWAEZI,
    USDC,
    WETH,
    UNIV3_ROUTER,
    UNIV2_ROUTER,
    SUSHI_ROUTER,
    QUOTER_V2,
    ENTRYPOINT,
    CHAINLINK_ETHUSD,
    UNIV3_BW_USDC,
    UNIV3_BW_WETH,
    UNIV2_BW_USDC,
    UNIV2_BW_WETH,
    SUSHI_BW_USDC,
    SUSHI_BW_WETH,
    BAL_BW_USDC,
    BAL_BW_WETH,
    BAL_BW_USDC_ID,
    BAL_BW_WETH_ID,
    POSITION_MANAGER
  );

  console.log("TX:", contract.deploymentTransaction().hash);
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log("✅ Deployed at:", addr);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
