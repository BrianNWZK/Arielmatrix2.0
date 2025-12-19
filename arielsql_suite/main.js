// arielsql_suite/main.js — One-shot: transfer tokens EOA→SCW, approve router, print balances, exit

import { ethers } from 'ethers';
import {
  ENHANCED_CONFIG as AA_CONFIG,
  EnhancedRPCManager,
  EnterpriseAASDK
} from '../modules/aa-loaves-fishes.js';

// Strict helper
function addrStrict(a) { try { return ethers.getAddress(String(a).trim()); } catch { return String(a).trim(); } }
const toUnits = (n, d) => ethers.parseUnits(String(n), d);
const fmtUnits = (bn, d) => ethers.formatUnits(bn, d);

// Runtime constants
const RUNTIME = {
  NETWORK: AA_CONFIG.NETWORK,
  ENTRY_POINT: addrStrict(AA_CONFIG.ENTRY_POINTS?.V07 || '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'),
  TOKENS: {
    USDC: addrStrict(AA_CONFIG.USDC_ADDRESS || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
    BWAEZI: addrStrict('0x998232423d0B260Ac397a893b360C8a254FcDd66')
  },
  DECIMALS: { USDC: 6, BWAEZI: 18 },
  UNISWAP_V3_ROUTER: addrStrict(AA_CONFIG.UNISWAP?.V3_ROUTER_ADDRESS || '0xE592427A0AEce92De3Edee1F18E0157C05861564'),
  NEW_SCW: addrStrict('0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2'),
  RPC_PROVIDERS: AA_CONFIG.PUBLIC_RPC_ENDPOINTS?.length ? AA_CONFIG.PUBLIC_RPC_ENDPOINTS : [
    'https://ethereum-rpc.publicnode.com',
    'https://rpc.ankr.com/eth',
    'https://eth.llamarpc.com'
  ],
  BUNDLER_RPC_URL: process.env.BUNDLER_RPC_URL || AA_CONFIG.BUNDLER?.RPC_URL || ''
};

// ERC20 + SCW interfaces
const erc20Iface = new ethers.Interface([
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address,uint256) returns (bool)',
  'function approve(address,uint256) returns (bool)'
]);
const scwIface = new ethers.Interface(['function execute(address,uint256,bytes) returns (bytes)']);

// State
const state = { provider: null, signer: null, aaNew: null, owner: null };

// Init provider + signer
async function initProviderAndSigner() {
  const rpc = new EnhancedRPCManager(RUNTIME.RPC_PROVIDERS, RUNTIME.NETWORK.chainId);
  await rpc.init();
  state.provider = rpc.getProvider();

  const pk = process.env.SOVEREIGN_PRIVATE_KEY;
  if (!pk || !pk.startsWith('0x') || pk.length < 66) throw new Error('SOVEREIGN_PRIVATE_KEY missing/invalid.');
  state.signer = new ethers.Wallet(pk, state.provider);
  state.owner = state.signer.address;
}

// Forward tokens EOA → SCW
async function forwardEoaToScw() {
  const usdc = new ethers.Contract(RUNTIME.TOKENS.USDC, erc20Iface, state.signer);
  const bw = new ethers.Contract(RUNTIME.TOKENS.BWAEZI, erc20Iface, state.signer);

  const txUsdc = await usdc.transfer(RUNTIME.NEW_SCW, toUnits(5, RUNTIME.DECIMALS.USDC));
  await txUsdc.wait();
  console.log(`EOA → SCW USDC (5): ${txUsdc.hash}`);

  const txBw = await bw.transfer(RUNTIME.NEW_SCW, toUnits(100_000_000, RUNTIME.DECIMALS.BWAEZI));
  await txBw.wait();
  console.log(`EOA → SCW BWAEZI (100,000,000): ${txBw.hash}`);
}

// Approve router on SCW
async function approveRouterOnScw() {
  const aaNew = new EnterpriseAASDK(state.signer, RUNTIME.ENTRY_POINT);
  await aaNew.initialize(state.provider, RUNTIME.NEW_SCW, RUNTIME.BUNDLER_RPC_URL);
  state.aaNew = aaNew;

  const approveToken = async (tokenAddr, label) => {
    const data = erc20Iface.encodeFunctionData('approve', [RUNTIME.UNISWAP_V3_ROUTER, ethers.MaxUint256]);
    const callData = scwIface.encodeFunctionData('execute', [tokenAddr, 0n, data]);
    const userOp = await aaNew.createUserOp(callData, { callGasLimit: 300_000n });
    const signed = await aaNew.signUserOp(userOp);
    const txHash = await aaNew.sendUserOpWithBackoff(signed, 5);
    console.log(`Approved ${label} on SCW: ${txHash}`);
  };

  await approveToken(RUNTIME.TOKENS.USDC, 'USDC');
  await approveToken(RUNTIME.TOKENS.BWAEZI, 'BWAEZI');
}

// Print balances
async function printBalances() {
  const usdc = new ethers.Contract(RUNTIME.TOKENS.USDC, erc20Iface, state.provider);
  const bw = new ethers.Contract(RUNTIME.TOKENS.BWAEZI, erc20Iface, state.provider);

  const bal = async (c, a, d) => fmtUnits(await c.balanceOf(a), d);

  console.log('Final balances:');
  console.log(`EOA     (${state.owner}) — USDC=${await bal(usdc, state.owner, RUNTIME.DECIMALS.USDC)}, BWAEZI=${await bal(bw, state.owner, RUNTIME.DECIMALS.BWAEZI)}`);
  console.log(`NEW SCW (${RUNTIME.NEW_SCW}) — USDC=${await bal(usdc, RUNTIME.NEW_SCW, RUNTIME.DECIMALS.USDC)}, BWAEZI=${await bal(bw, RUNTIME.NEW_SCW, RUNTIME.DECIMALS.BWAEZI)}`);
}

// Main
(async () => {
  try {
    console.log('🚀 One-shot — transfer, approve, balances, exit');
    await initProviderAndSigner();
    await forwardEoaToScw();
    await approveRouterOnScw();
    await printBalances();
    console.log('✅ Completed. Exiting.');
    process.exit(0);
  } catch (e) {
    console.error(`❌ Failed: ${e.message}`);
    process.exit(1);
  }
})();
