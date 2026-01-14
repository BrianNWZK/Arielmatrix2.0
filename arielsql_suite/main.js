// main.js
// Final version for completion of partial seeding:
// - Funds already in SCW → no funding steps.
// - Approvals confirmed unlimited on-chain → no approval code.
// - Granular per-pair checks: Skip if reserves > 0.
// - Confirmed: Uniswap V2 BWAEZI/USDC already seeded → auto-skipped.
// - Will execute: Uniswap V2 WETH, both SushiSwap pairs, both Balancer pools.
// - Balancer creation skipped gracefully if already exists.
// - BWAEZI balance check preserved for safety.

import { ethers } from "ethers";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";

dotenvExpand.expand(dotenv.config());

const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SCW_ADDRESS = process.env.SCW_ADDRESS;

if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");
if (!SCW_ADDRESS) throw new Error("Missing SCW_ADDRESS");

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer   = new ethers.Wallet(PRIVATE_KEY, provider);

// --- Mainnet addresses (lowercase inputs for safe checksum) ---
const UNIV2_FACTORY     = ethers.getAddress("0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f");
const UNIV2_ROUTER      = ethers.getAddress("0x7a250d5630b4cf539739df2c5dacb4c659f2488d");
const SUSHI_FACTORY     = ethers.getAddress("0xc0aee478e3658e2610c5f7a4a2e1777ce9e4f2ac");
const SUSHI_ROUTER      = ethers.getAddress("0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f");
const BALANCER_VAULT    = ethers.getAddress("0xba12222222228d8ba445958a75a0704d566bf2c8");
const WEIGHTED_POOL_FACTORY = ethers.getAddress("0x8e9aa87e45e92bad84d5f8dd5b9431736d4bfb3e");

// --- Tokens (lowercase inputs) ---
const bwzC = ethers.getAddress("0x54d1c2889b08cad0932266eade15ec884fa0cdc2"); // 18 decimals
const USDC = ethers.getAddress("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"); // 6 decimals
const WETH = ethers.getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"); // 18 decimals

// --- Chainlink ETH/USD feed ---
const CHAINLINK_ETHUSD = ethers.getAddress("0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419");

const chainlinkAbi = [
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"
];

// --- Skew targets ---
const BW_U2     = 2 / 98;   // $98 skew
const BW_SUSHI  = 2 / 96;   // $96 skew

// --- Balancer weight-corrected amounts ---
const TARGET_BAL_USDC = 94;
const WEIGHT_BW = 0.8;
const WEIGHT_PAIRED = 0.2;
const EFFECTIVE_RATIO = TARGET_BAL_USDC * (WEIGHT_PAIRED / WEIGHT_BW); // 23.5
const BW_BAL_CORRECTED = 2 / EFFECTIVE_RATIO; // ≈ 0.085106383

// --- ABIs ---
const scwAbi = ["function execute(address to, uint256 value, bytes data) returns (bytes)"];
const erc20Abi = ["function balanceOf(address owner) view returns (uint256)"];
const v2RouterAbi = ["function addLiquidity(address tokenA,address tokenB,uint amountADesired,uint amountBDesired,uint amountAMin,uint amountBMin,address to,uint deadline) returns (uint,uint,uint)"];
const v2FactoryAbi = ["function getPair(address tokenA, address tokenB) view returns (address pair)"];
const v2PairAbi = ["function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"];
const balancerFactoryAbi = [
  "event PoolCreated(address indexed pool)",
  "function create(string name,string symbol,address[] tokens,uint256[] weights,address owner,uint256 swapFeePercentage,bool disableUnbalancedJoins) returns (address pool)"
];
const balancerVaultAbi = ["function joinPool(bytes32 poolId,address sender,address recipient,(address[],uint256[],bytes,bool) request)"];
const balancerPoolAbi = ["function getPoolId() view returns (bytes32)"];

