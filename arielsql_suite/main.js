// main.js
// Compile + deploy WarehouseBalancerArb (MEV v17/v18) - SIZE-OPTIMIZED VERSION

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

// --- RAW ADDRESSES (all lowercase) ---
const RAW = {
  scw:              "0x59be70f1c57470d7773c3d5d27b8d165fcbe7eb2",
  balancer_vault:   "0xba12222222228d8ba445958a75a0704d566bf2c8",
  bwaezi:           "0x54d1c2889b08cad0932266eade15ec884fa0cdc2",
  usdc:             "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  weth:             "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  univ3_router:     "0xe592427a0aece92de3edee1f18e0157c05861564",
  univ2_router:     "0x7a250d5630b4cf539739df2c5dacb4c659f2488d",
  sushi_router:     "0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f",
  quoter_v2:        "0xb27308f9f90d607463bb33ea1bebb41c27ce5ab6",
  entrypoint:       "0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789",
  chainlink_ethusd: "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419",
  univ3_bw_usdc:    "0x261c64d4d96ebfa14398b52d93c9d063e3a619f8",
  univ3_bw_weth:    "0x142c3dce0a5605fb385fae7760302fab761022aa",
  univ2_bw_usdc:    "0xb3911905f8a6160ef89391442f85eca7c397859c",
  univ2_bw_weth:    "0x6df6f882ed69918349f75fe397b37e62c04515b6",
  sushi_bw_usdc:    "0x9d2f8f9a2e3c240decbbe23e9b3521e6ca2489d1",
  sushi_bw_weth:    "0xe9e62c8cc585c21fb05fd82fb68e0129711869f9",
  bal_bw_usdc:      "0x6659db7c55c701bc627fa2855bfbbc6d75d6fd7a",
  bal_bw_weth:      "0x9b143788f52daa8c91cf5162fb1b981663a8a1ef",
  position_manager: "0xc36442b4a4522e871399cd717abdd847ab11fe88"
};

// --- Helpers ---
function checksum(addr) {
  return ethers.getAddress(addr.toLowerCase());
}

function findContractFile() {
  const baseDir = "arielsql_suite/scripts";
  const files = fs.readdirSync(baseDir);
  const target = files.find(
    f =>
      f.endsWith(".sol") &&
      f.toLowerCase().includes("warehouse") &&
      f.toLowerCase().includes("balancerarb")
  );
  if (!target) throw new Error(`Solidity file not found in ${baseDir}.`);
  return { baseDir, file: target, fullPath: path.join(baseDir, target) };
}

function compile(source, fileName) {
  const input = {
    language: "Solidity",
    sources: { [fileName]: { content: source } },
    settings: {
      evmVersion: "shanghai",
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,  // Balanced; try 1000 or 200000 if still too large
        details: { yul: true }
      },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } }
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  if (output.errors) {
    const errs = output.errors.filter(e => e.severity === "error");
    if (errs.length) {
      errs.forEach(e => console.error(e.formattedMessage));
      throw new Error("Compilation failed");
    }
    output.errors.filter(e => e.severity === "warning").forEach(w => console.warn("Warning:", w.formattedMessage));
  }
  const compiled = output.contracts[fileName]?.WarehouseBalancerArb;
  if (!compiled) throw new Error("Contract WarehouseBalancerArb not found.");
  const deployedSize = compiled.evm.deployedBytecode.object.length / 2;
  if (deployedSize > 24576) {
    throw new Error(`Contract too large: ${deployedSize} bytes > 24,576 EVM limit. Try higher optimizer runs, remove features (e.g., seedAllPools), or use proxy pattern.`);
  }
  return {
    abi: compiled.abi,
    bytecode: "0x" + compiled.evm.bytecode.object,
    deployedSize
  };
}

async function fetchBalancerPoolIds(provider, balPoolAddrUSDC, balPoolAddrWETH) {
  const poolAbi = ["function getPoolId() external view returns (bytes32)"];
  const usdcPool = new ethers.Contract(balPoolAddrUSDC, poolAbi, provider);
  const wethPool = new ethers.Contract(balPoolAddrWETH, poolAbi, provider);
  const usdcId = await usdcPool.getPoolId();
  const wethId = await wethPool.getPoolId();
  return { usdcId, wethId };
}

// --- Deploy ---
async function main() {
  console.log("=== Compile + Deploy WarehouseBalancerArb (SIZE-OPTIMIZED) ===");

  const { baseDir, file, fullPath } = findContractFile();
  console.log("Source file:", fullPath);
  const source = fs.readFileSync(fullPath, "utf8");

  const { abi, bytecode, deployedSize } = compile(source, file);
  console.log(`Deployed bytecode size: ${deployedSize} bytes (<= 24576 OK)`);

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log("Deployer:", wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");
  if (balance < ethers.parseEther("0.5")) {
    throw new Error("Insufficient balance! Fund deployer with at least 0.5 ETH.");
  }

  // Normalize addresses
  const A = Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k.toUpperCase(), checksum(v)]));

  // Fetch Balancer pool IDs
  console.log("Fetching Balancer pool IDs...");
  const { usdcId: BAL_BW_USDC_ID, wethId: BAL_BW_WETH_ID } = await fetchBalancerPoolIds(
    provider,
    A.BAL_BW_USDC,
    A.BAL_BW_WETH
  );
  console.log("BAL_BW_USDC_ID:", BAL_BW_USDC_ID);
  console.log("BAL_BW_WETH_ID:", BAL_BW_WETH_ID);

  const args = [
    A.SCW, A.BALANCER_VAULT, A.BWAEZI, A.USDC, A.WETH,
    A.UNIV3_ROUTER, A.UNIV2_ROUTER, A.SUSHI_ROUTER, A.QUOTER_V2,
    A.ENTRYPOINT, A.CHAINLINK_ETHUSD,
    A.UNIV3_BW_USDC, A.UNIV3_BW_WETH,
    A.UNIV2_BW_USDC, A.UNIV2_BW_WETH,
    A.SUSHI_BW_USDC, A.SUSHI_BW_WETH,
    A.BAL_BW_USDC, A.BAL_BW_WETH,
    BAL_BW_USDC_ID, BAL_BW_WETH_ID,
    A.POSITION_MANAGER
  ];

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);

  const contract = await factory.deploy(...args);
  console.log("TX submitted:", contract.deploymentTransaction().hash);

  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log("✅ Deployed at:", addr);

  const info = {
    address: addr,
    tx: contract.deploymentTransaction().hash,
    deployer: wallet.address,
    poolIds: { BAL_BW_USDC_ID, BAL_BW_WETH_ID },
    network: await provider.getNetwork(),
    timestamp: new Date().toISOString(),
    bytecodeSize: deployedSize
  };

  fs.writeFileSync("deployment-info.json", JSON.stringify(info, null, 2));
  console.log("Saved deployment-info.json");
}

main().catch(err => {
  console.error("❌ Deployment failed:", err.message || err);
  process.exit(1);
});
