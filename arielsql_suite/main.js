// main.js
import { ethers } from "ethers";

// --- CONFIG ---
const RPC_URL = "https://rpc.ankr.com/eth";

// Uniswap V3 NonfungiblePositionManager (normalized to lowercase)
const NPM_ADDRESS = "0xc36442b4a4522e871399cd717abdd847ab11fe88";

// Paste the inner calldata from your logs here
const INNER_CALLDATA = "0x..."; // replace with the hex blob you want to test

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  try {
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
