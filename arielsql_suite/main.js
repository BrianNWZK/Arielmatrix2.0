// withdraw-and-repeg.js — Safely withdraw BWAEZI back to SCW, then re-peg gently
// Steps:
// A) Enumerate SCW's Uniswap V3 positions (bwzC/USDC fee 500, bwzC/WETH fee 3000)
// B) For each position: decreaseLiquidity(100%), then collect() to SCW (no swaps)
// C) Re-mint tiny in-range BWAEZI+USDC
// D) Microseed: 5 USDC → BWAEZI; 2 USDC → WETH; tiny WETH → BWAEZI
//
// Maintains all capabilities, adds address normalization, allowance checks, and pool tick alignment.

import { ethers } from "ethers";

const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;       // EOA signer for SCW.execute relays
const SCW_RAW     = process.env.SCW_ADDRESS;

// Core contracts (mainnet)
const NPM    = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88"; // Uniswap V3 Position Manager
const ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564"; // Uniswap V3 Router
const FACTORY= "0x1F98431c8aD98523631AE4a59f267346ea31F984";

// Tokens
const BWAEZI = "0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2";
const USDC   = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WETH   = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

// Pools (plain strings)
const POOL_BW_USDC = "0xe09e69Cf5d9f1BA67477b9720FAB7eb7883B4562"; // fee 500, spacing 10
const POOL_BW_WETH = "0x142C3dce0a5605Fb385fAe7760302fab761022aa"; // fee 3000, spacing 60

// Fee tiers
const FEE_USDC = 500;
const FEE_WETH = 3000;

// ABIs
const scwAbi   = ["function execute(address to, uint256 value, bytes data) returns (bytes)"];
const npmAbi   = [
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
const erc20Abi   = [
  "function approve(address spender,uint256 amount) returns (bool)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function decimals() view returns (uint8)"
];

// Helpers
function norm(a) { return ethers.getAddress(a); }
const SCW = (() => {
  if (!SCW_RAW || !SCW_RAW.startsWith("0x") || SCW_RAW.length !== 42) throw new Error("Missing or invalid SCW_ADDRESS");
  return norm(SCW_RAW);
})();

function sortLex(a, b) { return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a]; }
function spacingForFee(fee) { if (fee===500) return 10; if (fee===3000) return 60; throw new Error(`Unsupported fee ${fee}`); }

function alignTick(tick, spacing, pad = 6) {
  const lower = Math.floor((tick - spacing * pad) / spacing) * spacing;
  const upperAligned = Math.ceil((tick + spacing * pad) / spacing) * spacing;
  const upper = upperAligned <= lower ? lower + spacing : upperAligned;
  return { lower, upper };
}

async function getPool(provider, tokenA, tokenB, fee) {
  const f = new ethers.Contract(FACTORY, factoryAbi, provider);
  const [t0, t1] = sortLex(tokenA, tokenB);
  return await f.getPool(t0, t1, fee);
}

