// scripts/deploy-paymaster.js
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const Paymaster = await ethers.getContractFactory("BWAEZIPaymaster");
  const paymaster = await Paymaster.deploy(
    "0x5FF137D4bEAA7036d654a88Ea898df565D304B88",  // EntryPoint
    "0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da",  // BWAEZI
    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",  // WETH
    "0xb27308f9F90d607463bb33eA1BeBb41C27CE5AB6",  // Quoter
    3000                                                     // 0.3% pool
  );

  await paymaster.waitForDeployment();
  const addr = await paymaster.getAddress();
  console.log("REAL BWAEZI PAYMASTER DEPLOYED:", addr);
  console.log("Add to .env: BWAEZI_GAS_SPONSOR=", addr);
}

main().catch(console.error);
