// eoa-final-bootstrap.js
// Purpose: Mint liquidity into existing BWAEZI/USDC pool + create & seed BWAEZI/WETH pool
// Run from your EOA that holds BWAEZI + USDC + ETH for gas

import { ethers } from "ethers";

const RPC_URL = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY; // EOA with BWAEZI, USDC, ETH

// Correct checksummed mainnet addresses
const FACTORY = "0x1F98431c8aD98523631Ae4a59f267346ea31f984";
const NPM     = "0xC36442b4a4522E871399Cd717aBbDD847Ab11FE88"; // FIXED: correct checksum

const BWAEZI = "0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da";
const USDC   = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WETH   = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const POOL_BW_USDC = "0x051D003424c27987A4414F89B241a159a575b248"; // Existing & initialized

const SCW_RECIPIENT = "0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2"; // Your SCW owns positions

const factoryAbi = [
  "function getPool(address,address,uint24) view returns (address)",
  "function createPool(address,address,uint24) returns (address)"
];
const poolAbi = ["function initialize(uint160)"];
const npmAbi = [
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)"
];
const erc20Abi = ["function approve(address,uint256) returns (bool)"];

async function mintLiquidity(wallet, poolAddress, tokenA, tokenB, feeTier, amountA, amountB) {
  const pool = new ethers.Contract(poolAddress, ["function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)"], wallet.provider);
  const { tick } = await pool.slot0();

  const width = 120;
  const tickLower = Number(tick) - width;
  const tickUpper = Number(tick) + width;

  const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA];
  const amount0Desired = token0.toLowerCase() === tokenA.toLowerCase() ? amountA : amountB;
  const amount1Desired = token0.toLowerCase() === tokenA.toLowerCase() ? amountB : amountA;

  const tokenAContract = new ethers.Contract(tokenA, erc20Abi, wallet);
  const tokenBContract = new ethers.Contract(tokenB, erc20Abi, wallet);

  if (amountA > 0n) {
    console.log(`Approving NPM for ${ethers.formatUnits(amountA, tokenA === USDC ? 6 : 18)} ${tokenA === BWAEZI ? 'BWAEZI' : 'USDC'}`);
    await (await tokenAContract.approve(NPM, amountA)).wait();
  }
  if (amountB > 0n) {
    console.log(`Approving NPM for ${ethers.formatUnits(amountB, tokenB === USDC ? 6 : 18)} ${tokenB === BWAEZI ? 'BWAEZI' : 'WETH'}`);
    await (await tokenBContract.approve(NPM, amountB)).wait();
  }

  const npm = new ethers.Contract(NPM, npmAbi, wallet);

  const params = [
    token0,
    token1,
    feeTier,
    tickLower,
    tickUpper,
    amount0Desired,
    amount1Desired,
    0,
    0,
    SCW_RECIPIENT,
    Math.floor(Date.now() / 1000) + 1800
  ];

  console.log(`Minting on pool ${poolAddress} — range [${tickLower}, ${tickUpper}] (current tick: ${tick})`);
  const tx = await npm.mint(params);
  console.log(`Submitted mint tx: ${tx.hash}`);
  const rc = await tx.wait();
  console.log(`✅ Liquidity minted! block: ${rc.blockNumber}`);
}

async function createAndInitWethPool(wallet) {
  const feeTier = 3000;
  const [token0, token1] = BWAEZI.toLowerCase() < WETH.toLowerCase() ? [BWAEZI, WETH] : [WETH, BWAEZI];

  const factory = new ethers.Contract(FACTORY, factoryAbi, wallet);
  let pool = await factory.getPool(token0, token1, feeTier);

  if (pool !== ethers.ZeroAddress) {
    console.log(`BWAEZI/WETH pool already exists: ${pool}`);
  } else {
    console.log("Creating BWAEZI/WETH pool...");
    const tx = await factory.createPool(token0, token1, feeTier);
    await tx.wait();
    pool = await factory.getPool(token0, token1, feeTier);
    console.log(`✅ BWAEZI/WETH pool created: ${pool}`);

    const isBWToken0 = token0.toLowerCase() === BWAEZI.toLowerCase();
    const sqrtPriceX96 = isBWToken0
      ? "0x5be9ba858b43c000000000000"  // ~33 WETH per BWAEZI (ETH ~$3300)
      : "0x2c9058f9770d700000000000"; // ~0.0303 BWAEZI per WETH

    const poolCtr = new ethers.Contract(pool, poolAbi, wallet);
    console.log(`Initializing BWAEZI/WETH with sqrtPriceX96=${sqrtPriceX96}`);
    const txInit = await poolCtr.initialize(sqrtPriceX96);
    await txInit.wait();
    console.log("✅ BWAEZI/WETH pool initialized");
  }

  return pool;
}

async function main() {
  if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`EOA: ${wallet.address}`);
  console.log(`ETH Balance: ${ethers.formatEther(await provider.getBalance(wallet.address))} ETH\n`);

  // 1. Mint into existing BWAEZI/USDC pool
  const bwAmtUSDC = ethers.parseEther("0.05"); // ~$5 at $100 peg
  const usdcAmt = ethers.parseUnits("5", 6);    // $5 USDC

  await mintLiquidity(wallet, POOL_BW_USDC, BWAEZI, USDC, 500, bwAmtUSDC, usdcAmt);

  // 2. Create + mint into BWAEZI/WETH pool (asymmetric)
  const poolWeth = await createAndInitWethPool(wallet);

  const bwAmtWETH = ethers.parseEther("0.05");
  const wethAmt = 0n; // Zero WETH — asymmetric seed

  await mintLiquidity(wallet, poolWeth, BWAEZI, WETH, 3000, bwAmtWETH, wethAmt);

  console.log("🎯 FINAL BOOTSTRAP COMPLETE — Both pools seeded.");
  console.log("Your SCW can now run swaps and revenue loop.");
  console.log("Sovereign Finality Engine is LIVE.");
}

main().catch(e => {
  console.error("Fatal error:", e.message || e);
  process.exit(1);
});