async function getTick(provider, poolAddr) {
  const p = new ethers.Contract(poolAddr, poolAbi, provider);
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

async function buildMintCalldata(provider, tokenA, tokenB, fee, amountA, amountB, recipient, poolAddrHint = null) {
  const npmIface = new ethers.Interface(npmAbi);
  const [t0, t1] = sortLex(tokenA, tokenB);
  const pool = poolAddrHint || await getPool(provider, tokenA, tokenB, fee);
  if (!pool || pool === ethers.ZeroAddress) throw new Error("Pool not found");
  const tick = await getTick(provider, pool);
  const spacing = spacingForFee(fee);
  const { lower, upper } = alignTick(tick, spacing, 6);

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

async function ensureAllowance(provider, wallet, owner, token, spender, minAmount) {
  const c = new ethers.Contract(token, erc20Abi, provider);
  const allowance = await c.allowance(owner, spender);
  if (allowance >= minAmount) return false;

  const approveIface = new ethers.Interface(erc20Abi);
  const data = approveIface.encodeFunctionData("approve", [norm(spender), ethers.MaxUint256]);

  const scwIface = new ethers.Interface(scwAbi);
  const exec = scwIface.encodeFunctionData("execute", [norm(token), 0n, data]);

  const tx = await wallet.sendTransaction({ to: owner, data: exec, gasLimit: 200000 });
  await tx.wait();
  return true;
}

async function mintViaSCW(wallet, mintData, label) {
  const scwIface = new ethers.Interface(scwAbi);
  const execData = scwIface.encodeFunctionData("execute", [norm(NPM), 0n, mintData]);
  console.log(`Calldata length: ${execData.length}`);
  const tx = await wallet.sendTransaction({ to: SCW, data: execData, gasLimit: 800000 });
  console.log(`Mint tx (${label}): ${tx.hash}`);
  const rc = await tx.wait();
  if (rc.status === 1) console.log(`✅ Mint (${label}) succeeded`); else console.log(`❌ Mint (${label}) reverted`);
}

// Main
async function main() {
  if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`EOA: ${wallet.address}`);
  console.log(`ETH: ${ethers.formatEther(await provider.getBalance(wallet.address))} ETH`);

  const npm = new ethers.Contract(NPM, npmAbi, provider);
  const scwIface = new ethers.Interface(scwAbi);

  // A) Enumerate SCW positions
  const count = await npm.balanceOf(SCW);
  const tokenIds = [];
  for (let i = 0n; i < count; i++) {
    const id = await npm.tokenOfOwnerByIndex(SCW, i);
    tokenIds.push(Number(id));
  }
  console.log(`Found ${tokenIds.length} positions`);

  // B) Decrease liquidity 100% and collect to SCW
  for (const tokenId of tokenIds) {
    const pos = await npm.positions(tokenId);
    const token0 = pos.token0;
    const token1 = pos.token1;
    const fee    = pos.fee;
    const liquidity = pos.liquidity;

    console.log(`Position #${tokenId} fee=${fee} liq=${liquidity} range=[${pos.tickLower},${pos.tickUpper}]`);

    if (liquidity > 0n) {
      const decData = new ethers.Interface(npmAbi).encodeFunctionData("decreaseLiquidity", [[
        tokenId,
        liquidity,
        0n,
        0n,
        Math.floor(Date.now()/1000)+900
      ]]);
      const execDec = scwIface.encodeFunctionData("execute", [NPM, 0n, decData]);
      await wallet.sendTransaction({ to: SCW, data: execDec, gasLimit: 500000 }).then(r => r.wait());
      console.log(`✅ Decreased liquidity for #${tokenId}`);
    }

    const collectData = new ethers.Interface(npmAbi).encodeFunctionData("collect", [[
      tokenId,
      SCW,
      ethers.MaxUint128,
      ethers.MaxUint128
    ]]);
    const execCollect = scwIface.encodeFunctionData("execute", [NPM, 0n, collectData]);
    await wallet.sendTransaction({ to: SCW, data: execCollect, gasLimit: 500000 }).then(r => r.wait());
    console.log(`✅ Collected tokens for #${tokenId}`);
  }

  // C) Re-mint tiny in-range BWAEZI+USDC (align to current pool tick)
  const mintBW    = ethers.parseEther("0.001");
  const mintUS    = ethers.parseUnits("6", 6);

  // Ensure SCW approvals to NPM
  await ensureAllowance(provider, wallet, SCW, BWAEZI, NPM, mintBW);
  await ensureAllowance(provider, wallet, SCW, USDC,   NPM, mintUS);

  // Build mint against known pool tick alignment
  const currentTickUSDC = await getTick(provider, POOL_BW_USDC);
  const spacingUSDC     = spacingForFee(FEE_USDC);
  const { lower: tlUS, upper: tuUS } = alignTick(currentTickUSDC, spacingUSDC, 6);

  const [t0US, t1US] = sortLex(BWAEZI, USDC);
  const amount0DesiredUS = t0US.toLowerCase() === BWAEZI.toLowerCase() ? mintBW : mintUS;
  const amount1DesiredUS = t0US.toLowerCase() === BWAEZI.toLowerCase() ? mintUS : mintBW;

  const npmIface = new ethers.Interface(npmAbi);
  const mintParamsUS = [
    t0US, t1US, FEE_USDC, tlUS, tuUS,
    amount0DesiredUS, amount1DesiredUS,
    0n, 0n,
    SCW,
    Math.floor(Date.now()/1000)+1800
  ];
  const mintDataUS = npmIface.encodeFunctionData("mint", [mintParamsUS]);

  await mintViaSCW(wallet, mintDataUS, "tiny in-range BWAEZI+USDC");
  console.log("✅ Re-minted tiny in-range BWAEZI+USDC");

  // D) Microseed swaps to restore routing and path health
  // Ensure SCW approvals to Router (USDC, WETH, BWAEZI)
  await ensureAllowance(provider, wallet, SCW, USDC,  ROUTER, ethers.parseUnits("5", 6));
  await ensureAllowance(provider, wallet, SCW, WETH,  ROUTER, ethers.parseEther("0.001"));
  await ensureAllowance(provider, wallet, SCW, BWAEZI,ROUTER, ethers.parseEther("0.001"));

  // 1) 5 USDC → BWAEZI (direct 0.05% pool)
  const swap1 = buildExactInputSingleCalldata({
    tokenIn: USDC, tokenOut: BWAEZI, fee: FEE_USDC, recipient: SCW,
    amountIn: ethers.parseUnits("5", 6)
  });
  const execSwap1 = scwIface.encodeFunctionData("execute", [ROUTER, 0n, swap1]);
  await wallet.sendTransaction({ to: SCW, data: execSwap1, gasLimit: 500000 }).then(r => r.wait());
  console.log("✅ Microseed: 5 USDC → BWAEZI");

  // 2) 2 USDC → WETH (use USDC/WETH 0.05%)
  const swap2 = buildExactInputSingleCalldata({
    tokenIn: USDC, tokenOut: WETH, fee: FEE_USDC, recipient: SCW,
    amountIn: ethers.parseUnits("2", 6)
  });
  const execSwap2 = scwIface.encodeFunctionData("execute", [ROUTER, 0n, swap2]);
  await wallet.sendTransaction({ to: SCW, data: execSwap2, gasLimit: 500000 }).then(r => r.wait());
  console.log("✅ Seed: 2 USDC → WETH");

  // 3) tiny WETH → BWAEZI (0.3% pool)
  const swap3 = buildExactInputSingleCalldata({
    tokenIn: WETH, tokenOut: BWAEZI, fee: FEE_WETH, recipient: SCW,
    amountIn: ethers.parseEther("0.0005")
  });
  const execSwap3 = scwIface.encodeFunctionData("execute", [ROUTER, 0n, swap3]);
  await wallet.sendTransaction({ to: SCW, data: execSwap3, gasLimit: 500000 }).then(r => r.wait());
  console.log("✅ Tiny: WETH → BWAEZI");

  console.log("🎯 Done: BWAEZI returned to SCW, tiny re-peg established, paths warmed");
}

main().catch(e => console.error("Fatal:", e?.message || e));
