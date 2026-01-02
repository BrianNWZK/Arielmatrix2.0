// main.js
// Asymmetric mint: seed BWAEZI/USDC and BWAEZI/WETH with BWAEZI-only via SCW.execute.
// Prepares approvals from SCW to NPM before minting.

import { ethers } from "ethers";

const RPC_URL = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const NPM     = ethers.getAddress("0xc36442b4a4522e871399cd717abdd847ab11fe88");
const BWAEZI  = ethers.getAddress("0x998232423d0b260ac397a893b360c8a254fcdd66");
const USDC    = ethers.getAddress("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
const WETH    = ethers.getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const SCW     = ethers.getAddress("0x59be70f1c57470d7773c3d5d27b8d165fcbe7eb2");

// Existing pools
const POOL_BW_USDC = ethers.getAddress("0x2538aF0f2892cFFAa2473D6ce1D642F935E77045");
const POOL_BW_WETH = ethers.getAddress("0xa55CDEf550E19C85eA7734762EE762A440Bd2503");

// ABIs
const scwAbi = [
  "function execute(address to, uint256 value, bytes data)"
];
const poolAbi = [
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)"
];
const npmAbi = [
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)"
];
const erc20Abi = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)"
];

// Helpers
function getTickSpacing(feeTier) {
  switch (feeTier) {
    case 100:   return 1;
    case 500:   return 10;
    case 3000:  return 60;
    case 10000: return 200;
    default: throw new Error("Unsupported fee tier");
  }
}

function sortTokens(a, b) {
  return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
}

async function buildMint(provider, pool, tokenA, tokenB, feeTier, amountA, amountB) {
  const poolCtr = new ethers.Contract(pool, poolAbi, provider);
  const { tick } = await poolCtr.slot0();
  const spacing = getTickSpacing(feeTier);

  const halfWidth = 120; // ticks each side of current price
  const lowerRaw = Number(tick) - halfWidth;
  const upperRaw = Number(tick) + halfWidth;

  const tickLower = Math.floor(lowerRaw / spacing) * spacing;
  let tickUpper = Math.ceil(upperRaw / spacing) * spacing;
  if (tickUpper === tickLower) tickUpper = tickLower + spacing;

  const [token0, token1] = sortTokens(tokenA, tokenB);
  const amount0Desired = token0.toLowerCase() === tokenA.toLowerCase() ? amountA : amountB;
  const amount1Desired = token1.toLowerCase() === tokenB.toLowerCase() ? amountB : amountA;

  const params = [
    token0,
    token1,
    feeTier,                        // uint24
    tickLower,                      // int24 (number)
    tickUpper,                      // int24 (number)
    amount0Desired,                 // uint256 (BigInt)
    amount1Desired,                 // uint256 (BigInt)
    0n,                             // amount0Min
    0n,                             // amount1Min
    SCW,                            // recipient
    BigInt(Math.floor(Date.now() / 1000) + 1800) // deadline
  ];

  const npmIface = new ethers.Interface(npmAbi);
  const mintData = npmIface.encodeFunctionData("mint", [params]);

  return {
    mintData,
    tick: Number(tick),
    spacing,
    tickLower,
    tickUpper,
    pool,
    token0,
    token1,
    amount0Desired,
    amount1Desired
  };
}

function buildApproveData(token, spender, amount) {
  const erc20Iface = new ethers.Interface(erc20Abi);
  return erc20Iface.encodeFunctionData("approve", [spender, amount]);
}

async function ensureAllowanceViaSCW(signer, token, owner, spender, needed) {
  const erc = new ethers.Contract(token, erc20Abi, signer.provider);
  const current = await erc.allowance(owner, spender);
  if (current >= needed) {
    console.log(`Allowance OK: token=${token}, owner=${owner}, spender=${spender}, allowance=${current.toString()}`);
    return;
  }
  console.log(`Approving: token=${token}, owner=${owner}, spender=${spender}, needed=${needed.toString()}, current=${current.toString()}`);

  const scwIface = new ethers.Interface(scwAbi);
  const approveData = buildApproveData(token, spender, needed);
  const execData = scwIface.encodeFunctionData("execute", [token, 0n, approveData]);

  const tx = await signer.sendTransaction({ to: SCW, data: execData, value: 0n });
  console.log(`SCW approve tx: ${tx.hash}`);
  const rc = await tx.wait();
  console.log(`✅ Approved at block ${rc.blockNumber}`);
}

