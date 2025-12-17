// arielsql_suite/main.js — Settlement-only (no microseed, no loops)
// Env required:
// - SOVEREIGN_PRIVATE_KEY: EOA private key
// Optional overrides: EOA_OWNER, OLD_SCW, ACCOUNT_FACTORY, BUNDLER_RPC_URL

import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import process from 'process';

import {
  EnterpriseAASDK,
  ENHANCED_CONFIG as AA_CONFIG,
  SCW_FACTORY_ABI,
  buildInitCodeForSCW
} from '../modules/aa-loaves-fishes.js';

import {
  ProductionSovereignCore,
  chainRegistry,
  LIVE
} from '../core/sovereign-brain-v15.js';

// Minimal ERC20 + SCW.execute
const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address,uint256) returns (bool)',
  'function decimals() view returns (uint8)'
];
const SCW_EXEC_IFACE = new ethers.Interface(['function execute(address,uint256,bytes)']);
const ERC20_IFACE = new ethers.Interface(['function transfer(address,uint256) returns (bool)', 'function approve(address,uint256) returns (bool)']);

async function deployPredictedSCW({ provider, signer, owner, factoryAddr }) {
  const factory = new ethers.Contract(factoryAddr, SCW_FACTORY_ABI, provider);
  const predictedRaw = await factory.getAddress(owner, 0n);
  const predictedSCW = ethers.getAddress(predictedRaw);

  const code = await provider.getCode(predictedSCW);
  if (code && code !== '0x') return { address: predictedSCW, deployed: true };

  const { initCode } = await buildInitCodeForSCW(provider, factoryAddr, owner, predictedSCW, 0n);
  const aa = new EnterpriseAASDK(signer, AA_CONFIG.ENTRY_POINTS.V07);
  aa.factoryAddress = factoryAddr;
  await aa.initialize(provider, predictedSCW, AA_CONFIG.BUNDLER.RPC_URL);

  // Deploy with NOOP execute
  const noop = SCW_EXEC_IFACE.encodeFunctionData('execute', [predictedSCW, 0n, '0x']);
  const userOp = await aa.createUserOp(noop, {
    forceDeploy: true,
    callGasLimit: 400_000n,
    verificationGasLimit: 700_000n,
    preVerificationGas: 80_000n
  });
  const signed = await aa.signUserOp(userOp);
  const txHash = await aa.sendUserOpWithBackoff(signed, 5);

  return { address: predictedSCW, deployed: true, txHash };
}

async function scwTransferTokenViaAA({ provider, signer, scwAddress, token, to, amount }) {
  const aa = new EnterpriseAASDK(signer, AA_CONFIG.ENTRY_POINTS.V07);
  aa.factoryAddress = AA_CONFIG.ACCOUNT_FACTORY;
  await aa.initialize(provider, scwAddress, AA_CONFIG.BUNDLER_RPC_URL || AA_CONFIG.BUNDLER.RPC_URL);

  const transferData = ERC20_IFACE.encodeFunctionData('transfer', [to, amount]);
  const scwCalldata = SCW_EXEC_IFACE.encodeFunctionData('execute', [token, 0n, transferData]);

  const userOp = await aa.createUserOp(scwCalldata, { callGasLimit: 300_000n });
  const signed = await aa.signUserOp(userOp);
  return await aa.sendUserOpWithBackoff(signed, 5);
}

async function approveRouterOnNewSCW(core, tokenAddr) {
  const routerV3 = LIVE.DEXES.UNISWAP_V3.router;
  const approveData = ERC20_IFACE.encodeFunctionData('approve', [routerV3, ethers.MaxUint256]);
  const execCalldata = SCW_EXEC_IFACE.encodeFunctionData('execute', [tokenAddr, 0n, approveData]);

  const userOp = await core.aa.createUserOp(execCalldata, { callGasLimit: 300_000n });
  const signed = await core.aa.signUserOp(userOp);
  return await core.aa.sendUserOpWithBackoff(signed, 5);
}

