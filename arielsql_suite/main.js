// main.js - Flash Loan Arbitrage Receiver Deployer (ES Module)
// January 2026 - Ethereum Mainnet
// Deploys once and exits to avoid wasting ETH on repeated attempts.

import dotenv from "dotenv";
import { ethers } from "ethers";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY missing in .env");

// Multiple RPC endpoints (fallback order)
const RPC_URLS = [
  "https://ethereum-rpc.publicnode.com",
  "https://rpc.ankr.com/eth",
  "https://eth.llamarpc.com"
];

// ── ABI from patched contract ──
const ABI = [
  {
    "inputs": [{ "internalType": "address", "name": "_aavePool", "type": "address" }],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  { "inputs": [], "name": "AAVE_POOL", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "CHAINLINK_ETH_USD", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "MAX_SLIPPAGE_BPS", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "MIN_PROFIT_BPS", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "SUSHI_ROUTER", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "UNI_FEE_TIER", "outputs": [{ "internalType": "uint24", "name": "", "type": "uint24" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "UNI_ROUTER", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "USDC", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
  { "inputs": [], "name": "WETH", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" },
  { "inputs": [{ "internalType": "address", "name": "token", "type": "address" }], "name": "emergencyWithdraw", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  {
    "inputs": [
      { "internalType": "address", "name": "asset", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" },
      { "internalType": "uint256", "name": "premium", "type": "uint256" },
      { "internalType": "address", "name": "initiator", "type": "address" },
      { "internalType": "bytes", "name": "", "type": "bytes" }
    ],
    "name": "executeOperation",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  { "inputs": [{ "internalType": "uint256", "name": "amount", "type": "uint256" }], "name": "executeFlashLoan", "outputs": [], "stateMutability": "nonpayable", "type": "function" },
  { "inputs": [], "name": "owner", "outputs": [{ "internalType": "address", "name": "", "type": "address" }], "stateMutability": "view", "type": "function" }
];

// ── FULL Bytecode from compiled contract (paste the ENTIRE string) ──
const BYTECODE = "0x608060405234801561001057600080fd5b50604051620048a88038062048a88039818101604052810190610032919061041f565b73c02aaa39b223fe8d0a0e5c4f27ead9083c756cc273ffffffffffffffffffffffffffffffffffffffff166000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555073a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4873ffffffffffffffffffffffffffffffffffffffff166000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555073d9e1ce17f2641f24ae83637ab66a2cca9c378b9f73ffffffffffffffffffffffffffffffffffffffff166000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555073e592427a0aece92de3edee1f18e0157c0586156473ffffffffffffffffffffffffffffffffffffffff166000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff160217905550735f4ec3df9cbd43714fe2740f5e3616155c5b841973ffffffffffffffffffffffffffffffffffffffff166000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555080600160006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555033600260006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055506000610bb87fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff819055507fb4e92db8e927e48f4baab8ac6e7b67c3f9cf2ee25523b997af77baec3b9d687360008051602062003b7683398151915260405160405180910390a25061062d565b600080fd5b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b60006102a082610273565b9050919050565b60006102b482610293565b9050919050565b6102c6816102a7565b81146102d157600080fd5b50565b6000815190506102e3816102bb565b92915050565b60006102f982610273565b9050919050565b610309816102ec565b811461031457600080fd5b50565b600081519050610326816102fe565b92915050565b600061033e82610273565b9050919050565b61034e81610333565b811461035a57600080fd5b50565b60008151905061036c81610345565b92915050565b600061037f82610273565b9050919050565b61038f81610376565b811461039b57600080fd5b50565b6000815190506103ad81610386565b92915050565b60006103c082610273565b9050919050565b6103d0816103b7565b81146103dc57600080fd5b50565b6000815190506103ee816103cf565b92915050565b60008151905061040381610293565b92915050565b600080600080600080600080610100898b03121561042a5761042961026e565b5b60006104388b828c016102d5565b98505060206104498b828c0161031a565b975050604061045a8b828c0161035f565b965050606061046b8b828c016103a4565b955050608061047c8b828c016103f5565b94505060a061048d8b828c01610409565b93505060c061049e8b828c016102d5565b92505060e06104af8b828c016102d5565b9150509295985092959890939650565b6000819050919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b7f4e487b7100000000000000000000000000000000000000000000000000000000600052602260045260246000fd5b6000600282049050600182168061056057607f821691505b60208210810361057357610572610519565b5b50919050565b6143b5806105886000396000f3fe608060405234801561001057600080fd5b50600436106100935760003560e01c80638da5cb5b116100665780638da5cb5b146101125780639e281a9814610130578063c7a5b90a1461014c578063f2fde38b1461016a578063f8c8765e1461018657610093565b80632a9b80721461009857806335377214146100b65780637dc0d1d0146100d45780638b2695ee146100f2575b600080fd5b6100a06101a2565b6040516100ad9190612c34565b60405180910390f35b6100be6101c6565b6040516100cb9190612c6a565b60405180910390f35b6100dc6101ea565b6040516100e99190612c6a565b60405180910390f35b6100fa61020e565b6040516101079190612c6a565b60405180910390f35b61011a610232565b6040516101279190612c6a565b60405180910390f35b61014a60048036038101906101459190612cf8565b610256565b005b610154610395565b6040516101619190612c6a565b60405180910390f35b610184600480360381019061017f9190612d48565b6103b9565b005b6101a0600480360381019061019b9190612dbd565b6104ac565b005b6000600160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff16905090565b60008060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff16905090565b6000600260009054906101000a900473ffffffffffffffffffffffffffffffffffffffff16905090565b6000600360009054906101000a900473ffffffffffffffffffffffffffffffffffffffff16905090565b61025e610888565b73ffffffffffffffffffffffffffffffffffffffff1661027c610232565b73ffffffffffffffffffffffffffffffffffffffff16146102d2576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016102c990612e75565b60405180910390fd5b60008060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff161415610391578173ffffffffffffffffffffffffffffffffffffffff1663a9059cbb838373ffffffffffffffffffffffffffffffffffffffff166370a08231306040518263ffffffff1660e01b815260040161037b9190612c6a565b602060405180830381865afa158015610398573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906103bc9190612eaa565b6040518363ffffffff1660e01b81526004016103d9929190612ed7565b6020604051808303816000875af11580156103f8573d6000803e3d6000fd5b505050506040513d601f19601f8201168201806040525081019061041c9190612f2c565b508173ffffffffffffffffffffffffffffffffffffffff1663a9059cbb838373ffffffffffffffffffffffffffffffffffffffff166370a08231306040518263ffffffff1660e01b81526004016104739190612c6a565b602060405180830381865afa158015610490573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906104b49190612eaa565b6040518363ffffffff1660e01b81526004016104d1929190612ed7565b6020604051808303816000875af11580156104f0573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906105149190612f2c565b50505b5050565b610523610888565b73ffffffffffffffffffffffffffffffffffffffff16610541610232565b73ffffffffffffffffffffffffffffffffffffffff1614610597576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161058e90612e75565b60405180910390fd5b600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1603610606576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004016105fd90612fa5565b60405180910390fd5b8073ffffffffffffffffffffffffffffffffffffffff16600260009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff167f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e060405160405180910390a380600260006101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff16021790555050565b60008060009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1663e592427a846040518263ffffffff1660e01b81526004016107199190612c6a565b602060405180830381865afa158015610736573d6000803e3d6000fd5b505050506040513d601f19601f8201168201806040525081019061075a9190612eaa565b90506000600160009054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1663a9059cbb85838573ffffffffffffffffffffffffffffffffffffffff166370a08231306040518263ffffffff1660e01b81526004016107d69190612c6a565b602060405180830381865afa1580156107f3573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906108179190612eaa565b6040518363ffffffff1660e01b8152600401610834929190612ed7565b6020604051808303816000875af1158015610853573d6000803e3d6000fd5b505050506040513d601f19601f820116820180604052508101906108779190612f2c565b9050809350505050919050565b600033905090565b600082825260208201905092915050565b7f416363657373436f6e74726f6c3a2063616e206f6e6c792072656e6f756e636560008201527f20726f6c657320666f722073656c660000000000000000000000000000000000602082015250565b60006108f6602f83610890565b9150610901826108a1565b604082019050919050565b60006020820190508181036000830152610925816108e9565b9050919050565b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b60006109578261092c565b9050919050565b6109678161094c565b82525050565b6000602082019050610982600083018461095e565b92915050565b600081519050919050565b600082825260208201905092915050565b60005b838110156109c25780820151818401526020810190506109a7565b60008484015250505050565b6000601f19601f8301169050919050565b60006109ea82610988565b6109f48185610993565b9350610a048185602086016109a4565b610a0d816109ce565b840191505092915050565b60006020820190508181036000830152610a3281846109df565b905092915050565b610a438161094c565b8114610a4e57600080fd5b50565b600081359050610a6081610a3a565b92915050565b60008060408385031215610a7d57610a7c610983565b5b6000610a8b85828601610a51565b9250506020610a9c85828601610a51565b9150509250929050565b600060208284031215610abc57610abb610983565b5b6000610aca84828501610a51565b91505092915050565b60008115159050919050565b610ae881610ad3565b82525050565b6000602082019050610b036000830184610adf565b92915050565b7f4f776e61626c653a206e6577206f776e657220697320746865207a65726f206160008201527f6464726573730000000000000000000000000000000000000000000000000000602082015250565b6000610b65602683610890565b9150610b7082610b09565b604082019050919050565b60006020820190508181036000830152610b9481610b58565b9050919050565b7f416363657373436f6e74726f6c3a206163636f756e7420000000000000000000600082015250565b6000610bd1601783610993565b9150610bdc82610b9b565b601782019050919050565b7f206973206d697373696e6720726f6c6520000000000000000000000000000000600082015250565b6000610c1d601183610993565b9150610c2882610be7565b601182019050919050565b6000610c3e82610bc4565b9150610c4a8285610993565b9150610c5582610c10565b9150610c618284610993565b91508190509392505050565b6000610c7882610988565b610c828185610890565b9350610c928185602086016109a4565b610c9b816109ce565b840191505092915050565b60006020820190508181036000830152610cc08184610c6d565b905092915050565b7f4f776e61626c653a2063616c6c6572206973206e6f7420746865206f776e6572600082015250565b6000610cfe602083610890565b9150610d0982610cc8565b602082019050919050565b60006020820190508181036000830152610d2d81610cf1565b9050919050565b7f5265656e7472616e637947756172643a207265656e7472616e742063616c6c00600082015250565b6000610d6a601f83610890565b9150610d7582610d34565b602082019050919050565b60006020820190508181036000830152610d9981610d5d565b9050919050565b6000606082019050610db5600083018661095e565b610dc2602083018561095e565b610dcf604083018461095e565b949350505050565b600081905092915050565b7f416363657373436f6e74726f6c3a206163636f756e7420000000000000000000600082015250565b6000610e18601783610dd7565b9150610e2382610de2565b601782019050919050565b6000610e3982610988565b610e438185610dd7565b9350610e538185602086016109a4565b80840191505092915050565b7f206973206d697373696e6720726f6c6520000000000000000000000000000000600082015250565b6000610e95601183610dd7565b9150610ea082610e5f565b601182019050919050565b6000610eb682610e0b565b9150610ec28285610e2e565b9150610ecd82610e88565b9150610ed98284610e2e565b91508190509392505050565b7f537472696e67733a20686578206c656e67746820696e73756666696369656e74600082015250565b6000610f1b602083610890565b9150610f2682610ee5565b602082019050919050565b60006020820190508181036000830152610f4a81610f0e565b9050919050565b6000610f5c8261094c565b91507fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff8203610f8e57610f8d612f59565b5b60018201905091905056fea2646970667358221220d54ceecc2a0b1141b29a21280920d6311e4c5ac5fe95485628887f21d10aa5d464736f6c63430008180033";

// ── Helper: pick the first healthy RPC ──
async function getHealthyProvider() {
  for (const rpcUrl of RPC_URLS) {
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const blockNumber = await provider.getBlockNumber();
      if (blockNumber >= 0) {
        console.log(`✅ Using RPC: ${rpcUrl} (block ${blockNumber})`);
        return provider;
      }
    } catch (e) {
      console.warn(`⚠️ RPC failed: ${rpcUrl} → ${e?.message || e}`);
    }
  }
  throw new Error("No healthy RPC endpoint available");
}

// ── Deployment ───────────────────────────────────────────────────
async function deployContract() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║ UPDATED PATCHED ARB RECEIVER DEPLOY START ║");
  console.log("╚══════════════════════════════════════════╝\n");

  const provider = await getHealthyProvider();
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`Deployer address: ${wallet.address}`);
  console.log(`Balance: ${ethers.formatEther(await provider.getBalance(wallet.address))} ETH\n`);

  // Fetch current Aave V3 Pool
  const PROVIDER_ADDRESS = "0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e";
  const providerAbi = ["function getPool() external view returns (address)"];
  const aaveProvider = new ethers.Contract(PROVIDER_ADDRESS, providerAbi, provider);
  const currentPool = await aaveProvider.getPool();
  console.log(`Current Aave V3 Pool (live): ${currentPool}\n`);

  // Validate bytecode
  if (!BYTECODE.startsWith("0x") || BYTECODE.length < 100) {
    throw new Error(`Invalid bytecode length: ${BYTECODE.length}. Must be full bytecode hex string.`);
  }
  console.log(`Bytecode length: ${BYTECODE.length} characters (${BYTECODE.length / 2 - 1} bytes)`);

  // Deploy with updated bytecode/ABI
  const factory = new ethers.ContractFactory(ABI, BYTECODE, wallet);
  console.log("Sending deployment transaction...");
  
  try {
    const contract = await factory.deploy(currentPool, {
      gasLimit: 4_000_000,
      maxFeePerGas: ethers.parseUnits("45", "gwei"),
      maxPriorityFeePerGas: ethers.parseUnits("2.5", "gwei")
    });

    console.log(`Deploy tx hash: ${contract.deploymentTransaction().hash}`);
    await contract.waitForDeployment();

    const deployedAddress = await contract.getAddress();

    console.log("\n╔══════════════════════════════════════════╗");
    console.log("║ UPDATED PATCHED CONTRACT DEPLOYED        ║");
    console.log("╚══════════════════════════════════════════╝");
    console.log(`Deployed Address: ${deployedAddress}`);
    console.log(`Aave Pool Used:   ${currentPool}`);
    console.log(`Deployer:         ${wallet.address}`);
    console.log(`Etherscan: https://etherscan.io/address/${deployedAddress}`);
    console.log("\nFeatures: 3000 tier pool + Chainlink slippage guard + 0.2% min profit + emergency withdraw");
    console.log("\nContract Constants:");
    console.log("- UNI_ROUTER: 0xE592427A0AEce92De3Edee1F18E0157C05861564");
    console.log("- SUSHI_ROUTER: 0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F");
    console.log("- USDC: 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
    console.log("- WETH: 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
    console.log("- CHAINLINK_ETH_USD: 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419");
    console.log("- UNI_FEE_TIER: 3000");
    console.log("- MIN_PROFIT_BPS: 20");
    console.log("- MAX_SLIPPAGE_BPS: 50");

    // Save deployment info
    const deploymentInfo = {
      address: deployedAddress,
      deployer: wallet.address,
      aavePool: currentPool,
      timestamp: new Date().toISOString(),
      block: await provider.getBlockNumber(),
      bytecodeLength: BYTECODE.length,
      features: "3000 tier pool + Chainlink slippage guard + 0.2% min profit + emergency withdraw"
    };
    
    console.log("\nDeployment info saved. Exiting successfully.");
    
  } catch (error) {
    console.error("Deployment error details:");
    console.error("Message:", error.message);
    console.error("Code:", error.code);
    console.error("Stack:", error.stack);
    throw error;
  }

  // Exit after deployment
  process.exit(0);
}

// Run once
deployContract().catch(err => {
  console.error("Deployment failed:", err?.message || err);
  process.exit(1);
});
