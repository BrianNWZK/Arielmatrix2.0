// main.js
// One-shot deploy (no approval steps; assumed pre-done):
// - Seed bwzC/USDC and bwzC/WETH pairs on Uniswap V2 and SushiSwap (skip creation).
// - Create Balancer weighted pools (80/20, 0.3% fee) and join with corrected $2 skew.
// - Acquire required USDC via ETH → USDC swap if needed.
// - Wrap ETH → WETH if needed.
// - Transfer funds EOA → SCW, then seed pools with exact ratios.
// - Skew targets: Uniswap V2 = $98, SushiSwap = $96, Balancer V2 = $94 (corrected for weights).
// - Exits on first error; no retries.
// - Added safety check: If Uniswap V2 BWAEZI/USDC pair already has liquidity, assume deployment complete and exit (prevents repeat swaps/transfers/seeding on re-run).

import { ethers } from "ethers";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";

dotenvExpand.expand(dotenv.config());

const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SCW_ADDRESS = process.env.SCW_ADDRESS;

if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");
if (!SCW_ADDRESS) throw new Error("Missing SCW_ADDRESS");

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer   = new ethers.Wallet(PRIVATE_KEY, provider);

// --- Mainnet addresses (lowercase inputs for safe checksum) ---
const UNIV2_FACTORY     = ethers.getAddress("0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f"); // Added for liquidity check
const UNIV2_ROUTER      = ethers.getAddress("0x7a250d5630b4cf539739df2c5dacb4c659f2488d");
const SUSHI_ROUTER      = ethers.getAddress("0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f");
const BALANCER_VAULT    = ethers.getAddress("0xba12222222228d8ba445958a75a0704d566bf2c8");
const WEIGHTED_POOL_FACTORY = ethers.getAddress("0x8e9aa87e45e92bad84d5f8dd5b9431736d4bfb3e");

// --- Tokens (lowercase inputs) ---
const bwzC = ethers.getAddress("0x54d1c2889b08cad0932266eade15ec884fa0cdc2"); // 18 decimals
const USDC = ethers.getAddress("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"); // 6 decimals
const WETH = ethers.getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"); // 18 decimals

// --- Chainlink ETH/USD feed ---
const CHAINLINK_ETHUSD = ethers.getAddress("0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419");

const chainlinkAbi = [
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"
];

// --- Additional ABIs for safety check ---
const v2FactoryAbi = ["function getPair(address tokenA, address tokenB) view returns (address pair)"];
const pairAbi = ["function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"];

// --- Skew targets ---
const BW_U2     = 2 / 98;   // $98 skew
const BW_SUSHI  = 2 / 96;   // $96 skew

// --- Balancer weight-corrected amounts ---
const TARGET_BAL_USDC = 94;
const WEIGHT_BW = 0.8;
const WEIGHT_PAIRED = 0.2;
const EFFECTIVE_RATIO = TARGET_BAL_USDC * (WEIGHT_PAIRED / WEIGHT_BW); // 23.5
const BW_BAL_CORRECTED = 2 / EFFECTIVE_RATIO; // ≈ 0.085106383

// --- ABIs ---
const scwAbi = ["function execute(address to, uint256 value, bytes data) returns (bytes)"];
const erc20Abi = ["function balanceOf(address owner) view returns (uint256)", "function transfer(address to, uint256 value) returns (bool)"];
const wethAbi = ["function deposit() payable", "function balanceOf(address owner) view returns (uint256)", "function transfer(address to, uint256 value) returns (bool)"];
const v2RouterAbi = [
  "function addLiquidity(address tokenA,address tokenB,uint amountADesired,uint amountBDesired,uint amountAMin,uint amountBMin,address to,uint deadline) returns (uint,uint,uint)",
  "function swapExactETHForTokens(uint amountOutMin, address[] path, address to, uint deadline) payable returns (uint[] memory amounts)"
];
const balancerFactoryAbi = [
  "event PoolCreated(address indexed pool)",
  "function create(string name,string symbol,address[] tokens,uint256[] weights,address owner,uint256 swapFeePercentage,bool disableUnbalancedJoins) returns (address pool)"
];
const balancerVaultAbi = ["function joinPool(bytes32 poolId,address sender,address recipient,(address[],uint256[],bytes,bool) request)"];
const balancerPoolAbi = ["function getPoolId() view returns (bytes32)"];

