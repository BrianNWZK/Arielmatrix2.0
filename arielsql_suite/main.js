// main.js — Genesis seeding with in-range mint + microseed swaps
// Uses SCW.execute to forward calls
// Steps:
// 1. Mint tiny BWAEZI+USDC liquidity in-range
// 2. Swap 5 USDC → BWAEZI
// 3. Swap 2 USDC → WETH
// 4. Swap tiny WETH → BWAEZI

import { ethers } from "ethers";

const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SCW         = process.env.SCW_ADDRESS;

const NPM    = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88"; // Uniswap V3 position manager
const ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564"; // Uniswap V3 router

const BWAEZI = "0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2";
const USDC   = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WETH   = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const npmAbi     = [
  "function mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))"
];
const scwAbi     = ["function execute(address,uint256,bytes)"];
const routerAbi  = [
  "function exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160)) returns (uint256)"
];
const poolAbi    = ["function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)"];
const factoryAbi = ["function getPool(address,address,uint24) view returns (address)"];

function sortLex(a, b) {
  return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
}
function spacingForFee(fee) {
  if (fee === 500) return 10;
  if (fee === 3000) return 60;
  throw new Error(`Unsupported fee: ${fee}`);
}
function alignTick(tick, spacing) {
  const lower = Math.floor((tick - spacing * 6) / spacing) * spacing;
  const upper = Math.ceil((tick + spacing * 6) / spacing) * spacing;
  return { lower, upper: upper <= lower ? lower + spacing : upper };
}

async function getPool(provider, tokenA, tokenB, fee) {
  const f = new ethers.Contract("0x1F98431c8aD98523631AE4a59f267346ea31F984", factoryAbi, provider);
  const [token0, token1] = sortLex(tokenA, tokenB);
  return await f.getPool(token0, token1, fee);
}
async function getCurrentTick(provider, poolAddr) {
  const p = new ethers.Contract(poolAddr, poolAbi, provider);
  const [, tick] = await p.slot0();
  return Number(tick);
}

async function buildMintCalldata(provider, tokenA, tokenB, fee, amountA, amountB, recipient) {
  const npmIface = new ethers.Interface(npmAbi);
  const [token0, token1] = sortLex(tokenA, tokenB);
  const pool = await getPool(provider, tokenA, tokenB, fee);
  if (!pool || pool === ethers.ZeroAddress) throw new Error("Pool not found");
  const tick = await getCurrentTick(provider, pool);
  const spacing = spacingForFee(fee);
  const { lower, upper } = alignTick(tick, spacing);

  const amount0Desired = token0.toLowerCase() === tokenA.toLowerCase() ? amountA : amountB;
  const amount1Desired = token0.toLowerCase() === tokenA.toLowerCase() ? amountB : amountA;

  const params = [
    token0,
    token1,
    fee,
    lower,
    upper,
    amount0Desired,
    amount1Desired,
    0n,
    0n,
    recipient,
    Math.floor(Date.now() / 1000) + 1800
  ];
  return npmIface.encodeFunctionData("mint", [params]);
}

function buildExactInputSingleCalldata({
  tokenIn,
  tokenOut,
  fee,
  recipient,
  amountIn,
  amountOutMinimum = 0n,
  sqrtPriceLimitX96 = 0n
}) {
  const iface = new ethers.Interface(routerAbi);
  const params = [
    tokenIn,
    tokenOut,
    fee,
    recipient,
    Math.floor(Date.now() / 1000) + 600,
    amountIn,
    amountOutMinimum,
    sqrtPriceLimitX96
  ];
  return iface.encodeFunctionData("exactInputSingle", [params]);
}

async function main() {
  if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");
  if (!SCW) throw new Error("Missing SCW_ADDRESS");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);
  const scw      = ethers.getAddress(SCW);

  console.log(`EOA: ${wallet.address}`);

  const scwIface = new ethers.Interface(scwAbi);

  // 1. Mint tiny in-range BWAEZI+USDC
  const mintAmountBW = ethers.parseEther("0.001");       // tiny BWAEZI
  const mintAmountUS = ethers.parseUnits("9.62", 6);     // all USDC
  const mintData = await buildMintCalldata(provider, BWAEZI, USDC, 500, mintAmountBW, mintAmountUS, scw);
  const execMint = scwIface.encodeFunctionData("execute", [NPM, 0n, mintData]);
  await wallet.sendTransaction({ to: scw, data: execMint, gasLimit: 800000 });
  console.log("✅ Minted in-range BWAEZI+USDC liquidity");

  // 2. Microseed swap USDC→BWAEZI (5 USDC)
  const swapUSDCtoBW = buildExactInputSingleCalldata({
    tokenIn: USDC,
    tokenOut: BWAEZI,
    fee: 500,
    recipient: scw,
    amountIn: ethers.parseUnits("5", 6)
  });
  const execSwap1 = scwIface.encodeFunctionData("execute", [ROUTER, 0n, swapUSDCtoBW]);
  await wallet.sendTransaction({ to: scw, data: execSwap1, gasLimit: 500000 });
  console.log("✅ Microseed swap USDC→BWAEZI (5 USDC)");

  // 3. WETH leg seeding: USDC→WETH (2 USDC)
  const swapUSDCtoWETH = buildExactInputSingleCalldata({
    tokenIn: USDC,
    tokenOut: WETH,
    fee: 500,
    recipient: scw,
    amountIn: ethers.parseUnits("2", 6)
  });
  const execSwap2 = scwIface.encodeFunctionData("execute", [ROUTER, 0n, swapUSDCtoWETH]);
  await wallet.sendTransaction({ to: scw, data: execSwap2, gasLimit: 500000 });
  console.log("✅ Seeded WETH via USDC→WETH (2 USDC)");

  // 4. Tiny WETH→BWAEZI swap
  const swapWETHtoBW = buildExactInputSingleCalldata({
    tokenIn: WETH,
    tokenOut: BWAEZI,
    fee: 3000,
    recipient: scw,
    amountIn: ethers.parseEther("0.0005")
  });
  const execSwap3 = scwIface.encodeFunctionData("execute", [ROUTER, 0n, swapWETHtoBW]);
  await wallet.sendTransaction({ to: scw, data: execSwap3, gasLimit: 500000 });
  console.log("✅ Seeded BWAEZI via WETH→BWAEZI (tiny)");

  console.log("🎯 Genesis complete: pools active, quoter non-zero, USDC and WETH legs seeded");
}

main().catch(e => console.error("Fatal:", e));
