// withdraw.js
require('dotenv').config();
const { ethers } = require('ethers');
const artifact = require('./artifacts/contracts/BWAEZIPaymaster.json');

// ---- Runtime constants ----
const RPC_URLS = [
  'https://ethereum-rpc.publicnode.com',
  'https://rpc.ankr.com/eth',
  'https://eth.llamarpc.com'
];

const PAYMASTER_ADDRESS = process.env.PAYMASTER_ADDRESS; // deployed paymaster
const PRIVATE_KEY = process.env.PRIVATE_KEY; // must be owner/deployer key

// ---- ABIs ----
const paymasterAbi = artifact.abi;
const erc20Abi = ["function balanceOf(address account) view returns (uint256)"];

async function main() {
  if (!PRIVATE_KEY || !PAYMASTER_ADDRESS) {
    throw new Error("Missing PRIVATE_KEY or PAYMASTER_ADDRESS in .env");
  }

  // 1. Try providers in order until one works
  let provider;
  for (const url of RPC_URLS) {
    try {
      provider = new ethers.JsonRpcProvider(url, { chainId: 1, name: 'mainnet' });
      await provider.getBlockNumber(); // quick test
      console.log(`✅ Connected to RPC: ${url}`);
      break;
    } catch (e) {
      console.log(`⚠️ RPC failed: ${url} (${e.message})`);
    }
  }
  if (!provider) throw new Error("❌ No RPC endpoints available");

  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const paymaster = new ethers.Contract(PAYMASTER_ADDRESS, paymasterAbi, wallet);

  // 2. Confirm ownership
  const owner = await paymaster.owner();
  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error(`❌ You are not the owner. Contract owner is ${owner}, your address is ${wallet.address}`);
  }
  console.log(`✅ Confirmed owner: ${owner}`);

  // 3. Check BWAEZI token balance
  const bwaeziToken = "0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da"; // BWAEZI token
  const token = new ethers.Contract(bwaeziToken, erc20Abi, provider);
  const tokenBal = await token.balanceOf(PAYMASTER_ADDRESS);
  console.log(`BWAEZI token balance: ${ethers.formatUnits(tokenBal, 18)} BWAEZI`);

  // 4. Attempt withdrawal
  try {
    console.log("Attempting withdrawTokens...");
    const tx = await paymaster.withdrawTokens(bwaeziToken, wallet.address, tokenBal);
    console.log(`TX sent: ${tx.hash}`);
    await tx.wait();
    console.log("✅ Withdrawal confirmed via withdrawTokens");
    return;
  } catch (e) {
    console.log("withdrawTokens failed:", e.message);
  }

  try {
    console.log("Attempting withdrawTo...");
    const amount = ethers.parseEther("0.00146"); // adjust to actual ETH deposit
    const tx = await paymaster.withdrawTo(wallet.address, amount);
    console.log(`TX sent: ${tx.hash}`);
    await tx.wait();
    console.log("✅ Withdrawal confirmed via withdrawTo");
    return;
  } catch (e) {
    console.log("withdrawTo failed:", e.message);
  }

  try {
    console.log("Attempting withdraw...");
    const amount = ethers.parseEther("0.00146");
    const tx = await paymaster.withdraw(amount);
    console.log(`TX sent: ${tx.hash}`);
    await tx.wait();
    console.log("✅ Withdrawal confirmed via withdraw");
    return;
  } catch (e) {
    console.log("withdraw failed:", e.message);
  }

  throw new Error("❌ No withdrawal method worked!");
}

main().catch(console.error);
