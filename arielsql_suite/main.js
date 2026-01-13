// main.js
// One-shot deploy (no approval steps; assumed pre-done):
// - Create BWAEZI/USDC and BWAEZI/WETH pairs on Uniswap V2 and SushiSwap.
// - Create Balancer weighted pools (80/20, 0.3% fee) and join with corrected $2 skew.
// - Transfer funds EOA → SCW, then seed pools with exact ratios.
// - Skew targets: Uniswap V2 = $98, SushiSwap = $96, Balancer V2 = $94 (corrected for weights).
// - Exits on first error; no retries.

import { ethers } from "ethers";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";

dotenvExpand.expand(dotenv.config());

const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SCW_ADDRESS = process.env.SCW_ADDRESS;

// --- Hardcoded Balancer WeightedPoolFactory (Ethereum mainnet) ---
const WEIGHTED_POOL_FACTORY = ethers.getAddress("0x8E9aa87E45e92bad84D5F8DD5b9431736D4BfB3E");

if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");
if (!SCW_ADDRESS) throw new Error("Missing SCW_ADDRESS");

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer   = new ethers.Wallet(PRIVATE_KEY, provider);

// --- Mainnet addresses ---
const UNIV2_FACTORY     = ethers.getAddress("0x5C69bEe701ef814a2B6a3EDd4B1652CB9cc5aA6f");
const UNIV2_ROUTER      = ethers.getAddress("0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D");
const SUSHI_V2_FACTORY  = ethers.getAddress("0xC0AEe478e3658e2610c5F7A4A2E1777Ce9e4f2Ac");
const SUSHI_ROUTER      = ethers.getAddress("0xd9e1cE17f2641f24Ae83637ab66a2cca9C378B9F");
const BALANCER_VAULT    = ethers.getAddress("0xBA12222222228d8Ba445958a75a0704d566BF2C8");

// --- Tokens ---
const BWAEZI = ethers.getAddress("0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2"); // 18d
const USDC   = ethers.getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"); // 6d
const WETH   = ethers.getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"); // 18d

// --- Chainlink ETH/USD feed ---
const CHAINLINK_ETHUSD = ethers.getAddress("0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419"); // Mainnet ETH/USD

const chainlinkAbi = [
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"
];

// --- Skew targets ---
const BW_U2     = 2 / 98;   // $98 skew
const BW_SUSHI  = 2 / 96;   // $96 skew

// --- Balancer weight-corrected amounts ---
const TARGET_BAL_USDC = 94;
const WEIGHT_BW = 0.8;
const WEIGHT_PAIRED = 0.2;
const EFFECTIVE_RATIO = TARGET_BAL_USDC * (WEIGHT_PAIRED / WEIGHT_BW); // 23.5
const BW_BAL_CORRECTED = 2 / EFFECTIVE_RATIO; // ≈ 0.0851 BW

// --- ABIs ---
const scwAbi = ["function execute(address to, uint256 value, bytes data) returns (bytes)"];
const erc20Abi = ["function balanceOf(address owner) view returns (uint256)", "function transfer(address to, uint256 value) returns (bool)"];
const wethAbi = ["function deposit() payable", "function balanceOf(address owner) view returns (uint256)", "function transfer(address to, uint256 value) returns (bool)"];
const v2FactoryAbi = ["function getPair(address tokenA, address tokenB) external view returns (address pair)", "function createPair(address tokenA, address tokenB) external returns (address pair)"];
const v2RouterAbi = ["function addLiquidity(address tokenA,address tokenB,uint amountADesired,uint amountBDesired,uint amountAMin,uint amountBMin,address to,uint deadline) returns (uint,uint,uint)"];
const balancerFactoryAbi = [
  "event PoolCreated(address indexed pool)",
  "function create(string name,string symbol,address[] tokens,uint256[] weights,address owner,uint256 swapFeePercentage,bool disableUnbalancedJoins) returns (address pool)"
];
const balancerVaultAbi = ["function joinPool(bytes32 poolId,address sender,address recipient,(address[],uint256[],bytes,bool) request)"];
const balancerPoolAbi = ["function getPoolId() view returns (bytes32)"];

// --- Helpers ---
const toBW   = (x) => ethers.parseEther(x.toString());
const toUSDC = (x) => ethers.parseUnits(x.toString(), 6);
const toWETH = (x) => ethers.parseEther(x.toString());
const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 900);

async function getEthUsdReference() {
  const feed = new ethers.Contract(CHAINLINK_ETHUSD, chainlinkAbi, provider);
  const [, answer] = await feed.latestRoundData();
  if (answer <= 0) throw new Error("Invalid Chainlink ETH/USD price");
  return Number(answer) / 1e8; // Chainlink returns 8 decimals
}

