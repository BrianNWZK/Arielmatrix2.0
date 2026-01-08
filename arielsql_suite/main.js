// main.js
// Goal: Create BWAEZI/USDC (fee 3000) and BWAEZI/WETH (fee 3000) Uniswap V3 pools (if missing),
// initialize each at the exact peg, and mint tight-band liquidity via SCW.
// Pattern mirrors your WETH/BWAEZI script: EOA signer calls Factory.createPool and Pool.initialize;
// SCW executes NonfungiblePositionManager.mint. No approvals needed (SCW already has allowances).
// Adds optional wake-up swaps via SCW to kick price discovery.

// Env and libs
import { ethers } from "ethers";

const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");

// Addresses
const FACTORY = ethers.getAddress("0x1f98431c8ad98523631ae4a59f267346ea31f984");
const NPM     = ethers.getAddress("0xc36442b4a4522e871399cd717abdd847ab11fe88");
const SWAP_ROUTER = ethers.getAddress("0xE592427A0AEce92De3Edee1F18E0157C05861564");

const WETH    = ethers.getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const USDC    = ethers.getAddress("0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eB48");
const BWAEZI  = ethers.getAddress("0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2");
const SCW     = ethers.getAddress("0x59be70f1c57470d7773c3d5d27b8d165fcbe7eb2");

const FEE_TIER_USDC = 3000; // 0.3% for BWAEZI/USDC (fresh clean pool)
const FEE_TIER_WETH = 3000; // 0.3% for BWAEZI/WETH (existing)

// ABIs (pattern-aligned)
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
const swapRouterAbi = [
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)"
];

// Tick spacing helpers
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

// Integer sqrt
function sqrtBigInt(n) {
  if (n <= 0n) return 0n;
  let x = n, y = (x + 1n) >> 1n;
  while (y < x) { x = y; y = (x + n / x) >> 1n; }
  return x;
}

// Compute sqrtPriceX96 from peg: price = token1 per token0 (uses correct decimals)
function computeSqrtPriceX96(token0, token1, priceToken1PerToken0, dec0, dec1) {
  // priceRaw = (price * 10^dec1) / 10^dec0
  // sqrtPriceX96 = floor( sqrt(priceRaw) * 2^96 ) = floor( sqrt(price * 2^192 * 10^dec1 / 10^dec0) )
  const Q192 = 2n ** 192n;

  // Represent price as rational with 6-decimal fixed point to avoid float errors
  const fp = 1_000_000n;
  const priceScaled = BigInt(Math.round(priceToken1PerToken0 * 1e6)); // integer
  const numerator   = priceScaled * (10n ** BigInt(dec1)) * Q192;
  const denominator = fp * (10n ** BigInt(dec0));
  const scaled      = numerator / denominator;
  return sqrtBigInt(scaled);
}

// Ensure pool (create+initialize) following the WETH/BW pattern
async function ensurePoolAtPeg(provider, signer, tokenA, tokenB, feeTier, pegPriceToken1PerToken0) {
  const factory = new ethers.Contract(FACTORY, factoryAbi, signer);

  // Canonical order: token0 = lower address
  const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA];

  // Decimals (USDC=6, others assumed 18)
  const dec = (addr) => addr.toLowerCase() === USDC.toLowerCase() ? 6 : 18;
  const dec0 = dec(token0);
  const dec1 = dec(token1);

  let pool = await factory.getPool(token0, token1, feeTier);
  if (pool !== ethers.ZeroAddress) {
    console.log(`Pool exists: ${token0} / ${token1} fee ${feeTier} -> ${pool}`);
    return { pool, token0, token1 };
  }

  console.log(`Creating pool ${token0} / ${token1} fee ${feeTier}...`);
  const tx = await factory.createPool(token0, token1, feeTier);
  console.log(`Create tx: ${tx.hash}`);
  await tx.wait();

  pool = await factory.getPool(token0, token1, feeTier);
  console.log(`✅ Pool created: ${pool}`);

  // Compute sqrtPriceX96 at peg for token1 per token0
  const sqrtPriceX96 = computeSqrtPriceX96(token0, token1, pegPriceToken1PerToken0, dec0, dec1);

  // Initialize via pool.initialize (EOA signer, per your pattern)
  const poolCtr = new ethers.Contract(pool, poolAbi, signer);
  console.log(`Initializing price with sqrtPriceX96=${sqrtPriceX96.toString()}`);
  const txInit = await poolCtr.initialize(sqrtPriceX96);
  console.log(`Init tx: ${txInit.hash}`);
  await txInit.wait();
  console.log("✅ Pool initialized");

  return { pool, token0, token1 };
}

