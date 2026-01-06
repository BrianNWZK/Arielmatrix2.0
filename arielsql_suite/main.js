// withdraw-and-repeg.js — Safely withdraw BWAEZI back to SCW, then re-peg gently
// Steps:
// A) Enumerate SCW's Uniswap V3 positions (bwzC/USDC fee 500, bwzC/WETH fee 3000)
// B) For each position: decreaseLiquidity(100%), then collect() to SCW (no swaps)
// C) Re-mint tiny in-range BWAEZI+USDC
// D) Microseed: 5 USDC → BWAEZI; 2 USDC → WETH; tiny WETH → BWAEZI

import { ethers } from "ethers";

const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;       // EOA signer
const SCW         = ethers.getAddress(process.env.SCW_ADDRESS);

// Core contracts (mainnet)
const NPM    = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88"; // Uniswap V3 Position Manager
const ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564"; // Uniswap V3 Router
const FACTORY= "0x1F98431c8aD98523631AE4a59f267346ea31F984";

const BWAEZI = "0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2";
const USDC   = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WETH   = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

// Fee tiers
const FEE_USDC = 500;
const FEE_WETH = 3000;

// ABIs
const scwAbi  = ["function execute(address to, uint256 value, bytes data) returns (bytes)"];
const npmAbi  = [
  "function balanceOf(address) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function positions(uint256 tokenId) view returns (uint96 nonce,address operator,address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint128 liquidity,uint256 feeGrowthInside0LastX128,uint256 feeGrowthInside1LastX128,uint128 tokensOwed0,uint128 tokensOwed1)",
  "function decreaseLiquidity((uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline)) returns (uint256 amount0, uint256 amount1)",
  "function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max)) returns (uint256 amount0, uint256 amount1)",
  "function mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)) returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)"
];
const routerAbi = [
  "function exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160)) returns (uint256)"
];
const factoryAbi = ["function getPool(address,address,uint24) view returns (address)"];
const poolAbi    = ["function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)"];

// Helpers
function sortLex(a, b) { return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a]; }
function spacingForFee(fee) { if (fee===500) return 10; if (fee===3000) return 60; throw new Error(`Unsupported fee ${fee}`); }
function alignTick(tick, spacing) {
  const lower = Math.floor((tick - spacing * 6) / spacing) * spacing;
  const upper = Math.ceil((tick + spacing * 6) / spacing) * spacing;
  return { lower, upper: upper <= lower ? lower + spacing : upper };
}
async function getPool(provider, tokenA, tokenB, fee) {
  const f = new ethers.Contract(FACTORY, factoryAbi, provider);
  const [t0, t1] = sortLex(tokenA, tokenB);
  return await f.getPool(t0, t1, fee);
}
async function getTick(provider, pool) {
  const p = new ethers.Contract(pool, poolAbi, provider);
  const [, tick] = await p.slot0();
  return Number(tick);
}
function buildExactInputSingleCalldata({ tokenIn, tokenOut, fee, recipient, amountIn, amountOutMinimum=0n, sqrtPriceLimitX96=0n }) {
  const iface = new ethers.Interface(routerAbi);
  const params = [
    tokenIn, tokenOut, fee, recipient,
    Math.floor(Date.now()/1000)+600,
    amountIn, amountOutMinimum, sqrtPriceLimitX96
  ];
  return iface.encodeFunctionData("exactInputSingle", [params]);
}
async function buildMintCalldata(provider, tokenA, tokenB, fee, amountA, amountB, recipient) {
  const npmIface = new ethers.Interface(npmAbi);
  const [t0, t1] = sortLex(tokenA, tokenB);
  const pool = await getPool(provider, tokenA, tokenB, fee);
  if (!pool || pool === ethers.ZeroAddress) throw new Error("Pool not found");
  const tick = await getTick(provider, pool);
  const spacing = spacingForFee(fee);
  const { lower, upper } = alignTick(tick, spacing);

  const amount0Desired = t0.toLowerCase() === tokenA.toLowerCase() ? amountA : amountB;
  const amount1Desired = t0.toLowerCase() === tokenA.toLowerCase() ? amountB : amountA;

  const params = [
    t0, t1, fee, lower, upper,
    amount0Desired, amount1Desired,
    0n, 0n,
    recipient,
    Math.floor(Date.now()/1000)+1800
  ];
  return npmIface.encodeFunctionData("mint", [params]);
}

