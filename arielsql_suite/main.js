// main.js
// Asymmetric mint to avoid USDC "STF": seed BWAEZI/USDC with BWAEZI-only, and BWAEZI/WETH with BWAEZI-only.
// Uses SCW.execute(address,uint256,bytes) by sending a raw transaction to SCW.
// Assumes BWAEZI/WETH pool already exists and is initialized.

import { ethers } from "ethers";

const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const NPM     = ethers.getAddress("0xc36442b4a4522e871399cd717abdd847ab11fe88");
const BWAEZI  = ethers.getAddress("0x9be921e5efacd53bc4eebcfdc4494d257cfab5da");
const USDC    = ethers.getAddress("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
const WETH    = ethers.getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const SCW     = ethers.getAddress("0x59be70f1c57470d7773c3d5d27b8d165fcbe7eb2");

// Existing pools
const POOL_BW_USDC = ethers.getAddress("0x051d003424c27987a4414f89b241a159a575b248");
const POOL_BW_WETH = ethers.getAddress("0x8925456Ec713Be7F4fD759FdAd03d91404e8B424");

// ABIs
const scwAbi = [
  "function execute(address to, uint256 value, bytes data)"
];
const poolAbi = [
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)"
];
const npmAbi = [
  "function mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)) returns (uint256,uint128,uint256,uint256)"
];
const erc20Abi = [
  "function balanceOf(address) view returns (uint256)"
];

// Helpers
function getTickSpacing(feeTier) {
  switch (feeTier) {
    case 100: return 1;
    case 500: return 10;
    case 3000: return 60;
    case 10000: return 200;
    default: throw new Error("Unsupported fee");
  }
}

async function buildMint(provider, pool, tokenA, tokenB, feeTier, amountA, amountB) {
  const poolCtr = new ethers.Contract(pool, poolAbi, provider);
  const slot0 = await poolCtr.slot0();
  const tick = Number(slot0.tick);
  const spacing = getTickSpacing(feeTier);

  const halfWidth = 120;
  const lowerRaw = tick - halfWidth;
  const upperRaw = tick + halfWidth;

  // Align: lower=floor, upper=ceil (ensure non-zero width)
  const la = Math.floor(lowerRaw / spacing) * spacing;
  const uaCeil = Math.ceil(upperRaw / spacing) * spacing;
  const ua = uaCeil === la ? la + spacing : uaCeil;

  // token0/token1 orientation
  const [token0, token1] =
    tokenA.toLowerCase() < tokenB.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA];

  // Map amounts to sides (asymmetric allowed: one can be 0n)
  const amount0Desired = token0.toLowerCase() === tokenA.toLowerCase() ? amountA : amountB;
  const amount1Desired = token1.toLowerCase() === tokenB.toLowerCase() ? amountB : amountA;

  const paramsArray = [
    token0,
    token1,
    feeTier,                    // uint24 (number)
    BigInt(la),                 // int24
    BigInt(ua),                 // int24
    amount0Desired,             // uint256 (BigInt)
    amount1Desired,             // uint256 (BigInt)
    0n,
    0n,
    SCW,
    BigInt(Math.floor(Date.now() / 1000) + 1800)
  ];

  const npmIface = new ethers.Interface(npmAbi);
  const mintData = npmIface.encodeFunctionData("mint", [paramsArray]);

  return { mintData, tick, spacing, la, ua, pool, token0, token1, amount0Desired, amount1Desired };
}

async function executeMintViaSCW(signer, mintData, pool, la, ua, tick, spacing) {
  console.log(`Mint via SCW — pool=${pool}, range [${la}, ${ua}] (tick: ${tick}, spacing: ${spacing})`);

  // Pre-simulate inner call (from SCW) to catch state issues early
  try {
    await signer.provider.call({ to: NPM, from: SCW, data: mintData });
  } catch (e) {
    throw new Error(`Pre-sim failed (SCW->NPM): ${e.reason || e.shortMessage || e.message}`);
  }

  // Encode SCW.execute and send directly
  const scwIface = new ethers.Interface(scwAbi);
  const execData = scwIface.encodeFunctionData("execute", [NPM, 0n, mintData]);

  const tx = await signer.sendTransaction({ to: SCW, data: execData, value: 0n });
  console.log(`SCW tx: ${tx.hash}`);
  const rc = await tx.wait();
  console.log(`✅ Minted via SCW at block ${rc.blockNumber}`);
}

async function assertBWBalance(signer, needed) {
  const bw = new ethers.Contract(BWAEZI, erc20Abi, signer.provider);
  const bal = await bw.balanceOf(SCW);
  if (bal < needed) throw new Error(`Insufficient BWAEZI in SCW: need ${needed.toString()}, have ${bal.toString()}`);
}

async function main() {
  if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`Signer EOA: ${signer.address}`);
  console.log(`ETH balance: ${ethers.formatEther(await provider.getBalance(signer.address))} ETH`);

  // 1) BWAEZI/USDC — BWAEZI-only to avoid USDC STF
  const bwAmtUSDC = ethers.parseEther("0.05");
  const usdcAmt   = 0n;

  await assertBWBalance(signer, bwAmtUSDC);

  const mUSDC =
    await buildMint(provider, POOL_BW_USDC, BWAEZI, USDC, 500, bwAmtUSDC, usdcAmt);

  console.log(`Token order: token0=${mUSDC.token0}, token1=${mUSDC.token1}`);
  console.log(`Amounts: amount0=${mUSDC.amount0Desired.toString()}, amount1=${mUSDC.amount1Desired.toString()}`);

  await executeMintViaSCW(signer, mUSDC.mintData, mUSDC.pool, mUSDC.la, mUSDC.ua, mUSDC.tick, mUSDC.spacing);

  // 2) BWAEZI/WETH — BWAEZI-only
  const bwAmtWETH = ethers.parseEther("0.05");
  const wethAmt   = 0n;

  await assertBWBalance(signer, bwAmtWETH);

  const mWETH =
    await buildMint(provider, POOL_BW_WETH, BWAEZI, WETH, 3000, bwAmtWETH, wethAmt);

  console.log(`Token order: token0=${mWETH.token0}, token1=${mWETH.token1}`);
  console.log(`Amounts: amount0=${mWETH.amount0Desired.toString()}, amount1=${mWETH.amount1Desired.toString()}`);

  await executeMintViaSCW(signer, mWETH.mintData, mWETH.pool, mWETH.la, mWETH.ua, mWETH.tick, mWETH.spacing);

  console.log("🎯 BOTH POOLS SEEDED ASYMMETRICALLY FROM SCW — GENESIS READY");
}

main().catch(err => {
  console.error("Fatal:", err.reason || err.message || err);
  process.exit(1);
});
