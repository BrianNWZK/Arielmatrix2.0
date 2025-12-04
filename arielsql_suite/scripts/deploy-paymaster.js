// arielsql_suite/scripts/deploy-paymaster.js
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- CONFIGURATION ---
// IMPORTANT: Replace the placeholders below with the correct addresses for your network.
const ENTRY_POINT_ADDRESS = process.env.ENTRY_POINT_ADDRESS || "0x5FF137D4bEAAc6eac2CB60A49B86AA4A056ceD86"; // e.g., EntryPoint address
const BWAEZI_TOKEN_ADDRESS = process.env.BWAEZI_TOKEN_ADDRESS || "0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da"; // BWAEZI Token
const WETH_ADDRESS = process.env.WETH_ADDRESS || "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; // WETH address
const QUOTER_V2_ADDRESS = process.env.QUOTER_V2_ADDRESS || "0x61fFE16894595e6382903786193b2a249c5E7E24"; // Uniswap QuoterV2
const POOL_FEE = 3000; // e.g., 3000 = 0.3%

// Resolve the path to the artifact file relative to the project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACT_PATH = path.resolve(
  __dirname, 
  '../../artifacts/contracts/BWAEZIPaymaster.sol/BWAEZIPaymaster.json'
);
// --- END CONFIGURATION ---

export async function deployPaymaster(signer) {
  let paymasterAddr;
  try {
    // 1. Load the contract artifact (ABI and Bytecode)
    console.log(`Loading artifact from: ${ARTIFACT_PATH}`);
    // This step relies on the 'Build Command' (Option B) having compiled the contract.
    const artifactJson = fs.readFileSync(ARTIFACT_PATH, 'utf8');
    const artifact = JSON.parse(artifactJson);
    const abi = artifact.abi;
    const bytecode = artifact.bytecode;
    
    // 2. Create a contract factory
    const PaymasterFactory = new ethers.ContractFactory(abi, bytecode, signer);

    // 3. Deploy the contract with constructor arguments
    console.log("Deploying BWAEZIPaymaster...");
    const paymaster = await PaymasterFactory.deploy(
      ENTRY_POINT_ADDRESS,
      BWAEZI_TOKEN_ADDRESS,
      WETH_ADDRESS,
      QUOTER_V2_ADDRESS,
      POOL_FEE
    );

    await paymaster.waitForDeployment();
    
    paymasterAddr = await paymaster.getAddress();
    console.log(`BWAEZIPaymaster deployed to: ${paymasterAddr}`);
    
    return paymasterAddr;

  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(
        `FATAL ERROR: The required contract artifact was not found at ${ARTIFACT_PATH}. 
        Please ensure your Render 'Build Command' (Option B) runs the contract compilation command (e.g., 'npx hardhat compile') before deployment starts.`
      );
    }
    throw error;
  }
}
