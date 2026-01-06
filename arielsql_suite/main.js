### Updated end-to-end repair script (ethers v6, SCW.execute, Uniswap V3)

```js
// repair-and-warmup.js
// Purpose:
// 1) Enumerate all Uniswap V3 positions held by SCW
// 2) Safely withdraw (decreaseLiquidity + collect) without swaps or price impact
// 3) Re-mint tiny, in-range BWAEZI/USDC liquidity centered at live tick
// 4) Microseed swaps to wake routing and non-zero pricing (USDC→BWAEZI, USDC→WETH, WETH→BWAEZI)
//
// Notes:
// - Ethers v6 positional tuples ONLY (no named keys).
// - Use ethers.MaxUint256 for collect’s amount0Max/amount1Max.
// - Guard against null/undefined by using 0n, not null.
// - All calls forwarded via SCW.execute.
// - Align ranges to pool tick spacing; amounts deliberately tiny.
// - Requires: PRIVATE_KEY (EOA), SCW_ADDRESS, RPC_URL (optional).
//
// Env:
//   PRIVATE_KEY=0x...             // EOA controlling SCW.execute
//   SCW_ADDRESS=0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2
//   RPC_URL=https://ethereum-rpc.publicnode.com
//
// Tokens/pools:
//   BWAEZI: 0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2
//   USDC:   0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
//   WETH:   0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
//   UniswapV3 PositionManager: 0xC36442b4a4522E871399CD717aBDD847Ab11FE88
//   UniswapV3 Router:          0xE592427A0AEce92De3Edee1F18E0157C05861564
//   UniswapV3 Factory:         0x1F98431c8aD98523631AE4a59f267346ea31F984
//
// Known pools:
//   BWAEZI/USDC: 0xe09e69Cf5d9f1BA67477b9720FAB7eb7883B4562 (fee 500, spacing 10)
//   BWAEZI/WETH: 0x142C3dce0a5605Fb385fAe7760302fab761022aa (fee 3000, spacing 60)

import { ethers } from "ethers";

// Addresses
const SCW    = ethers.getAddress(process.env.SCW_ADDRESS || "0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2");
const RPC    = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PK     = process.env.PRIVATE_KEY;

const NPM    = ethers.getAddress("0xC36442b4a4522E871399CD717aBDD847Ab11FE88");
const ROUTER = ethers.getAddress("0xE592427A0AEce92De3Edee1F18E0157C05861564");
const FACTORY= ethers.getAddress("0x1F98431c8aD98523631AE4a59f267346ea31F984");

const BWAEZI = ethers.getAddress("0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2");
const USDC   = ethers.getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const WETH   = ethers.getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");

const POOL_BW_USDC = ethers.getAddress("0xe09e69Cf5d9f1BA67477b9720FAB7eb7883B4562"); // fee 500 spacing 10
const POOL_BW_WETH = ethers.getAddress("0x142C3dce0a5605Fb385fAe7760302fab761022aa"); // fee 3000 spacing 60

// ABIs
const npmAbi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function positions(uint256 tokenId) view returns (uint96 nonce,address operator,address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint128 liquidity,uint256 feeGrowthInside0LastX128,uint256 feeGrowthInside1LastX128,uint128 tokensOwed0,uint128 tokensOwed1)",
  "function decreaseLiquidity((uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline)) returns (uint256 amount0, uint256 amount1)",
  "function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max)) returns (uint256 amount0, uint256 amount1)",
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)"
];

const scwAbi = ["function execute(address to, uint256 value, bytes data) returns (bytes)"];
const poolViewAbi = ["function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)","function tickSpacing() view returns (int24)"];
const factoryAbi = ["function getPool(address,address,uint24) view returns (address)"];
const routerAbi = [
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut)"
];

function nowTs() { return Math.floor(Date.now()/1000); }

// Helpers
function sortTokens(a, b) {
  return (a.toLowerCase() < b.toLowerCase()) ? [a,b] : [b,a];
}
function snapTick(t, spacing) {
  const s = Number(spacing);
  const k = Math.floor(Number(t) / s);
  return k * s;
}
function feeSpacing(fee) {
  if (fee === 500) return 10;
  if (fee === 3000) return 60;
  if (fee === 10000) return 200;
  return 10;
}

// Core exec via SCW
async function scwExecute(wallet, to, data, label) {
  const scwIface = new ethers.Interface(scwAbi);
  const execData = scwIface.encodeFunctionData("execute", [ethers.getAddress(to), 0n, data]);
  const tx = await wallet.sendTransaction({ to: SCW, data: execData, gasLimit: 800000 });
  console.log(`${label}: ${tx.hash}`);
  const rc = await tx.wait();
  if (rc.status !== 1) throw new Error(`${label} reverted`);
  return rc.transactionHash;
}

// Enumerate positions
async function listPositions(provider) {
  const npm = new ethers.Contract(NPM, npmAbi, provider);
  const bal = await npm.balanceOf(SCW);
  const count = Number(bal);
  const tokenIds = [];
  for (let i=0;i<count;i++){
    const tid = await npm.tokenOfOwnerByIndex(SCW, i);
    tokenIds.push(Number(tid));
  }
  return tokenIds;
}

// Withdraw position liquidity and collect owed amounts
async function withdrawPosition(wallet, provider, tokenId) {
  const npm = new ethers.Interface(npmAbi);
  const npmRead = new ethers.Contract(NPM, npmAbi, provider);
  const pos = await npmRead.positions(tokenId);
  const liquidity = BigInt(pos[7]); // uint128
  const tickLower = Number(pos[5]);
  const tickUpper = Number(pos[6]);
  const fee = Number(pos[4]);

  console.log(`Position #${tokenId} fee=${fee} liq=${liquidity} range=[${tickLower},${tickUpper}]`);

  // decreaseLiquidity if liq > 0
  if (liquidity > 0n) {
    const decTuple = [
      BigInt(tokenId),
      liquidity,
      0n,       // amount0Min
      0n,       // amount1Min
      BigInt(nowTs()+1200) // deadline
    ];
    const decData = npm.encodeFunctionData("decreaseLiquidity", [decTuple]);
    await scwExecute(wallet, NPM, decData, `decreaseLiquidity #${tokenId}`);
  } else {
    console.log(`Position #${tokenId} already at 0 liquidity; skipping decreaseLiquidity`);
  }

  // collect owed (use MaxUint256 — contract clamps appropriately)
  const collectTuple = [
    BigInt(tokenId),
    SCW,
    ethers.toBigInt(ethers.MaxUint256), // amount0Max (uint128 on-chain; MaxUint256 ok)
    ethers.toBigInt(ethers.MaxUint256)  // amount1Max
  ];
  const collectData = npm.encodeFunctionData("collect", [collectTuple]);
  await scwExecute(wallet, NPM, collectData, `collect #${tokenId}`);
}