async function main() {
  if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");
  if (!SCW) throw new Error("Missing SCW_ADDRESS");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);
  const scwIface = new ethers.Interface(scwAbi);
  const npm      = new ethers.Contract(NPM, npmAbi, provider);

  console.log(`EOA: ${wallet.address}`);

  // A) Enumerate SCW positions
  const count = await npm.balanceOf(SCW);
  const tokenIds = [];
  for (let i = 0n; i < count; i++) {
    const id = await npm.tokenOfOwnerByIndex(SCW, i);
    tokenIds.push(Number(id));
  }
  console.log(`Found ${tokenIds.length} positions`);

  // B) For each position: read, then decreaseLiquidity(100%), collect() to SCW
  for (const tokenId of tokenIds) {
    const pos = await npm.positions(tokenId);
    const token0 = pos.token0;
    const token1 = pos.token1;
    const fee    = pos.fee;
    const liquidity = pos.liquidity;

    console.log(`Position #${tokenId} fee=${fee} liq=${liquidity} range=[${pos.tickLower},${pos.tickUpper}]`);

    if (liquidity === 0n) {
      // Still collect owed fees/tokens if any
      const collectData = new ethers.Interface(npmAbi).encodeFunctionData("collect", [[
        tokenId,
        SCW,
        ethers.MaxUint128,
        ethers.MaxUint128
      ]]);
      const execCollect = scwIface.encodeFunctionData("execute", [NPM, 0n, collectData]);
      await wallet.sendTransaction({ to: SCW, data: execCollect, gasLimit: 300000 });
      console.log(`✅ Collected owed tokens for #${tokenId}`);
      continue;
    }

    // decreaseLiquidity: 100% with min=0 (no swaps), just returns underlying to collectible state
    const decData = new ethers.Interface(npmAbi).encodeFunctionData("decreaseLiquidity", [[
      tokenId,
      liquidity,
      0n,
      0n,
      Math.floor(Date.now()/1000)+900
    ]]);
    const execDec = scwIface.encodeFunctionData("execute", [NPM, 0n, decData]);
    await wallet.sendTransaction({ to: SCW, data: execDec, gasLimit: 500000 });
    console.log(`✅ Decreased liquidity for #${tokenId}`);

    // collect to SCW (amount0Max/amount1Max = MaxUint128)
    const collectData = new ethers.Interface(npmAbi).encodeFunctionData("collect", [[
      tokenId,
      SCW,
      ethers.MaxUint128,
      ethers.MaxUint128
    ]]);
    const execCollect = scwIface.encodeFunctionData("execute", [NPM, 0n, collectData]);
    await wallet.sendTransaction({ to: SCW, data: execCollect, gasLimit: 500000 });
    console.log(`✅ Collected tokens for #${tokenId}`);
  }

  // C) Re-mint tiny in-range BWAEZI+USDC (use whatever USDC remains; BWAEZI is abundant)
  const mintBW = ethers.parseEther("0.001");
  // If SCW USDC is ~9.62, we can use 6 for re-mint, leaving buffer for swaps
  const mintUS = ethers.parseUnits("6", 6);

  const mintData = await buildMintCalldata(provider, BWAEZI, USDC, FEE_USDC, mintBW, mintUS, SCW);
  const execMint = scwIface.encodeFunctionData("execute", [NPM, 0n, mintData]);
  await wallet.sendTransaction({ to: SCW, data: execMint, gasLimit: 800000 });
  console.log("✅ Re-minted tiny in-range BWAEZI+USDC");

  // D) Microseed swaps to restore routing and path health

  // 1) 5 USDC → BWAEZI
  const swap1 = buildExactInputSingleCalldata({
    tokenIn: USDC, tokenOut: BWAEZI, fee: FEE_USDC, recipient: SCW,
    amountIn: ethers.parseUnits("5", 6)
  });
  const execSwap1 = scwIface.encodeFunctionData("execute", [ROUTER, 0n, swap1]);
  await wallet.sendTransaction({ to: SCW, data: execSwap1, gasLimit: 500000 });
  console.log("✅ Microseed: 5 USDC → BWAEZI");

  // 2) 2 USDC → WETH
  const swap2 = buildExactInputSingleCalldata({
    tokenIn: USDC, tokenOut: WETH, fee: FEE_USDC, recipient: SCW,
    amountIn: ethers.parseUnits("2", 6)
  });
  const execSwap2 = scwIface.encodeFunctionData("execute", [ROUTER, 0n, swap2]);
  await wallet.sendTransaction({ to: SCW, data: execSwap2, gasLimit: 500000 });
  console.log("✅ Seed: 2 USDC → WETH");

  // 3) tiny WETH → BWAEZI (e.g., 0.0005)
  const swap3 = buildExactInputSingleCalldata({
    tokenIn: WETH, tokenOut: BWAEZI, fee: FEE_WETH, recipient: SCW,
    amountIn: ethers.parseEther("0.0005")
  });
  const execSwap3 = scwIface.encodeFunctionData("execute", [ROUTER, 0n, swap3]);
  await wallet.sendTransaction({ to: SCW, data: execSwap3, gasLimit: 500000 });
  console.log("✅ Tiny: WETH → BWAEZI");

  console.log("🎯 Done: BWAEZI returned to SCW, tiny re-peg established, paths warmed");
}

main().catch(e => console.error("Fatal:", e?.message || e));
