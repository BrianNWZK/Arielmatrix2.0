// main.js
import 'dotenv/config';
import { ethers } from 'ethers';

// ---- Constants ----
const RPC_URLS = [
  'https://ethereum-rpc.publicnode.com',
  'https://rpc.ankr.com/eth',
  'https://eth.llamarpc.com'
];

// Deployed Paymaster & EntryPoint
const PAYMASTER_ADDRESS = (process.env.PAYMASTER_ADDRESS || '').trim();
const PRIVATE_KEY = (process.env.PRIVATE_KEY || '').trim();
const ENTRY_POINT = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';

// Hardcoded BWAEZI token (from bytecode)
const BWAEZI = '0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da';

// ---- Minimal ABIs ----
const paymasterAbi = [
  // Common patterns — if names differ, we’ll fallback to direct selector
  'function owner() view returns (address)',
  'function withdraw(uint256 amount)',                             // ETH (EntryPoint deposit) to owner
  'function withdrawTo(address recipient, uint256 amount)',        // ETH/tokens to recipient
  'function withdrawTokens(address token, address recipient, uint256 amount)'
];

const entryPointAbi = [
  'function balanceOf(address) view returns (uint256)'
];

const erc20Abi = [
  'function balanceOf(address account) view returns (uint256)'
];

// Helper: connect to first healthy RPC
async function getProvider() {
  for (const url of RPC_URLS) {
    try {
      const p = new ethers.JsonRpcProvider(url, { chainId: 1, name: 'mainnet' });
      await p.getBlockNumber();
      console.log(`✅ Connected to RPC: ${url}`);
      return p;
    } catch (e) {
      console.log(`⚠️ RPC failed: ${url} (${e.message})`);
    }
  }
  throw new Error('No RPC endpoints available');
}

// Helper: safe fee setup
async function gasFees(provider) {
  const fd = await provider.getFeeData();
  const tip = fd.maxPriorityFeePerGas ?? ethers.parseUnits('2', 'gwei');
  const base = fd.maxFeePerGas ?? ethers.parseUnits('25', 'gwei');
  return {
    maxPriorityFeePerGas: tip,
    maxFeePerGas: base
  };
}

async function main() {
  if (!PRIVATE_KEY) throw new Error('PRIVATE_KEY missing');
  if (!PAYMASTER_ADDRESS) throw new Error('PAYMASTER_ADDRESS missing');

  const provider = await getProvider();
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const paymaster = new ethers.Contract(PAYMASTER_ADDRESS, paymasterAbi, wallet);
  const entryPoint = new ethers.Contract(ENTRY_POINT, entryPointAbi, provider);
  const token = new ethers.Contract(BWAEZI, erc20Abi, provider);

  // 1) Confirm owner
  const owner = await paymaster.owner();
  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error(`You are not the owner. Owner: ${owner}, you: ${wallet.address}`);
  }
  console.log(`✅ Confirmed owner: ${owner}`);

  // 2) Read balances precisely
  const depositWei = await entryPoint.balanceOf(PAYMASTER_ADDRESS);
  const tokenBal = await token.balanceOf(PAYMASTER_ADDRESS);
  console.log(`EntryPoint deposit: ${ethers.formatEther(depositWei)} ETH`);
  console.log(`BWAEZI token:      ${ethers.formatUnits(tokenBal, 18)} BWAEZI`);

  const fees = await gasFees(provider);

  // 3) Try withdrawing BWAEZI tokens first (if any)
  if (tokenBal > 0n) {
    try {
      console.log('▶ withdrawTokens(BWAEZI, owner, full token balance) — callStatic check');
      await paymaster.callStatic.withdrawTokens(BWAEZI, wallet.address, tokenBal);
      const tx = await paymaster.withdrawTokens(BWAEZI, wallet.address, tokenBal, {
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
        gasLimit: 180000n
      });
      console.log(`⏳ withdrawTokens tx: ${tx.hash}`);
      const rec = await tx.wait();
      console.log(`✅ Tokens withdrawn. Block: ${rec.blockNumber}`);
    } catch (e) {
      console.log(`withdrawTokens failed: ${e.shortMessage || e.message}`);
    }
  } else {
    console.log('ℹ️ No BWAEZI token balance to withdraw.');
  }

  // 4) Withdraw EntryPoint deposit (ETH) exactly; avoid mismatched amounts
  if (depositWei > 0n) {
    // Prefer withdrawTo(owner, amount); if not present, try withdraw(amount)
    let ethDone = false;

    // A) Try withdrawTo(owner, depositWei)
    try {
      console.log('▶ withdrawTo(owner, full deposit) — callStatic check');
      await paymaster.callStatic.withdrawTo(wallet.address, depositWei);
      const tx = await paymaster.withdrawTo(wallet.address, depositWei, {
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
        gasLimit: 140000n
      });
      console.log(`⏳ withdrawTo tx: ${tx.hash}`);
      const rec = await tx.wait();
      console.log(`✅ ETH deposit withdrawn via withdrawTo. Block: ${rec.blockNumber}`);
      ethDone = true;
    } catch (e) {
      console.log(`withdrawTo failed: ${e.shortMessage || e.message}`);
    }

    // B) Try withdraw(depositWei) if A failed
    if (!ethDone) {
      try {
        console.log('▶ withdraw(full deposit) — callStatic check');
        await paymaster.callStatic.withdraw(depositWei);
        const tx = await paymaster.withdraw(depositWei, {
          maxFeePerGas: fees.maxFeePerGas,
          maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
          gasLimit: 120000n
        });
        console.log(`⏳ withdraw tx: ${tx.hash}`);
        const rec = await tx.wait();
        console.log(`✅ ETH deposit withdrawn via withdraw. Block: ${rec.blockNumber}`);
        ethDone = true;
      } catch (e) {
        console.log(`withdraw failed: ${e.shortMessage || e.message}`);
      }
    }

    // C) Final fallback: direct selector call for withdrawTo(address,uint256)
    if (!ethDone) {
      try {
        console.log('▶ Fallback: direct selector 0x205c2878 (withdrawTo(address,uint256))');
        // Build a minimal Interface on-the-fly to encode data
        const iface = new ethers.Interface(['function withdrawTo(address,uint256)']);
        const data = iface.encodeFunctionData('withdrawTo', [wallet.address, depositWei]);

        // Send raw tx to Paymaster with explicit gas; skip estimateGas entirely
        const tx = await wallet.sendTransaction({
          to: PAYMASTER_ADDRESS,
          data,
          maxFeePerGas: fees.maxFeePerGas,
          maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
          gasLimit: 160000n,
          value: 0n
        });
        console.log(`⏳ raw selector tx: ${tx.hash}`);
        const rec = await tx.wait();
        console.log(`✅ ETH deposit withdrawn via raw selector. Block: ${rec.blockNumber}`);
        ethDone = true;
      } catch (e) {
        console.log(`Raw selector withdrawTo failed: ${e.shortMessage || e.message}`);
      }
    }

    if (!ethDone) {
      throw new Error('All ETH withdrawal paths failed. Likely signature mismatch or internal require on amount/recipient.');
    }
  } else {
    console.log('ℹ️ No EntryPoint deposit to withdraw.');
  }

  console.log('🎯 Done.');
}

main().catch((e) => {
  console.error(`❌ Failed: ${e.shortMessage || e.message}`);
  process.exit(1);
});
