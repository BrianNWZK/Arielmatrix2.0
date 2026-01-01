// main.js
// Goal: Create BWAEZI/USDC Uniswap V3 pool (if missing), initialize price, and mint liquidity via SCW
// Caller signs; SCW executes. No approvals needed (SCW already has unlimited allowances).

import { ethers } from "ethers";

const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const FACTORY = ethers.getAddress("0x1f98431c8ad98523631ae4a59f267346ea31f984");
const NPM     = ethers.getAddress("0xc36442b4a4522e871399cd717abdd847ab11fe88");
const USDC    = ethers.getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606EB48"); // 6 decimals
const BWAEZI  = ethers.getAddress("0x998232423d0b260ac397a893b360c8a254fcdd66"); // assumed 18 decimals
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
// To allow one-sided BWAEZI liquidity, set an initial price that's reasonable.
// For BWAEZI/USDC, we'll start around 1 USDC per BWAEZI as a neutral seed.
// If BWAEZI is token0, price(USDC/BWAEZI) = 1 => sqrtPriceX96 = 2^96.
// If USDC is token0, price(BWAEZI/USDC) = 1 => also sqrtPriceX96 = 2^96.
// You can replace these with precise computed sqrtPriceX96 if needed later.
function getInitSqrtPriceX96() {
  // 2^96 = 79228162514264337593543950336
  return 79228162514264337593543950336n;
}

async function ensurePool(provider, signer) {
  const factory = new ethers.Contract(FACTORY, factoryAbi, signer);
  const [token0, token1] = BWAEZI.toLowerCase() < USDC.toLowerCase() ? [BWAEZI, USDC] : [USDC, BWAEZI];

  let pool = await factory.getPool(token0, token1, FEE_TIER);
  if (pool !== ethers.ZeroAddress) {
    console.log(`BWAEZI/USDC pool exists: ${pool}`);
    return { pool, token0, token1 };
  }

  console.log("Creating BWAEZI/USDC pool...");
  const tx = await factory.createPool(token0, token1, FEE_TIER);
  console.log(`Create tx: ${tx.hash}`);
  await tx.wait();

  pool = await factory.getPool(token0, token1, FEE_TIER);
  console.log(`✅ Pool created: ${pool}`);

  const sqrtPriceX96 = getInitSqrtPriceX96();

  const poolCtr = new ethers.Contract(pool, poolAbi, signer);
  console.log(`Initializing price with sqrtPriceX96=${sqrtPriceX96.toString()}`);
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
  const bwaeziAmt = ethers.parseEther("0.05"); // adjust as needed
  const usdcAmt   = ethers.parseUnits("0", 6);

  const amount0Desired =
    token0.toLowerCase() === BWAEZI.toLowerCase() ? bwaeziAmt :
    token0.toLowerCase() === USDC.toLowerCase()   ? usdcAmt   :
    0n;

  const amount1Desired =
    token1.toLowerCase() === BWAEZI.toLowerCase() ? bwaeziAmt :
    token1.toLowerCase() === USDC.toLowerCase()   ? usdcAmt   :
    0n;

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

  // 1) Create/init BWAEZI/USDC pool if needed
  const { pool, token0, token1 } = await ensurePool(provider, signer);

  // 2) Build SCW execute for NPM.mint
  const { mintData, tick, spacing, lowerAligned, upperAligned } =
    await buildMintViaSCW(provider, pool, token0, token1);

  console.log(
    `Mint BWAEZI/USDC via SCW — pool=${pool}, range [${lowerAligned}, ${upperAligned}] (tick: ${tick}, spacing: ${spacing})`
  );

  // 3) Execute from SCW
  const scw = new ethers.Contract(SCW, scwAbi, signer);
  const tx = await scw.execute(NPM, 0n, mintData);
  console.log(`SCW execute tx: ${tx.hash}`);
  const rc = await tx.wait();
  console.log(`✅ BWAEZI/USDC seeded via SCW — block ${rc.blockNumber}`);
}

main().catch(err => {
  console.error("Fatal:", err.reason || err.message || err);
  process.exit(1);
});
