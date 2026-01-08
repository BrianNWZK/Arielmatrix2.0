// main.js
// Goal: Use existing BWAEZI/USDC (fee 3000) pool (already created, initialized, and seeded),
// update with the new pool address for swaps, and focus on seeding BWAEZI/WETH (fee 3000) with
// robust minting via SCW (approvals, balance-fit, STF fallback). Then run wake-up swaps via SCW.
//
// Pattern mirrors your WETH/BWAEZI script: EOA signer calls SCW.execute(NPM.mint).
// No factory/create/init for USDC pool (removed per instruction). USDC pool address is fixed.
// Adds explicit approvals, balance checks, and STF fallback for the WETH leg.

import { ethers } from "ethers";

// Env
const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");

// Addresses
const NPM         = ethers.getAddress("0xc36442b4a4522e871399cd717abdd847ab11fe88");
const SWAP_ROUTER = ethers.getAddress("0xE592427A0AEce92De3Edee1F18E0157C05861564");

const WETH   = ethers.getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const USDC   = ethers.getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const BWAEZI = ethers.getAddress("0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2");
const SCW    = ethers.getAddress("0x59be70f1c57470d7773c3d5d27b8d165fcbe7eb2");

// Pools
const USDC_POOL_3000 = ethers.getAddress("0x261c64d4d96EBfa14398B52D93C9d063E3a619f8"); // new BWAEZI/USDC fee 3000 (created & seeded)
const WETH_POOL_3000 = ethers.getAddress("0x142C3dce0a5605Fb385fAe7760302fab761022aa"); // BWAEZI/WETH fee 3000

const FEE_TIER_WETH = 3000; // 0.3%

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
const erc20Abi = [
  "function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)"
];
const swapRouterAbi = [
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)"
];

// Tick helpers
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

// Approvals via SCW
async function ensureApprovalViaSCW(signer, token, spender, minAmount) {
  const t = new ethers.Contract(token, erc20Abi, signer);
  const allowance = await t.allowance(SCW, spender);
  if (allowance >= minAmount) return;

  const iface = new ethers.Interface(erc20Abi);
  const data = iface.encodeFunctionData("approve", [spender, ethers.MaxUint256]);
  const scw = new ethers.Contract(SCW, scwAbi, signer);
  const tx = await scw.execute(token, 0n, data);
  console.log(`SCW approve ${token} -> ${spender} tx: ${tx.hash}`);
  await tx.wait();
  console.log(`✅ Approved ${token} for ${spender}`);
}

// Build SCW.execute for NPM.mint with tight band
async function buildMintViaSCW(provider, pool, token0, token1, feeTier, desiredToken0, desiredToken1) {
  const poolCtr = new ethers.Contract(pool, poolAbi, provider);
  const slot0 = await poolCtr.slot0();
  const tick = Number(slot0.tick);
  const spacing = getTickSpacing(feeTier);

  const halfWidth = 120;
  const lowerAligned = nearestUsableTick(tick - halfWidth, spacing);
  const upperAlignedRaw = nearestUsableTick(tick + halfWidth, spacing);
  const upperAligned = upperAlignedRaw === lowerAligned ? lowerAligned + spacing : upperAlignedRaw;

  const params = {
    token0,
    token1,
    fee: feeTier,
    tickLower: BigInt(lowerAligned),
    tickUpper: BigInt(upperAligned),
    amount0Desired: desiredToken0,
    amount1Desired: desiredToken1,
    amount0Min: 0,
    amount1Min: 0,
    recipient: SCW,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 1800)
  };

  const iface = new ethers.Interface(npmAbi);
  const mintData = iface.encodeFunctionData("mint", [params]);

  return { mintData, tick, spacing, lowerAligned, upperAligned };
}