async function settleFundingNoMicroseed() {
  console.log('\n=== Settlement-only run (no microseed): start ===\n');

  // 1) Provider + signer
  await chainRegistry.init();
  const provider = chainRegistry.getProvider();

  if (!process.env.SOVEREIGN_PRIVATE_KEY) throw new Error('SOVEREIGN_PRIVATE_KEY env required');
  const signer = new ethers.Wallet(process.env.SOVEREIGN_PRIVATE_KEY, provider);

  // 2) Resolve addresses
  const OWNER = ethers.getAddress(process.env.EOA_OWNER || '0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA');
  const OLD_SCW = ethers.getAddress(process.env.OLD_SCW || '0x5Ae673b4101c6FEC025C19215E1072C23Ec42A3C');
  const FACTORY = ethers.getAddress(process.env.ACCOUNT_FACTORY || AA_CONFIG.ACCOUNT_FACTORY);
  const USDC = ethers.getAddress(AA_CONFIG.USDC_ADDRESS);
  const BWAEZI = ethers.getAddress(AA_CONFIG.BWAEZI_ADDRESS);

  // 3) Deploy predicted SCW (salt=0) and align config
  const newScw = await deployPredictedSCW({ provider, signer, owner: OWNER, factoryAddr: FACTORY });
  console.log(`✅ New SCW: ${newScw.address}${newScw.txHash ? ` (tx: ${newScw.txHash})` : ''}`);

  LIVE.SCW_ADDRESS = newScw.address;
  AA_CONFIG.SCW_ADDRESS = newScw.address;

  // 4) Old SCW → EOA transfers
  const usdcAmt = ethers.parseUnits('5.00', 6);            // 5 USDC
  const bwaeziAmt = ethers.parseEther('100000000');        // 100M BWAEZI (18 decimals)

  try {
    const tx1 = await scwTransferTokenViaAA({ provider, signer, scwAddress: OLD_SCW, token: USDC, to: OWNER, amount: usdcAmt });
    console.log(`➡️ Old SCW → EOA USDC tx: ${tx1}`);
  } catch (e) { console.warn(`USDC pull failed: ${e.message}`); }

  try {
    const tx2 = await scwTransferTokenViaAA({ provider, signer, scwAddress: OLD_SCW, token: BWAEZI, to: OWNER, amount: bwaeziAmt });
    console.log(`➡️ Old SCW → EOA BWAEZI tx: ${tx2}`);
  } catch (e) { console.warn(`BWAEZI pull failed: ${e.message}`); }

  // 5) EOA → new SCW transfers (direct ERC-20)
  const usdcC = new ethers.Contract(USDC, ERC20_ABI, signer);
  const bwC = new ethers.Contract(BWAEZI, ERC20_ABI, signer);

  const eoaUsdcBal = await usdcC.balanceOf(OWNER);
  const eoaBwBal = await bwC.balanceOf(OWNER);

  if (eoaUsdcBal >= usdcAmt) {
    const tx = await usdcC.transfer(newScw.address, usdcAmt);
    const rc = await tx.wait();
    console.log(`✅ EOA → New SCW USDC: ${rc.transactionHash}`);
  } else {
    console.warn('EOA lacks 5 USDC after pull; skipping USDC forward');
  }

  if (eoaBwBal >= bwaeziAmt) {
    const tx = await bwC.transfer(newScw.address, bwaeziAmt);
    const rc = await tx.wait();
    console.log(`✅ EOA → New SCW BWAEZI: ${rc.transactionHash}`);
  } else {
    console.warn('EOA lacks 100M BWAEZI after pull; skipping BWAEZI forward');
  }

  // 6) Approvals on new SCW, no microseed
  const core = new ProductionSovereignCore();
  process.env.SETTLEMENT_MODE = 'true'; // core should not start loops
  await core.initialize(AA_CONFIG.BUNDLER.RPC_URL);

  try {
    const approvalUSDC = await approveRouterOnNewSCW(core, USDC);
    const approvalBW = await approveRouterOnNewSCW(core, BWAEZI);
    console.log(`✅ Router approvals set on new SCW — USDC: ${approvalUSDC}, BWAEZI: ${approvalBW}`);
  } catch (e) {
    console.warn(`Approvals failed: ${e.message}`);
  }

  // 7) Final balances and exit
  const scwUsdcBal = await usdcC.balanceOf(newScw.address);
  const scwBwBal = await bwC.balanceOf(newScw.address);
  console.log(`📦 New SCW balances — USDC: ${Number(scwUsdcBal)/1e6}, BWAEZI: ${ethers.formatEther(scwBwBal)}`);

  console.log('\n=== Settlement-only run (no microseed): complete ===\n');
  process.exit(0);
}

// Optional minimal server for visibility
function startStatusServer() {
  const app = express();
  app.use(cors());
  app.get('/health', (req, res) => res.json({ status: 'SETTLEMENT_NO_MICROSEED', ts: Date.now() }));
  const port = process.env.PORT ? Number(process.env.PORT) : 10000;
  app.listen(port, () => console.log(`🌐 Status on :${port}`));
}

// Entry
(async () => {
  try {
    startStatusServer(); // optional
    await settleFundingNoMicroseed();
  } catch (e) {
    console.error('❌ Settlement failed:', e.message);
    process.exit(1);
  }
})();
