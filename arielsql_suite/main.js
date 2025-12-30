// eoa-final-bootstrap.js
// Purpose: Mint liquidity into existing BWAEZI/USDC pool + create & seed BWAEZI/WETH pool
// Run from your EOA that holds BWAEZI + USDC + ETH for gas

import { ethers } from "ethers";

const RPC_URL = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY; // EOA with BWAEZI, USDC, ETH

// Normalize all addresses to avoid checksum/ENS errors
const FACTORY       = ethers.getAddress("0x1f98431c8ad98523631ae4a59f267346ea31f984");
const NPM           = ethers.getAddress("0xc36442b4a4522e871399cd717abdd847ab11fe88");
const BWAEZI        = ethers.getAddress("0x9be921e5efacd53bc4eebcfdc4494d257cfab5da");
const USDC          = ethers.getAddress("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
const WETH          = ethers.getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const POOL_BW_USDC  = ethers.getAddress("0x051d003424c27987a4414f89b241a159a575b248");
const SCW_RECIPIENT = ethers.getAddress("0x59be70f1c57470d7773c3d5d27b8d165fcbe7eb2");

const factoryAbi = [
  "function getPool(address,address,uint24) view returns (address)",
  "function createPool(address,address,uint24) returns (address)"
];
const poolAbi = ["function initialize(uint160)"];
const npmAbi = [
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)"
];
const erc20Abi = ["function approve(address,uint256) returns (bool)"];

// Tick spacing per fee tier
function getTickSpacing(feeTier) {
  switch (feeTier) {
    case 100: return 1;    // 0.01%
    case 500: return 10;   // 0.05%
    case 3000: return 60;  // 0.3%
    case 10000: return 200; // 1%
    default: throw new Error(`Unsupported fee tier: ${feeTier}`);
  }
}

// Round to nearest usable tick (multiple of tickSpacing)
function nearestUsableTick(tick, tickSpacing) {
  // tick is Number (can be negative). Ensure integer division floors toward -Infinity.
  const q = Math.floor(tick / tickSpacing);
  return q * tickSpacing;
}

async function mintLiquidity(wallet, poolAddress, tokenA, tokenB, feeTier, amountA, amountB) {
  const pool = new ethers.Contract(
    poolAddress,
    ["function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)"],
    wallet.provider
  );
  const slot0 = await pool.slot0();
  const tick = Number(slot0[1]); // int24 tick as Number

  const tickSpacing = getTickSpacing(feeTier);
  const halfWidth = 120; // desired half-width in ticks around current tick

  // Center around current tick, aligned to tick spacing
  const rawLower = tick - halfWidth;
  const rawUpper = tick + halfWidth;
  const tickLowerAligned = nearestUsableTick(rawLower, tickSpacing);
  const tickUpperAligned = nearestUsableTick(rawUpper, tickSpacing);

  // Ensure lower < upper and they differ by at least one spacing step
  const tickLower = BigInt(tickLowerAligned);
  const tickUpper = BigInt(
    tickUpperAligned === tickLowerAligned
      ? tickLowerAligned + tickSpacing
      : tickUpperAligned
  );

  // Token ordering for Uniswap V3 (token0 < token1)
  const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA];
  const amount0Desired = token0.toLowerCase() === tokenA.toLowerCase() ? amountA : amountB;
  const amount1Desired = token0.toLowerCase() === tokenA.toLowerCase() ? amountB : amountA;

  // Approvals
  const tokenAContract = new ethers.Contract(tokenA, erc20Abi, wallet);
  const tokenBContract = new ethers.Contract(tokenB, erc20Abi, wallet);

  if (amountA > 0n) {
    const decA = tokenA === USDC ? 6 : 18;
    console.log(`Approving NPM for ${ethers.formatUnits(amountA, decA)} ${tokenA === BWAEZI ? 'BWAEZI' : tokenA === USDC ? 'USDC' : 'WETH'}`);
    await (await tokenAContract.approve(NPM, amountA)).wait();
  }
  if (amountB > 0n) {
    const decB = tokenB === USDC ? 6 : 18;
    console.log(`Approving NPM for ${ethers.formatUnits(amountB, decB)} ${tokenB === BWAEZI ? 'BWAEZI' : tokenB === USDC ? 'USDC' : 'WETH'}`);
    await (await tokenBContract.approve(NPM, amountB)).wait();
  }

  const npm = new ethers.Contract(NPM, npmAbi, wallet);

  // Use struct object (ethers v6) and BigInt deadline
  const params = {
    token0,
    token1,
    fee: feeTier,
    tickLower,
    tickUpper,
    amount0Desired,
    amount1Desired,
    amount0Min: 0,
    amount1Min: 0,
    recipient: SCW_RECIPIENT,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 1800)
  };

  console.log(
    `Minting on pool ${poolAddress} — range [${tickLowerAligned}, ${tickUpperAligned}] (current tick: ${tick}, spacing: ${tickSpacing})`
  );
  const tx = await npm.mint(params);
  console.log(`Submitted mint tx: ${tx.hash}`);
  const rc = await tx.wait();
  console.log(`✅ Liquidity minted! block: ${rc.blockNumber}`);
}

