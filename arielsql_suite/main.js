// main.js — Single withdrawal only, exits cleanly
// Requirements:
//   - SOVEREIGN_PRIVATE_KEY: 0x-prefixed private key for your EOA (0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA)
// Optional:
//   - RPC_URL, PAYMASTER_ADDRESS

import { ethers } from 'ethers';

// ---- Runtime constants ----
const ENTRY_POINT = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';
const PAYMASTER = (process.env.PAYMASTER_ADDRESS || '0x60ECf16c79fa205DDE0c3cEC66BfE35BE291cc47').trim();
const RPC_URL = process.env.RPC_URL || 'https://ethereum-rpc.publicnode.com';

// Explicit EOA address
const EOA_ADDRESS = '0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA';

// ---- Interfaces ----
const entryPointIface = new ethers.Interface([
  'function withdrawTo(address withdrawAddress, uint256 amount)'
]);

// ---- Main ----
(async () => {
  try {
    // Provider + signer
    const provider = new ethers.JsonRpcProvider(RPC_URL, { chainId: 1, name: 'mainnet' });
    const pk = process.env.SOVEREIGN_PRIVATE_KEY;
    if (!pk || !pk.startsWith('0x') || pk.length < 66) throw new Error('SOVEREIGN_PRIVATE_KEY missing/invalid');
    const signer = new ethers.Wallet(pk, provider);

    // Sanity check: ensure signer matches the EOA address
    if (signer.address.toLowerCase() !== EOA_ADDRESS.toLowerCase()) {
      throw new Error(`Signer address ${signer.address} does not match expected EOA ${EOA_ADDRESS}`);
    }

    // Withdraw exactly 3000000000000000 wei (≈0.003 ETH) from EntryPoint back to EOA
    const ep = new ethers.Contract(ENTRY_POINT, entryPointIface.fragments, signer);
    const amount = 3010197904000000n; // in wei
    const tx = await ep.withdrawTo(EOA_ADDRESS, amount);
    const rec = await tx.wait();

    console.log(`💸 Withdrawn ${ethers.formatEther(amount)} ETH from paymaster ${PAYMASTER} back to ${EOA_ADDRESS}`);
    console.log(`Tx hash: ${rec.transactionHash}`);
    process.exit(0);
  } catch (e) {
    console.error(`❌ Failed: ${e.message}`);
    process.exit(1);
  }
})();