async function ensurePair(factoryAddr, dexName, tokenA, tokenB) {
  const factory = new ethers.Contract(factoryAddr, v2FactoryAbi, signer);
  let pair = await factory.getPair(tokenA, tokenB);
  if (pair !== ethers.ZeroAddress) {
    console.log(`${dexName} pair exists: ${pair}`);
    return pair;
  }
  console.log(`Creating ${dexName} pair ${tokenA}/${tokenB}...`);
  const tx = await factory.createPair(tokenA, tokenB);
  await tx.wait();
  pair = await factory.getPair(tokenA, tokenB);
  console.log(`✅ ${dexName} pair created: ${pair}`);
  return pair;
}

async function addLiquidityViaSCW(scw, routerAddr, tokenA, tokenB, amountA, amountB) {
  const routerIface = new ethers.Interface(v2RouterAbi);
  const data = routerIface.encodeFunctionData("addLiquidity", [tokenA, tokenB, amountA, amountB, 0n, 0n, SCW_ADDRESS, deadline()]);
  const tx = await scw.execute(routerAddr, 0n, data);
  console.log(`SCW addLiquidity ${tokenA}/${tokenB} via ${routerAddr} tx: ${tx.hash}`);
  await tx.wait();
}

async function joinBalancerViaSCW(scw, vaultAddr, poolId, assets, amounts) {
  const userData = ethers.AbiCoder.default.encode(["uint8","uint256[]","uint256"], [0, amounts, 0n]);
  const request = [assets, amounts, userData, false];
  const vaultIface = new ethers.Interface(balancerVaultAbi);
  const data = vaultIface.encodeFunctionData("joinPool", [poolId, SCW_ADDRESS, SCW_ADDRESS, request]);
  const tx = await scw.execute(vaultAddr, 0n, data);
  console.log(`SCW joinPool ${poolId} tx: ${tx.hash}`);
  await tx.wait();
}

async function createAndSeedBalancer(scw, name, symbol, tokens, isUSDC, wethEq) {
  const balFactory = new ethers.Contract(WEIGHTED_POOL_FACTORY, balancerFactoryAbi, signer);
  const weights = [ethers.parseEther("0.8"), ethers.parseEther("0.2")];
  const txCreate = await balFactory.create(name, symbol, tokens, weights, SCW_ADDRESS, ethers.parseUnits("0.003", 18), false);
  const rc = await txCreate.wait();

  // Decode PoolCreated event safely
  const eventIface = new ethers.Interface(balancerFactoryAbi);
  let poolAddr;
  for (const log of rc.logs) {
    try {
      const parsed = eventIface.parseLog(log);
      if (parsed?.name === "PoolCreated") {
        poolAddr = parsed.args.pool;
        break;
      }
    } catch {}
  }
  
  if (!poolAddr) throw new Error(`Failed to obtain Balancer pool address for ${symbol}`);
  console.log(`✅ Balancer pool (${symbol}) created: ${poolAddr}`);

  const pool = new ethers.Contract(poolAddr, balancerPoolAbi, signer);
  const poolId = await pool.getPoolId();

  const amounts = isUSDC
    ? [toBW(BW_BAL_CORRECTED), toUSDC(2)]
    : [toBW(BW_BAL_CORRECTED), toWETH(wethEq)];

  await joinBalancerViaSCW(scw, BALANCER_VAULT, poolId, tokens, amounts);
}

