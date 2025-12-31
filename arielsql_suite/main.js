// arielsql_suite/main.js
import { deployPaymaster } from "./scripts/deploy-paymaster.js";
import { compilePaymasterContract } from "./scripts/compile-paymaster.js";
import { ethers } from "ethers";
import http from "http";
import * as dotenv from 'dotenv';
import * as dotenvExpand from 'dotenv-expand';

// Load environment variables (assuming you have dotenv installed)
const env = dotenv.config();
dotenvExpand.expand(env);

(async () => {
    console.log("SOVEREIGN MEV BRAIN v12 — FINAL LAUNCH");

    try {
        // STEP 1: COMPILE CONTRACT IN THE SAME PROCESS (Fixes ARTIFACT FILE IS MISSING)
        console.log("--- Starting Paymaster contract compilation ---");
        const artifactPath = await compilePaymasterContract();
        
        // --- Wallet Setup ---
        const provider = new ethers.JsonRpcProvider("https://eth.llamarpc.com");
        const privateKey = process.env.SOVEREIGN_PRIVATE_KEY; 
        
        if (!privateKey || privateKey.length < 32) {
            throw new Error("Missing or invalid SOVEREIGN_PRIVATE_KEY env var");
        }
        const wallet = new ethers.Wallet(privateKey, provider);
        // ----------------------

        // STEP 2: Deploy Paymaster, passing the guaranteed artifact path
        const paymasterAddr = await deployPaymaster(wallet, artifactPath); 

        // STEP 3: Approve Paymaster from sponsor token SCW
        const tokenAddress = "0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da";
        const tokenAbi = ["function approve(address spender, uint256 amount) returns (bool)"];
        const token = new ethers.Contract(tokenAddress, tokenAbi, wallet);
        console.log("⛽ Approving Paymaster to spend sponsor token...");
        
        const approveTx = await token.approve(paymasterAddr, ethers.MaxUint256); 
        await approveTx.wait();
        console.log("✅ Paymaster approved successfully.");

        // STEP 4: Launch Core (retaining your original logic for the brain)
        // Note: Assumes core/sovereign-brain.js exists relative to the project root or a sibling folder
        const { ProductionSovereignCore, LIVE } = await import("../core/sovereign-brain.js");
        
        // Update live config
        LIVE.BWAEZI_GAS_SPONSOR = paymasterAddr;

        // Launch brain
        const core = new ProductionSovereignCore();
        await core.initialize();
        await core.startAutoTrading();

        console.log(`\n🎉 DEPLOYMENT AND SETUP COMPLETE!`);
        console.log(`FULLY GASLESS • FULLY AUTONOMOUS • BWAEZI PAYMASTER LIVE`);
        console.log("PAYMASTER:", paymasterAddr);

        // STEP 5: Start HTTP server to keep process alive
        const PORT = 10000;
        const server = http.createServer((req, res) => {
            if (req.url === "/health") {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ 
                    status: "ok", 
                    paymaster: paymasterAddr,
                    brain: "v12",
                    gasless: true 
                }));
                return;
            }
            // Status endpoint with core stats
            if (req.url === "/status") {
                try {
                    const stats = core.getStats();
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify(stats));
                    return;
                } catch (err) {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: err.message }));
                    return;
                }
            }
            
            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end(`Sovereign MEV Brain v12 is running\nPaymaster: ${paymasterAddr}\nGasless: true\n`);
        });
        
        server.listen(PORT, () => {
            console.log(`🚀 Server listening on port ${PORT}`);
        });

    } catch (error) {
        console.error("❌ Fatal error during launch:", error.message);
        process.exit(1);
    }
})();
