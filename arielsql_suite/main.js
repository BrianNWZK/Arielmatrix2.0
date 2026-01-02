// main.js — AA-based asymmetric mint via SCW.execute
// - Approves BWAEZI to NPM and Paymaster from SCW via AA
// - Mints liquidity for BWAEZI/USDC (fee 500) and BWAEZI/WETH (fee 3000)
// - Wraps calls in SCW.execute and submits via Pimlico bundler

import express from "express";
import { ethers } from "ethers";
import { EnterpriseAASDK, EnhancedRPCManager } from "../modules/aa-loaves-fishes.js";

// Constants
const ENTRY_POINT = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
const BUNDLER = "https://api.pimlico.io/v2/1/rpc?apikey=pim_K4etjrjHvpTx4We2SuLLjt";
const SCW = ethers.getAddress(process.env.SCW_ADDRESS || "0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2");

const RPC_URLS = [
  "https://ethereum-rpc.publicnode.com",
  "https://rpc.ankr.com/eth",
  "https://eth.llamarpc.com"
];

// Addresses
const NPM       = ethers.getAddress("0xc36442b4a4522e871399cd717abdd847ab11fe88"); // NonfungiblePositionManager
const BWAEZI    = ethers.getAddress("0x998232423d0b260ac397a893b360c8a254fcdd66");
const USDC      = ethers.getAddress("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
const WETH      = ethers.getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const PAYMASTER = ethers.getAddress("0x76e81CB971BDd0d8D51995CA458A1eAfb6B29FB9");

// Existing pools
const POOL_BW_USDC = ethers.getAddress("0x2538aF0f2892cFFAa2473D6ce1D642F935E77045");
const POOL_BW_WETH = ethers.getAddress("0xa55CDEf550E19C85eA7734762EE762A440Bd2503");

// ABIs
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
const scwAbi = [
  "function execute(address to,uint256 value,bytes data)"
];

// Interfaces
const npmIface   = new ethers.Interface(npmAbi);
const erc20Iface = new ethers.Interface(erc20Abi);
const scwIface   = new ethers.Interface(scwAbi);

// Helpers
function getTickSpacing(feeTier) {
  switch (feeTier) {
    case 100:   return 1;
    case 500:   return 10;
    case 3000:  return 60;
    case 10000: return 200;
    default: throw new Error(`Unsupported fee tier: ${feeTier}`);
  }
}

function sortTokens(a, b) {
  return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
}

async function getBundlerGas(provider) {
  try {
    const res = await provider.send("pimlico_getUserOperationGasPrice", []);
    let maxFeePerGas = BigInt(res.maxFeePerGas);
    let maxPriorityFeePerGas = BigInt(res.maxPriorityFeePerGas);
    const TIP_FLOOR = 50_000_000n; // 50 gwei
    if (maxPriorityFeePerGas < TIP_FLOOR) maxPriorityFeePerGas = TIP_FLOOR;
    maxFeePerGas = (maxFeePerGas * 12n) / 10n;
    return { maxFeePerGas, maxPriorityFeePerGas };
  } catch {
    const fd = await provider.getFeeData();
    const base = fd.maxFeePerGas ?? ethers.parseUnits("35", "gwei");
    const tip  = fd.maxPriorityFeePerGas ?? ethers.parseUnits("3", "gwei");
    const TIP_FLOOR = 50_000_000n;
    return {
      maxFeePerGas: (BigInt(base.toString()) * 12n) / 10n,
      maxPriorityFeePerGas: BigInt(tip.toString()) < TIP_FLOOR ? TIP_FLOOR : BigInt(tip.toString())
    };
  }
}

async function assertBWBalance(provider, needed) {
  const bw = new ethers.Contract(BWAEZI, erc20Abi, provider);
  const bal = await bw.balanceOf(SCW);
  if (bal < needed) throw new Error(`Insufficient BWAEZI in SCW: need ${needed.toString()}, have ${bal.toString()}`);
  console.log(`BWAEZI balance OK in SCW: ${bal.toString()}`);
}

async function ensureAllowanceViaAA(aa, provider, token, owner, spender, needed) {
  const erc = new ethers.Contract(token, erc20Abi, provider);
  const current = await erc.allowance(owner, spender);
  if (current >= needed) {
    console.log(`Allowance OK: token=${token}, owner=${owner}, spender=${spender}, allowance=${current.toString()}`);
    return;
  }
  console.log(`Approving via AA: token=${token}, spender=${spender}, needed=${needed.toString()}`);

  const approveData = erc20Iface.encodeFunctionData("approve", [spender, needed]);
  const callData = scwIface.encodeFunctionData("execute", [token, 0n, approveData]);

  const { maxFeePerGas, maxPriorityFeePerGas } = await getBundlerGas(provider);
  const userOp = await aa.createUserOp(callData, {
    callGasLimit:        300000n,
    verificationGasLimit:700000n,
    preVerificationGas:   80000n,
    maxFeePerGas,
    maxPriorityFeePerGas
  });
  const signed = await aa.signUserOp(userOp);
  const hash = await aa.sendUserOpWithBackoff(signed, 5);
  console.log(`SCW approve submitted: ${hash}`);
}

async function buildMint(provider, pool, tokenA, tokenB, feeTier, amountA, amountB) {
  const poolCtr = new ethers.Contract(pool, poolAbi, provider);
  const { tick } = await poolCtr.slot0();
  const spacing = getTickSpacing(feeTier);

  const halfWidth = 120;
  const lowerRaw = Number(tick) - halfWidth;
  const upperRaw = Number(tick) + halfWidth;

  const tickLower = Math.floor(lowerRaw / spacing) * spacing;
  let tickUpper = Math.ceil(upperRaw / spacing) * spacing;
  if (tickUpper === tickLower) tickUpper = tickLower + spacing;

  const [token0, token1] = sortTokens(tokenA, tokenB);
  const amount0Desired = token0.toLowerCase() === tokenA.toLowerCase() ? amountA : amountB;
  const amount1Desired = token1.toLowerCase() === tokenB.toLowerCase() ? amountB : amountA;

  const params = [
    token0, token1, feeTier,
    tickLower, tickUpper,
    amount0Desired, amount1Desired,
    0n, 0n,
    SCW,
    BigInt(Math.floor(Date.now() / 1000) + 1800)
  ];

  const mintData = npmIface.encodeFunctionData("mint", [params]);

  return { mintData, tick: Number(tick), spacing, tickLower, tickUpper, pool, token0, token1, amount0Desired, amount1Desired };
}

async function mintViaAA(aa, provider, mintPack) {
  const { mintData, pool, tickLower, tickUpper, tick, spacing } = mintPack;
  console.log(`Mint via SCW (AA) — pool=${pool}, range [${tickLower}, ${tickUpper}] (tick: ${tick}, spacing: ${spacing})`);

  try {
    await provider.call({ to: NPM, from: SCW, data: mintData });
  } catch (e) {
    throw new Error(`Pre-sim failed (SCW->NPM): ${e?.reason || e?.shortMessage || e?.message}`);
  }

  const callData = scwIface.encodeFunctionData("execute",