// Build SCW.execute for NPM.mint with tight band
async function buildMintViaSCW(provider, pool, token0, token1, feeTier, desiredToken0, desiredToken1) {
  const poolCtr = new ethers.Contract(pool, poolAbi, provider);
  const slot0 = await poolCtr.slot0();
  const tick = Number(slot0.tick);
  const spacing = getTickSpacing(feeTier);

  // Tight range around current tick (±120 ticks, aligned)
  const halfWidth = 120;
  const lowerAligned = nearestUsableTick(tick - halfWidth, spacing);
  const upperAlignedRaw = nearestUsableTick(tick + halfWidth, spacing);
  const upperAligned = upperAlignedRaw === lowerAligned ? lowerAligned + spacing : upperAlignedRaw;

  const tickLower = BigInt(lowerAligned);
  const tickUpper = BigInt(upperAligned);

  // Params for NPM.mint
  const params = {
    token0,
    token1,
    fee: feeTier,
    tickLower,
    tickUpper,
    amount0Desired: desiredToken0,
    amount1Desired: desiredToken1,
    amount0Min: 0,
    amount1Min: 0,
    recipient: SCW,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 1800)
  };

  const iface = new ethers.Interface(npmAbi);
  const mintData = iface.encodeFunctionData("mint", [params]);

  return { mintData, tick, spacing, lowerAligned, upperAligned };
}

