import { deployPaymaster } from './scripts/deploy-paymaster.js';
import { ProductionSovereignCore } from '../core/sovereign-brain.js';
import { ethers } from 'ethers';
import http from 'http';

(async () => {
  console.log("SOVEREIGN MEV BRAIN v12 — FINAL LAUNCH");

  const provider = new ethers.JsonRpcProvider("https://eth.llamarpc.com");
  const wallet = new ethers.Wallet(process.env.SOVEREIGN_PRIVATE_KEY, provider);

  // DEPLOY REAL PAYMASTER
  const paymasterAddr = await deployPaymaster(wallet);

  // APPROVE FROM SCW
  const token = new ethers.Contract(
    "0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da",
    ["function approve(address,uint256)"],
    wallet
  );
  await (await token.approve(paymasterAddr, ethers.MaxUint256)).wait();

  // UPDATE LIVE CONFIG
  const { LIVE } = await import('../core/sovereign-brain.js');
  LIVE.BWAEZI_GAS_SPONSOR = paymasterAddr;

  // LAUNCH BRAIN
  const core = new ProductionSovereignCore();
  await core.initialize();
  await core.startAutoTrading();

  console.log("FULLY GASLESS • FULLY AUTONOMOUS • BWAEZI PAYMASTER LIVE");
  console.log("PAYMASTER:", paymasterAddr);

  // ✅ PORT BINDING TO KEEP PROCESS ALIVE
  const PORT = 10000; // fixed port as requested
  http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end(`Sovereign MEV Brain is running\nPaymaster: ${paymasterAddr}\n`);
  }).listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}`);
  });
})();
