// main.js
import { ethers } from "ethers";

// --- CONFIG ---
// Use a reliable Ethereum RPC endpoint (Infura, Alchemy, Ankr, etc.)
const RPC_URL = "https://rpc.ankr.com/eth";

// Uniswap V3 NonfungiblePositionManager
const NPM_ADDRESS = "0xC36442b4a4522e871399cd717abdd847ab11fe88";

// Paste the inner calldata you saw in your logs (after SCW.execute)
// Example from your logs (replace with the exact hex you want to test):
const INNER_CALLDATA = "0xb61d27f6000000000000000000000000c36442b4a4522e871399cd717abdd847ab11fe88000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000064a16712950000000000000000000000009be921e5efacd53bc4eebcfdc4494d257cfab5da000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000000000001f400000000000000000000000000000000000000000000000000000000";

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  try {
    // Direct simulation against PositionManager
    const result = await provider.call({
      to: NPM_ADDRESS,
      data: INNER_CALLDATA
    });

    if (result === "0x") {
      console.log("✅ Call succeeded (no revert).");
    } else {
      console.log("✅ Call returned data:", result);
    }
  } catch (err) {
    console.error("❌ Call reverted.");
    if (err.data) {
      const errorHex = err.data;
      // Standard Solidity Error(string) selector
      if (errorHex.startsWith("0x08c379a0")) {
        const reason = ethers.AbiCoder.defaultAbiCoder().decode(
          ["string"],
          "0x" + errorHex.slice(10)
        );
        console.error("Revert reason:", reason[0]);
      } else {
        console.error("Raw revert data:", errorHex);
      }
    } else {
      console.error("Error:", err.message);
    }
  }
}

main();
