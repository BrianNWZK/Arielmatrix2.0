// main.js
// Goal: Create BWAEZI/WETH Uniswap V3 pool (if missing), initialize price, and mint liquidity via SCW
// Caller signs; SCW executes. No approvals needed (SCW already has unlimited allowances).

import { ethers } from "ethers";

const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const FACTORY = ethers.getAddress("0x1f98431c8ad98523631ae4a59f267346ea31f984");
const NPM     = ethers.getAddress("0xc36442b4a4522e871399cd717abdd847ab11fe88");
const WETH    = ethers.getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const BWAEZI  = ethers.getAddress("0x9be921e5efacd53bc4eebcfdc4494d257cfab5da");
const SCW     = ethers.getAddress("0x59be70f1c57470d7773c3d5d27b8d165fcbe7eb2");

const FEE_TIER = 3000; // 0.3%

// ABIs
const factoryAbi = [
  "function getPool(address,address,uint24) view returns (address)",
  "function createPool(address,address,uint24) returns (address)"
];
const poolAbi = [
  "function initialize(uint160 sqrtPriceX96)",
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)"
];
const scwAbi = [
  "function execute(address to, uint256 value, bytes data) returns (bytes)"
];
const npmAbi = [
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline))"
];

// Tick spacing helper
function getTickSpacing(feeTier) {
  switch (feeTier) {
    case 100: return 1;
    case 500: return 10;
    case 3000: return 60;
    case 10000: return 200;
    default: throw new Error(`Unsupported fee tier: ${feeTier}`);
  }
}
function nearestUsableTick(tick, spacing) {
  const q = Math.floor(tick / spacing);
  return q * spacing;
}

// Price init: choose sqrtPriceX96 constant
// Pick an initial price so one-sided BWAEZI liquidity is valid.
// If BWAEZI is token0, set sqrtPrice so price(WETH/BWAEZI) ~ 33 (example peg).
function getInitSqrtPriceX96(isBWToken0) {
  // These constants are example starting prices used earlier in your stack.
  // You can replace with a precise computed sqrtPriceX96 if needed.
  return isBWToken0
    ? BigInt("0x5be9ba858b43c000000000000")  // ~33 WETH per BWAEZI when BWAEZI is token0
    : BigInt("0x2c9058f9770d700000000000"); // ~0.0303 BWAEZI per WETH when WETH is token0
}

async function ensurePool(provider, signer) {
  const factory = new ethers.Contract(FACTORY, factoryAbi, signer);
  const [token0, token1] = BWAEZI.toLowerCase() < WETH.toLowerCase() ? [BWAEZI, WETH] : [WETH, BWAEZI];

  let pool = await factory.getPool(token0, token1, FEE_TIER);
  if (pool !== ethers.ZeroAddress) {
    console.log(`BWAEZI/WETH pool exists: ${pool}`);
    return { pool, token0, token1 };
  }

  console.log("Creating BWAEZI/WETH pool...");
  const tx = await factory.createPool(token0, token1, FEE_TIER);
  console.log(`Create tx: ${tx.hash}`);
  await tx.wait();

  pool = await factory.getPool(token0, token1, FEE_TIER);
  console.log(`✅ Pool created: ${pool}`);

  const isBWToken0 = token0.toLowerCase() === BWAEZI.toLowerCase();
  const sqrtPriceX96 = getInitSqrtPriceX96(isBWToken0);

  const poolCtr = new ethers.Contract(pool, poolAbi, signer);
  console.log(`Initializing price with sqrtPriceX96=${sqrtPriceX96}`);
  const txInit = await poolCtr.initialize(sqrtPriceX96);
  console.log(`Init tx: ${txInit.hash}`);
  await txInit.wait();
  console.log("✅ Pool initialized");

  return { pool, token0, token1 };
}

async function buildMintViaSCW(provider, pool, token0, token1) {
  const poolCtr = new ethers.Contract(pool, poolAbi, provider);
  const slot0 = await poolCtr.slot0();
  const tick = Number(slot0.tick);
  const spacing = getTickSpacing(FEE_TIER);

  const halfWidth = 120;
  const lowerAligned = nearestUsableTick(tick - halfWidth, spacing);
  const upperAligned = nearestUsableTick(tick + halfWidth, spacing);

  const tickLower = BigInt(lowerAligned);
  const tickUpper = BigInt(upperAligned === lowerAligned ? lowerAligned + spacing : upperAligned);

  // Decide amounts (asymmetric seed: BWAEZI only)
  const bwAmt   = ethers.parseEther("0.05"); // adjust if needed
  const wethAmt = 0n;

  const amount0Desired = token0.toLowerCase() === BWAEZI.toLowerCase() ? bwAmt  : wethAmt;
  const amount1Desired = token1.toLowerCase() === WETH.toLowerCase()   ? wethAmt : bwAmt;

  const params = {
    token0,
    token1,
    fee: FEE_TIER,
    tickLower,
    tickUpper,
    amount0Desired,
    amount1Desired,
    amount0Min: 0,
    amount1Min: 0,
    recipient: SCW,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 1800)
  };

  const iface = new ethers.Interface(npmAbi);
  const mintData = iface.encodeFunctionData("mint", [params]);

  return { mintData, tick, spacing, lowerAligned, upperAligned };
}

async function main() {
  if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`Signer: ${signer.address}`);
  console.log(`ETH: ${ethers.formatEther(await provider.getBalance(signer.address))} ETH`);

  // 1) Create/init pool if needed
  const { pool, token0, token1 } = await ensurePool(provider, signer);

  // 2) Build SCW execute for NPM.mint
  const { mintData, tick, spacing, lowerAligned, upperAligned } =
    await buildMintViaSCW(provider, pool, token0, token1);

  console.log(
    `Mint BWAEZI/WETH via SCW — pool=${pool}, range [${lowerAligned}, ${upperAligned}] (tick: ${tick}, spacing: ${spacing})`
  );

  // 3) Execute from SCW
  const scw = new ethers.Contract(SCW, scwAbi, signer);
  const tx = await scw.execute(NPM, 0n, mintData);
  console.log(`SCW execute tx: ${tx.hash}`);
  const rc = await tx.wait();
  console.log(`✅ BWAEZI/WETH seeded via SCW — block ${rc.blockNumber}`);
}

main().catch(err => {
  console.error("Fatal:", err.reason || err.message || err);
  process.exit(1);
});
