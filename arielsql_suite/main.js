// main.js
// Compile + deploy WarehouseBalancerArb (MEV v17/v18)
// Usage: node main.js

import fs from "fs";
import path from "path";
import solc from "solc";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";
import { ethers } from "ethers";

dotenvExpand.expand(dotenv.config());

// --- ENV ---
const RPC_URL = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");

// --- CONTRACT SOURCE PATH ---
const baseDir = "arielsql_suite/scripts";

function findContractFile() {
  const files = fs.readdirSync(baseDir);
  const target = files.find(f =>
    f.endsWith(".sol") &&
    f.toLowerCase().includes("warehouse") &&
    f.toLowerCase().includes("balancerarb")
  );
  if (!target) throw new Error(`Solidity file not found in ${baseDir}.`);
  return target;
}

// --- COMPILE ---
function compile(source, fileName) {
  const input = {
    language: "Solidity",
    sources: { [fileName]: { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
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
  const compiled = output.contracts[fileName]?.WarehouseBalancerArb;
  if (!compiled) throw new Error("Contract WarehouseBalancerArb not found.");
  return { abi: compiled.abi, bytecode: "0x" + compiled.evm.bytecode.object };
}

// --- RAW ADDRESSES (lowercase) ---
const RAW = {
  SCW:              "0x59be70f1c57470d7773c3d5d27b8d165fcbe7eb2",
  BALANCER_VAULT:   "0xba12222222228d8ba445958a75a0704d566bf2c8",
  BWAEZI:           "0x54d1c2889b08cad0932266eade15ec884fa0cdc2",
  USDC:             "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  WETH:             "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  UNIV3_ROUTER:     "0xe592427a0aece92de3edee1f18e0157c05861564",
  UNIV2_ROUTER:     "0x7a250d5630b4cf539739df2c5dacb4c659f2488d",
  SUSHI_ROUTER:     "0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f",
  QUOTER_V2:        "0xb27308f9f90d607463bb33ea1bebb41c27ce5ab6",
  ENTRYPOINT:       "0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789",
  CHAINLINK_ETHUSD: "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419",
  UNIV3_BW_USDC:    "0x261c64d4d96ebfa14398b52d93c9d063e3a619f8",
  UNIV3_BW_WETH:    "0x142c3dce0a5605fb385fae7760302fab761022aa",
  UNIV2_BW_USDC:    "0xb3911905f8a6160ef89391442f85eca7c397859c",
  UNIV2_BW_WETH:    "0x6df6f882ed69918349f75fe397b37e62c04515b6",
  SUSHI_BW_USDC:    "0x9d2f8f9a2e3c240decbbe23e9b3521e6ca2489d1",
  SUSHI_BW_WETH:    "0xe9e62c8cc585c21fb05fd82fb68e0129711869f9",
  BAL_BW_USDC:      "0x6659db7c55c701bc627fa2855bfbbc6d75d6fd7a",
  BAL_BW_WETH:      "0x9b143788f52daa8c91cf5162fb1b981663a8a1ef",
  POSITION_MANAGER: "0xc36442b4a4522e871399cd717abdd847ab11fe88"
};

// --- DEPLOY ---
async function main() {
  console.log("=== Compile + Deploy WarehouseBalancerArb ===");

  const contractFile = findContractFile();
  const contractPath = path.join(baseDir, contractFile);
  const contractSource = fs.readFileSync(contractPath, "utf8");

  const { abi, bytecode } = compile(contractSource, contractFile);

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("Deployer:", wallet.address);
  console.log("Balance:", ethers.formatEther(await provider.getBalance(wallet.address)), "ETH");

  // Normalize addresses
  const A = {};
  for (const [k, v] of Object.entries(RAW)) {
    A[k] = ethers.getAddress(v);
  }

  // Fetch Balancer pool IDs
  const poolAbi = ["function getPoolId() external view returns (bytes32)"];
  const usdcPool = new ethers.Contract(A.BAL_BW_USDC, poolAbi, provider);
  const wethPool = new ethers.Contract(A.BAL_BW_WETH, poolAbi, provider);
  const BAL_BW_USDC_ID = await usdcPool.getPoolId();
  const BAL_BW_WETH_ID = await wethPool.getPoolId();

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy(
    A.SCW,
    A.BALANCER_VAULT,
    A.BWAEZI,
    A.USDC,
    A.WETH,
    A.UNIV3_ROUTER,
    A.UNIV2_ROUTER,
    A.SUSHI_ROUTER,
    A.QUOTER_V2,
    A.ENTRYPOINT,
    A.CHAINLINK_ETHUSD,
    A.UNIV3_BW_USDC,
    A.UNIV3_BW_WETH,
    A.UNIV2_BW_USDC,
    A.UNIV2_BW_WETH,
    A.SUSHI_BW_USDC,
    A.SUSHI_BW_WETH,
    A.BAL_BW_USDC,
    A.BAL_BW_WETH,
    BAL_BW_USDC_ID,
    BAL_BW_WETH_ID,
    A.POSITION_MANAGER
  );

  console.log("TX:", contract.deploymentTransaction().hash);
  await contract.waitForDeployment();
  console.log("✅ Deployed at:", await contract.getAddress());
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
