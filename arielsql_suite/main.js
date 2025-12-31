// main.js
import 'dotenv/config';
import { ethers } from 'ethers';

const RPC_URLS = [
  'https://ethereum-rpc.publicnode.com',
  'https://rpc.ankr.com/eth',
  'https://eth.llamarpc.com'
];

const PAYMASTER_ADDRESS = process.env.PAYMASTER_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const paymasterAbi = [
  "function owner() view returns (address)",
  "function withdraw(uint256 amount) external",
  "function withdrawTo(address recipient, uint256 amount) external",
  "function withdrawTokens(address token, address recipient, uint256 amount) external"
];

async function main() {
  let provider;
  for (const url of RPC_URLS) {
    try {
      provider = new ethers.JsonRpcProvider(url, { chainId: 1, name: 'mainnet' });
      await provider.getBlockNumber();
      console.log(`✅ Connected to RPC: ${url}`);
      break;
    } catch (e) {
      console.log(`⚠️ RPC failed: ${url} (${e.message})`);
    }
  }
  if (!provider) throw new Error("❌ No RPC endpoints available");

  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const paymaster = new ethers.Contract(PAYMASTER_ADDRESS, paymasterAbi, wallet);

  const owner = await paymaster.owner();
  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error(`❌ You are not the owner. Contract owner is ${owner}, your address is ${wallet.address}`);
  }

  console.log(`✅ Confirmed owner: ${owner}`);

  // Example: withdrawTo
  const amount = ethers.parseEther("0.00146");
  const tx = await paymaster.withdrawTo(wallet.address, amount);
  console.log(`TX sent: ${tx.hash}`);
  await tx.wait();
  console.log("✅ Withdrawal confirmed");
}

main().catch(console.error);
