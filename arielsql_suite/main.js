// main.js — AA-based minting & seeding for BWAEZI/USDC (500) and BWAEZI/WETH (3000)
// Uses SCW via EntryPoint + Pimlico bundler (UserOperation), not direct EOA → SCW calls

import express from 'express';
import { ethers } from 'ethers';
import { EnterpriseAASDK, EnhancedRPCManager } from '../modules/aa-loaves-fishes.js';

const ENTRY_POINT = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';
const BUNDLER     = 'https://api.pimlico.io/v2/1/rpc?apikey=pim_4NdivPuNDvvKZ1e1aNPKrb';

const RPC_URLS = [
  'https://ethereum-rpc.publicnode.com',
  'https://rpc.ankr.com/eth',
  'https://eth.llamarpc.com'
];

// Core contracts
const NPM    = ethers.getAddress('0xc36442b4a4522e871399cd717abdd847ab11fe88'); // Uniswap V3 Position Manager
const SCW    = ethers.getAddress(process.env.SCW_ADDRESS || '0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2');

// Tokens
const BWAEZI = ethers.getAddress('0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2');
const USDC   = ethers.getAddress('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
const WETH   = ethers.getAddress('0xC02aaA39b223FE8D0A0E5C4F27eAD9083C756Cc2');

// Pools (confirmed created and initialized)
const POOL_BW_USDC = ethers.getAddress('0xe09e69Cf5d9f1BA67477b9720FAB7eb7883B4562'); // fee 500, spacing 10
const POOL_BW_WETH = ethers.getAddress('0x142C3dce0a5605Fb385fAe7760302fab761022aa'); // fee 3000, spacing 60

// ABIs
const poolAbi = ['function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)'];
const npmAbi  = ['function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)'];
const erc20Abi = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)'
];

// Interfaces
const npmIface = new ethers.Interface(npmAbi);

function getTickSpacingForPool(poolAddr) {
  return poolAddr.toLowerCase() === POOL_BW_USDC.toLowerCase() ? 10 : 60;
}
function getFeeTierForPool(poolAddr) {
  return poolAddr.toLowerCase() === POOL_BW_USDC.toLowerCase() ? 500 : 3000;
}

async function init() {
  const mgr = new EnhancedRPCManager(RPC_URLS, 1);
  await mgr.init();
  const provider = mgr.getProvider();

  const pk = process.env.SOVEREIGN_PRIVATE_KEY;
  if (!pk || !pk.startsWith('0x') || pk.length < 66) {
    throw new Error('SOVEREIGN_PRIVATE_KEY missing/invalid');
  }
  const signer = new ethers.Wallet(pk, provider);

  const aa = new EnterpriseAASDK(signer, ENTRY_POINT);
  aa.paymasterMode = 'NONE';
  await aa.initialize(provider, SCW, BUNDLER);

  return { provider, aa };
}

// AA-aware gas setup
async function getBundlerGas(provider) {
  try {
    const res = await provider.send('pimlico_getUserOperationGasPrice', []);
    let maxFeePerGas = BigInt(res.maxFeePerGas);
    let maxPriorityFeePerGas = BigInt(res.maxPriorityFeePerGas);
    const TIP_FLOOR = 50_000_000n;
    if (maxPriorityFeePerGas < TIP_FLOOR) maxPriorityFeePerGas = TIP_FLOOR;
    maxFeePerGas = (maxFeePerGas * 12n) / 10n;
    return { maxFeePerGas, maxPriorityFeePerGas };
  } catch {
    const fallback = await provider.getFeeData();
    const base = fallback.maxFeePerGas ?? ethers.parseUnits('35', 'gwei');
    const tip  = fallback.maxPriorityFeePerGas ?? ethers.parseUnits('3', 'gwei');
    const TIP_FLOOR = 50_000_000n;
    return {
      maxFeePerGas: BigInt(base.toString()) * 12n / 10n,
      maxPriorityFeePerGas: (BigInt(tip.toString()) < TIP_FLOOR) ? TIP_FLOOR : BigInt(tip.toString())
    };
  }
}

// Pool tick + spacing
async function getTickInfo(provider, poolAddr) {
  const pool = new ethers.Contract(poolAddr, poolAbi, provider);
  const [sqrtPriceX96, tick] = await pool.slot0();
  if (sqrtPriceX96 === 0n) throw new Error(`Pool ${poolAddr} not initialized (sqrtPriceX96=0)`);
  return { tick: Number(tick), spacing: getTickSpacingForPool(poolAddr) };
}

function alignTicks(tick, spacing, width = 120) {
  const lowerRaw = tick - width;
  const upperRaw = tick + width;
  const tickLower = Math.floor(lowerRaw / spacing) * spacing;
  let tickUpper   = Math.ceil(upperRaw / spacing) * spacing;
  if (tickUpper <= tickLower) tickUpper = tickLower + spacing;
  return { tickLower, tickUpper };
}