async function executeMintViaSCW(signer, mintData, pool, tickLower, tickUpper, tick, spacing) {
  console.log(`Mint via SCW — pool=${pool}, range [${tickLower}, ${tickUpper}] (tick: ${tick}, spacing: ${spacing})`);

  // Pre-simulate with from=SCW (will revert if allowance/balances/range invalid)
  try {
    await signer.provider.call({ to: NPM, from: SCW, data: mintData });
  } catch (e) {
    throw new Error(`Pre-sim failed (SCW->NPM): ${e.reason || e.shortMessage || e.message}`);
  }

  const scwIface = new ethers.Interface(scwAbi);
  const execData = scwIface.encodeFunctionData("execute", [NPM, 0n, mintData]);
  const tx = await signer.sendTransaction({ to: SCW, data: execData, value: 0n });
  console.log(`SCW tx: ${tx.hash}`);
  const rc = await tx.wait();
  console.log(`✅ Minted via SCW at block ${rc.blockNumber}`);
}

async function assertBWBalance(provider, needed) {
  const bw = new ethers.Contract(BWAEZI, erc20Abi, provider);
  const bal = await bw.balanceOf(SCW);
  if (bal < needed) throw new Error(`Insufficient BWAEZI in SCW: need ${needed.toString()}, have ${bal.toString()}`);
  console.log(`BWAEZI balance OK in SCW: ${bal.toString()}`);
}

async function main() {
  if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer   = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`Signer EOA: ${signer.address}`);
  console.log(`ETH balance: ${ethers.formatEther(await provider.getBalance(signer.address))} ETH`);

  // 1) BWAEZI/USDC — BWAEZI-only
  const bwAmtUSDC = ethers.parseEther("0.05");
  await assertBWBalance(provider, bwAmtUSDC);

  // Approve BWAEZI from SCW to NPM (USDC side is 0, so no USDC approve)
  await ensureAllowanceViaSCW(signer, BWAEZI, SCW, NPM, bwAmtUSDC);

  const mUSDC = await buildMint(provider, POOL_BW_USDC, BWAEZI, USDC, 500, bwAmtUSDC, 0n);
  console.log(`Token order: token0=${mUSDC.token0}, token1=${mUSDC.token1}`);
  console.log(`Amounts: amount0=${mUSDC.amount0Desired.toString()}, amount1=${mUSDC.amount1Desired.toString()}`);
  await executeMintViaSCW(signer, mUSDC.mintData, mUSDC.pool, mUSDC.tickLower, mUSDC.tickUpper, mUSDC.tick, mUSDC.spacing);

  // 2) BWAEZI/WETH — BWAEZI-only
  const bwAmtWETH = ethers.parseEther("0.05");
  await assertBWBalance(provider, bwAmtWETH);

  // Approve BWAEZI again if needed (allowance may already cover)
  await ensureAllowanceViaSCW(signer, BWAEZI, SCW, NPM, bwAmtWETH);

  const mWETH = await buildMint(provider, POOL_BW_WETH, BWAEZI, WETH, 3000, bwAmtWETH, 0n);
  console.log(`Token order: token0=${mWETH.token0}, token1=${mWETH.token1}`);
  console.log(`Amounts: amount0=${mWETH.amount0Desired.toString()}, amount1=${mWETH.amount1Desired.toString()}`);
  await executeMintViaSCW(signer, mWETH.mintData, mWETH.pool, mWETH.tickLower, mWETH.tickUpper, mWETH.tick, mWETH.spacing);

  console.log("🎯 BOTH POOLS SEEDED ASYMMETRICALLY FROM SCW — GENESIS READY");
}

main().catch(err => {
  console.error("Fatal:", err.reason || err.message || err);
  process.exit(1);
});