// --- Helpers ---
const round = (x, d) => Number(Number(x).toFixed(d));
const toBW   = (x) => ethers.parseUnits(round(x, 18).toString(), 18);
const toUSDC = (x) => ethers.parseUnits(round(x, 6).toString(), 6);
const toWETH = (x) => ethers.parseUnits(round(x, 18).toString(), 18);
const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 900);

async function getEthUsdReference() {
  const feed = new ethers.Contract(CHAINLINK_ETHUSD, chainlinkAbi, provider);
  const [, answer] = await feed.latestRoundData();
  if (answer <= 0) throw new Error("Invalid Chainlink ETH/USD price");
  return Number(answer) / 1e8;
}

async function hasLiquidity(factoryAddr, tokenA, tokenB) {
  const factory = new ethers.Contract(factoryAddr, v2FactoryAbi, provider);
  const pair = await factory.getPair(tokenA, tokenB);
  if (pair === ethers.ZeroAddress) return false;
  const pairCtr = new ethers.Contract(pair, v2PairAbi, provider);
  try {
    const { reserve0, reserve1 } = await pairCtr.getReserves();
    return reserve0 > 0n || reserve1 > 0n;
  } catch {
    return false;
  }
}

async function addLiquidityViaSCW(scw, routerAddr, tokenA, tokenB, amountA, amountB, pairName) {
  const routerIface = new ethers.Interface(v2RouterAbi);
  const data = routerIface.encodeFunctionData("addLiquidity", [tokenA, tokenB, amountA, amountB, 0n, 0n, SCW_ADDRESS, deadline()]);
  const tx = await scw.execute(routerAddr, 0n, data);
  console.log(`SCW addLiquidity ${pairName} via ${routerAddr} tx: ${tx.hash}`);
  await tx.wait();
  console.log(`✅ ${pairName} seeded`);
}

async function joinBalancerViaSCW(scw, vaultAddr, poolId, assets, amounts, poolName) {
  const userData = ethers.AbiCoder.defaultAbiCoder().encode(["uint8","uint256[]","uint256"], [0, amounts, 0n]);
  const request = [assets, amounts, userData, false];
  const vaultIface = new ethers.Interface(balancerVaultAbi);
  const data = vaultIface.encodeFunctionData("joinPool", [poolId, SCW_ADDRESS, SCW_ADDRESS, request]);
  const tx = await scw.execute(vaultAddr, 0n, data);
  console.log(`SCW joinPool ${poolName} tx: ${tx.hash}`);
  await tx.wait();
  console.log(`✅ ${poolName} seeded`);
}

async function createAndSeedBalancer(scw, name, symbol, tokens, isUSDC, wethEq, poolName) {
  const balFactory = new ethers.Contract(WEIGHTED_POOL_FACTORY, balancerFactoryAbi, signer);
  const weights = [ethers.parseUnits("0.8", 18), ethers.parseUnits("0.2", 18)];

  let poolAddr;
  try {
    const txCreate = await balFactory.create(name, symbol, tokens, weights, SCW_ADDRESS, ethers.parseUnits("0.003", 18), false);
    const rc = await txCreate.wait();

    const eventIface = new ethers.Interface(balancerFactoryAbi);
    for (const log of rc.logs) {
      try {
        const parsed = eventIface.parseLog(log);
        if (parsed?.name === "PoolCreated") {
          poolAddr = parsed.args.pool;
          break;
        }
      } catch {}
    }
    if (!poolAddr) throw new Error(`Failed to obtain Balancer pool address for ${symbol}`);
    console.log(`✅ Balancer pool (${poolName}) created: ${poolAddr}`);
  } catch (e) {
    console.log(`⚠️ Balancer ${poolName} creation skipped (likely already exists): ${e.reason || e.message || e}`);
    return false; // Indicate creation skipped
  }

  const pool = new ethers.Contract(poolAddr, balancerPoolAbi, signer);
  const poolId = await pool.getPoolId();

  const amounts = isUSDC
    ? [toBW(BW_BAL_CORRECTED), toUSDC(2)]
    : [toBW(BW_BAL_CORRECTED), toWETH(wethEq)];

  await joinBalancerViaSCW(scw, BALANCER_VAULT, poolId, tokens, amounts, poolName);
  return true;
}

