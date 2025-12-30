// main.js
// Seed BWAEZI/USDC (fee 500) and BWAEZI/WETH (fee 3000) via SCW using direct sendTransaction.
// Adds: env-driven amounts, token-order logs, tick-bound assertions, and clear error messages.

import { ethers } from "ethers";

const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const NPM    = ethers.getAddress("0xc36442b4a4522e871399cd717abdd847ab11fe88");
const BWAEZI = ethers.getAddress("0x9be921e5efacd53bc4eebcfdc4494d257cfab5da");
const USDC   = ethers.getAddress("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
const WETH   = ethers.getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const SCW    = ethers.getAddress("0x59be70f1c57470d7773c3d5d27b8d165fcbe7eb2");

// Existing pools
const POOL_BW_USDC = ethers.getAddress("0x051d003424c27987a4414f89b241a159a575b248");
const POOL_BW_WETH = ethers.getAddress("0x8925456Ec713Be7F4fD759FdAd03d91404e8B424");

// Amounts via env (fallbacks provided)
const BW_USDC_AMT = process.env.BW_USDC_AMT || "0.05"; // BWAEZI 18d
const USDC_AMT    = process.env.USDC_AMT    || "5";    // USDC 6d
const BW_WETH_AMT = process.env.BW_WETH_AMT || "0.05"; // BWAEZI 18d
const WETH_AMT    = process.env.WETH_AMT    || "0";    // WETH 18d (one-sided seed default)

const scwAbi  = ["function execute(address to, uint256 value, bytes data) returns (bytes)"];
const poolAbi = [
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)"
];

const npmAbi = [
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline))"
];

function getTickSpacing(fee) {
  if (fee === 500) return 10;
  if (fee === 3000) return 60;
  throw new Error("Unsupported fee");
}

function nearestUsableTick(tick, spacing) {
  return Math.floor(tick / spacing) * spacing;
}

function formatAmt(addr, amt) {
  if (addr.toLowerCase() === USDC.toLowerCase()) return ethers.formatUnits(amt, 6);
  return ethers.formatEther(amt);
}

async function mintViaSCW(signer, poolAddr, tokenA, tokenB, fee, rawAmtA, rawAmtB) {
  // 1) Read slot0 and compute aligned ticks
  const pool = new ethers.Contract(poolAddr, poolAbi, signer.provider);
  const { tick } = await pool.slot0();
  const spacing = getTickSpacing(fee);

  const width = 120;
  const lowerAligned = nearestUsableTick(Number(tick) - width, spacing);
  const upperAligned = nearestUsableTick(Number(tick) + width, spacing);

  const tickLower = BigInt(lowerAligned);
  const tickUpper = BigInt(upperAligned === lowerAligned ? lowerAligned + spacing : upperAligned);

  if (tickUpper <= tickLower) {
    throw new Error(`Invalid tick range: tickUpper(${tickUpper}) <= tickLower(${tickLower})`);
  }

  // 2) Token ordering and amounts
  const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA];

  const amountA = tokenA.toLowerCase() === USDC.toLowerCase()
    ? ethers.parseUnits(rawAmtA, 6)
    : ethers.parseEther(rawAmtA);

  const amountB = tokenB.toLowerCase() === USDC.toLowerCase()
    ? ethers.parseUnits(rawAmtB, 6)
    : ethers.parseEther(rawAmtB);

  const amount0Desired = token0.toLowerCase() === tokenA.toLowerCase() ? amountA : amountB;
  const amount1Desired = token0.toLowerCase() === tokenA.toLowerCase() ? amountB : amountA;

  console.log(`Token order: token0=${token0}, token1=${token1}`);
  console.log(`Amounts: amount0=${formatAmt(token0, amount0Desired)}, amount1=${formatAmt(token1, amount1Desired)}`);

  // 3) Build NPM.mint calldata
  const params = {
    token0,
    token1,
    fee,
    tickLower,
    tickUpper,
    amount0Desired,
    amount1Desired,
    amount0Min: 0n,
    amount1Min: 0n,
    recipient: SCW,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 1800)
  };

  const npmIface = new ethers.Interface(npmAbi);
  const mintData = npmIface.encodeFunctionData("mint", [params]);

  // 4) Encode SCW.execute and send directly
  const scwIface = new ethers.Interface(scwAbi);
  const execData = scwIface.encodeFunctionData("execute", [NPM, 0n, mintData]);

  console.log(`Minting on ${poolAddr} — range [${lowerAligned}, ${upperAligned}] (tick: ${tick}, spacing: ${spacing})`);
  const tx = await signer.sendTransaction({ to: SCW, data: execData, value: 0n });
  console.log(`Submitted: ${tx.hash}`);

  const rc = await tx.wait();
  console.log(`✅ Minted via SCW! block ${rc.blockNumber}`);
}

async function main() {
  if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer   = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`Signer EOA: ${signer.address}`);
  console.log(`ETH balance: ${ethers.formatEther(await provider.getBalance(signer.address))} ETH\n`);

  // 1) BWAEZI/USDC — fee 500, balanced
  await mintViaSCW(
    signer,
    POOL_BW_USDC,
    BWAEZI,
    USDC,
    500,
    BW_USDC_AMT, // BW
    USDC_AMT     // USDC
  );

  // 2) BWAEZI/WETH — fee 3000, one-sided BW
  await mintViaSCW(
    signer,
    POOL_BW_WETH,
    BWAEZI,
    WETH,
    3000,
    BW_WETH_AMT, // BW
    WETH_AMT     // WETH (often "0" for asymmetric seed)
  );

  console.log("🎯 BOTH POOLS SEEDED FROM SCW — GENESIS READY");
}

main().catch(e => {
  console.error("Fatal:", e.message || e);
  process.exit(1);
});
