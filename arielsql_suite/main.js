// main.js
import 'dotenv/config';
import { ethers } from 'ethers';

// RPC redundancy
const RPC_URLS = [
  'https://ethereum-rpc.publicnode.com',
  'https://rpc.ankr.com/eth',
  'https://eth.llamarpc.com'
];

// Environment
const PAYMASTER_ADDRESS = (process.env.PAYMASTER_ADDRESS || '').trim();
const PRIVATE_KEY = (process.env.PRIVATE_KEY || '').trim();

// Constants
const ENTRY_POINT = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';
const OWNER_ADDRESS = (process.env.OWNER_ADDRESS || '').trim() || ''; // optionally force recipient

// ABIs
const readOnlyAbi = ['function owner() view returns (address)'];
const entryPointAbi = ['function balanceOf(address) view returns (uint256)'];

// Candidate withdraw signatures to try
const candidateSigs = [
  // most common
  'function withdraw(uint256 amount)',
  'function withdrawTo(address recipient, uint256 amount)',
  // swapped order variant seen in some contracts
  'function withdrawTo(uint256 amount, address recipient)',
  // owner-only recipient (no arg recipient)
  'function withdrawTo(uint256 amount)',
  // withdraw full to caller (no args)
  'function withdraw()',
];

// Provider selector
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

async function main() {
  if (!PRIVATE_KEY) throw new Error('PRIVATE_KEY missing');
  if (!PAYMASTER_ADDRESS) throw new Error('PAYMASTER_ADDRESS missing');

  const provider = await getProvider();
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  // Minimal contract (only owner())
  const paymasterOwner = new ethers.Contract(PAYMASTER_ADDRESS, readOnlyAbi, provider);
  const owner = await paymasterOwner.owner();
  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error(`You are not the owner. Owner: ${owner}, you: ${wallet.address}`);
  }
  console.log(`✅ Confirmed owner: ${owner}`);

  // Read exact EntryPoint deposit
  const entryPoint = new ethers.Contract(ENTRY_POINT, entryPointAbi, provider);
  const depositWei = await entryPoint.balanceOf(PAYMASTER_ADDRESS);
  console.log(`EntryPoint deposit: ${ethers.formatEther(depositWei)} ETH`);

  if (depositWei === 0n) {
    console.log('ℹ️ No deposit to withdraw.');
    return;
  }

  // Fee config
  const fd = await provider.getFeeData();
  const maxPriorityFeePerGas = fd.maxPriorityFeePerGas ?? ethers.parseUnits('2', 'gwei');
  const maxFeePerGas = fd.maxFeePerGas ?? ethers.parseUnits('25', 'gwei');

  // Build try functions from candidate signatures
  const interfaces = candidateSigs.map(sig => new ethers.Interface([sig]));

  // Amount variants: exact deposit, deposit - 1, deposit - 1000 (guard against strict checks)
  const amounts = [
    depositWei,
    depositWei > 0n ? depositWei - 1n : 0n,
    depositWei > 1000n ? depositWei - 1000n : depositWei
  ];

  // Recipient to use (default: owner)
  const recipient = OWNER_ADDRESS || wallet.address;

  // Try each combination with callStatic before sending
  let success = null;

  for (const iface of interfaces) {
    const frag = Object.values(iface.fragments).find(f => f.type === 'function');
    const name = frag.name;

    for (const amt of amounts) {
      let args;
      try {
        if (frag.inputs.length === 0) {
          // withdraw()
          args = [];
        } else if (frag.inputs.length === 1) {
          // either withdraw(uint256) or withdrawTo(uint256)
          const isUintOnly = frag.inputs[0].type.startsWith('uint');
          args = isUintOnly ? [amt] : [recipient];
        } else if (frag.inputs.length === 2) {
          // withdrawTo(address,uint256) or withdrawTo(uint256,address)
          const [a0, a1] = frag.inputs.map(i => i.type);
          if (a0.startsWith('address') && a1.startsWith('uint')) {
            args = [recipient, amt];
          } else if (a0.startsWith('uint') && a1.startsWith('address')) {
            args = [amt, recipient];
          } else {
            // unexpected types; skip
            continue;
          }
        } else {
          continue; // not a candidate we handle
        }

        // Encode and callStatic
        const data = iface.encodeFunctionData(name, args);
        // Use call directly to catch reverts without generating methods
        const callResult = await provider.call({
          to: PAYMASTER_ADDRESS,
          from: wallet.address,
          data
        });

        // If call didn't revert, we consider it a valid path
        console.log(`✅ callStatic succeeded: ${name}(${args.map(a => typeof a === 'bigint' ? a.toString() : a).join(', ')})`);
        success = { iface, name, args };
        break;
      } catch (e) {
        // Reverted — log concise info
        console.log(`✗ ${name}(${frag.inputs.map(i => i.type).join(', ')}) with amt=${amt.toString()} reverted`);
      }
    }
    if (success) break;
  }

  if (!success) {
    throw new Error('All signature/amount combinations reverted. The contract likely uses a different signature or internal conditions (e.g., fixed recipient, timelock).');
  }

  // Send the actual transaction with explicit gas limit and fees
  const { iface, name, args } = success;
  const data = iface.encodeFunctionData(name, args);

  const tx = await wallet.sendTransaction({
    to: PAYMASTER_ADDRESS,
    data,
    value: 0n,
    gasLimit: 180000n,
    maxFeePerGas,
    maxPriorityFeePerGas
  });

  console.log(`⏳ Sending ${name} tx: ${tx.hash}`);
  const rec = await tx.wait();
  console.log(`✅ Withdraw confirmed in block ${rec.blockNumber}`);
}

main().catch((e) => {
  console.error(`❌ Failed: ${e.shortMessage || e.message}`);
  process.exit(1);
});
