// scripts/deploy-paymaster.js
import { ethers } from "ethers";
import { HardhatEthersProvider } from "@nomicfoundation/hardhat-ethers/internal/hardhat-ethers-provider"; // Note: For a pure JS file, you might use a standard provider/signer, but based on the original script using 'ethers from "hardhat"', this is the common pattern. Using ethers.Wallet ensures it works with the provider from main.js.

// Wrap the deployment logic in an exported function
export async function deployPaymaster(wallet) {
  console.log("Deploying Paymaster with:", wallet.address);

  // We use ethers.ContractFactory with the wallet as signer
  // Replace the Hardhat specific 'ethers.getContractFactory' with a standard ethers equivalent if not in a Hardhat environment
  const PaymasterArtifact = require("../artifacts/contracts/BWAEZIPaymaster.sol/BWAEZIPaymaster.json");
  const Paymaster = new ethers.ContractFactory(
    PaymasterArtifact.abi,
    PaymasterArtifact.bytecode,
    wallet
  );

  const paymaster = await Paymaster.deploy(
    "0x5FF137D4bEAA7036d654a88Ea898df565D304B88",  // EntryPoint
    "0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da",  // BWAEZI
    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",  // WETH
    "0xb27308f9F90d607463bb33eA1BeBb41C27CE5AB6",  // Quoter
    3000                                           // 0.3% pool
  );
  
  // Wait for the deployment transaction to be confirmed
  await paymaster.deploymentTransaction().wait(); 
  
  const addr = await paymaster.getAddress();
  console.log("REAL BWAEZI PAYMASTER DEPLOYED:", addr);
  
  // Return the address for main.js to use
  return addr;
}