async function buildMintCalldata(provider, poolAddr, tokenA, tokenB, amountADesired, amountBDesired) {
  const { tick, spacing } = await getTickInfo(provider, poolAddr);
  const { tickLower, tickUpper } = alignTicks(tick, spacing, 120);

  // Lexicographic token order
  const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA];
  const amount0Desired = token0.toLowerCase() === tokenA.toLowerCase() ? amountADesired : amountBDesired;
  const amount1Desired = token0.toLowerCase() === tokenA.toLowerCase() ? amountBDesired : amountADesired;
  const fee = getFeeTierForPool(poolAddr);

  console.log(`Pool=${poolAddr}`);
  console.log(`Ticks: current=${tick} lower=${tickLower} upper=${tickUpper} spacing=${spacing}`);
  console.log(`Amounts: token0=${token0} amount0=${amount0Desired.toString()} | token1=${token1} amount1=${amount1Desired.toString()} | fee=${fee}`);

  const params = [
    token0,
    token1,
    fee,
    tickLower,
    tickUpper,
    amount0Desired,
    amount1Desired,
    0n,
    0n,
    SCW,
    Math.floor(Date.now() / 1000) + 1800
  ];

  return npmIface.encodeFunctionData('mint', [params]);
}

async function assertSCWReady(provider) {
  const bw = new ethers.Contract(BWAEZI, erc20Abi, provider);
  const bal = await bw.balanceOf(SCW);
  const allow = await bw.allowance(SCW, NPM);
  console.log(`SCW BWAEZI balance=${bal.toString()} allowance to NPM=${allow.toString()}`);
  if (bal === 0n) throw new Error('SCW BWAEZI balance is zero');
  if (allow === 0n) throw new Error('SCW allowance to NPM is zero');
}

async function submitMintAA(aa, calldata, label) {
  const { maxFeePerGas, maxPriorityFeePerGas } = await getBundlerGas(aa.provider);

  const userOp = await aa.createUserOp(calldata, {
    callGasLimit: 800000n,
    verificationGasLimit: 800000n,
    preVerificationGas: 90000n,
    maxFeePerGas,
    maxPriorityFeePerGas,
    target: NPM // The destination for SCW.execute is set inside calldata builder of EnterpriseAASDK
  });

  const signed = await aa.signUserOp(userOp);
  const hash = await aa.sendUserOpWithBackoff(signed, 6);
  console.log(`Mint (${label}) userOp: ${hash}`);
}

async function main() {
  const { provider, aa } = await init();

  console.log(`Using SCW sender: ${SCW}`);
  await assertSCWReady(provider);

  // 1) BWAEZI/USDC — asymmetric (BWAEZI only)
  const bwUsdcMintDataAsym = await buildMintCalldata(
    provider,
    POOL_BW_USDC,
    BWAEZI,
    USDC,
    ethers.parseEther('0.05'), // BWAEZI (18 decimals)
    0n                          // USDC (6 decimals)
  );
  const scwExecuteUsdcAsym = aa.encodeExecute(NPM, 0n, bwUsdcMintDataAsym);
  await submitMintAA(aa, scwExecuteUsdcAsym, 'BWAEZI/USDC (asym BW only)');

  // Optional small symmetric mint to reduce revert risk if price sits between sides
  const bwUsdcMintDataSym = await buildMintCalldata(
    provider,
    POOL_BW_USDC,
    BWAEZI,
    USDC,
    ethers.parseEther('0.01'), // BWAEZI
    100000n                    // USDC (6 decimals) = 0.1 USDC
  );
  const scwExecuteUsdcSym = aa.encodeExecute(NPM, 0n, bwUsdcMintDataSym);
  await submitMintAA(aa, scwExecuteUsdcSym, 'BWAEZI/USDC (small symmetric)');

  // 2) BWAEZI/WETH — asymmetric (BWAEZI only)
  const bwWethMintDataAsym = await buildMintCalldata(
    provider,
    POOL_BW_WETH,
    BWAEZI,
    WETH,
    ethers.parseEther('0.05'), // BWAEZI
    0n                          // WETH
  );
  const scwExecuteWethAsym = aa.encodeExecute(NPM, 0n, bwWethMintDataAsym);
  await submitMintAA(aa, scwExecuteWethAsym, 'BWAEZI/WETH (asym BW only)');

  // Optional small symmetric mint
  const bwWethMintDataSym = await buildMintCalldata(
    provider,
    POOL_BW_WETH,
    BWAEZI,
    WETH,
    ethers.parseEther('0.01'),     // BWAEZI
    ethers.parseEther('0.0001')    // WETH
  );
  const scwExecuteWethSym = aa.encodeExecute(NPM, 0n, bwWethMintDataSym);
  await submitMintAA(aa, scwExecuteWethSym, 'BWAEZI/WETH (small symmetric)');

  console.log('🎯 BOTH POOLS SEEDED — GENESIS COMPLETE');
}

// Start worker
(async () => {
  try {
    await main();
  } catch (e) {
    console.error('❌ Failed:', e);
  }
})();

// Keep Render happy
const app = express();
app.get('/', (req, res) => res.send('Minting worker running'));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
