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

const contractPath = path.resolve("arielsql_suite", "contracts", "BWAEZIPaymaster.sol");

// Constructor args — 6 params per hardened contract
const ENTRYPOINT   = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"; // EntryPoint v0.6
const BWAEZI       = "0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2"; // BWAEZI token
const WETH         = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; // WETH
const UNISWAP_V3   = "0xE592427A0AEce92De3Edee1F18E0157C05861564"; // Uniswap V3 Router
const QUOTER_V2    = "0xb27308f9f90d607463bb33ea1bebb41c27ce5ab6"; // Uniswap QuoterV2
const SCW_ADDRESS  = process.env.SCW_ADDRESS; // Smart Contract Wallet
if (!SCW_ADDRESS) throw new Error("Missing SCW_ADDRESS in .env");

// --- Import resolver for solc ---
function findImports(importPath) {
  try {
    if (importPath.startsWith("@")) {
      const resolved = path.resolve("node_modules", importPath);
      return { contents: fs.readFileSync(resolved, "utf8") };
    }
    const localFlat = path.resolve("arielsql_suite", "contracts", importPath);
    if (fs.existsSync(localFlat)) {
      return { contents: fs.readFileSync(localFlat, "utf8") };
    }
    const localRelative = path.resolve(path.dirname(contractPath), importPath);
    if (fs.existsSync(localRelative)) {
      return { contents: fs.readFileSync(localRelative, "utf8") };
    }
    return { error: "File not found: " + importPath };
  } catch {
    return { error: "File not found: " + importPath };
  }
}

// --- Compile and deploy ---
async function main() {
  console.log("=== PAYMASTER COMPILE + DEPLOY ===");

  // Compile
  console.log("🔨 Compiling BWAEZIPaymaster...");
  const source = fs.readFileSync(contractPath, "utf8");
  const input = {
    language: "Solidity",
    sources: { "BWAEZIPaymaster.sol": { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } }
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

  if (output.errors) {
    const errors = output.errors.filter(e => e.severity === "error");
    if (errors.length > 0) {
      errors.forEach(err => console.error(err.formattedMessage));
      throw new Error("Compilation failed");
    }
    output.errors
      .filter(e => e.severity === "warning")
      .forEach(w => console.warn("Warning:", w.formattedMessage));
  }

  const contract = output.contracts["BWAEZIPaymaster.sol"].BWAEZIPaymaster;
  const abi = contract.abi;
  const bytecode = "0x" + contract.evm.bytecode.object;

  // Deploy
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("Deployer:", wallet.address);
  console.log("Balance:", ethers.formatEther(await provider.getBalance(wallet.address)), "ETH");

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);

  const paymaster = await factory.deploy(
    ENTRYPOINT,
    BWAEZI,
    WETH,
    UNISWAP_V3,
    QUOTER_V2,
    SCW_ADDRESS
  );

  console.log("TX:", paymaster.deploymentTransaction().hash);
  await paymaster.waitForDeployment();
  const addr = await paymaster.getAddress();
  console.log("✅ Paymaster deployed at:", addr);

  console.log("⚠️ IMPORTANT: Now send BWAEZI.approve(paymaster, MaxUint256) from your SCW.");
  console.log("   The deploy script cannot approve on behalf of SCW — SCW must execute it.");
}

main().catch(e => {
  console.error("Fatal:", e);
  process.exit(1);
});
