// main.js
// Hardened version with approval scan + safe error handling + summary report

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

// --- Addresses ---
const UNIV2_FACTORY     = ethers.getAddress("0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f");
const UNIV2_ROUTER      = ethers.getAddress("0x7a250d5630b4cf539739df2c5dacb4c659f2488d");
const SUSHI_FACTORY     = ethers.getAddress("0xc0aee478e3658e2610c5f7a4a2e1777ce9e4f2ac");
const SUSHI_ROUTER      = ethers.getAddress("0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f");
const BALANCER_VAULT    = ethers.getAddress("0xba12222222228d8ba445958a75a0704d566bf2c8");
const WEIGHTED_POOL_FACTORY = ethers.getAddress("0x8e9aa87e45e92bad84d5f8dd5b9431736d4bfb3e");

// --- Tokens ---
const bwzC = ethers.getAddress("0x54d1c2889b08cad0932266eade15ec884fa0cdc2");
const USDC = ethers.getAddress("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
const WETH = ethers.getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");

// --- Chainlink ETH/USD feed ---
const CHAINLINK_ETHUSD = ethers.getAddress("0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419");
const chainlinkAbi = ["function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"];

// --- Skew targets ---
const BW_U2     = 2 / 98;
const BW_SUSHI  = 2 / 96;

// --- Balancer weight-corrected ---
const TARGET_BAL_USDC = 94;
const WEIGHT_BW = 0.8;
const WEIGHT_PAIRED = 0.2;
const EFFECTIVE_RATIO = TARGET_BAL_USDC * (WEIGHT_PAIRED / WEIGHT_BW);
const BW_BAL_CORRECTED = 2 / EFFECTIVE_RATIO;

// --- ABIs ---
const scwAbi = ["function execute(address to, uint256 value, bytes data) returns (bytes)"];
const erc20Abi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)"
];
const v2RouterAbi = ["function addLiquidity(address,address,uint,uint,uint,uint,address,uint) returns (uint,uint,uint)"];
const v2FactoryAbi = ["function getPair(address,address) view returns (address)"];
const v2PairAbi = ["function getReserves() view returns (uint112,uint112,uint32)"];
const balancerFactoryAbi = [
  "event PoolCreated(address indexed pool)",
  "function create(string,string,address[],uint256[],address,uint256,bool) returns (address)"
];
const balancerVaultAbi = ["function joinPool(bytes32,address,address,(address[],uint256[],bytes,bool))"];
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
  if (answer <= 0n) throw new Error("Invalid Chainlink ETH/USD price");
  return Number(answer) / 1e8;
}

// --- Approval scan ---
async function ensureApproval(tokenAddr, spender, label) {
  try {
    const token = new ethers.Contract(tokenAddr, erc20Abi, signer);
    const allowance = await token.allowance(SCW_ADDRESS, spender);
    if (allowance > 0n) {
      console.log(`✅ ${label} already approved for ${spender}`);
      return true;
    }
    console.log(`⚠️ ${label} not approved — sending approval`);
    const tx = await token.approve(spender, ethers.MaxUint256);
    await tx.wait();
    console.log(`✅ ${label} approved for ${spender}`);
    return true;
  } catch (err) {
    console.log(`❌ Approval failed for ${label}: ${err.reason || err.message}`);
    return false;
  }
}

// --- Summary tracker ---
const summary = [];

function logSummary(name, status) {
  summary.push({ name, status });
}

// --- Liquidity helpers ---
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
  try {
    const okA = await ensureApproval(tokenA, routerAddr, `${pairName} tokenA`);
    const okB = await ensureApproval(tokenB, routerAddr, `${pairName} tokenB`);
    if (!okA || !okB) {
      logSummary(pairName, "Approval failed");
      return;
    }
    const routerIface = new ethers.Interface(v2RouterAbi);
    const data = routerIface.encodeFunctionData("addLiquidity", [
      tokenA, tokenB, amountA, amountB, 0n, 0n, SCW_ADDRESS, deadline()
    ]);
    const tx = await scw.execute(routerAddr, 0n, data);
    await tx.wait();
    console.log(`✅ ${pairName} seeded`);
    logSummary(pairName, "Seeded");
  } catch (err) {
    console.log(`❌ Skipping ${pairName} — ${err.reason || err.message}`);
    logSummary(pairName, "Failed");
  }
}

async function joinBalancerViaSCW(scw, vaultAddr, poolId, assets, amounts, poolName) {
  try {
    for (let i = 0; i < assets.length; i++) {
      await ensureApproval(assets[i], vaultAddr, `${poolName} asset${i}`);
    }
    const userData = ethers.AbiCoder.defaultAbiCoder().encode(["uint8","uint256[]","uint256"], [0, amounts, 0n]);
    const request = [assets, amounts, userData, false];
    const vaultIface = new ethers.Interface(balancerVaultAbi);
    const data = vaultIface.encodeFunctionData("joinPool", [poolId, SCW_ADDRESS, SCW_ADDRESS, request]);
    const tx = await scw.execute(vaultAddr, 0n, data);
    await tx.wait();
    console.log(`✅ ${poolName} seeded`);
    logSummary(poolName, "Seeded");
  } catch (err) {
    console.log(`❌ Skipping Balancer ${poolName} — ${err.reason || err.message}`);
    logSummary(poolName, "Failed");
  }
}

