// arielsql_suite/main.js
import { deployPaymaster } from "./scripts/deploy-paymaster.js";
import { ProductionSovereignCore } from "../core/sovereign-brain.js";
import { ethers } from "ethers";
import http from "http";

(async () => {
  console.log("SOVEREIGN MEV BRAIN v12 — FINAL LAUNCH");

  // Provider and wallet (ethers v6)
  const provider = new ethers.JsonRpcProvider("https://eth.llamarpc.com");

  const privateKey = process.env.SOVEREIGN_PRIVATE_KEY;
  if (!privateKey || privateKey.length < 32) {
    throw new Error("Missing or invalid SOVEREIGN_PRIVATE_KEY env var");
  }
  const wallet = new ethers.Wallet(privateKey, provider);

  // Deploy Paymaster
  const paymasterAddr = await deployPaymaster(wallet);

  // Approve Paymaster from sponsor token SCW
  const tokenAddress = "0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da";
  const tokenAbi = [
    "function approve(address spender, uint256 amount) returns (bool)"
  ];
  const token = new ethers.Contract(tokenAddress, tokenAbi, wallet);
  console.log("⛽ Approving Paymaster to spend sponsor token...");
  const approveTx = await token.approve(paymasterAddr, ethers.MaxUint256);
  await approveTx.wait();
  console.log("✅ Approval confirmed:", approveTx.hash);

  // Update live config
  const { LIVE } = await import("../core/sovereign-brain.js");
  LIVE.BWAEZI_GAS_SPONSOR = paymasterAddr;

  // Launch brain
  const core = new ProductionSovereignCore();
  await core.initialize();
  await core.startAutoTrading();

  console.log("FULLY GASLESS • FULLY AUTONOMOUS • BWAEZI PAYMASTER LIVE");
  console.log("PAYMASTER:", paymasterAddr);

  // Bind to fixed port 10000 to keep process alive and satisfy deployers
  const PORT = 10000;
  const server = http.createServer((req, res) => {
    // Minimal status endpoints
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", paymaster: paymasterAddr }));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(`Sovereign MEV Brain is running\nPaymaster: ${paymasterAddr}\n`);
  });

  server.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}`);
  });
})().catch((err) => {
  console.error("❌ Fatal error during launch:", err);
  process.exit(1);
});