// Wake-up swaps via SCW (uses the fixed USDC pool address context)
async function wakeUpSwapsViaSCW(signer) {
  const scw = new ethers.Contract(SCW, scwAbi, signer);
  const routerIface = new ethers.Interface(swapRouterAbi);

  // USDC -> BWAEZI (fee 3000) small swap
  {
    const params = {
      tokenIn: USDC,
      tokenOut: BWAEZI,
      fee: 3000,
      recipient: SCW,
      deadline: Math.floor(Date.now() / 1000) + 900,
      amountIn: ethers.parseUnits("2", 6),
      amountOutMinimum: 0n,
      sqrtPriceLimitX96: 0n
    };
    const data = routerIface.encodeFunctionData("exactInputSingle", [params]);
    const tx = await scw.execute(SWAP_ROUTER, 0n, data);
    console.log(`SCW swap USDC->BW (2 USDC) tx: ${tx.hash}`);
    await tx.wait();
    console.log("✅ Wake-up USDC->BW swap done");
  }

  // USDC -> WETH (fee 500) then WETH -> BWAEZI (fee 3000)
  {
    const params1 = {
      tokenIn: USDC,
      tokenOut: WETH,
      fee: 500, // change to 3000 if your USDC/WETH tier is 3000
      recipient: SCW,
      deadline: Math.floor(Date.now() / 1000) + 900,
      amountIn: ethers.parseUnits("2", 6),
      amountOutMinimum: 0n,
      sqrtPriceLimitX96: 0n
    };
    const data1 = routerIface.encodeFunctionData("exactInputSingle", [params1]);
    const tx1 = await scw.execute(SWAP_ROUTER, 0n, data1);
    console.log(`SCW swap USDC->WETH (2 USDC) tx: ${tx1.hash}`);
    await tx1.wait();

    const params2 = {
      tokenIn: WETH,
      tokenOut: BWAEZI,
      fee: 3000,
      recipient: SCW,
      deadline: Math.floor(Date.now() / 1000) + 900,
      amountIn: ethers.parseEther("0.0005"),
      amountOutMinimum: 0n,
      sqrtPriceLimitX96: 0n
    };
    const data2 = routerIface.encodeFunctionData("exactInputSingle", [params2]);
    const tx2 = await scw.execute(SWAP_ROUTER, 0n, data2);
    console.log(`SCW swap WETH->BW (0.0005 WETH) tx: ${tx2.hash}`);
    await tx2.wait();
    console.log("✅ Wake-up WETH->BW swap done");
  }
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`Signer: ${signer.address}`);
  console.log(`ETH: ${ethers.formatEther(await provider.getBalance(signer.address))} ETH`);

  // USDC/BWAEZI pool is already created/initialized/seeded. Log its tick for visibility.
  {
    const p = new ethers.Contract(USDC_POOL_3000, poolAbi, provider);
    try {
      const slot0 = await p.slot0();
      console.log(`USDC-3000 pool=${USDC_POOL_3000} tick=${Number(slot0[1])}`);
    } catch {
      console.log(`USDC-3000 pool=${USDC_POOL_3000} slot0 unavailable`);
    }
  }

  // WETH leg: approvals, balance-fit, STF fallback mint via SCW
  {
    const tWETH = new ethers.Contract(WETH, erc20Abi, provider);
    const tBW   = new ethers.Contract(BWAEZI, erc20Abi, provider);
    const balW  = await tWETH.balanceOf(SCW);
    const balBW = await tBW.balanceOf(SCW);

    let bwAmt   = ethers.parseEther("0.02");     // target BW
    let wethAmt = ethers.parseEther("0.0006");   // target WETH

    // Fit to balances
    if (balBW < bwAmt) bwAmt = balBW;
    if (balW  < wethAmt) wethAmt = balW * 9n / 10n; // keep 10% margin

    // Ensure approvals
    await ensureApprovalViaSCW(signer, BWAEZI, NPM, bwAmt);
    await ensureApprovalViaSCW(signer, WETH,   NPM, wethAmt);

    // Determine token order for WETH pool
    const [wethT0, wethT1] = BWAEZI.toLowerCase() < WETH.toLowerCase() ? [BWAEZI, WETH] : [WETH, BWAEZI];

    // Build two-sided mint
    const amount0Desired = wethT0.toLowerCase() === BWAEZI.toLowerCase() ? bwAmt  : wethAmt;
    const amount1Desired = wethT1.toLowerCase() === WETH.toLowerCase()   ? wethAmt : bwAmt;

    try {
      const { mintData, tick, spacing, lowerAligned, upperAligned } =
        await buildMintViaSCW(provider, WETH_POOL_3000, wethT0, wethT1, FEE_TIER_WETH, amount0Desired, amount1Desired);

      console.log(`Mint BWAEZI/WETH via SCW — pool=${WETH_POOL_3000}, range [${lowerAligned}, ${upperAligned}] (tick: ${tick}, spacing: ${spacing})`);
      const scw = new ethers.Contract(SCW, scwAbi, signer);
      const tx = await scw.execute(NPM, 0n, mintData);
      console.log(`SCW execute (WETH-3000 mint) tx: ${tx.hash}`);
      const rc = await tx.wait();
      console.log(`✅ BWAEZI/WETH seeded via SCW — block ${rc.blockNumber}`);
    } catch (e) {
      const msg = String(e?.reason || e?.message || "");
      if (msg.includes("STF") || msg.includes("transfer") || msg.includes("safeTransferFrom")) {
        console.warn("STF on WETH mint — retrying one-sided BWAEZI-only mint");

        const oneSide0 = wethT0.toLowerCase() === BWAEZI.toLowerCase() ? bwAmt  : 0n;
        const oneSide1 = wethT1.toLowerCase() === WETH.toLowerCase()   ? 0n     : bwAmt;

        const { mintData } =
          await buildMintViaSCW(provider, WETH_POOL_3000, wethT0, wethT1, FEE_TIER_WETH, oneSide0, oneSide1);

        const scw = new ethers.Contract(SCW, scwAbi, signer);
        const tx = await scw.execute(NPM, 0n, mintData);
        console.log(`SCW execute (WETH-3000 BW-only mint) tx: ${tx.hash}`);
        const rc = await tx.wait();
        console.log(`✅ BWAEZI/WETH BW-only seeded via SCW — block ${rc.blockNumber}`);
      } else {
        throw e;
      }
    }
  }

  // Wake-up swaps using the fixed USDC pool address context
  await wakeUpSwapsViaSCW(signer);

  console.log("✅ Deploy complete — USDC pool fixed address used for swaps, WETH leg seeded with robust flow, wake-up swaps done.");
}

main().catch(err => {
  console.error("Fatal:", err.reason || err.message || err);
  process.exit(1);
});