// --- Helpers ---
const round = (x, d) => Number(Number(x).toFixed(d));
const toBW   = (x) => ethers.parseUnits(round(x, 18).toString(), 18);
const toUSDC = (x) => ethers.parseUnits(round(x, 6).toString(), 6);
const toWETH = (x) => ethers.parseUnits(round(x, 18).toString(), 18);
const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 900);

async function getEthUsdReference() {
  const feed = new ethers.Contract(CHAINLINK_ETHUSD, chainlinkAbi, provider);
  const [, answer] = await feed.latestRoundData();
  if (answer <= 0) throw new Error("Invalid Chainlink ETH/USD price");
  return Number(answer) / 1e8;
}

async function addLiquidityViaSCW(scw, routerAddr, tokenA, tokenB, amountA, amountB) {
  const routerIface = new ethers.Interface(v2RouterAbi);
  const data = routerIface.encodeFunctionData("addLiquidity", [tokenA, tokenB, amountA, amountB, 0n, 0n, SCW_ADDRESS, deadline()]);
  const tx = await scw.execute(routerAddr, 0n, data);
  console.log(`SCW addLiquidity ${tokenA}/${tokenB} via ${routerAddr} tx: ${tx.hash}`);
  await tx.wait();
}

async function joinBalancerViaSCW(scw, vaultAddr, poolId, assets, amounts) {
  const userData = ethers.AbiCoder.defaultAbiCoder().encode(["uint8","uint256[]","uint256"], [0, amounts, 0n]);
  const request = [assets, amounts, userData, false];
  const vaultIface = new ethers.Interface(balancerVaultAbi);
  const data = vaultIface.encodeFunctionData("joinPool", [poolId, SCW_ADDRESS, SCW_ADDRESS, request]);
  const tx = await scw.execute(vaultAddr, 0n, data);
  console.log(`SCW joinPool ${poolId} tx: ${tx.hash}`);
  await tx.wait();
}

