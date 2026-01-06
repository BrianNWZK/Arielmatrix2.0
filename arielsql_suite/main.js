// main.js
// One-time drain for position #1167465 (BWAEZI/USDC fee-500)
// Ethers v6 — decreaseLiquidity + collect, then bind to port

import { ethers } from "ethers";
import http from "http";

// Env
const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SCW         = ethers.getAddress(process.env.SCW_ADDRESS || "0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2");
const PORT        = Number(process.env.PORT || 8080);

if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");

// Contracts
const NPM = ethers.getAddress("0xC36442b4a4522E871399CD717aBDD847Ab11FE88");

// ABIs
const npmAbi = [
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

async function drain1167465(wallet, provider) {
  const npmRead  = new ethers.Contract(NPM, npmAbi, provider);
  const npmIface = new ethers.Interface(npmAbi);
  const pos      = await npmRead.positions(1167465);

  const liq   = BigInt(pos[7]);
  const owed0 = BigInt(pos[10]);
  const owed1 = BigInt(pos[11]);

  console.log(`Position #1167465 liquidity=${liq} owed0=${owed0} owed1=${owed1}`);

  // 1) decreaseLiquidity with full liquidity
  if (liq > 0n) {
    const decTuple = [1167465n, liq, 0n, 0n, BigInt(nowTs()+1200)];
    const decData  = npmIface.encodeFunctionData("decreaseLiquidity", [decTuple]);
    try { await scwExecute(wallet, NPM, decData, "decreaseLiquidity #1167465"); }
    catch (e) { console.warn(`decreaseLiquidity error: ${e?.message||e}`); }
  } else {
    console.log("No liquidity left in #1167465");
  }

  // 2) collect immediately after
  const collectTuple = [1167465n, SCW, UINT128_MAX, UINT128_MAX];
  const collectData  = npmIface.encodeFunctionData("collect", [collectTuple]);
  try { await scwExecute(wallet, NPM, collectData, "collect #1167465"); }
  catch (e) { console.warn(`collect error: ${e?.message||e}`); }
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`EOA: ${wallet.address}`);
  console.log(`ETH: ${ethers.formatEther(await provider.getBalance(wallet.address))} ETH`);

  await drain1167465(wallet, provider);

  console.log("✅ Drain of #1167465 complete");

  // Quick HTTP server to bind port
  http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, status: "drain-1167465-complete", ts: Date.now() }));
  }).listen(PORT, () => {
    console.log(`🌐 Server listening on port ${PORT}`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => console.error("Fatal:", e.message));
}
