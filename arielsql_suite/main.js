// main.js
// Balancer-only: detect pools created by your EOA, print address/ID, create if missing, then joinPool seed

import { ethers } from "ethers";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";

dotenvExpand.expand(dotenv.config());

const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SCW_ADDRESS = process.env.SCW_ADDRESS;
const CREATOR_EOA = ethers.getAddress("0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA"); // your EOA

if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");
if (!SCW_ADDRESS) throw new Error("Missing SCW_ADDRESS");

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer   = new ethers.Wallet(PRIVATE_KEY, provider);

// --- Balancer addresses ---
const BALANCER_VAULT        = ethers.getAddress("0xba12222222228d8ba445958a75a0704d566bf2c8");
const WEIGHTED_POOL_FACTORY = ethers.getAddress("0x8e9aa87e45e92bad84d5f8dd5b9431736d4bfb3e");

// --- Tokens ---
const bwzC = ethers.getAddress("0x54d1c2889b08cad0932266eade15ec884fa0cdc2");
const USDC = ethers.getAddress("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
const WETH = ethers.getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");

// --- Chainlink ETH/USD feed ---
const CHAINLINK_ETHUSD = ethers.getAddress("0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419");
const chainlinkAbi = ["function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"];

// --- Balancer skew targets ---
const TARGET_BAL_USDC   = 94;
const WEIGHT_BW         = 0.8;
const WEIGHT_PAIRED     = 0.2;
const EFFECTIVE_RATIO   = TARGET_BAL_USDC * (WEIGHT_PAIRED / WEIGHT_BW);
const BW_BAL_CORRECTED  = 2 / EFFECTIVE_RATIO;

// --- ABIs ---
const scwAbi = ["function execute(address to, uint256 value, bytes data) returns (bytes)"];
const erc20Abi = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)"
];
const balancerFactoryAbi = [
  "function create(string,string,address[],uint256[],address,uint256,bool) returns (address)"
];
const balancerVaultAbi = [
  "function joinPool(bytes32,address,address,(address[],uint256[],bytes,bool))",
  "function getPoolTokens(bytes32) view returns (address[] tokens, uint256[] balances, uint256 lastChangeBlock)"
];
const balancerPoolAbi  = ["function getPoolId() view returns (bytes32)"];

// --- Helpers ---
const round    = (x, d) => Number(Number(x).toFixed(d));
const toBW     = (x) => ethers.parseUnits(round(x, 18).toString(), 18);
const toUSDC   = (x) => ethers.parseUnits(round(x, 6).toString(), 6);
const toWETH   = (x) => ethers.parseUnits(round(x, 18).toString(), 18);

async function getEthUsdReference() {
  const feed = new ethers.Contract(CHAINLINK_ETHUSD, chainlinkAbi, provider);
  const [, answer] = await feed.latestRoundData();
  if (answer <= 0n) throw new Error("Invalid Chainlink ETH/USD price");
  return Number(answer) / 1e8;
}

async function ensureApproval(tokenAddr, spender, label) {
  const token = new ethers.Contract(tokenAddr, erc20Abi, signer);
  const allowance = await token.allowance(SCW_ADDRESS, spender);
  if (allowance > 0n) {
    console.log(`✅ ${label} already approved for ${spender}`);
    return;
  }
  console.log(`⚠️ ${label} not approved — sending approval`);
  const tx = await token.approve(spender, ethers.MaxUint256);
  await tx.wait();
  console.log(`✅ ${label} approved for ${spender}`);
}

