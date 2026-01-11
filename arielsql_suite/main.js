import { ethers } from "ethers";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";

dotenvExpand.expand(dotenv.config());

// --- CONFIG ---
const RPC_URL = process.env.RPC_URL || "https://eth.llamarpc.com";
const PRIVATE_KEY = process.env.SOVEREIGN_PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("Missing SOVEREIGN_PRIVATE_KEY");

const SCW_ADDRESS   = process.env.SCW_ADDRESS; // your Smart Contract Wallet
const BWAEZI        = "0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2"; // BWAEZI token

// Hardcode your two deployed paymasters
const PAYMASTERS = [
  "0x4e073AAA36Cd51fD37298F87E3Fce8437a08DD71",
  "0x79a515d5a085d2B86AFf104eC9C8C2152C9549C0"
];

// --- ABI fragments ---
const tokenIface = new ethers.Interface([
  "function approve(address spender, uint256 amount) returns (bool)"
]);

// SCW ABI (SimpleAccount style)
const scwIface = new ethers.Interface([
  "function execute(address dest, uint256 value, bytes calldata func) external"
]);

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("SCW:", SCW_ADDRESS);
  console.log("Paymasters:", PAYMASTERS);

  const scw = new ethers.Contract(SCW_ADDRESS, scwIface, wallet);

  for (const pm of PAYMASTERS) {
    console.log(`Approving paymaster ${pm}...`);
    const approveData = tokenIface.encodeFunctionData("approve", [pm, ethers.MaxUint256]);
    const tx = await scw.execute(BWAEZI, 0, approveData);
    console.log("TX sent:", tx.hash);
    await tx.wait();
    console.log(`✅ Approved paymaster ${pm}`);
  }

  console.log("🎉 All paymasters approved. Exiting.");
}

main().catch(e => {
  console.error("Fatal:", e);
  process.exit(1);
});
