// main.js
// Mint BWAEZI/USDC (fee 500) and BWAEZI/WETH (fee 3000) via SCW that exposes execute(address,uint256,bytes)
// Assumes BWAEZI/WETH pool is already created and initialized.

import { ethers } from "ethers";

const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const NPM     = ethers.getAddress("0xc36442b4a4522e871399cd717abdd847ab11fe88");
const WETH    = ethers.getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const BWAEZI  = ethers.getAddress("0x9be921e5efacd53bc4eebcfdc4494d257cfab5da");
const SCW     = ethers.getAddress("0x59be70f1c57470d7773c3d5d27b8d165fcbe7eb2");

// Existing pools
const POOL_BW_USDC = ethers.getAddress("0x051d003424c27987a4414f89b241a159a575b248");
const POOL_BW_WETH = ethers.getAddress("0x8925456Ec713Be7F4fD759FdAd03d91404e8B424");

const scwAbi = [
  "function execute(address to, uint256 value, bytes data) returns (bytes)"
];

const poolAbi = [
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)"
];

const npmAbi = [
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline))"
];

function getTickSpacing(feeTier) {
  switch (feeTier) {
    case 100: return 1;
    case 500: return 10;
    case 3000: return 60;
    case 10000: return 200;
    default: throw new Error("Unsupported fee");
  }
}

function nearestUsableTick(tick, spacing) {
  return Math.floor(tick / spacing) * spacing;
}

async function buildMint(provider, pool, tokenA, tokenB, feeTier, amountA, amountB) {
  const slot0 = await new ethers.Contract(pool, poolAbi, provider).slot0();
  const tick = Number(slot0.tick);
  const spacing = getTickSpacing(feeTier);

  const halfWidth = 120;
  const la = nearestUsableTick(tick - halfWidth, spacing);
  const ua = nearestUsableTick(tick + halfWidth, spacing);

  const tickLower = BigInt(la);
  const tickUpper = BigInt(ua === la ? la + spacing : ua);

  const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA];
  const amount0Desired = token0.toLowerCase() === tokenA.toLowerCase() ? amountA : amountB;
  const amount1Desired = token0.toLowerCase() === tokenA.toLowerCase() ? amountB : amountA;

  const params = {
    token0, token1, fee: feeTier,
    tickLower, tickUpper,
    amount0Desired, amount1Desired,
    amount0Min: 0, amount1Min: 0,
    recipient: SCW,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 1800)
  };

  const iface = new ethers.Interface(npmAbi);
  const mintData = iface.encodeFunctionData("mint", [params]);
  return { mintData, tick, spacing, la, ua, pool };
}

async function executeMint(scw, mintData, pool, la, ua, tick, spacing) {
  console.log(`Mint via SCW — pool=${pool}, range [${la}, ${ua}] (tick: ${tick}, spacing: ${spacing})`);
  try {
    await scw.callStatic.execute(NPM, 0n, mintData);
  } catch (e) {
    throw new Error(`SCW rejected execute(): ${e.reason || e.shortMessage || e.message}`);
  }
  const tx = await scw.execute(NPM, 0n, mintData);
  console.log(`SCW tx: ${tx.hash}`);
  const rc = await tx.wait();
  console.log(`✅ Minted via SCW at block ${rc.blockNumber}`);
}

async function main() {
  if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);
  const scw = new ethers.Contract(SCW, scwAbi, signer);

  console.log(`Signer: ${signer.address}`);
  console.log(`ETH: ${ethers.formatEther(await provider.getBalance(signer.address))} ETH`);

  // 1) Mint BWAEZI/USDC (existing pool, fee 500)
  const bwAmtUSDC = ethers.parseEther("0.05");
  const usdcAmt   = ethers.parseUnits("5", 6);
  const { mintData: mintUSDC, tick: tickUSDC, spacing: spacingUSDC, la: laUSDC, ua: uaUSDC, pool: poolUSDC } =
    await buildMint(provider, POOL_BW_USDC, BWAEZI, ethers.getAddress("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"), 500, bwAmtUSDC, usdcAmt);
  await executeMint(scw, mintUSDC, poolUSDC, laUSDC, uaUSDC, tickUSDC, spacingUSDC);

  // 2) Mint BWAEZI/WETH (existing pool, fee 3000)
  const bwAmtWETH = ethers.parseEther("0.05");
  const wethAmt   = 0n;
  const { mintData: mintWETH, tick: tickWETH, spacing: spacingWETH, la: laWETH, ua: uaWETH, pool: poolWETH } =
    await buildMint(provider, POOL_BW_WETH, BWAEZI, WETH, 3000, bwAmtWETH, wethAmt);
  await executeMint(scw, mintWETH, poolWETH, laWETH, uaWETH, tickWETH, spacingWETH);

  console.log("🎯 Genesis seeding complete — BWAEZI/USDC and BWAEZI/WETH minted via SCW.");
}

main().catch(err => {
  console.error("Fatal:", err.reason || err.message || err);
  process.exit(1);
});
