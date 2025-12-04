// arielsql_suite/main.js
import { deployPaymaster } from "./scripts/deploy-paymaster.js";
import { compilePaymasterContract } from "./scripts/compile-paymaster.js"; // <-- NEW IMPORT
import { ethers } from "ethers";
import http from "http";
// Note: You may need to add 'core' or other application-specific imports here if they are used later in the file.

(async () => {
    console.log("SOVEREIGN MEV BRAIN v12 — FINAL LAUNCH");

    try {
        // STEP 1: COMPILE CONTRACT IN THE SAME PROCESS
        console.log("--- Starting Paymaster contract compilation ---");
        const artifactPath = await compilePaymasterContract();
        console.log("--- Paymaster contract compilation complete ---");

        // Provider and wallet setup (using user's setup)
        const provider = new ethers.JsonRpcProvider("https://eth.llamarpc.com");
        
        // Ensure you use the correct environment variable name, e.g., SOVEREIGN_PRIVATE_KEY
        const privateKey = process.env.SOVEREIGN_PRIVATE_KEY; 
        
        if (!privateKey || privateKey.length < 32) {
            throw new Error("Missing or invalid SOVEREIGN_PRIVATE_KEY env var");
        }
        const wallet = new ethers.Wallet(privateKey, provider);

        // STEP 2: Deploy Paymaster, passing the guaranteed artifact path
        // The deployer script now expects the absolute artifact path.
        const paymasterAddr = await deployPaymaster(wallet, artifactPath); 

        // Approve Paymaster from sponsor token SCW (retaining user's original logic)
        const tokenAddress = "0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da"; // BWAEZI Token Address
        const tokenAbi = [
            "function approve(address spender, uint256 amount) returns (bool)"
        ];
        const token = new ethers.Contract(tokenAddress, tokenAbi, wallet);
        console.log("⛽ Approving Paymaster to spend sponsor token...");
        
        // You might need to adjust the approval amount depending on your use case (MaxUint256 is common for Paymasters)
        const approveTx = await token.approve(paymasterAddr, ethers.MaxUint256); 
        await approveTx.wait();
        console.log("✅ Paymaster approved successfully.");

        console.log(`\n🎉 DEPLOYMENT AND SETUP COMPLETE!`);
        console.log(`GASLESS • FULLY AUTONOMOUS • BWAEZI PAYMASTER LIVE`);
        console.log("PAYMASTER:", paymasterAddr);

        // Bind to fixed port 10000 to keep process alive and satisfy deployers (retaining user's original logic)
        const PORT = 10000;
        const server = http.createServer((req, res) => {
            // Minimal status endpoints
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
            
            // Assuming 'core' is defined elsewhere and handles stats retrieval
            if (req.url === "/status") {
                try {
                    // Placeholder for core.getStats() if it's used elsewhere
                    const stats = { status: "running" }; 
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
            res.end(`Sovereign MEV Brain v12 is running\nPaymaster: ${paymasterAddr}`);
        });
        
        server.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });

    } catch (error) {
        console.error("❌ Critical launch failure:", error.message);
        process.exit(1);
    }
})();
