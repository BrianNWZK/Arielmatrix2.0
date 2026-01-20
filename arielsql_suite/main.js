// main.js
// Compile + deploy WarehouseBalancerArb (MEV v17/v18)
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

// --- CONTRACT SOURCE PATH ---
const baseDir = "arielsql_suite/scripts";

function findContractFile() {
  const files = fs.readdirSync(baseDir);
  const target = files.find(f =>
    f.endsWith(".sol") &&
    f.toLowerCase().includes("warehouse") &&
    f.toLowerCase().includes("centricbalancerarb")
  );
  if (!target) {
    throw new Error(`Solidity file not found in ${baseDir}.`);
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
      optimizer: { enabled: true, runs: 500 },
      viaIR: true, // enable IR to avoid stack-too-deep
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
  const compiled = output.contracts[contractFile]?.WarehouseBalancerArb;
  if (!compiled) {
    const available = Object.keys(output.contracts[contractFile] || {});
    throw new Error(`Contract not found. Found: ${available.join(", ")}`);
  }
  return { abi: compiled.abi, bytecode: "0x" + compiled.evm.bytecode.object };
}

// --- DEPLOY ---
async function main() {
  console.log("=== Compile + Deploy WarehouseBalancerArb ===");
  console.log("Source file:", contractPath);

  const { abi, bytecode } = compile(contractSource);

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("Deployer:", wallet.address);
  console.log("Balance:", ethers.formatEther(await provider.getBalance(wallet.address)), "ETH");

  // Normalize all addresses with getAddress()
  const SCW              = ethers.getAddress("0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2");
  const BALANCER_VAULT   = ethers.getAddress("0xBA12222222228d8Ba445958a75a0704d566BF2C8");
  const BWAEZI           = ethers.getAddress("0x54D1C2889B08CAd0932266EAde15ec884FA0CdC2");
  const USDC             = ethers.getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
  const WETH             = ethers.getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
  const UNIV3_ROUTER     = ethers.getAddress("0xE592427A0AEce92De3Edee1F18E0157C05861564");
  const UNIV2_ROUTER     = ethers.getAddress("0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D");
  const SUSHI_ROUTER     = ethers.getAddress("0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F");
  const QUOTER_V2        = ethers.getAddress("0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6");
  const ENTRYPOINT       = ethers.getAddress("0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789");
  const CHAINLINK_ETHUSD = ethers.getAddress("0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419");

  const UNIV3_BW_USDC    = ethers.getAddress("0x261c64D4D96EbFA14398B52d93C9D063E3A619F8");
  const UNIV3_BW_WETH    = ethers.getAddress("0x142C3dCE0A5605Fb385fae7760302fAB761022AA");
  const UNIV2_BW_USDC    = ethers.getAddress("0xb3911905F8A6160Ef89391442F85ecA7C397859C");
  const UNIV2_BW_WETH    = ethers.getAddress("0x6Df6F882ED69918349F75Fe397B37e62C04515B6");
  const SUSHI_BW_USDC    = ethers.getAddress("0x9d2F8F9A2E3C240dECbbE23e9B3521E6ca2489D1");
  const SUSHI_BW_WETH    = ethers.getAddress("0xE9E62C8Cc585C21Fb05Fd82Fb68E0129711869F9");
  const BAL_BW_USDC      = ethers.getAddress("0x6659Db7c55C701bC627FA2855BFBBC6D75D6fD7A");
  const BAL_BW_WETH      = ethers.getAddress("0x9B143788F52Daa8C91cf5162Fb1B981663A8A1eF");

  const POSITION_MANAGER = ethers.getAddress("0xC36442b4a4522E871399CD717aBDD847Ab11FE88");

  // Dynamically fetch Balancer pool IDs
  const poolAbi = ["function getPoolId() external view returns (bytes32)"];
  const usdcPool = new ethers.Contract(BAL_BW_USDC, poolAbi, provider);
  const wethPool = new ethers.Contract(BAL_BW_WETH, poolAbi, provider);

  const BAL_BW_USDC_ID = await usdcPool.getPoolId();
  const BAL_BW_WETH_ID = await wethPool.getPoolId();

  console.log("Fetched USDC Pool ID:", BAL_BW_USDC_ID);
  console.log("Fetched WETH Pool ID:", BAL_BW_WETH_ID);

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);

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
  console.log("✅ Deployed at:", await contract.getAddress());
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