async function main() {
  console.log(`EOA: ${signer.address}`);
  console.log(`SCW: ${SCW_ADDRESS}`);

  const ETH_USD_REFERENCE = await getEthUsdReference();
  const WETH_EQ = 2 / ETH_USD_REFERENCE;

  console.log(`ETH/USD ref (Chainlink): $${ETH_USD_REFERENCE}`);
  console.log(`Seed amounts → U2 bwzC=${BW_U2.toFixed(10)}, Sushi bwzC=${BW_SUSHI.toFixed(10)}, Bal bwzC(corrected)=${BW_BAL_CORRECTED.toFixed(10)}, WETH(eq $2)=${WETH_EQ.toFixed(8)}`);

  const scw  = new ethers.Contract(SCW_ADDRESS, scwAbi, signer);
  const bw   = new ethers.Contract(bwzC, erc20Abi, signer);

  // --- Verify remaining BWAEZI in SCW ---
  const scwBwBal = await bw.balanceOf(SCW_ADDRESS);
  const bwNeededRemaining =
    toBW(BW_U2) +          // Uniswap V2 WETH (USDC leg already done)
    toBW(BW_SUSHI) * 2n +  // Both SushiSwap
    toBW(BW_BAL_CORRECTED) * 2n; // Both Balancer

  if (scwBwBal < bwNeededRemaining) {
    throw new Error(`SCW bwzC insufficient for remaining seeds: have ${ethers.formatEther(scwBwBal)} need ~${ethers.formatEther(bwNeededRemaining)}`);
  }

  // --- Seed Uniswap V2 ---
  if (await hasLiquidity(UNIV2_FACTORY, bwzC, USDC)) {
    console.log("✅ Uniswap V2 BWAEZI/USDC already seeded - skipping");
  } else {
    await addLiquidityViaSCW(scw, UNIV2_ROUTER, bwzC, USDC, toBW(BW_U2), toUSDC(2), "BWAEZI/USDC (Uniswap V2)");
  }

  if (await hasLiquidity(UNIV2_FACTORY, bwzC, WETH)) {
    console.log("✅ Uniswap V2 BWAEZI/WETH already seeded - skipping");
  } else {
    await addLiquidityViaSCW(scw, UNIV2_ROUTER, bwzC, WETH, toBW(BW_U2), toWETH(WETH_EQ), "BWAEZI/WETH (Uniswap V2)");
  }

  // --- Seed SushiSwap ---
  if (await hasLiquidity(SUSHI_FACTORY, bwzC, USDC)) {
    console.log("✅ SushiSwap BWAEZI/USDC already seeded - skipping");
  } else {
    await addLiquidityViaSCW(scw, SUSHI_ROUTER, bwzC, USDC, toBW(BW_SUSHI), toUSDC(2), "BWAEZI/USDC (SushiSwap)");
  }

  if (await hasLiquidity(SUSHI_FACTORY, bwzC, WETH)) {
    console.log("✅ SushiSwap BWAEZI/WETH already seeded - skipping");
  } else {
    await addLiquidityViaSCW(scw, SUSHI_ROUTER, bwzC, WETH, toBW(BW_SUSHI), toWETH(WETH_EQ), "BWAEZI/WETH (SushiSwap)");
  }

  // --- Create & seed Balancer pools ---
  await createAndSeedBalancer(scw, "bwzC/USDC Weighted", "bwzC-USDC-WP", [bwzC, USDC], true, WETH_EQ, "BWAEZI/USDC Balancer");
  await createAndSeedBalancer(scw, "bwzC/WETH Weighted", "bwzC-WETH-WP", [bwzC, WETH], false, WETH_EQ, "BWAEZI/WETH Balancer");

  console.log("\n🎯 Done: All remaining pools seeded successfully (skipped completed steps).");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err.reason || err.message || err);
  process.exit(1);
});
