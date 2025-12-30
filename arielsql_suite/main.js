// main.js
// Asymmetric mint via SCW: BWAEZI/USDC (USDC = 0) and BWAEZI/WETH (WETH = 0)

import { ethers } from "ethers";

const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const NPM    = ethers.getAddress("0xc36442b4a4522e871399cd717abdd847ab11fe88");
const BWAEZI = ethers.getAddress("0x9be921e5efacd53bc4eebcfdc4494d257cfab5da");
const USDC   = ethers.getAddress("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
const WETH   = ethers.getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const SCW    = ethers.getAddress("0x59be70f1c57470d7773c3d5d27b8d165fcbe7eb2");

// Existing pools
const POOL_BW_USDC = ethers.getAddress("0x051d003424c27987a4414f89b241a159a575b248");
const POOL_BW_WETH = ethers.getAddress("0x8925456Ec713Be7F4fD759FdAd03d91404e8B424");

// Configurable BW amounts
const BW_USDC_AMT = process.env.BW_USDC_AMT || "0.05";
const BW_WETH_AMT = process.env.BW_WETH_AMT || "0.05";

const scwAbi  = ["function execute(address to, uint256 value, bytes data) returns (bytes)"];
const poolAbi = [
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)"
];
const erc20Abi = [
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)"
];
const npmAbi = [
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline))"
];

function getTickSpacing(fee) {
  if (fee === 500) return 10;
  if (fee === 3000) return 60;
  throw new Error("Unsupported fee");
}
function nearestUsableTick(tick, spacing) {
  return Math.floor(tick / spacing) * spacing;
}

async function getTokenMeta(provider, token) {
  const t = new ethers.Contract(token, erc20Abi, provider);
  const decimals = await t.decimals();
  const balance  = await t.balanceOf(SCW);
  const allowance = await t.allowance(SCW, NPM);
  return { decimals, balance, allowance };
}

function parseBW(human, decimals) {
  return ethers.parseUnits(human, decimals);
}

function clamp(amount, balance) {
  return amount > balance ? balance : amount;
}

async function mintAsymmetricViaSCW(signer, poolAddr, tokenA, tokenB, fee, humanBW) {
  const provider = signer.provider;

  // Token meta
  const bwMeta = await getTokenMeta(provider, BWAEZI);
  const zeroMeta = await getTokenMeta(provider, tokenB); // for logs only

  // Parse and clamp BW amount
  let bwAmt = parseBW(humanBW, bwMeta.decimals);
  bwAmt = clamp(bwAmt, bwMeta.balance);

  // Read pool tick and align bounds
  const pool = new ethers.Contract(poolAddr, poolAbi, provider);
  const { tick } = await pool.slot0();
  const spacing = getTickSpacing(fee);

  const width = 120;
  const lowerAligned = nearestUsableTick(Number(tick) - width, spacing);
  const upperAligned = nearestUsableTick(Number(tick) + width, spacing);
  const tickLower = BigInt(lowerAligned);
  const tickUpper = BigInt(upperAligned === lowerAligned ? lowerAligned + spacing : upperAligned);
  if (tickUpper <= tickLower) throw new Error(`Invalid tick range: ${tickLower}..${tickUpper}`);

  // Sort tokens and map amounts: BW amount to BW token, zero to the other side
  const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA];
  const amount0Desired = token0.toLowerCase() === BWAEZI.toLowerCase() ? bwAmt : 0n;
  const amount1Desired = token0.toLowerCase() === BWAEZI.toLowerCase() ? 0n    : bwAmt;

  // Logs
  const fmt = (addr, amt, dec) => ethers.formatUnits(amt, dec);
  console.log(`Pool: ${poolAddr}`);
  console.log(`Tick: ${tick}, spacing: ${spacing}, range [${lowerAligned}, ${upperAligned}]`);
  console.log(`BWAEZI balance=${fmt(BWAEZI, bwMeta.balance, bwMeta.decimals)} allowance=${fmt(BWAEZI, bwMeta.allowance, bwMeta.decimals)}`);
  console.log(`Other token=${tokenB} balance=${zeroMeta.balance} allowance=${zeroMeta.allowance}`);
  console.log(`Mint asymmetric: BW=${fmt(BWAEZI, bwAmt, bwMeta.decimals)}, other=0`);

  if (amount0Desired === 0n && amount1Desired === 0n) throw new Error("BW amount is zero — nothing to mint.");

  // Build NPM.mint
  const params = {
    token0,
    token1,
    fee,
    tickLower,
    tickUpper,
    amount0Desired,
    amount1Desired,
    amount0Min: 0n,
    amount1Min: 0n,
    recipient: SCW,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 1800)
  };
  const npmIface = new ethers.Interface(npmAbi);
  const mintData = npmIface.encodeFunctionData("mint", [params]);

  // SCW.execute forwarding
  const scwIface = new ethers.Interface(scwAbi);
  const execData = scwIface.encodeFunctionData("execute", [NPM, 0n, mintData]);

  const tx = await signer.sendTransaction({ to: SCW, data: execData, value: 0n });
  console.log(`Submitted: ${tx.hash}`);
  const rc = await tx.wait();
  console.log(`✅ Minted via SCW — block ${rc.blockNumber}`);
}

async function main() {
  if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer   = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`Signer EOA: ${signer.address}`);
  console.log(`ETH balance: ${ethers.formatEther(await provider.getBalance(signer.address))} ETH\n`);

  // 1) BWAEZI/USDC — USDC = 0
  await mintAsymmetricViaSCW(
    signer,
    POOL_BW_USDC,
    BWAEZI,
    USDC,
    500,
    BW_USDC_AMT
  );

  // 2) BWAEZI/WETH — WETH = 0
  await mintAsymmetricViaSCW(
    signer,
    POOL_BW_WETH,
    BWAEZI,
    WETH,
    3000,
    BW_WETH_AMT
  );

  console.log("🎯 BOTH POOLS SEEDED ASYMMETRICALLY FROM SCW — GENESIS READY");
}

main().catch(e => {
  console.error("Fatal:", e.message || e);
  process.exit(1);
});
