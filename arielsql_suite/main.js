// main.js
// One-time script to withdraw remaining BWAEZI liquidity positions
// Ethers v6 — drains all positions with non-zero liquidity

import { ethers } from "ethers";

// Env
const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SCW         = ethers.getAddress(process.env.SCW_ADDRESS || "0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2");

if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");

// Uniswap V3 PositionManager
const NPM = ethers.getAddress("0xC36442b4a4522E871399CD717aBDD847Ab11FE88");

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
  const tx = await wallet.sendTransaction({ to: SCW, data: execData, gasLimit: 800000 });
  console.log(`${label}: ${tx.hash}`);
  const rc = await tx.wait();
  return rc.status === 1;
}

async function listPositions(provider) {
  const npmRead = new ethers.Contract(NPM, npmAbi, provider);
  const bal = await npmRead.balanceOf(SCW);
  const ids = [];
  for (let i=0;i<Number(bal);i++) {
    const tid = await npmRead.tokenOfOwnerByIndex(SCW, i);
    ids.push(Number(tid));
  }
  return ids;
}

async function withdrawPosition(wallet, provider, tokenId) {
  const npmIface = new ethers.Interface(npmAbi);
  const npmRead  = new ethers.Contract(NPM, npmAbi, provider);
  const pos      = await npmRead.positions(tokenId);
  const liquidity= BigInt(pos[7]);

  console.log(`Position #${tokenId} liquidity=${liquidity}`);

  if (liquidity > 0n) {
    const decTuple = [BigInt(tokenId), liquidity, 0n, 0n, BigInt(nowTs()+1200)];
    const decData  = npmIface.encodeFunctionData("decreaseLiquidity", [decTuple]);
    try { await scwExecute(wallet, NPM, decData, `decreaseLiquidity #${tokenId}`); }
    catch (e) { console.warn(`decreaseLiquidity failed for #${tokenId}: ${e?.message||e}`); }
  }

  const collectTuple = [BigInt(tokenId), SCW, UINT128_MAX, UINT128_MAX];
  const collectData  = npmIface.encodeFunctionData("collect", [collectTuple]);
  try { await scwExecute(wallet, NPM, collectData, `collect #${tokenId}`); }
  catch (e) { console.warn(`collect failed for #${tokenId}: ${e?.message||e}`); }
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`EOA: ${wallet.address}`);
  console.log(`ETH: ${ethers.formatEther(await provider.getBalance(wallet.address))} ETH`);

  const ids = await listPositions(provider);
  console.log(`Found ${ids.length} positions`);

  // Drain only positions with non-zero liquidity (your ~250 BWAEZI chunks)
  for (const tid of ids) {
    try {
      await withdrawPosition(wallet, provider, tid);
    } catch (e) {
      console.warn(`Withdraw failed for #${tid}: ${e?.message||e}`);
    }
  }

  console.log("✅ One-time drain complete");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => console.error("Fatal:", e.message));
}
