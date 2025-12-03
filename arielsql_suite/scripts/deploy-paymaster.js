// arielsql_suite/scripts/deploy-paymaster.js
import { ethers } from "ethers";
// IMPORTANT: Use your actual artifact path and name.
// This assumes your contract is BWAEZIPaymaster in BWAEZIPaymaster.sol.
import PaymasterArtifact from "../artifacts/contracts/BWAEZIPaymaster.sol/BWAEZIPaymaster.json" assert { type: "json" };

/**
 * Deploy BWAEZIPaymaster with explicit constructor arguments.
 *
 * @param {ethers.Signer} signer - Ethers v6 signer (Wallet connected to provider).
 * @returns {Promise<string>} - Deployed paymaster address.
 */
export async function deployPaymaster(signer) {
  // Validate signer
  if (!signer || typeof signer.getAddress !== "function") {
    throw new Error("deployPaymaster: signer is required and must be an ethers v6 Signer");
  }

  // Ensure artifact has abi and bytecode
  const { abi, bytecode } = PaymasterArtifact;
  if (!abi || !bytecode) {
    throw new Error("deployPaymaster: invalid artifact — ABI or bytecode missing");
  }

  // Create ContractFactory (ethers v6)
  const factory = new ethers.ContractFactory(abi, bytecode, signer);

  // Constructor args (replace if needed)
  const entryPoint = "0x5FF137D4bEAA7036d654a88Ea898df565D304B88";
  const sponsorToken = "0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da";
  const weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
  const uniV3Quoter = "0xb27308f9F90d607463bb33eA1BeBb41C27CE5AB6";
  const baseFeeBps = 3000;

  console.log("⏳ Deploying BWAEZI Paymaster...");
  const paymaster = await factory.deploy(
    entryPoint,
    sponsorToken,
    weth,
    uniV3Quoter,
    baseFeeBps
  );

  // Wait for deployment (ethers v6)
  await paymaster.waitForDeployment();
  const address = await paymaster.getAddress();

  console.log("✅ REAL BWAEZI PAYMASTER DEPLOYED:", address);
  return address;
}
