// main.js
// Drain only positions in the exact BWAEZI/USDC pool address, and only if liquidity > 2
// Ethers v6 — decreaseLiquidity + collect, then bind to port

import { ethers } from "ethers";
import http from "http";

// Env
const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SCW         = ethers.getAddress(process.env.SCW_ADDRESS || "0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2");
const PORT        = Number(process.env.PORT || 8080);

if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");

// Addresses
const NPM              = ethers.getAddress("0xC36442b4a4522E871399CD717aBDD847Ab11FE88"); // NonfungiblePositionManager
const UNIV3_FACTORY    = ethers.getAddress("0x1F98431c8aD98523631AE4a59f267346ea31F984");
const POOL_BW_USDC     = ethers.getAddress("0xe09e69Cf5d9f1BA67477b9720FAB7eb7883B4562"); // fee 500 spacing 10

// Tokens (mainnet)
const BWAEZI           = ethers.getAddress("0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2");
const USDC             = ethers.getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");

// ABIs
const npmAbi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function positions(uint256 tokenId) view returns (uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
  "function decreaseLiquidity((uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline)) returns (uint256,uint256)",
  "function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max)) returns (uint256,uint256)"
];
const factoryAbi = [
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)"
];
const scwAbi = ["function execute(address to, uint256 value, bytes data) returns (bytes)"];

function nowTs() { return Math.floor(Date.now()/1000); }
const UINT128_MAX = BigInt("0xffffffffffffffffffffffffffffffff");

async function scwExecute(wallet, to, data, label) {
  const scwIface = new ethers.Interface(scwAbi);
  const execData = scwIface.encodeFunctionData("execute", [ethers.getAddress(to), 0n, data]);
  const tx = await wallet.sendTransaction({ to: SCW, data: execData, gasLimit: 900000 });
  console.log(`${label}: ${tx.hash}`);
  const rc = await tx.wait();
  return rc.status === 1;
}

async function resolvePool(provider, token0, token1, fee) {
  const factory = new ethers.Contract(UNIV3_FACTORY, factoryAbi, provider);
  // Factory expects tokenA < tokenB (sorted) internally; it handles order, but we’ll query both ways to be safe
  const pool1 = await factory.getPool(token0, token1, fee);
  if (pool1 && pool1 !== ethers.ZeroAddress) return ethers.getAddress(pool1);
  const pool2 = await factory.getPool(token1, token0, fee);
  if (pool2 && pool2 !== ethers.ZeroAddress) return ethers.getAddress(pool2);
  return ethers.ZeroAddress;
}

async function drainIfTargetPool(wallet, provider, tokenId) {
  const npmRead  = new ethers.Contract(NPM, npmAbi, provider);
  const npmIface = new ethers.Interface(npmAbi);

  const pos      = await npmRead.positions(tokenId);
  const token0   = ethers.getAddress(pos[2]);
  const token1   = ethers.getAddress(pos[3]);
  const fee      = Number(pos[4]);
  const liq      = BigInt(pos[7]);

  // Resolve actual pool for this position
  const derivedPool = await resolvePool(provider, token0, token1, fee);

  console.log(`NFT #${tokenId} pair=[${token0},${token1}] fee=${fee} liquidity=${liq} pool=${derivedPool}`);

  // Strict match: only act if this NFT maps to the exact pool address provided
  const isBWUSDC = (token0 === BWAEZI && token1 === USDC) || (token0 === USDC && token1 === BWAEZI);
  const poolMatch = derivedPool === POOL_BW_USDC && fee === 500 && isBWUSDC;

  if (!poolMatch) {
    console.log("Pool/address/fee mismatch — skipping to save gas");
    return;
  }

  // Only act if liquidity > 2
  if (liq > 2n) {
    const decTuple = [BigInt(tokenId), liq, 0n, 0n, BigInt(nowTs()+1200)];
    const decData  = npmIface.encodeFunctionData("decreaseLiquidity", [decTuple]);
    try { await scwExecute(wallet, NPM, decData, `decreaseLiquidity #${tokenId}`); }
    catch (e) { console.warn(`decreaseLiquidity error: ${e?.message||e}`); }

    const collectTuple = [BigInt(tokenId), SCW, UINT128_MAX, UINT128_MAX];
    const collectData  = npmIface.encodeFunctionData("collect", [collectTuple]);
    try { await scwExecute(wallet, NPM, collectData, `collect #${tokenId}`); }
    catch (e) { console.warn(`collect error: ${e?.message||e}`); }
  } else {
    console.log("Liquidity ≤ 2 — skipping to save gas");
  }
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`EOA: ${wallet.address}`);
  console.log(`ETH: ${ethers.formatEther(await provider.getBalance(wallet.address))} ETH`);

  // Enumerate NFTs owned by SCW (read-only, no gas)
  const npmRead = new ethers.Contract(NPM, npmAbi, provider);
  const bal     = await npmRead.balanceOf(SCW);
  console.log(`SCW owns ${bal} position NFTs`);

  for (let i = 0; i < Number(bal); i++) {
    const tid = await npmRead.tokenOfOwnerByIndex(SCW, i);
    await drainIfTargetPool(wallet, provider, Number(tid));
  }

  console.log("✅ Drain complete (only NFTs in target pool with liquidity > 2)");

  // Bind to port
  http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, status: "drain-target-pool-liq>2-complete", ts: Date.now() }));
  }).listen(PORT, () => {
    console.log(`🌐 Server listening on port ${PORT}`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => console.error("Fatal:", e.message));
}