async function joinBalancerViaSCW(scw, vaultAddr, poolId, assets, amounts, poolName) {
  for (let i = 0; i < assets.length; i++) {
    await ensureApproval(assets[i], vaultAddr, `${poolName} asset${i}`);
  }
  const userData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint8","uint256[]","uint256"], [0, amounts, 0n]
  );
  const request = [assets, amounts, userData, false];
  const vaultIface = new ethers.Interface(balancerVaultAbi);
  const data = vaultIface.encodeFunctionData("joinPool", [poolId, SCW_ADDRESS, SCW_ADDRESS, request]);
  const tx = await scw.execute(vaultAddr, 0n, data);
  console.log(`SCW joinPool ${poolName} tx: ${tx.hash}`);
  await tx.wait();
  console.log(`✅ ${poolName} seeded`);
}

async function createWeightedPool(name, symbol, tokens) {
  const balFactory = new ethers.Contract(WEIGHTED_POOL_FACTORY, balancerFactoryAbi, signer);
  const weights = [ethers.parseUnits("0.8", 18), ethers.parseUnits("0.2", 18)];

  // Predict pool address deterministically
  const predictedAddr = await balFactory.create.staticCall(
    name, symbol, tokens, weights, SCW_ADDRESS,
    ethers.parseUnits("0.003", 18), false
  );
  console.log(`Predicted pool address: ${predictedAddr}`);

  // Send actual tx
  const tx = await balFactory.create(
    name, symbol, tokens, weights, SCW_ADDRESS,
    ethers.parseUnits("0.003", 18), false
  );
  await tx.wait();

  const pool = new ethers.Contract(predictedAddr, balancerPoolAbi, provider);
  const poolId = await pool.getPoolId();
  return { poolAddr: predictedAddr, poolId };
}

async function main() {
  console.log(`EOA: ${signer.address}`);
  console.log(`SCW: ${SCW_ADDRESS}`);

  const ETH_USD_REFERENCE = await getEthUsdReference();
  const WETH_EQ = 2 / ETH_USD_REFERENCE;

  console.log(`ETH/USD ref (Chainlink): $${ETH_USD_REFERENCE}`);
  console.log(`Balancer seed amounts → bwzC(corrected)=${BW_BAL_CORRECTED.toFixed(10)}, WETH(eq $2)=${WETH_EQ.toFixed(8)}`);

  const scw = new ethers.Contract(SCW_ADDRESS, scwAbi, signer);

  // --- BWAEZI/USDC Weighted ---
  {
    const tokens = [bwzC, USDC];
    let poolMeta;
    try {
      poolMeta = await createWeightedPool("bwzC/USDC Weighted", "bwzC-USDC-WP", tokens);
      console.log(`✅ BWAEZI/USDC pool ready`);
      console.log(`- Address: ${poolMeta.poolAddr}`);
      console.log(`- PoolId: ${poolMeta.poolId}`);
    } catch (err) {
      console.log(`❌ Failed to create/find BWAEZI/USDC pool: ${err.message}`);
      return;
    }
    const amounts = [toBW(BW_BAL_CORRECTED), toUSDC(2)];
    await joinBalancerViaSCW(scw, BALANCER_VAULT, poolMeta.poolId, tokens, amounts, "BWAEZI/USDC Balancer");
  }

  // --- BWAEZI/WETH Weighted ---
  {
    const tokens = [bwzC, WETH];
    let poolMeta;
    try {
      poolMeta = await createWeightedPool("bwzC/WETH Weighted", "bwzC-WETH-WP", tokens);
      console.log(`✅ BWAEZI/WETH pool ready`);
      console.log(`- Address: ${poolMeta.poolAddr}`);
      console.log(`- PoolId: ${poolMeta.poolId}`);
    } catch (err) {
      console.log(`❌ Failed to create/find BWAEZI/WETH pool: ${err.message}`);
      return;
    }
    const amounts = [toBW(BW_BAL_CORRECTED), toWETH(WETH_EQ)];
    await joinBalancerViaSCW(scw, BALANCER_VAULT, poolMeta.poolId, tokens, amounts, "BWAEZI/WETH Balancer");
  }

  console.log("\n🎯 Done: Balancer pools created/detected and seeded.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Non-fatal:", err.reason || err.message

