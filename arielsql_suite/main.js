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
  chainlink_ethusd_secondary: "0x0000000000000000000000000000000000000000",
  univ3_bw_usdc: "0x261c64d4d96ebfa14398b52d93c9d063e3a619f8",
  univ3_bw_weth: "0x142c3dce0a5605fb385fae7760302fab761022aa",
  univ2_bw_usdc: "0xb3911905f8a6160ef89391442f85eca7c397859c",
  univ2_bw_weth: "0x6dF6F882ED69918349F75Fe397b37e62C04515b6",
  sushi_bw_usdc: "0x9d2f8f9a2e3c240decbbe23e9b3521e6ca2489d1",
  sushi_bw_weth: "0xe9e62c8cc585c21fb5fd82fb68e0129711869f9",
  bal_bw_usdc: "0x6659db7c55c701bc627fa2855bfbbc6d75d6fd7a",
  bal_bw_weth: "0x9b143788f52daa8c91cf5162fb1b981663a8a1ef",
  position_manager: "0xc36442b4a4522e871399cd717abdd847ab11fe88",
  paymaster_a: "0x4e073aaa36cd51fd37298f87e3fce8437a08dd71",
  paymaster_b: "0x79a515d5a085d2b86aff104ec9c8c2152c9549c0"
};

// --- Helpers ---
function checksum(addr) {
  return ethers.getAddress(addr.toLowerCase());
}

function compileContract() {
  const baseDir = "arielsql_suite/scripts";
  
  // Read both refactored files
  const mainSource = fs.readFileSync(path.join(baseDir, "Warehouse‑centricBalancerArb.sol"), "utf8");
  const mathLibSource = fs.readFileSync(path.join(baseDir, "MathLibraries.sol"), "utf8");
  
  // Prepare solc input
  const input = {
    language: "Solidity",
    sources: {
      "WarehouseBalancerArb.sol": { content: mainSource },
      "MathLibraries.sol": { content: mathLibSource }
    },
    settings: {
      viaIR: true,
      optimizer: { enabled: true, runs: 1 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } }
    }
  };
  
  console.log("Compiling contracts...");
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  
  if (output.errors) {
    const errors = output.errors.filter(e => e.severity === "error");
    const warnings = output.errors.filter(e => e.severity === "warning");
    
    if (errors.length) {
      errors.forEach(e => console.error(e.formattedMessage || e.message));
      throw new Error("Compilation failed");
    }
    if (warnings.length) {
      warnings.forEach(w => console.warn("Warning:", w.formattedMessage || w.message));
    }
  }
  
  const compiled = output.contracts["WarehouseBalancerArb.sol"]?.WarehouseBalancerArb;
  if (!compiled) {
    console.error("Available contracts:", Object.keys(output.contracts || {}));
    throw new Error("Contract WarehouseBalancerArb not found.");
  }
  
  return {
    abi: compiled.abi,
    bytecode: "0x" + compiled.evm.bytecode.object,
    deployedSize: (compiled.evm.deployedBytecode.object.length / 2)
  };
}

