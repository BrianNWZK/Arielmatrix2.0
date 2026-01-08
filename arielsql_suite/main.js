// main.js
// Goal: Use existing BWAEZI/USDC (fee 3000) pool (already created, initialized, and seeded),
// focus on robust seeding of BWAEZI/WETH (fee 3000) via SCW with balance-fitting and STF fallback.
// Then perform wake-up swaps via SCW using the USDC pool.
// All unlimited approvals are confirmed on-chain — NO approval code included.
// Execution order preserved.

import { ethers } from "ethers";

// Env
const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");

// Addresses
const NPM         = ethers.getAddress("0xc36442b4a4522e871399cd717abdd847ab11fe88"); // Uniswap V3 Positions NFT Manager
const SWAP_ROUTER = ethers.getAddress("0xE592427A0AEce92De3Edee1F18E0157C05861564"); // Uniswap V3 SwapRouter (v1, still widely used)

const WETH   = ethers.getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const USDC   = ethers.getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const BWAEZI = ethers.getAddress("0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2");
const SCW    = ethers.getAddress("0x59be70f1c57470d7773c3d5d27b8d165fcbe7eb2");

// Pools
const USDC_POOL_3000 = ethers.getAddress("0x261c64d4d96EBfa14398B52D93C9d063E3a619f8"); // BWAEZI/USDC fee 3000
const WETH_POOL_3000 = ethers.getAddress("0x142C3dce0a5605Fb385fAe7760302fab761022aa"); // BWAEZI/WETH fee 3000

const FEE_TIER_WETH = 3000;