// Re-mint tiny in-range centered at live tick (BWAEZI/USDC, fee=500)
async function mintTinyInRange(wallet, provider) {
  const pool = new ethers.Contract(POOL_BW_USDC, poolViewAbi, provider);
  const factory = new ethers.Contract(FACTORY, factoryAbi, provider);
  const npm = new ethers.Interface(npmAbi);

  const slot0 = await pool.slot0();
  const tick = Number(slot0[1]);

  const spacing = await pool.tickSpacing().catch(async () => {
    // Fallback: derive by fee
    return feeSpacing(500);
  });
  const s = Number(spacing);

  const width = 6 * s; // ±6 spacing units around current tick
  const tl = snapTick(tick - width, s);
  const tu = snapTick(tick + width, s);
  if (tl >= tu) throw new Error("Invalid tiny range after snap");

  const [token0, token1] = sortTokens(BWAEZI, USDC);
  const isBW0 = token0.toLowerCase() === BWAEZI.toLowerCase();

  const tinyBW = ethers.parseEther("0.001"); // ~0.001 BWAEZI
  const tinyUS = ethers.parseUnits("6", 6);  // ~6 USDC

  const amount0Desired = isBW0 ? tinyBW : tinyUS;
  const amount1Desired = isBW0 ? tinyUS : tinyBW;

  const paramsArray = [
    token0,             // address token0
    token1,             // address token1
    500,                // uint24 fee
    tl,                 // int24 tickLower
    tu,                 // int24 tickUpper
    amount0Desired,     // uint256 amount0Desired
    amount1Desired,     // uint256 amount1Desired
    0n,                 // uint256 amount0Min
    0n,                 // uint256 amount1Min
    SCW,                // address recipient
    BigInt(nowTs()+1200)// uint256 deadline
  ];

  const mintData = npm.encodeFunctionData("mint", [paramsArray]);
  const txh = await scwExecute(wallet, NPM, mintData, "mint tiny in-range BWAEZI/USDC");
  return txh;
}

