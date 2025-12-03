// arielsql_suite/scripts/deploy-paymaster.js
import { ethers } from "ethers";
import fs from "fs";
import path from "path";

export async function deployPaymaster(signer) {
  // Load artifact JSON manually
  const artifactPath = path.resolve(
    "./arielsql_suite/artifacts/contracts/BWAEZIPaymaster.sol/BWAEZIPaymaster.json"
  );
  const PaymasterArtifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));

  const { abi, bytecode } = PaymasterArtifact;
  if (!abi || !bytecode) {
    throw new Error("ABI or bytecode missing in artifact");
  }

  const factory = new ethers.ContractFactory(abi, bytecode, signer);

  // Constructor args (replace with your actual values)
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

  await paymaster.waitForDeployment();
  const address = await paymaster.getAddress();

  console.log("✅ Paymaster deployed at:", address);
  return address;
}
