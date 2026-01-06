// main.js
// Locate, list, and drain only BWAEZI/USDC fee-500 positions with BWAEZI > 0.1
// Ethers v6 — one-time script with HTTP server

import { ethers } from "ethers";
import http from "http";

// Env
const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SCW         = ethers.getAddress(process.env.SCW_ADDRESS || "0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2");
const PORT        = Number(process.env.PORT || 8080);

if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");

// Contracts
const NPM          = ethers.getAddress("0xC36442b4a4522E871399CD717aBDD847Ab11FE88");
const POOL_BW_USDC = ethers.getAddress("0xe09e69Cf5d9f1BA67477b9720FAB7eb7883B4562"); // fee 500 spacing 10

// Tokens
const BWAEZI = ethers.getAddress("0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2");
const USDC   = ethers.getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");

// ABIs
const npmAbi = [
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function positions(uint256 tokenId) view returns (uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
  "function decreaseLiquidity((uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline)) returns (uint256,uint256)",
  "function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max)) returns (uint256,uint256)"
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

async function listPositions(provider) {
  const npmRead = new ethers.Contract(NPM, npmAbi, provider);
  const bal = await npmRead.balanceOf(SCW);
  const ids = [];
  for (let i = 0; i < Number(bal); i++) {
    ids.push(Number(await npmRead.tokenOfOwnerByIndex(SCW, i)));
  }
  return ids;
}

async function inspectAndDrain(wallet, provider, tokenId) {
  const npmRead  = new ethers.Contract(NPM, npmAbi, provider);
  const npmIface = new ethers.Interface(npmAbi);
  const pos      = await npmRead.positions(tokenId);

  const token0 = ethers.getAddress(pos[2]);
  const token1 = ethers.getAddress(pos[3]);
  const fee    = Number(pos[4]);
  const liq    = BigInt(pos[7]);
  const owed0  = BigInt(pos[10]);
  const owed1  = BigInt(pos[11]);

  // Determine which side is BWAEZI
  let bwaeziAmount = 0;
  if (token0 === BWAEZI) bwaeziAmount = Number(ethers.formatEther(owed0));
  if (token1 === BWAEZI) bwaeziAmount = Number(ethers.formatEther(owed1));

  console.log(`Position #${tokenId} pair=[${token0},${token1}] fee=${fee} liquidity=${liq} BWAEZI owed=${bwaeziAmount}`);

  // Only drain BWAEZI/USDC fee-500 positions with BWAEZI > 0.05
  const pairMatch = (token0 === BWAEZI && token1 === USDC) || (token0 === USDC && token1 === BWAEZI);
  if (!pairMatch || fee !== 500 || bwaeziAmount <= 0.1) return;

  if (liq > 0n) {
    const decTuple = [BigInt(tokenId), liq, 0n, 0n, BigInt(nowTs()+1200)];
    const decData  = npmIface.encodeFunctionData("decreaseLiquidity", [decTuple]);
    try { await scwExecute(wallet, NPM, decData, `decreaseLiquidity #${tokenId}`); }
    catch (e) { console.warn(`decreaseLiquidity error for #${tokenId}: ${e?.message||e}`); }
  }

  const collectTuple = [BigInt(tokenId), SCW, UINT128_MAX, UINT128_MAX];
  const collectData  = npmIface.encodeFunctionData("collect", [collectTuple]);
  try { await scwExecute(wallet, NPM, collectData, `collect #${tokenId}`); }
  catch (e) { console.warn(`collect error for #${tokenId}: ${e?.message||e}`); }

  await new Promise(r => setTimeout(r, 1500));
  try { await scwExecute(wallet, NPM, collectData, `collect(retry) #${tokenId}`); }
  catch (e) { console.warn(`collect(retry) error for #${tokenId}: ${e?.message||e}`); }
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`EOA: ${wallet.address}`);
  console.log(`ETH: ${ethers.formatEther(await provider.getBalance(wallet.address))} ETH`);

  const ids = await listPositions(provider);
  console.log(`Found ${ids.length} position NFTs`);

  for (const tid of ids) {
    try { await inspectAndDrain(wallet, provider, tid); }
    catch (e) { console.warn(`Drain failed for #${tid}: ${e?.message||e}`); }
  }

  console.log("✅ Drain complete");

  // Quick HTTP server to bind port
  http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, status: "drain-complete", ts: Date.now() }));
  }).listen(PORT, () => {
    console.log(`🌐 Server listening on port ${PORT}`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => console.error("Fatal:", e.message));
}
