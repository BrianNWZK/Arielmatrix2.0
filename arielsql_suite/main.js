// main.js
// Compile + deploy WarehouseBalancerArb (MEV v17/v18)
// - Checksummed addresses (EIP-55)
// - Dynamic Balancer poolId fetching
// - viaIR enabled to avoid "stack too deep"
// - Clear constructor arg order (22 args)

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

// --- Addresses (raw) ---
const RAW = {
  // Core
  SCW:              "0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2",
  BALANCER_VAULT:   "0xBA12222222228d8Ba445958a75a0704d566BF2C8",
  BWAEZI:           "0x54D1C2889B08CAD0932266EAde15eC884fA0CdC2", // corrected checksum
  USDC:             "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  WETH:             "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",

  // Routers & infra
  UNIV3_ROUTER:     "0xE592427A0AEce92De3Edee1F18E0157C05861564",
  UNIV2_ROUTER:     "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  SUSHI_ROUTER:     "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
  QUOTER_V2:        "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6",
  ENTRYPOINT:       "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
  CHAINLINK_ETHUSD: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",

  // Pools (addresses)
  UNIV3_BW_USDC:    "0x261c64D4D96EbFA14398B52d93C9D063E3A619F8",
  UNIV3_BW_WETH:    "0x142C3dCE0A5605Fb385fae7760302fAB761022AA",
  UNIV2_BW_USDC:    "0xb3911905F8A6160Ef89391442F85ecA7C397859C",
  UNIV2_BW_WETH:    "0x6Df6F882ED69918349F75Fe397B37e62C04515B6",
  SUSHI_BW_USDC:    "0x9d2F8F9A2E3C240dECbbE23e9B3521E6ca2489D1",
  SUSHI_BW_WETH:    "0xE9E62C8Cc585C21Fb05Fd82Fb68E0129711869F9",
  BAL_BW_USDC:      "0x6659Db7c55C701bC627FA2855BFBBC6D75D6fD7A",
  BAL_BW_WETH:      "0x9B143788F52Daa8C91cf5162Fb1B981663A8A1eF",

  // Position manager
  POSITION_MANAGER: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
};

// --- Helpers ---
function checksum(addr) {
  return ethers.getAddress(addr);
}

function findContractFile() {
  const baseDir = "arielsql_suite/scripts";
  const files = fs.readdirSync(baseDir);
  const target = files.find(
    f =>
      f.endsWith(".sol") &&
      f.toLowerCase().includes("warehouse") &&
      (f.toLowerCase().includes("centricbalancerarb") ||
       f.toLowerCase().includes("balancerarb"))
  );
  if (!target) {
    const allSol = files.filter(f => f.endsWith(".sol"));
    throw new Error(`Solidity file not found in ${baseDir}. Found: ${allSol.join(", ")}`);
  }
  return { baseDir, file: target, fullPath: path.join(baseDir, target) };
}

function compile(source, fileName) {
  const input = {
    language: "Solidity",
    sources: { [fileName]: { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } }
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  if (output.errors) {
    const errs = output.errors.filter(e => e.severity === "error");
    const warns = output.errors.filter(e => e.severity === "warning");
    if (errs.length) {
      errs.forEach(e => console.error(e.formattedMessage));
      throw new Error("Compilation failed");
    }
    warns.forEach(w => console.warn("Warning:", w.formattedMessage));
  }
  const compiled = output.contracts[fileName]?.WarehouseBalancerArb;
  if (!compiled) {
    const available = Object.keys(output.contracts[fileName] || {});
    throw new Error(`Contract WarehouseBalancerArb not found. Available: ${available.join(", ")}`);
  }
  return {
    abi: compiled.abi,
    bytecode: "0x" + compiled.evm.bytecode.object,
    deployedSize: (compiled.evm.deployedBytecode.object.length / 2)
  };
}

// --- Fetch Balancer poolIds from pool addresses ---
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
  console.log("=== Compile + Deploy WarehouseBalancerArb ===");

  // Contract file
  const { baseDir, file, fullPath } = findContractFile();
  console.log("Source file:", fullPath);
  const source = fs.readFileSync(fullPath, "utf8");

  // Compile
  const { abi, bytecode, deployedSize } = compile(source, file);
  console.log(`Deployed bytecode size: ${deployedSize} bytes`);

  // Provider & wallet
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log("Deployer:", wallet.address);
  console.log("Balance:", ethers.formatEther(await provider.getBalance(wallet.address)), "ETH");

  // Checksummed addresses
  const A = Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k, checksum(v)]));

  // Dynamic Balancer poolIds
  console.log("Fetching Balancer pool IDs...");
  const { usdcId: BAL_BW_USDC_ID, wethId: BAL_BW_WETH_ID } = await fetchBalancerPoolIds(
    provider,
    A.BAL_BW_USDC,
    A.BAL_BW_WETH
  );
  console.log("BAL_BW_USDC_ID:", BAL_BW_USDC_ID);
  console.log("BAL_BW_WETH_ID:", BAL_BW_WETH_ID);

  // Constructor args (22 total)
  const args = [
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
  ];

  // Deploy
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);

  // Optional: estimate gas to catch constructor reverts early
  try {
    const txReq = await factory.getDeployTransaction(...args);
    const est = await provider.estimateGas(txReq);
    console.log("Estimated gas:", est.toString());
  } catch (e) {
    console.warn("Gas estimation failed (may still deploy if inputs are valid):", e.message);
  }

  const contract = await factory.deploy(...args);
  console.log("TX:", contract.deploymentTransaction().hash);

  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log("✅ Deployed at:", addr);

  // Persist deployment info
  const info = {
    address: addr,
    tx: contract.deploymentTransaction().hash,
    deployer: wallet.address,
    poolIds: { BAL_BW_USDC_ID, BAL_BW_WETH_ID },
    network: await provider.getNetwork(),
    timestamp: new Date().toISOString()
  };
  fs.writeFileSync("deployment-info.json", JSON.stringify(info, null, 2));
  console.log("Saved deployment-info.json");
}

main().catch(err => {
  console.error("❌ Deployment failed:", err.message);
  process.exit(1);
});
