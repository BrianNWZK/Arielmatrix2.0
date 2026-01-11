// scripts/deploy-bwaezi-paymaster.js
import { ethers } from "ethers";
import fs from "fs";
import path from "path";
import solc from "solc";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";

dotenvExpand.expand(dotenv.config());

// --- CONFIG ---
const RPC_URL = process.env.RPC_URL || "https://eth.llamarpc.com";
const PRIVATE_KEY = process.env.SOVEREIGN_PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("Missing SOVEREIGN_PRIVATE_KEY");

// Contract source
const contractPath = path.resolve("contracts", "BWAEZIPaymaster.sol");

// Constructor args
const ENTRYPOINT     = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"; // EntryPoint v0.6
const BWAEZI         = "0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2"; // BWAEZI token
const WETH           = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; // WETH
const UNISWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564"; // Uniswap V3 Router
const QUOTER_V2      = "0xb27308f9f90d607463bb33ea1bebb41c27ce5ab6"; // QuoterV2
const SCW            = "0x59be70f1c57470d7773c3d5d27b8d165fcbe7eb2"; // Your SCW

// --- Compile contract ---
function compile() {
  const source = fs.readFileSync(contractPath, "utf8");
  const input = {
    language: "Solidity",
    sources: { "BWAEZIPaymaster.sol": { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } }
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const contract = output.contracts["BWAEZIPaymaster.sol"].BWAEZIPaymaster;
  return { abi: contract.abi, bytecode: "0x" + contract.evm.bytecode.object };
}

// --- Deploy ---
async function main() {
  console.log("=== BWAEZI PAYMASTER DEPLOYMENT ===");

  const { abi, bytecode } = compile();
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("Deployer:", wallet.address);
  console.log("Balance:", ethers.formatEther(await provider.getBalance(wallet.address)), "ETH");

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const paymaster = await factory.deploy(
    ENTRYPOINT,
    BWAEZI,
    WETH,
    UNISWAP_ROUTER,
    QUOTER_V2,
    SCW
  );

  console.log("TX:", paymaster.deploymentTransaction().hash);
  await paymaster.waitForDeployment();
  const addr = await paymaster.getAddress();
  console.log("✅ Paymaster deployed at:", addr);

  // Approve BWAEZI once
  const tokenAbi = ["function approve(address spender, uint256 amount) returns (bool)"];
  const token = new ethers.Contract(BWAEZI, tokenAbi, wallet);
  const tx = await token.approve(addr, ethers.MaxUint256);
  await tx.wait();
  console.log("✅ BWAEZI approved for Paymaster");

  console.log("🎉 Deployment complete. Paymaster live at:", addr);
}

main().catch(e => {
  console.error("Fatal:", e);
  process.exit(1);
});