async function createAndInitWethPool(wallet) {
  const feeTier = 3000; // 0.3%
  const [token0, token1] = BWAEZI.toLowerCase() < WETH.toLowerCase() ? [BWAEZI, WETH] : [WETH, BWAEZI];

  const factory = new ethers.Contract(FACTORY, factoryAbi, wallet);
  let pool = await factory.getPool(token0, token1, feeTier);

  if (pool !== ethers.ZeroAddress) {
    console.log(`BWAEZI/WETH pool already exists: ${pool}`);
  } else {
    console.log("Creating BWAEZI/WETH pool...");
    const tx = await factory.createPool(token0, token1, feeTier);
    await tx.wait();
    pool = await factory.getPool(token0, token1, feeTier);
    console.log(`✅ BWAEZI/WETH pool created: ${pool}`);

    // Initialize price
    const isBWToken0 = token0.toLowerCase() === BWAEZI.toLowerCase();
    const sqrtPriceX96 = isBWToken0
      ? BigInt("0x5be9ba858b43c000000000000")  // ~33 WETH per BWAEZI
      : BigInt("0x2c9058f9770d700000000000"); // ~0.0303 BWAEZI per WETH

    const poolCtr = new ethers.Contract(pool, poolAbi, wallet);
    console.log(`Initializing BWAEZI/WETH with sqrtPriceX96=${sqrtPriceX96}`);
    const txInit = await poolCtr.initialize(sqrtPriceX96);
    await txInit.wait();
    console.log("✅ BWAEZI/WETH pool initialized");
  }

  return pool;
}

async function main() {
  if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`EOA: ${wallet.address}`);
  console.log(`ETH Balance: ${ethers.formatEther(await provider.getBalance(wallet.address))} ETH\n`);

  // 1) Mint into existing BWAEZI/USDC (fee 500)
  const bwAmtUSDC = ethers.parseEther("0.05"); // BW token amount (18 decimals)
  const usdcAmt   = ethers.parseUnits("5", 6); // USDC amount (6 decimals)

  await mintLiquidity(wallet, POOL_BW_USDC, BWAEZI, USDC, 500, bwAmtUSDC, usdcAmt);

  // 2) Optionally create + seed BWAEZI/WETH asymmetric
  // const poolWeth = await createAndInitWethPool(wallet);
  // const bwAmtWETH = ethers.parseEther("0.05");
  // const wethAmt   = 0n;
  // await mintLiquidity(wallet, poolWeth, BWAEZI, WETH, 3000, bwAmtWETH, wethAmt);

  console.log("🎯 FINAL BOOTSTRAP COMPLETE — BWAEZI/USDC liquidity seeded.");
}

main().catch(e => {
  console.error("Fatal error:", e.message || e);
  process.exit(1);
});
