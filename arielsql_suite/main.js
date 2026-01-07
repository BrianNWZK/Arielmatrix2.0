// main.js
// Final one-shot genesis seeding script for BWAEZI token
// Uses ERC-4337 via Pimlico bundler
// Bundles NonfungiblePositionManager.createAndInitializePoolIfNecessary + mint via multicall
// Fixes:
// - Sign canonical EntryPoint userOp hash via getUserOpHash (EP 0.6.0)
// - Derive token0/token1 + fee + current tick from pool, use tight band around live tick
// Streamlined: no approvals/balance checks/paymaster. Single-run. Bundler gas estimation.
// No lock file — exits immediately after confirmed seeding.

import express from "express";
import { ethers } from "ethers";

// ===== Constants =====
const NPM = ethers.getAddress("0xC36442b4a4522E871399CD717aBDD847Ab11FE88");
const ENTRY_POINT = ethers.getAddress("0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789");
const FACTORY = ethers.getAddress("0x1F98431c8aD98523631AE4a59f267346ea31F984");
const BUNDLER_RPC_URL = "https://api.pimlico.io/v2/1/rpc?apikey=pim_4NdivPuNDvvKZ1e1aNPKrb";

// ===== Env =====
const RPC_URL = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");
const SCW = ethers.getAddress(process.env.SCW_ADDRESS || "0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2");
const PORT = Number(process.env.PORT || 10000);

// ===== Pools & Tokens =====
const POOL_BW_USDC = ethers.getAddress("0xe09e69Cf5d9f1BA67477b9720FAB7eb7883B4562"); // fee 500
const POOL_BW_WETH = ethers.getAddress("0x142C3dce0a5605Fb385fAe7760302fab761022aa"); // fee 3000
const BWAEZI = ethers.getAddress("0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2");
const USDC   = ethers.getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const WETH   = ethers.getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");

// ===== ABIs =====
const poolAbi = [
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)"
];
const npmAbi = [
  "function multicall(bytes[] calldata data) external payable returns (bytes[] memory results)",
  "function createAndInitializePoolIfNecessary(address token0,address token1,uint24 fee,uint160 sqrtPriceX96) external payable returns (address pool)",
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) external returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)"
];
const scwAbi = ["function execute(address to,uint256 value,bytes data) returns (bytes)"];
const entryPointAbi = [
  "function getNonce(address sender, uint192 key) view returns (uint256)",
  "function getUserOpHash((address sender,uint256 nonce,bytes initCode,bytes callData,uint256 callGasLimit,uint256 verificationGasLimit,uint256 preVerificationGas,uint256 maxFeePerGas,uint256 maxPriorityFeePerGas,bytes paymasterAndData,bytes signature)) view returns (bytes32)"
];

// ===== Tick utils =====
const MIN_TICK = -887272;
const MAX_TICK =  887272;

function spacingForFee(fee) {
  if (fee === 100) return 1;
  if (fee === 500) return 10;
  if (fee === 3000) return 60;
  if (fee === 10000) return 200;
  return 1;
}
function clampAlign(value, spacing) {
  return Math.floor(value / spacing) * spacing;
}
function tightBandAroundTick(currentTick, spacing, bandSpans = 2) {
  let lower = clampAlign(currentTick - bandSpans * spacing, spacing);
  let upper = clampAlign(currentTick + bandSpans * spacing, spacing) + spacing;
  const minAligned = Math.ceil(MIN_TICK / spacing) * spacing;
  const maxAligned = Math.floor(MAX_TICK / spacing) * spacing;
  lower = Math.max(lower, minAligned);
  upper = Math.min(upper, maxAligned);
  if (upper <= lower) upper = lower + spacing;
  return { lower, upper };
}
function nowDeadline(secs = 1200) {
  return Math.floor(Date.now() / 1000) + secs;
}

// ===== sqrtPrice helpers =====
function q96() { return 2n ** 96n; }
function sqrtPriceX96FromPrice(priceNum, priceDen, dec0, dec1) {
  const scale = BigInt(10) ** BigInt(dec1 - dec0);
  const numerator = BigInt(priceNum) * scale;
  const ratio = (numerator * q96() * q96()) / BigInt(priceDen);
  let z = ratio;
  let x = ratio;
  let y = (x + 1n) / 2n;
  while (y < x) { x = y; y = (x + z / x) / 2n; }
  return x;
}

// ===== Build bundled calldata (init + mint) =====
async function buildBundleCallData(provider, poolAddr, nominalA, nominalB) {
  const pool = new ethers.Contract(poolAddr, poolAbi, provider);
  const iface = new ethers.Interface(npmAbi);

  const [sqrtPriceX96Raw, tickRaw] = await pool.slot0().catch(() => [0n, 0n]);
  const tick = Number(tickRaw);
  const token0 = await pool.token0();
  const token1 = await pool.token1();
  const fee = Number(await pool.fee());
  const spacing = spacingForFee(fee);
  const { lower: tickLower, upper: tickUpper } = tightBandAroundTick(tick, spacing, 2);

  const isBWToken0 = token0.toLowerCase() === BWAEZI.toLowerCase();
  const amount0Desired = isBWToken0 ? nominalA : nominalB;
  const amount1Desired = isBWToken0 ? nominalB : nominalA;

  let initSqrt = sqrtPriceX96Raw && sqrtPriceX96Raw !== 0n
    ? sqrtPriceX96Raw
    : (() => {
        const dec0 = (token0.toLowerCase() === USDC.toLowerCase()) ? 6 : 18;
        const dec1 = (token1.toLowerCase() === USDC.toLowerCase()) ? 6 : 18;
        const isUSDC = token0.toLowerCase() === USDC.toLowerCase() || token1.toLowerCase() === USDC.toLowerCase();
        return isUSDC
          ? sqrtPriceX96FromPrice(100n, 1n, dec0, dec1)
          : sqrtPriceX96FromPrice(3n, 100n, dec0, dec1);
      })();

  const initCalldata = iface.encodeFunctionData("createAndInitializePoolIfNecessary", [token0, token1, fee, initSqrt]);
  const mintParams = [
    token0, token1, fee, tickLower, tickUpper,
    amount0Desired, amount1Desired, 0n, 0n, SCW, nowDeadline()
  ];
  const mintCalldata = iface.encodeFunctionData("mint", [mintParams]);

  return iface.encodeFunctionData("multicall", [[initCalldata, mintCalldata]]);
}

// ===== ERC-4337 helpers =====
async function getNonce(provider, sender) {
  const ep = new ethers.Contract(ENTRY_POINT, entryPointAbi, provider);
  return await ep.getNonce(sender, 0);
}
async function getUserOpHash(provider, userOp) {
  const ep = new ethers.Contract(ENTRY_POINT, entryPointAbi, provider);
  return await ep.getUserOpHash({ ...userOp, signature:
