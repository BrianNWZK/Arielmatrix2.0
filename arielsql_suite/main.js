// main.js
import 'dotenv/config';
import { ethers } from 'ethers';

const RPC_URLS = [
  'https://ethereum-rpc.publicnode.com',
  'https://rpc.ankr.com/eth',
  'https://eth.llamarpc.com'
];

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const PAYMASTER_ADDRESS = process.env.PAYMASTER_ADDRESS;
const ENTRY_POINT = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';

const paymasterAbi = [
  "function owner() view returns (address)",
  "function withdraw(uint256 amount) external",
  "function withdrawEntryPoint(uint256 amount) external",
  "function withdrawAllEntryPoint() external"
];

const entryPointAbi = [
  "function balanceOf(address) view returns (uint256)"
];

async function getProvider() {
  for (const url of RPC_URLS) {
    try {
      const p = new ethers.JsonRpcProvider(url, { chainId: 1, name: 'mainnet' });
      await p.getBlockNumber();
      console.log(`✅ Connected to RPC: ${url}`);
      return p;
    } catch (e) {
      console.log(`⚠️ RPC failed: ${url}`);
    }
  }
  throw new Error('No RPC endpoints available');
}

async function main() {
  if (!PRIVATE_KEY || !PAYMASTER_ADDRESS) throw new Error('Missing env vars');

  const provider = await getProvider();
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const paymaster = new ethers.Contract(PAYMASTER_ADDRESS, paymasterAbi, wallet);
  const entryPoint = new ethers.Contract(ENTRY_POINT, entryPointAbi, provider);

  const owner = await paymaster.owner();
  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error(`Not owner. Contract owner: ${owner}, you: ${wallet.address}`);
  }
  console.log(`✅ Confirmed owner: ${owner}`);

  const depositWei = await entryPoint.balanceOf(PAYMASTER_ADDRESS);
  console.log(`EntryPoint deposit: ${ethers.formatEther(depositWei)} ETH`);

  if (depositWei > 0n) {
    console.log('▶ Withdrawing all ETH deposit...');
    const tx = await paymaster.withdrawAllEntryPoint();
    await tx.wait();
    console.log('✅ ETH withdrawn to owner');
  } else {
    console.log('ℹ️ No ETH deposit to withdraw.');
  }
}

main().catch(console.error);
