// repair-and-warmup.js
// Ethers v6 — Uniswap V3 position clean-up, tiny re-mint, microseed swaps
// Resumes from a specific tokenId (defaults to 1166159), skips already-known errors inline.
// Includes a simple HTTP server for port binding (set PORT or use default 8080).

import { ethers } from "ethers";
import http from "http";

// Env
const RPC_URL         = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY     = process.env.PRIVATE_KEY;
const SCW             = ethers.getAddress(process.env.SCW_ADDRESS || "0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2");
const TOKEN_ID_START  = Number(process.env.TOKEN_ID_START || 1166147);
const PORT            = Number(process.env.PORT || 8080);

if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");

// Core contracts
const NPM     = ethers.getAddress("0xC36442b4a4522E871399CD717aBDD847Ab11FE88");
const ROUTER  = ethers.getAddress("0xE592427A0AEce92De3Edee1F18E0157C05861564");
const FACTORY = ethers.getAddress("0x1F98431c8aD98523631AE4a59f267346ea31F984");

// Tokens
const BWAEZI = ethers.getAddress("0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2");
const USDC   = ethers.getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const WETH   = ethers.getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");

// Pools (known)
const POOL_BW_USDC = ethers.getAddress("0xe09e69Cf5d9f1BA67477b9720FAB7eb7883B4562"); // fee 500, spacing 10
const POOL_BW_WETH = ethers.getAddress("0x142C3dce0a5605Fb385fAe7760302fab761022aa"); // fee 3000, spacing 60

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
const poolViewAbi = [
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)",
  "function tickSpacing() view returns (int24)"
];
const routerAbi = [
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut)"
];
const factoryAbi = ["function getPool(address,address,uint24) view returns (address)"];

function nowTs() { return Math.floor(Date.now()/1000); }
function sortTokens(a, b) { return (a.toLowerCase() < b.toLowerCase()) ? [a,b] : [b,a]; }
function snapTick(t, spacing) {
  const s = Number(spacing);
  return Math.floor(Number(t) / s) * s;
}
function feeSpacing(fee) {
  if (fee === 500) return 10;
  if (fee === 3000) return 60;
  if (fee === 10000) return 200;
  return 10;
}
const UINT128_MAX = BigInt("0xffffffffffffffffffffffffffffffff");

// SCW forwarding
async function scwExecute(wallet, to, data, label) {
  const scwIface = new ethers.Interface(scwAbi);
  const execData = scwIface.encodeFunctionData("execute", [ethers.getAddress(to), 0n, data]);
  const tx = await wallet.sendTransaction({ to: SCW, data: execData, gasLimit: 800000 });
  console.log(`${label}: ${tx.hash}`);
  const rc = await tx.wait();
  if (rc.status !== 1) throw new Error(`${label} reverted`);
  return rc.transactionHash;
}

// Enumerate position NFTs
async function listPositions(provider) {
  const npmRead = new ethers.Contract(NPM, npmAbi, provider);
  const bal = await npmRead.balanceOf(SCW);
  const count = Number(bal);
  const tokenIds = [];
  for (let i = 0; i < count; i++) {
    const tid = await npmRead.tokenOfOwnerByIndex(SCW, i);
    tokenIds.push(Number(tid));
  }
  return tokenIds;
}

// Withdraw (decrease + collect)
async function withdrawPosition(wallet, provider, tokenId) {
  const npmIface = new ethers.Interface(npmAbi);
  const npmRead = new ethers.Contract(NPM, npmAbi, provider);
  const pos = await npmRead.positions(tokenId);

  const liquidity = BigInt(pos[7]); // uint128
  const fee = Number(pos[4]);
  const tickLower = Number(pos[5]);
  const tickUpper = Number(pos[6]);

  console.log(`Position #${tokenId} fee=${fee} liq=${liquidity} range=[${tickLower},${tickUpper}]`);

  // decreaseLiquidity if liq > 0
  if (liquidity > 0n) {
    const decTuple = [
      BigInt(tokenId),
      liquidity,
      0n, // amount0Min
      0n, // amount1Min
      BigInt(nowTs() + 1200) // deadline
    ];
    const decData = npmIface.encodeFunctionData("decreaseLiquidity", [decTuple]);
    try {
      await scwExecute(wallet, NPM, decData, `decreaseLiquidity #${tokenId}`);
    } catch (e) {
      const msg = e?.message || String(e);
      if (msg.includes("already known")) {
        console.warn(`decreaseLiquidity already known for #${tokenId}; proceeding to collect`);
      } else {
        console.warn(`decreaseLiquidity failed for #${tokenId}: ${msg}`);
      }
    }
  } else {
    console.log(`Position #${tokenId} already at 0 liquidity; skipping decreaseLiquidity`);
  }

  // collect owed
  const collectTuple = [
    BigInt(tokenId),
    SCW,
    UINT128_MAX,
    UINT128_MAX
  ];
  const collectData = npmIface.encodeFunctionData("collect", [collectTuple]);
  try {
    await scwExecute(wallet, NPM, collectData, `collect #${tokenId}`);
  } catch (e) {
    const msg = e?.message || String(e);
    console.warn(`collect failed for #${tokenId}: ${msg}`);
    // Optional short retry for transient hiccups
    try {
      await new Promise(r => setTimeout(r, 1500));
      await scwExecute(wallet, NPM, collectData, `collect(retry) #${tokenId}`);
    } catch (e2) {
      console.warn(`collect retry failed for #${tokenId}: ${e2?.message || e2}`);
    }
  }
}

