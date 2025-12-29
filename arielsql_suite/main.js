// main.js
import { ethers } from "ethers";

// --- CONFIG ---
// Public Ethereum RPC endpoint (no API key required)
const RPC_URL = "https://ethereum-rpc.publicnode.com";

// Uniswap V3 NonfungiblePositionManager (lowercase address to avoid checksum errors)
const NPM_ADDRESS = "0xc36442b4a4522e871399cd717abdd847ab11fe88";

// Inner calldata extracted from your logs
const INNER_CALLDATA =
  "0xb61d27f6000000000000000000000000c36442b4a4522e871399cd717abdd847ab11fe88000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000064a16712950000000000000000000000009be921e5efacd53bc4eebcfdc4494d257cfab5da000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000000000001f400000000000000000000000000000000000000000000000000000000";

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