async function main() {
  console.log(`EOA: ${signer.address}`);
  console.log(`SCW: ${SCW_ADDRESS}`);

  // --- Fetch live ETH/USD from Chainlink ---
  const ETH_USD_REFERENCE = await getEthUsdReference();
  const WETH_EQ = 2 / ETH_USD_REFERENCE;

  console.log(`ETH/USD ref (Chainlink): $${ETH_USD_REFERENCE}`);
  console.log(`Seed amounts → U2 BW=${BW_U2.toFixed(10)}, Sushi BW=${BW_SUSHI.toFixed(10)}, Bal BW(corrected)=${BW_BAL_CORRECTED.toFixed(10)}, WETH(eq $2)=${WETH_EQ.toFixed(8)}`);

  const scw  = new ethers.Contract(SCW_ADDRESS, scwAbi, signer);
  const usdc = new ethers.Contract(USDC, erc20Abi, signer);
  const bw   = new ethers.Contract(BWAEZI, erc20Abi, signer);
  const weth = new ethers.Contract(WETH, wethAbi, signer);

  // --- Ensure pairs exist on Uniswap V2 & Sushi ---
  await ensurePair(UNIV2_FACTORY, "Uniswap V2", BWAEZI, USDC);
  await ensurePair(UNIV2_FACTORY, "Uniswap V2", BWAEZI, WETH);
  await ensurePair(SUSHI_V2_FACTORY, "SushiSwap", BWAEZI, USDC);
  await ensurePair(SUSHI_V2_FACTORY, "SushiSwap", BWAEZI, WETH);

  // --- Transfer funds EOA → SCW ---
  const neededUSDC = toUSDC(6);              // $2 each for U2-USDC, Sushi-USDC, Bal-USDC
  const neededWETH = toWETH(WETH_EQ * 3);    // $2 eq each for U2-WETH, Sushi-WETH, Bal-WETH

  const eoaUsdcBal = await usdc.balanceOf(signer.address);
  const eoaWethBal = await weth.balanceOf(signer.address);
  const eoaEthBal  = await provider.getBalance(signer.address);

  if (eoaUsdcBal < neededUSDC) {
    throw new Error(`EOA USDC insufficient: have ${ethers.formatUnits(eoaUsdcBal,6)} need ${ethers.formatUnits(neededUSDC,6)}`);
  }
  if (eoaWethBal < neededWETH) {
    const shortfall = neededWETH - eoaWethBal;
    if (eoaEthBal < shortfall) {
      throw new Error(`EOA ETH insufficient to wrap: need ${ethers.formatEther(shortfall)} WETH worth of ETH`);
    }
    const wrapTx = await weth.deposit({ value: shortfall });
    console.log(`Wrapped ETH → WETH ${ethers.formatEther(shortfall)} tx: ${wrapTx.hash}`);
    await wrapTx.wait();
  }

  // Transfer USDC & WETH to SCW
  const txUsdc = await usdc.transfer(SCW_ADDRESS, neededUSDC);
  console.log(`EOA → SCW USDC ${ethers.formatUnits(neededUSDC,6)} tx: ${txUsdc.hash}`);
  await txUsdc.wait();

  const txWeth = await weth.transfer(SCW_ADDRESS, neededWETH);
  console.log(`EOA → SCW WETH ${ethers.formatEther(neededWETH)} tx: ${txWeth.hash}`);
  await txWeth.wait();

  // Verify BWAEZI availability in SCW
  const scwBwBal = await bw.balanceOf(SCW_ADDRESS);
  const bwNeededTotal =
    toBW(BW_U2) + toBW(BW_U2) +         // Uniswap V2: BW/USDC + BW/WETH
    toBW(BW_SUSHI) + toBW(BW_SUSHI) +   // SushiSwap: BW/USDC + BW/WETH
    toBW(BW_BAL_CORRECTED) + toBW(BW_BAL_CORRECTED); // Balancer: BW/USDC + BW/WETH

  if (scwBwBal < bwNeededTotal) {
    throw new Error(`SCW BWAEZI insufficient: have ${ethers.formatEther(scwBwBal)} need ${ethers.formatEther(bwNeededTotal)}`);
  }

  // --- Seed Uniswap V2 ---
  await addLiquidityViaSCW(scw, UNIV2_ROUTER, BWAEZI, USDC, toBW(BW_U2), toUSDC(2));       // $98 skew
  await addLiquidityViaSCW(scw, UNIV2_ROUTER, BWAEZI, WETH, toBW(BW_U2), toWETH(WETH_EQ)); // $2 eq WETH

  // --- Seed SushiSwap ---
  await addLiquidityViaSCW(scw, SUSHI_ROUTER, BWAEZI, USDC, toBW(BW_SUSHI), toUSDC(2));    // $96 skew
  await addLiquidityViaSCW(scw, SUSHI_ROUTER, BWAEZI, WETH, toBW(BW_SUSHI), toWETH(WETH_EQ));

  // --- Create Balancer pools (80/20, 0.3% fee) and join with corrected $2 seed ---
  await createAndSeedBalancer(scw, "BWAEZI/USDC Weighted", "BWZ-USDC-WP", [BWAEZI, USDC], true, WETH_EQ);
  await createAndSeedBalancer(scw, "BWAEZI/WETH Weighted", "BWZ-WETH-WP", [BWAEZI, WETH], false, WETH_EQ);

  console.log("\n🎯 Done: All pools created and seeded with exact $2 skew amounts (Balancer corrected for 80/20). Exiting.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err.reason || err.message || err);
  process.exit(1);
});