// Mint tiny in-range centered at live tick (BWAEZI/USDC fee=500)
async function mintTinyInRange(wallet, provider) {
  const pool = new ethers.Contract(POOL_BW_USDC, poolViewAbi, provider);
  const npmIface = new ethers.Interface(npmAbi);

  const slot0 = await pool.slot0();
  const tick = Number(slot0[1]);

  let spacing;
  try {
    spacing = await pool.tickSpacing();
  } catch {
    spacing = feeSpacing(500);
  }
  const s = Number(spacing);

  const tl = snapTick(tick - 6 * s, s);
  const tu = snapTick(tick + 6 * s, s);
  if (tl >= tu) throw new Error("Invalid tiny range after snap");

  const [token0, token1] = sortTokens(BWAEZI, USDC);
  const isBW0 = token0.toLowerCase() === BWAEZI.toLowerCase();

  const tinyBW = ethers.parseEther("0.001");   // ~0.001 BWAEZI
  const tinyUS = ethers.parseUnits("6", 6);    // ~6 USDC

  const amount0Desired = isBW0 ? tinyBW : tinyUS;
  const amount1Desired = isBW0 ? tinyUS : tinyBW;

  const paramsArray = [
    token0,
    token1,
    500,            // fee
    tl,
    tu,
    amount0Desired,
    amount1Desired,
    0n,             // amount0Min
    0n,             // amount1Min
    SCW,
    BigInt(nowTs() + 1200)
  ];

  const mintData = npmIface.encodeFunctionData("mint", [paramsArray]);
  await scwExecute(wallet, NPM, mintData, "mint tiny in-range BWAEZI/USDC");
}

// Microseed swaps (USDC→BWAEZI, USDC→WETH, WETH→BWAEZI)
async function microseedSwaps(wallet) {
  const routerIface = new ethers.Interface(routerAbi);

  // 1) USDC -> BWAEZI (5 USDC)
  {
    const amountIn = ethers.parseUnits("5", 6);
    const call = [
      USDC, BWAEZI, 500, SCW,
      BigInt(nowTs() + 600),
      amountIn, 0n, 0n
    ];
    const data = routerIface.encodeFunctionData("exactInputSingle", [call]);
    await scwExecute(wallet, ROUTER, data, "swap USDC->BWAEZI 5 USDC");
  }

  // 2) USDC -> WETH (2 USDC) using 0.05% pool
  {
    const amountIn = ethers.parseUnits("2", 6);
    const call = [
      USDC, WETH, 500, SCW,
      BigInt(nowTs() + 600),
      amountIn, 0n, 0n
    ];
    const data = routerIface.encodeFunctionData("exactInputSingle", [call]);
    await scwExecute(wallet, ROUTER, data, "swap USDC->WETH 2 USDC");
  }

  // 3) WETH -> BWAEZI (tiny) via 0.3% pool
  {
    const amountIn = ethers.parseEther("0.0005");
    const call = [
      WETH, BWAEZI, 3000, SCW,
      BigInt(nowTs() + 600),
      amountIn, 0n, 0n
    ];
    const data = routerIface.encodeFunctionData("exactInputSingle", [call]);
    await scwExecute(wallet, ROUTER, data, "swap WETH->BWAEZI tiny");
  }
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`EOA: ${wallet.address}`);
  console.log(`ETH: ${ethers.formatEther(await provider.getBalance(wallet.address))} ETH`);

  // 1) Enumerate positions
  const ids = await listPositions(provider);
  console.log(`Found ${ids.length} positions`);

  // 2) Withdraw each position, resuming from TOKEN_ID_START
  for (const tid of ids) {
    if (TOKEN_ID_START && tid < TOKEN_ID_START) continue;
    try {
      await withdrawPosition(wallet, provider, tid);
    } catch (e) {
      console.warn(`Withdraw failed for #${tid}: ${e?.message || e}`);
    }
  }

  // 3) Mint tiny in-range BWAEZI/USDC
  try {
    await mintTinyInRange(wallet, provider);
  } catch (e) {
    console.warn(`Mint tiny in-range failed: ${e?.message || e}`);
  }

  // 4) Microseed swaps (wake routing/prices)
  try {
    await microseedSwaps(wallet);
  } catch (e) {
    console.warn(`Microseed swaps failed: ${e?.message || e}`);
  }

  console.log("✅ Repair + warm-up flow complete");

  // Simple keep-alive HTTP server for port binding
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      status: "repair-and-warmup",
      tokenIdStart: TOKEN_ID_START,
      ts: Date.now()
    }));
  });
  server.listen(PORT, () => {
    console.log(`🌐 Keep-alive server listening on port ${PORT}`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => console.error("Fatal:", e.message));
}

export {
  listPositions,
  withdrawPosition,
  mintTinyInRange,
  microseedSwaps
};
