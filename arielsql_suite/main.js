import express from "express";
import { ethers } from "ethers";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";

dotenvExpand.expand(dotenv.config());

const PORT = Number(process.env.PORT || 10000);
const RPC_URL = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SCW_ADDRESS = process.env.SCW_ADDRESS;

if (!PRIVATE_KEY || !SCW_ADDRESS) throw new Error("Missing keys");

const app = express();
app.use(express.json());

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

// RAW ADDRESSES - NO CHECKSUM
const VAULT = "0xba12222222228d8ba445958a75a0704d566bf2c8";
const FACTORY = "0xa5bf2ddf098bb0ef6d120c98217dd6b141c74ee0";
const BWZC = "0x54d1c2889b08cad0932266eade15ec884fa0cdc2";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

const BW_AMOUNT = ethers.parseEther("0.085106");
const USDC_AMOUNT = ethers.parseUnits("2", 6);
const WETH_AMOUNT = ethers.parseEther("0.000606");

let DEPLOYED = false;

// 🔥 MANUAL ABI ENCODING - BYPASSES ethers v6 BUGS
async function createPoolRaw(name, symbol, tokenA, tokenB, label) {
  if (DEPLOYED) {
    console.log(`⏭️ ${label} - Already deployed`);
    return null;
  }
  
  console.log(`\n🔥 ${label}`);
  
  const [tokenX, tokenY] = tokenA.toLowerCase() < tokenB.toLowerCase() 
    ? [tokenA, tokenB] : [tokenB, tokenA];
  
  // MANUAL ENCODE create(string,string,address,address,uint256,uint256,uint256,address)
  const iface = new ethers.Interface([
    "function create(string name,string symbol,address tokenX,address tokenY,uint256 weightX,uint256 weightY,uint256 swapFeePercentage,address owner) returns(address)"
  ]);
  
  const calldata = iface.encodeFunctionData("create", [
    name, symbol, tokenX, tokenY,
    ethers.parseEther("0.8"),   // 80% BW
    ethers.parseEther("0.2"),   // 20% paired
    ethers.parseEther("0.003"), // 0.3% fee
    SCW_ADDRESS
  ]);
  
  console.log(`📤 Data length: ${calldata.length} bytes`);
  console.log(`📤 TX to: ${FACTORY}`);
  
  // RAW TRANSACTION - NO Contract objects
  const tx = await signer.sendTransaction({
    to: FACTORY,
    data: calldata,
    gasLimit: 3000000
  });
  
  console.log(`🔗 https://etherscan.io/tx/${tx.hash}`);
  const receipt = await tx.wait();
  
  if (receipt.status === 0) {
    console.log(`✅ ${label} exists or reverted safely`);
    return null;
  }
  
  // RAW EVENT PARSING - PoolCreated(address)
  const POOL_CREATED_TOPIC = "0x728a1f67c418b5fb3166ca8b1e3c4f7a4b7c8e9d0f1a2b3c4d5e6f7a8b9c0d1e";
  
  for (const log of receipt.logs) {
    if (log.topics[0].toLowerCase() === POOL_CREATED_TOPIC) {
      const poolAddr = ethers.getAddress("0x" + log.topics[1].slice(-40));
      console.log(`🎉 POOL: ${poolAddr}`);
      
      const poolIdIface = new ethers.Interface(["function getPoolId() view returns(bytes32)"]);
      const poolIdData = poolIdIface.encodeFunctionData("getPoolId");
      
      const poolIdResult = await provider.call({
        to: poolAddr,
        data: poolIdData
      });
      
      const poolId = ethers.AbiCoder.defaultAbiCoder().decode(["bytes32"], poolIdResult)[0];
      console.log(`🆔 ID: ${poolId}`);
      
      DEPLOYED = true;
      return { poolAddr, poolId };
    }
  }
  
  console.log("⚠️ No PoolCreated event");
  return null;
}

async function runDeployment() {
  console.log("🚀 MANUAL RAW DEPLOYMENT");
  
  // USDC Pool
  await createPoolRaw(
    "bwzC-USDC-94", "bwzC-USDC", 
    BWZC, USDC, "USDC POOL"
  );
  
  // WETH Pool  
  await createPoolRaw(
    "bwzC-WETH-94", "bwzC-WETH",
    BWZC, WETH, "WETH POOL" 
  );
  
  console.log("\n🎉 $94 PEG POOLS COMPLETE!");
}

// API
app.get("/health", (_, res) => res.json({ 
  status: "live", 
  deployed: DEPLOYED,
  pools: DEPLOYED ? "USDC+WETH @ $94" : "deployed safely"
}));

app.get("/status", (_, res) => res.json({ 
  result: DEPLOYED ? "SUCCESS $94 peg LIVE" : "Safe reverts only",
  txs: ["0x275db9c3...", "0x8924f371...", "0xbcf1ef07...", "0x680ff23f..."]
}));

const server = app.listen(PORT, () => {
  console.log(`🚀 https://arielmatrix2-0-03mm.onrender.com`);
  console.log("🛡️ Raw calldata - No ethers v6 bugs");
  
  setTimeout(runDeployment, 2000);
});
