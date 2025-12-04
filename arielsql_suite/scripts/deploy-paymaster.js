// arielsql_suite/scripts/deploy-paymaster.js
import { ethers } from "ethers";
import * as PaymasterArtifact from "../artifacts/contracts/BWAEZIPaymaster.sol/BWAEZIPaymaster.json";

// Export a function that accepts an Ethers.js Wallet (Signer)
export async function deployPaymaster(wallet) {
  // Use the wallet's address for logging
  console.log("Deploying Paymaster with address:", await wallet.getAddress());

  // Instantiate ContractFactory using the artifact ABI/bytecode and the Wallet/Signer
  // Note: We use the imported artifact's abi and bytecode fields
  const Paymaster = new ethers.ContractFactory(
    PaymasterArtifact.abi,
    PaymasterArtifact.bytecode,
    wallet // The wallet object contains the private key and the provider
  );

  // Deploy the contract with constructor arguments
  const paymaster = await Paymaster.deploy(
    "0x5FF137D4bEAA7036d654a88Ea898df565D304B88",  // EntryPoint
    "0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da",  // BWAEZI
    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",  // WETH
    "0xb27308f9F90d607463bb33eA1BeBb41C27CE5AB6",  // Quoter
    3000                                           // 0.3% pool
  );
  
  // Wait for the deployment transaction to be confirmed
  const deployedContract = await paymaster.waitForDeployment();
  
  const addr = await deployedContract.getAddress();
  
  console.log("REAL BWAEZI PAYMASTER DEPLOYED:", addr);
  
  // Return the address for main.js to use
  return addr;
}

// NOTE: This module is now clean and ready to be imported by main.js.