// Optional wake-up swaps via SCW
async function wakeUpSwapsViaSCW(signer) {
  const scw = new ethers.Contract(SCW, scwAbi, signer);
  const routerIface = new ethers.Interface(swapRouterAbi);

  // USDC -> BWAEZI (fee 3000) small swap
  {
    const params = {
      tokenIn: USDC,
      tokenOut: BWAEZI,
      fee: 3000,
      recipient: SCW,
      deadline: Math.floor(Date.now() / 1000) + 900,
      amountIn: ethers.parseUnits("2", 6),
      amountOutMinimum: 0n,
      sqrtPriceLimitX96: 0n
    };
    const data = routerIface.encodeFunctionData("exactInputSingle", [params]);
    const tx = await scw.execute(SWAP_ROUTER, 0n, data);
    console.log(`SCW swap USDC->BW (2 USDC) tx: ${tx.hash}`);
    await tx.wait();
    console.log("✅ Wake-up USDC->BW swap done");
  }

  // USDC -> WETH (fee 500) then WETH -> BWAEZI (fee 3000)
  {
    const params1 = {
      tokenIn: USDC,
      tokenOut: WETH,
      fee: 500, // change to 3000 if your USDC/WETH tier is 3000
      recipient: SCW,
      deadline: Math.floor(Date.now() / 1000) + 900,
      amountIn: ethers.parseUnits("2", 6),
      amountOutMinimum: 0n,
      sqrtPriceLimitX96: 0n
    };
    const data1 = routerIface.encodeFunctionData("exactInputSingle", [params1]);
    const tx1 = await scw.execute(SWAP_ROUTER, 0n, data1);
    console.log(`SCW swap USDC->WETH (2 USDC) tx: ${tx1.hash}`);
    await tx1.wait();

    const params2 = {
      tokenIn: WETH,
      tokenOut: BWAEZI,
      fee: 3000,
      recipient: SCW,
      deadline: Math.floor(Date.now() / 1000) + 900,
      amountIn: ethers.parseEther("0.0005"),
      amountOutMinimum: 0n,
      sqrtPriceLimitX96: 0n
    };
    const data2 = routerIface.encodeFunctionData("exactInputSingle", [params2]);
    const tx2 = await scw.execute(SWAP_ROUTER, 0n, data2);
    console.log(`SCW swap WETH->BW (0.0005 WETH) tx: ${tx2.hash}`);
    await tx2.wait();
    console.log("✅ Wake-up WETH->BW swap done");
  }
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`Signer: ${signer.address}`);
  console.log(`ETH: ${ethers.formatEther(await provider.getBalance(signer.address))} ETH`);

  // 1) Ensure BWAEZI/USDC (fee 3000) pool exists and is initialized at exact peg: 1 BW = 100 USDC
  // price token1 (USDC) per token0 (BWAEZI) = 100
  const { pool: usdcPool, token0: usdcT0, token1: usdcT1 } =
    await ensurePoolAtPeg(provider, signer, BWAEZI, USDC, FEE_TIER_USDC, 100);

  // 2) Ensure BWAEZI/WETH (fee 3000) pool exists and is initialized at peg: 1 BW = 0.03 WETH
  // price token1 (WETH) per token0 (BWAEZI) = 0.03
  const { pool: wethPool, token0: wethT0, token1: wethT1 } =
    await ensurePoolAtPeg(provider, signer, BWAEZI, WETH, FEE_TIER_WETH, 0.03);

  // 3) Build SCW mint for USDC-3000: peg-aware amounts (fits SCW balances: ~5 USDC available)
  {
    const bwAmt   = ethers.parseEther("0.05");      // ~ $5 BW
    const usdcAmt = ethers.parseUnits("5", 6);      // 5 USDC
    const amount0Desired = usdcT0.toLowerCase() === BWAEZI.toLowerCase() ? bwAmt  : usdcAmt;
    const amount1Desired = usdcT1.toLowerCase() === USDC.toLowerCase()   ? usdcAmt : bwAmt;

    const { mintData, tick, spacing, lowerAligned, upperAligned } =
      await buildMintViaSCW(provider, usdcPool, usdcT0, usdcT1, FEE_TIER_USDC, amount0Desired, amount1Desired);

    console.log(`Mint BWAEZI/USDC via SCW — pool=${usdcPool}, range [${lowerAligned}, ${upperAligned}] (tick: ${tick}, spacing: ${spacing})`);
    const scw = new ethers.Contract(SCW, scwAbi, signer);
    const tx = await scw.execute(NPM, 0n, mintData);
    console.log(`SCW execute (USDC-3000 mint) tx: ${tx.hash}`);
    const rc = await tx.wait();
    console.log(`✅ BWAEZI/USDC seeded via SCW — block ${rc.blockNumber}`);
  }

  // 4) Build SCW mint for WETH-3000: peg-aware amounts (fits SCW balances: ~0.0009 WETH)
  {
    const bwAmt   = ethers.parseEther("0.02");        // ~0.0006 WETH at peg
    const wethAmt = ethers.parseEther("0.0006");      // fits balance
    const amount0Desired = wethT0.toLowerCase() === BWAEZI.toLowerCase() ? bwAmt  : wethAmt;
    const amount1Desired = wethT1.toLowerCase() === WETH.toLowerCase()   ? wethAmt : bwAmt;

    const { mintData, tick, spacing, lowerAligned, upperAligned } =
      await buildMintViaSCW(provider, wethPool, wethT0, wethT1, FEE_TIER_WETH, amount0Desired, amount1Desired);

    console.log(`Mint BWAEZI/WETH via SCW — pool=${wethPool}, range [${lowerAligned}, ${upperAligned}] (tick: ${tick}, spacing: ${spacing})`);
    const scw = new ethers.Contract(SCW, scwAbi, signer);
    const tx = await scw.execute(NPM, 0n, mintData);
    console.log(`SCW execute (WETH-3000 mint) tx: ${tx.hash}`);
    const rc = await tx.wait();
    console.log(`✅ BWAEZI/WETH seeded via SCW — block ${rc.blockNumber}`);
  }

  // 5) Optional: wake-up swaps to kick routing (small, safe)
  await wakeUpSwapsViaSCW(signer);

  console.log("✅ Deploy complete — pools ensured, initialized at peg, mints executed via SCW, wake-up swaps done.");
}

main().catch(err => {
  console.error("Fatal:", err.reason || err.message || err);
  process.exit(1);
});