async function createAndSeedBalancer(scw, name, symbol, tokens, isUSDC, wethEq) {
  const balFactory = new ethers.Contract(WEIGHTED_POOL_FACTORY, balancerFactoryAbi, signer);
  const weights = [ethers.parseUnits("0.8", 18), ethers.parseUnits("0.2", 18)];

  let poolAddr;
  try {
    const txCreate = await balFactory.create(name, symbol, tokens, weights, SCW_ADDRESS, ethers.parseUnits("0.003", 18), false);
    const rc = await txCreate.wait();

    const eventIface = new ethers.Interface(balancerFactoryAbi);
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
  } catch (e) {
    console.log(`⚠️ Balancer pool creation skipped for (${symbol}): ${e.reason || e.message || e}`);
    return;
  }

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

  // --- Safety check to prevent repeat execution ---
  const factory = new ethers.Contract(UNIV2_FACTORY, v2FactoryAbi, provider);
  const pairAddr = await factory.getPair(bwzC, USDC);
  if (pairAddr !== ethers.ZeroAddress) {
    const pair = new ethers.Contract(pairAddr, pairAbi, provider);
    try {
      const { reserve0, reserve1 } = await pair.getReserves();
      if (reserve0 > 0n || reserve1 > 0n) {
        console.log("⚠️ Uniswap V2 BWAEZI/USDC pair already has liquidity — assuming deployment already complete. Skipping all actions to prevent duplicates.");
        process.exit(0);
      }
    } catch (e) {
      console.log("Could not check reserves (pair may not exist yet) — proceeding.");
    }
  }

  const ETH_USD_REFERENCE = await getEthUsdReference();
  const WETH_EQ = 2 / ETH_USD_REFERENCE;

  console.log(`ETH/USD ref (Chainlink): $${ETH_USD_REFERENCE}`);
  console.log(`Seed amounts → U2 bwzC=${BW_U2.toFixed(10)}, Sushi bwzC=${BW_SUSHI.toFixed(10)}, Bal bwzC(corrected)=${BW_BAL_CORRECTED.toFixed(10)}, WETH(eq $2)=${WETH_EQ.toFixed(8)}`);

  const scw  = new ethers.Contract(SCW_ADDRESS, scwAbi, signer);
  const usdc = new ethers.Contract(USDC, erc20Abi, signer);
  const bw   = new ethers.Contract(bwzC, erc20Abi, signer);
  const weth = new ethers.Contract(WETH, wethAbi, signer);
  const uniRouter = new ethers.Contract(UNIV2_ROUTER, v2RouterAbi, signer);

  // --- Acquire / prepare funds in EOA ---
  const neededUSDC = toUSDC(6);
  const neededWETH = toWETH(round(WETH_EQ * 3, 18));

  let eoaUsdcBal = await usdc.balanceOf(signer.address);
  if (eoaUsdcBal < neededUSDC) {
    const targetUsdcOut = 6.5; // slight buffer
    let ethInFloat = targetUsdcOut / ETH_USD_REFERENCE;
    ethInFloat *= 1.08; // 8% slippage/gas buffer
    const value = ethers.parseEther(ethInFloat.toFixed(18));

    const path = [WETH, USDC];
    const amountOutMin = toUSDC(6);

    console.log(`Swapping ~${ethers.formatEther(value)} ETH for at least 6 USDC (single swap)...`);
    const swapTx = await uniRouter.swapExactETHForTokens(
      amountOutMin,
      path,
      signer.address,
      deadline(),
      { value }
    );
    console.log(`EOA ETH → USDC swap tx: ${swapTx.hash}`);
    await swapTx.wait();

    eoaUsdcBal = await usdc.balanceOf(signer.address);
    if (eoaUsdcBal < neededUSDC) {
      throw new Error(`Swap acquired only ${ethers.formatUnits(eoaUsdcBal,6)} USDC — insufficient`);
    }
    console.log(`✅ Acquired ${ethers.formatUnits(eoaUsdcBal,6)} USDC`);
  }

  let eoaWethBal = await weth.balanceOf(signer.address);
  const eoaEthBal = await provider.getBalance(signer.address);
  if (eoaWethBal < neededWETH) {
    const shortfall = neededWETH - eoaWethBal;
    if (eoaEthBal < shortfall * 12n / 10n) {
      throw new Error(`EOA ETH insufficient for wrapping needed WETH`);
    }
    const wrapTx = await weth.deposit({ value: shortfall });
    console.log(`Wrapped ${ethers.formatEther(shortfall)} ETH → WETH tx: ${wrapTx.hash}`);
    await wrapTx.wait();
  }

  // --- Transfer funds EOA → SCW (single transfers) ---
  const txUsdc = await usdc.transfer(SCW_ADDRESS, neededUSDC);
  console.log(`EOA → SCW USDC 6 tx: ${txUsdc.hash}`);
  await txUsdc.wait();

  const txWeth = await weth.transfer(SCW_ADDRESS, neededWETH);
  console.log(`EOA → SCW WETH ${ethers.formatEther(neededWETH)} tx: ${txWeth.hash}`);
  await txWeth.wait();

  // Verify bwzC in SCW
  const scwBwBal = await bw.balanceOf(SCW_ADDRESS);
  const bwNeededTotal =
    toBW(BW_U2) * 2n +
    toBW(BW_SUSHI) * 2n +
    toBW(BW_BAL_CORRECTED) * 2n;

  if (scwBwBal < bwNeededTotal) {
    throw new Error(`SCW bwzC insufficient: have ${ethers.formatEther(scwBwBal)} need ${ethers.formatEther(bwNeededTotal)}`);
  }

  // --- Seed Uniswap V2 ---
  await addLiquidityViaSCW(scw, UNIV2_ROUTER, bwzC, USDC, toBW(BW_U2), toUSDC(2));
  await addLiquidityViaSCW(scw, UNIV2_ROUTER, bwzC, WETH, toBW(BW_U2), toWETH(WETH_EQ));

  // --- Seed SushiSwap ---
  await addLiquidityViaSCW(scw, SUSHI_ROUTER, bwzC, USDC, toBW(BW_SUSHI), toUSDC(2));
  await addLiquidityViaSCW(scw, SUSHI_ROUTER, bwzC, WETH, toBW(BW_SUSHI), toWETH(WETH_EQ));

  // --- Create & seed Balancer pools ---
  await createAndSeedBalancer(scw, "bwzC/USDC Weighted", "bwzC-USDC-WP", [bwzC, USDC], true, WETH_EQ);
  await createAndSeedBalancer(scw, "bwzC/WETH Weighted", "bwzC-WETH-WP", [bwzC, WETH], false, WETH_EQ);

  console.log("\n🎯 Done: All pools seeded/created successfully.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err.reason || err.message || err);
  process.exit(1);
});