async function createAndSeedBalancer(scw, name, symbol, tokens, isUSDC, wethEq, poolName) {
  try {
    const balFactory = new ethers.Contract(WEIGHTED_POOL_FACTORY, balancerFactoryAbi, signer);
    const weights = [ethers.parseUnits("0.8", 18), ethers.parseUnits("0.2", 18)];

    let poolAddr;
    try {
      const txCreate = await balFactory.create(
        name, symbol, tokens, weights, SCW_ADDRESS,
        ethers.parseUnits("0.003", 18), false
      );
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
      console.log(`⚠️ Balancer ${poolName} creation skipped (likely exists): ${e.reason || e.message}`);
      logSummary(poolName, "Skipped (exists)");
      return false;
    }

    const pool = new ethers.Contract(poolAddr, balancerPoolAbi, signer);
    const poolId = await pool.getPoolId();

    const amounts = isUSDC
      ? [toBW(BW_BAL_CORRECTED), toUSDC(2)]
      : [toBW(BW_BAL_CORRECTED), toWETH(wethEq)];

    await joinBalancerViaSCW(scw, BALANCER_VAULT, poolId, tokens, amounts, poolName);
    return true;
  } catch (err) {
    console.log(`❌ Skipping Balancer ${poolName} — ${err.reason || err.message}`);
    logSummary(poolName, "Failed");
    return false;
  }
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
  try {
    const scwBwBal = await bw.balanceOf(SCW_ADDRESS);
    const bwNeededRemaining =
      toBW(BW_U2) +
      toBW(BW_SUSHI) * 2n +
      toBW(BW_BAL_CORRECTED) * 2n;

    if (scwBwBal < bwNeededRemaining) {
      console.log(`⚠️ SCW bwzC insufficient: have ${ethers.formatEther(scwBwBal)} need ~${ethers.formatEther(bwNeededRemaining)}`);
    }
  } catch (err) {
    console.log(`❌ Balance check failed: ${err.reason || err.message}`);
  }

  // --- Seed Uniswap V2 ---
  if (await hasLiquidity(UNIV2_FACTORY, bwzC, USDC)) {
    console.log("✅ Uniswap V2 BWAEZI/USDC already seeded - skipping");
    logSummary("BWAEZI/USDC (Uniswap V2)", "Skipped (exists)");
  } else {
    await addLiquidityViaSCW(scw, UNIV2_ROUTER, bwzC, USDC, toBW(BW_U2), toUSDC(2), "BWAEZI/USDC (Uniswap V2)");
  }

  if (await hasLiquidity(UNIV2_FACTORY, bwzC, WETH)) {
    console.log("✅ Uniswap V2 BWAEZI/WETH already seeded - skipping");
    logSummary("BWAEZI/WETH (Uniswap V2)", "Skipped (exists)");
  } else {
    await addLiquidityViaSCW(scw, UNIV2_ROUTER, bwzC, WETH, toBW(BW_U2), toWETH(WETH_EQ), "BWAEZI/WETH (Uniswap V2)");
  }

  // --- Seed SushiSwap ---
  if (await hasLiquidity(SUSHI_FACTORY, bwzC, USDC)) {
    console.log("✅ SushiSwap BWAEZI/USDC already seeded - skipping");
    logSummary("BWAEZI/USDC (SushiSwap)", "Skipped (exists)");
  } else {
    await addLiquidityViaSCW(scw, SUSHI_ROUTER, bwzC, USDC, toBW(BW_SUSHI), toUSDC(2), "BWAEZI/USDC (SushiSwap)");
  }

  if (await hasLiquidity(SUSHI_FACTORY, bwzC, WETH)) {
    console.log("✅ SushiSwap BWAEZI/WETH already seeded - skipping");
    logSummary("BWAEZI/WETH (SushiSwap)", "Skipped (exists)");
  } else {
    await addLiquidityViaSCW(scw, SUSHI_ROUTER, bwzC, WETH, toBW(BW_SUSHI), toWETH(WETH_EQ), "BWAEZI/WETH (SushiSwap)");
  }

  // --- Create & seed Balancer pools ---
  await createAndSeedBalancer(scw, "bwzC/USDC Weighted", "bwzC-USDC-WP", [bwzC, USDC], true, WETH_EQ, "BWAEZI/USDC Balancer");
  await createAndSeedBalancer(scw, "bwzC/WETH Weighted", "bwzC-WETH-WP", [bwzC, WETH], false, WETH_EQ, "BWAEZI/WETH Balancer");

  // --- Summary report ---
  console.log("\n📊 Summary Report:");
  summary.forEach(item => {
    console.log(`- ${item.name}: ${item.status}`);
  });

  console.log("\n🎯 Done: Flow completed with skips logged where issues occurred.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Non-fatal:", err.reason || err.message || err);
  process.exit(0);
});