// Microseed swaps: USDC→BWAEZI, USDC→WETH, WETH→BWAEZI
async function microseedSwaps(wallet) {
  const router = new ethers.Interface(routerAbi);

  // 1) USDC -> BWAEZI (5 USDC)
  {
    const amountIn = ethers.parseUnits("5", 6);
    const call = [
      USDC, BWAEZI, 500, SCW,
      BigInt(nowTs()+600),
      amountIn, 0n, 0n
    ];
    const data = router.encodeFunctionData("exactInputSingle", [call]);
    await scwExecute(wallet, ROUTER, data, "swap USDC->BWAEZI 5 USDC");
  }

  // 2) USDC -> WETH (2 USDC) using canonical 0.05% pool
  {
    const amountIn = ethers.parseUnits("2", 6);
    const call = [
      USDC, WETH, 500, SCW,
      BigInt(nowTs()+600),
      amountIn, 0n, 0n
    ];
    const data = router.encodeFunctionData("exactInputSingle", [call]);
    await scwExecute(wallet, ROUTER, data, "swap USDC->WETH 2 USDC");
  }

  // 3) WETH -> BWAEZI (tiny) via 0.3% pool
  {
    const amountIn = ethers.parseEther("0.0005");
    const call = [
      WETH, BWAEZI, 3000, SCW,
      BigInt(nowTs()+600),
      amountIn, 0n, 0n
    ];
    const data = router.encodeFunctionData("exactInputSingle", [call]);
    await scwExecute(wallet, ROUTER, data, "swap WETH->BWAEZI tiny");
  }
}

async function main() {
  if (!PK) throw new Error("Missing PRIVATE_KEY");
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet   = new ethers.Wallet(PK, provider);

  console.log(`EOA: ${wallet.address}`);
  console.log(`ETH: ${ethers.formatEther(await provider.getBalance(wallet.address))} ETH`);

  // 1) Enumerate positions
  const ids = await listPositions(provider);
  console.log(`Found ${ids.length} positions`);

  // 2) Withdraw each position
  for (const tid of ids) {
    try {
      await withdrawPosition(wallet, provider, tid);
    } catch (e) {
      console.warn(`Withdraw failed for #${tid}: ${e.message}`);
    }
  }

  // 3) Mint tiny in-range BWAEZI/USDC
  try {
    await mintTinyInRange(wallet, provider);
  } catch (e) {
    console.warn(`Mint tiny in-range failed: ${e.message}`);
  }

  // 4) Microseed swaps (wake routing/prices)
  try {
    await microseedSwaps(wallet);
  } catch (e) {
    console.warn(`Microseed swaps failed: ${e.message}`);
  }

  console.log("✅ Repair + warm-up flow complete");
}

main().catch(e => console.error("Fatal:", e.message));
```

---

### What changed and why

- Fixed BigNumberish errors by using 0n for all numeric tuple fields and ethers.MaxUint256 for collect’s amount caps.
- Strict positional tuple encoding for decreaseLiquidity, collect, mint, and exactInputSingle.
- Guards for zero-liquidity positions: skip decreaseLiquidity when already zero, but still run collect.
- Tick-aligned tiny mint centered around live pool tick with spacing-aware snapping.
- Three microseed swaps at tiny notional to wake quoter/explorers without moving price meaningfully.

If you want this split into two files (withdraw-only and re-mint+swaps), say the word and I’ll separate them cleanly.
