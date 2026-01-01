// main.js
// Goal: Mint BWAEZI/USDC liquidity via SCW into existing Uniswap V3 pool
// Pool already created and initialized, so we skip creation/init.

import { ethers } from "ethers";

const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const NPM     = ethers.getAddress("0xc36442b4a4522e871399cd717abdd847ab11fe88");
const SCW     = ethers.getAddress("0x59be70f1c57470d7773c3d5d27b8d165fcbe7eb2");
const POOL    = ethers.getAddress("0x051d003424c27987a4414f89b241a159a575b248"); // existing BWAEZI/USDC pool
const BWAEZI  = ethers.getAddress("0x998232423d0b260ac397a893b360c8a254fcdd66");
const USDC    = ethers.getAddress("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");

const FEE_TIER = 500; // 0.05%

// ABIs
const poolAbi = [
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

  // Decide amounts (balanced seed: BWAEZI + USDC)
  const bwAmt   = ethers.parseEther("0.05");   // adjust if needed
  const usdcAmt = ethers.parseUnits("5", 6);   // adjust if needed

  const amount0Desired = token0.toLowerCase() === BWAEZI.toLowerCase() ? bwAmt  : usdcAmt;
  const amount1Desired = token1.toLowerCase() === USDC.toLowerCase()   ? usdcAmt : bwAmt;

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

  // Token ordering
  const [token0, token1] = BWAEZI.toLowerCase() < USDC.toLowerCase() ? [BWAEZI, USDC] : [USDC, BWAEZI];

  // Build SCW execute for NPM.mint
  const { mintData, tick, spacing, lowerAligned, upperAligned } =
    await buildMintViaSCW(provider, POOL, token0, token1);

  console.log(
    `Mint BWAEZI/USDC via SCW — pool=${POOL}, range [${lowerAligned}, ${upperAligned}] (tick: ${tick}, spacing: ${spacing})`
  );

  // Execute from SCW
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