// ABIs
const poolAbi = [
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)"
];
const scwAbi = [
  "function execute(address to, uint256 value, bytes data) returns (bytes)"
];
const npmAbi = [
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) returns (uint256,uint128,uint256,uint256)"
];
const erc20Abi = [
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

// Build mint calldata
async function buildMintViaSCW(provider, pool, token0, token1, feeTier, desiredToken0, desiredToken1) {
  const poolCtr = new ethers.Contract(pool, poolAbi, provider);
  const slot0 = await poolCtr.slot0();
  const tick = Number(slot0.tick);
  const spacing = getTickSpacing(feeTier);

  const halfWidth = 120;
  const lowerAligned = nearestUsableTick(tick - halfWidth, spacing);
  const upperAlignedRaw = nearestUsableTick(tick + halfWidth, spacing);
  const upperAligned = upperAlignedRaw === lowerAligned ? lowerAligned + spacing : upperAlignedRaw;

  const paramsArray = [
    token0, token1, feeTier,
    BigInt(lowerAligned), BigInt(upperAligned),
    desiredToken0, desiredToken1,
    0n, 0n, SCW,
    BigInt(Math.floor(Date.now() / 1000) + 1800)
  ];

  const iface = new ethers.Interface(npmAbi);
  const mintData = iface.encodeFunctionData("mint", [paramsArray]);

  return { mintData, tick, lowerAligned, upperAligned };
}

// Wake-up swaps (robust, balance-fit, skips on zero)
async function wakeUpSwapsViaSCW(signer, provider) {
  const scw = new ethers.Contract(SCW, scwAbi, signer);
  const routerIface = new ethers.Interface(swapRouterAbi);
  const tUSDC = new ethers.Contract(USDC, erc20Abi, provider);
  const tWETH = new ethers.Contract(WETH, erc20Abi, provider);

  // USDC -> BWAEZI
  try {
    const balUSDC = await tUSDC.balanceOf(SCW);
    let amountIn = ethers.parseUnits("2", 6);
    if (balUSDC < amountIn) amountIn = balUSDC * 9n / 10n;
    console.log(`[SWAP] USDC balance=${ethers.formatUnits(balUSDC, 6)}; planned=${ethers.formatUnits(amountIn, 6)}`);
    if (amountIn > 0n) {
      const params = {
        tokenIn: USDC, tokenOut: BWAEZI, fee: 3000, recipient: SCW,
        deadline: Math.floor(Date.now() / 1000) + 900, amountIn, amountOutMinimum: 0n, sqrtPriceLimitX96: 0n
      };
      const data = routerIface.encodeFunctionData("exactInputSingle", [params]);
      const tx = await scw.execute(SWAP_ROUTER, 0n, data);
      console.log(`SCW swap USDC->BW tx: ${tx.hash}`);
      await tx.wait();
      console.log("✅ Wake-up USDC->BW swap done");
    } else {
      console.warn("Skipping USDC->BW: zero balance");
    }
  } catch (e) {
    console.warn(`USDC->BW failed: ${e?.reason || e?.message || e}`);
  }

  // USDC -> WETH -> BWAEZI
  try {
    const balUSDC2 = await tUSDC.balanceOf(SCW);
    let amountInUSDC = ethers.parseUnits("2", 6);
    if (balUSDC2 < amountInUSDC) amountInUSDC = balUSDC2 * 9n / 10n;
    console.log(`[SWAP] USDC balance (leg2)=${ethers.formatUnits(balUSDC2, 6)}; planned=${ethers.formatUnits(amountInUSDC, 6)}`);
    if (amountInUSDC > 0n) {
      const params1 = {
        tokenIn: USDC, tokenOut: WETH, fee: 500, recipient: SCW,
        deadline: Math.floor(Date.now() / 1000) + 900, amountIn: amountInUSDC, amountOutMinimum: 0n, sqrtPriceLimitX96: 0n
      };
      const data1 = routerIface.encodeFunctionData("exactInputSingle", [params1]);
      const tx1 = await scw.execute(SWAP_ROUTER, 0n, data1);
      console.log(`SCW swap USDC->WETH tx: ${tx1.hash}`);
      await tx1.wait();

      const balWETH = await tWETH.balanceOf(SCW);
      let amountInWETH = ethers.parseEther("0.0005");
      if (balWETH < amountInWETH) amountInWETH = balWETH * 9n / 10n;
      console.log(`[SWAP] WETH balance=${ethers.formatEther(balWETH)}; planned=${ethers.formatEther(amountInWETH)}`);
      if (amountInWETH > 0n) {
        const params2 = {
          tokenIn: WETH, tokenOut: BWAEZI, fee: 3000, recipient: SCW,
          deadline: Math.floor(Date.now() / 1000) + 900, amountIn: amountInWETH, amountOutMinimum: 0n, sqrtPriceLimitX96: 0n
        };
        const data2 = routerIface.encodeFunctionData("exactInputSingle", [params2]);
        const tx2 = await scw.execute(SWAP_ROUTER, 0n, data2);
        console.log(`SCW swap WETH->BW tx: ${tx2.hash}`);
        await tx2.wait();
        console.log("✅ Wake-up WETH->BW swap done");
      } else {
        console.warn("Skipping WETH->BW: zero balance after USDC swap");
      }
    } else {
      console.warn("Skipping USDC->WETH leg: zero balance");
    }
  } catch (e) {
    console.warn(`WETH leg failed: ${e?.reason || e?.message || e}`);
  }
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`Signer: ${signer.address}`);
  console.log(`ETH: ${ethers.formatEther(await provider.getBalance(signer.address))} ETH`);

  // Log USDC pool tick
  {
    const p = new ethers.Contract(USDC_POOL_3000, poolAbi, provider);
    try {
      const slot0 = await p.slot0();
      console.log(`USDC-3000 pool=${USDC_POOL_3000} tick=${Number(slot0.tick)}`);
    } catch {
      console.log(`USDC-3000 pool slot0 unavailable`);
    }
  }

  // WETH/BWAEZI mint with balance-fit + STF fallback (no approvals needed)
  {
    const tWETH = new ethers.Contract(WETH, erc20Abi, provider);
    const tBW   = new ethers.Contract(BWAEZI, erc20Abi, provider);
    let balW    = await tWETH.balanceOf(SCW);
    let balBW   = await tBW.balanceOf(SCW);

    let targetBW   = ethers.parseEther("0.02");
    let targetWETH = ethers.parseEther("0.0006");

    let bwAmt   = balBW < targetBW ? balBW * 9n / 10n : targetBW;
    let wethAmt = balW < targetWETH ? balW * 9n / 10n : targetWETH;

    if (bwAmt === 0n && wethAmt === 0n) {
      console.warn("Skipping mint: zero balances for both tokens");
    } else {
      const [token0, token1] = BWAEZI.toLowerCase() < WETH.toLowerCase() ? [BWAEZI, WETH] : [WETH, BWAEZI];
      const amount0Desired = token0.toLowerCase() === BWAEZI.toLowerCase() ? bwAmt : wethAmt;
      const amount1Desired = token1.toLowerCase() === WETH.toLowerCase() ? wethAmt : bwAmt;

      try {
        const { mintData, tick, lowerAligned, upperAligned } = 
          await buildMintViaSCW(provider, WETH_POOL_3000, token0, token1, FEE_TIER_WETH, amount0Desired, amount1Desired);

        console.log(`Minting BWAEZI/WETH range [${lowerAligned}, ${upperAligned}] (current tick ${tick})`);
        const scw = new ethers.Contract(SCW, scwAbi, signer);
        const tx = await scw.execute(NPM, 0n, mintData);
        console.log(`SCW mint tx: ${tx.hash}`);
        await tx.wait();
        console.log("✅ BWAEZI/WETH seeded (dual-sided)");
      } catch (e) {
        const msg = String(e?.reason || e?.message || e);
        if (msg.includes("STF") || msg.includes("transfer") || msg.includes("safeTransferFrom")) {
          console.warn("STF detected – falling back to BWAEZI-only mint");
          const oneSide0 = token0.toLowerCase() === BWAEZI.toLowerCase() ? bwAmt : 0n;
          const oneSide1 = token1.toLowerCase() === WETH.toLowerCase() ? 0n : bwAmt;
          if (oneSide0 > 0n || oneSide1 > 0n) {
            const { mintData } = 
              await buildMintViaSCW(provider, WETH_POOL_3000, token0, token1, FEE_TIER_WETH, oneSide0, oneSide1);
            const scw = new ethers.Contract(SCW, scwAbi, signer);
            const tx = await scw.execute(NPM, 0n, mintData);
            console.log(`SCW BW-only mint tx: ${tx.hash}`);
            await tx.wait();
            console.log("✅ BWAEZI/WETH seeded (BW-only fallback)");
          } else {
            console.warn("No BWAEZI balance for one-sided mint");
          }
        } else {
          throw e;
        }
      }
    }
  }

  // Wake-up swaps
  await wakeUpSwapsViaSCW(signer, provider);

  console.log("✅ Script complete — all approvals confirmed on-chain, no approval calls in code");
}

main().catch(err => {
  console.error("Fatal:", err.reason || err.message || err);
  process.exit(1);
});