// --- Deploy ---
async function main() {
  console.log("=== Compile + Deploy WarehouseBalancerArb V20 ===");
  
  try {
    // Compile
    const { abi, bytecode, deployedSize } = compileContract();
    
    console.log(`Deployed bytecode size: ${deployedSize} bytes`);
    console.log(`Contract size check: ${deployedSize > 24576 ? '❌ EXCEEDS LIMIT' : '✅ OK'} (limit: 24576 bytes)`);
    
    if (deployedSize > 24576) {
      console.warn("\n⚠️  WARNING: Contract size exceeds limit!");
      console.warn("Consider additional optimizations:");
      console.warn("1. Use more aggressive optimizer settings");
      console.warn("2. Move more functions to external libraries");
      console.warn("3. Remove unused functions");
      console.warn("4. Use shorter error messages");
    }
    
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    console.log("\nDeployer:", wallet.address);
    console.log("Balance:", ethers.formatEther(await provider.getBalance(wallet.address)), "ETH");
    
    // Normalize addresses
    const A = Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k.toUpperCase(), checksum(v)]));
    
    // Fetch Balancer pool IDs
    console.log("\nFetching Balancer pool IDs...");
    const { usdcId: BAL_BW_USDC_ID, wethId: BAL_BW_WETH_ID } = await fetchBalancerPoolIds(
      provider,
      A.BAL_BW_USDC,
      A.BAL_BW_WETH
    );
    console.log("BAL_BW_USDC_ID:", BAL_BW_USDC_ID);
    console.log("BAL_BW_WETH_ID:", BAL_BW_WETH_ID);
    
    // Fetch BWZC decimals
    console.log("\nFetching BWZC decimals...");
    const BWZC_DECIMALS = await fetchBwzcDecimals(provider, A.BWZC);
    console.log("BWZC_DECIMALS:", BWZC_DECIMALS);
    
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);
    
    // Deploy with 20 constructor arguments
    console.log("\nDeploying with 20 constructor arguments...");
    console.log("This may take a moment...");
    
    const contract = await factory.deploy(
      A.SCW,                    // 1. _scw
      A.USDC,                   // 2. _usdc
      A.WETH,                   // 3. _weth
      A.BWZC,                   // 4. _bwzc
      A.BALANCER_VAULT,         // 5. _vault
      A.UNIV2_ROUTER,           // 6. _uniV2Router
      A.SUSHI_ROUTER,           // 7. _sushiRouter
      A.UNIV3_ROUTER,           // 8. _uniV3Router
      A.POSITION_MANAGER,       // 9. _uniV3NFT
      A.QUOTER_V2,              // 10. _quoterV2
      BAL_BW_USDC_ID,           // 11. _balBWUSDCId (bytes32)
      BAL_BW_WETH_ID,           // 12. _balBWWETHId (bytes32)
      A.CHAINLINK_ETHUSD,       // 13. _chainlinkEthUsd
      A.CHAINLINK_ETHUSD_SECONDARY, // 14. _chainlinkEthUsdSecondary
      A.UNIV3_BW_USDC,          // 15. _uniV3EthUsdPool
      A.UNIV3_BW_USDC,          // 16. _uniV3UsdcPool
      A.UNIV3_BW_WETH,          // 17. _uniV3WethPool
      A.ENTRYPOINT,             // 18. _entryPoint
      A.PAYMASTER_A,            // 19. _paymasterA
      A.PAYMASTER_B,            // 20. _paymasterB
      {
        gasLimit: 10000000,
        gasPrice: await provider.getFeeData().then(feeData => feeData.gasPrice)
      }
    );
    
    console.log("\nTX sent:", contract.deploymentTransaction().hash);
    console.log("Waiting for deployment confirmation...");
    
    await contract.waitForDeployment();
    const addr = await contract.getAddress();
    console.log("✅ Deployed at:", addr);
    
    // Verify deployment
    const code = await provider.getCode(addr);
    if (code === "0x") {
      throw new Error("Contract deployment failed - no code at address");
    }
    console.log("Contract code verified successfully");
    
    // Save deployment info
    const info = {
      address: addr,
      tx: contract.deploymentTransaction().hash,
      deployer: wallet.address,
      constructorArguments: [
        A.SCW,
        A.USDC,
        A.WETH,
        A.BWZC,
        A.BALANCER_VAULT,
        A.UNIV2_ROUTER,
        A.SUSHI_ROUTER,
        A.UNIV3_ROUTER,
        A.POSITION_MANAGER,
        A.QUOTER_V2,
        BAL_BW_USDC_ID,
        BAL_BW_WETH_ID,
        A.CHAINLINK_ETHUSD,
        A.CHAINLINK_ETHUSD_SECONDARY,
        A.UNIV3_BW_USDC,
        A.UNIV3_BW_USDC,
        A.UNIV3_BW_WETH,
        A.ENTRYPOINT,
        A.PAYMASTER_A,
        A.PAYMASTER_B,
      ],
      poolIds: {
        BAL_BW_USDC_ID: BAL_BW_USDC_ID,
        BAL_BW_WETH_ID: BAL_BW_WETH_ID
      },
      bwzcDecimals: BWZC_DECIMALS,
      network: await provider.getNetwork(),
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync("deployment-info.json", JSON.stringify(info, null, 2));
    console.log("Saved deployment-info.json");
    console.log("\n🎉 Deployment successful!");
    
  } catch (error) {
    console.error("\n❌ Deployment failed:", error.message);
    console.error("Stack:", error.stack);
    
    if (error.message.includes("insufficient funds")) {
      console.error("\n💡 Tip: Add more ETH to your deployer wallet");
    } else if (error.message.includes("nonce")) {
      console.error("\n💡 Tip: Try resetting your wallet nonce");
    } else if (error.message.includes("argument")) {
      console.error("\n💡 Tip: Constructor argument mismatch");
    }
    
    process.exit(1);
  }
}

// --- Run ---
main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
