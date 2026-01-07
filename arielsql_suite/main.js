// main.js
// Genesis seeding script with HTTP server for deployment health

import express from "express";
import { ethers } from "ethers";

// ===== Env =====
const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");

const SCW         = ethers.getAddress(process.env.SCW_ADDRESS || "0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2");
const PORT        = process.env.PORT || 3000;

// ===== Pools & Tokens (same as before) =====
const POOL_BW_USDC = ethers.getAddress("0xe09e69Cf5d9f1BA67477b9720FAB7eb7883B4562");
const POOL_BW_WETH = ethers.getAddress("0x142C3dce0a5605Fb385fAe7760302fab761022aa");
const BWAEZI = ethers.getAddress("0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2");
const USDC   = ethers.getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const WETH   = ethers.getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");

// ===== ABIs & helpers (same as before) =====
// … spacingForFee, alignTickAround, encodeMint, mintTinyBWUSDC, mintTinyBWWETH …

// ===== Main seeding =====
async function runSeeding() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`EOA: ${wallet.address}`);
  console.log(`SCW: ${SCW}`);

  try {
    await mintTinyBWUSDC(wallet, provider);
    await mintTinyBWWETH(wallet, provider);
    console.log("✅ Genesis seeding complete");
  } catch (e) {
    console.error("Fatal error during seeding:", e.message || e);
  }
}

// ===== Server =====
const app = express();
app.get("/", (req, res) => {
  res.send("BWAEZI seeding service is running");
});

app.listen(PORT, async () => {
  console.log(`Server bound on port ${PORT}`);
  // Kick off seeding once server is up
  await runSeeding();
  // Exit after seeding
  process.exit(0);
});
