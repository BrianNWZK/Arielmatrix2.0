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
// --- RAW ADDRESSES (all lowercase) ---
const RAW = {
  scw: "0x59be70f1c57470d7773c3d5d27b8d165fcbe7eb2",
  balancer_vault: "0xba12222222228d8ba445958a75a0704d566bf2c8",
  bwzc: "0x54d1c2889b08cad0932266eade15ec884fa0cdc2",
  usdc: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  weth: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
  univ3_router: "0xe592427a0aece92de3edee1f18e0157c05861564",
  univ2_router: "0x7a250d5630b4cf539739df2c5dacb4c659f2488d",
  sushi_router: "0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f",
  quoter_v2: "0xb27308f9f90d607463bb33ea1bebb41c27ce5ab6",
  entrypoint: "0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789",
  chainlink_ethusd: "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419",
  univ3_bw_usdc: "0x261c64d4d96ebfa14398b52d93c9d063e3a619f8",
  univ3_bw_weth: "0x142c3dce0a5605fb385fae7760302fab761022aa",
  univ2_bw_usdc: "0xb3911905f8a6160ef89391442f85eca7c397859c",
  univ2_bw_weth: "0x6dF6F882ED69918349F75Fe397b37e62C04515b6",
  sushi_bw_usdc: "0x9d2f8f9a2e3c240decbbe23e9b3521e6ca2489d1",
  sushi_bw_weth: "0xe9e62c8cc585c21fb05fd82fb68e0129711869f9",
  bal_bw_usdc: "0x6659db7c55c701bc627fa2855bfbbc6d75d6fd7a",
  bal_bw_weth: "0x9b143788f52daa8c91cf5162fb1b981663a8a1ef",
  position_manager: "0xc36442b4a4522e871399cd717abdd847ab11fe88",
  // Dual paymasters (from your deployment logs)
  paymaster_a: "0x4e073aaa36cd51fd37298f87e3fce8437a08dd71",
  paymaster_b: "0x79a515d5a085d2b86aff104ec9c8c2152c9549c0"
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
      optimizer: { enabled: true, runs: 1 },
      viaIR: true,
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
  return {
    abi: compiled.abi,
    bytecode: "0x" + compiled.evm.bytecode.object,
    deployedSize: (compiled.evm.deployedBytecode.object.length / 2)
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
async function fetchBwzcDecimals(provider, bwzcAddr) {
  const abi = ["function decimals() external view returns (uint8)"];
  const contract = new ethers.Contract(bwzcAddr, abi, provider);
  return await contract.decimals();
}
// --- Deploy ---
async function main() {
  console.log("=== Compile + Deploy WarehouseBalancerArb V20 ===");
  const { baseDir, file, fullPath } = findContractFile();
  console.log("Source file:", fullPath);
  const source = fs.readFileSync(fullPath, "utf8");
  const { abi, bytecode, deployedSize } = compile(source, file);
  console.log(`Deployed bytecode size: ${deployedSize} bytes`);
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log("Deployer:", wallet.address);
  console.log("Balance:", ethers.formatEther(await provider.getBalance(wallet.address)), "ETH");
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
  // Fetch BWZC decimals
  console.log("Fetching BWZC decimals...");
  const BWZC_DECIMALS = await fetchBwzcDecimals(provider, A.BWZC);
  console.log("BWZC_DECIMALS:", BWZC_DECIMALS);
  const OWNER = wallet.address;
  const args = [
    OWNER,
    A.SCW,
    A.USDC,
    A.WETH,
    A.BWZC,
    A.UNIV3_ROUTER,
    A.QUOTER_V2,
    A.CHAINLINK_ETHUSD,
    A.BALANCER_VAULT,
    A.UNIV2_ROUTER,
    A.SUSHI_ROUTER,
    A.ENTRYPOINT,
    A.POSITION_MANAGER,
    BWZC_DECIMALS,
    A.PAYMASTER_A,
    A.PAYMASTER_B,
    BAL_BW_USDC_ID,
    BAL_BW_WETH_ID
  ];
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  try {
    const txReq = await factory.getDeployTransaction(...args);
    const est = await provider.estimateGas(txReq);
    console.log("Estimated gas:", est.toString());
  } catch (e) {
    console.warn("Gas estimation failed:", e.message);
  }
  const contract = await factory.deploy(...args);
  console.log("TX:", contract.deploymentTransaction().hash);
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log("✅ Deployed at:", addr);
  const info = {
    address: addr,
    tx: contract.deploymentTransaction().hash,
    deployer: wallet.address,
    poolIds: { BAL_BW_USDC_ID, BAL_BW_WETH_ID },
    bwzcDecimals: BWZC_DECIMALS,
    network: await provider.getNetwork(),
    timestamp: new Date().toISOString()
  };
  fs.writeFileSync("deployment-info.json", JSON.stringify(info, null, 2));
  console.log("Saved deployment-info.json");
}
// --- Run ---
main().catch(err => {
  console.error("❌ Deployment failed:", err.message);
  console.error("Troubleshooting tips:");
  console.error("1. Ensure deployer wallet has sufficient ETH for gas");
  console.error("2. Verify all constructor arguments are valid addresses and pool IDs");
  console.error("3. Contract size warnings may require optimizer runs=1 or splitting into libraries");
  process.exit(1);
});
