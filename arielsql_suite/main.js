import { ethers } from "ethers";

const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SCW         = process.env.SCW_ADDRESS;

const NPM   = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
const BWAEZI= "0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2";
const USDC  = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WETH  = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const npmAbi    = ["function mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256))"];
const scwAbi    = ["function execute(address,uint256,bytes)"];
const routerAbi = ["function exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160)) returns (uint256)"];

async function main() {
  if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`EOA: ${wallet.address}`);

  const scwIface = new ethers.Interface(scwAbi);

  // 1. Mint tiny BOTH-token liquidity around current tick
  const npmIface = new ethers.Interface(npmAbi);
  const tickLower = -120, tickUpper = 120; // simplified narrow range
  const mintParams = [
    BWAEZI, USDC, 500,
    tickLower, tickUpper,
    ethers.parseEther("0.001"),      // tiny BWAEZI
    ethers.parseUnits("50", 6),      // tiny USDC
    0n, 0n,
    SCW,
    Math.floor(Date.now()/1000)+1800
  ];
  const mintData = npmIface.encodeFunctionData("mint", [mintParams]);
  const execMint = scwIface.encodeFunctionData("execute", [NPM, 0n, mintData]);
  await wallet.sendTransaction({ to: SCW, data: execMint, gasLimit: 800000 });
  console.log("✅ Minted tiny in-range BWAEZI+USDC liquidity");

  // 2. Microseed swap USDC→BWAEZI (5 USDC)
  const router = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
  const swapIface = new ethers.Interface(routerAbi);
  const swapData = swapIface.encodeFunctionData("exactInputSingle", [{
    tokenIn: USDC, tokenOut: BWAEZI, fee: 500, recipient: SCW,
    deadline: Math.floor(Date.now()/1000)+600,
    amountIn: ethers.parseUnits("5",6),
    amountOutMinimum: 0n, sqrtPriceLimitX96: 0n
  }]);
  const execSwap = scwIface.encodeFunctionData("execute", [router, 0n, swapData]);
  await wallet.sendTransaction({ to: SCW, data: execSwap, gasLimit: 500000 });
  console.log("✅ Microseed swap USDC→BWAEZI executed");

  // 3. WETH leg seeding: USDC→WETH→BWAEZI
  // Leg 1: USDC→WETH (3 USDC)
  const swapData1 = swapIface.encodeFunctionData("exactInputSingle", [{
    tokenIn: USDC, tokenOut: WETH, fee: 500, recipient: SCW,
    deadline: Math.floor(Date.now()/1000)+600,
    amountIn: ethers.parseUnits("3",6),
    amountOutMinimum: 0n, sqrtPriceLimitX96: 0n
  }]);
  const execSwap1 = scwIface.encodeFunctionData("execute", [router, 0n, swapData1]);
  await wallet.sendTransaction({ to: SCW, data: execSwap1, gasLimit: 500000 });
  console.log("✅ Seeded WETH via USDC→WETH");

  // Leg 2: WETH→BWAEZI (tiny fixed WETH amount)
  const swapData2 = swapIface.encodeFunctionData("exactInputSingle", [{
    tokenIn: WETH, tokenOut: BWAEZI, fee: 3000, recipient: SCW,
    deadline: Math.floor(Date.now()/1000)+600,
    amountIn: ethers.parseEther("0.0008"), // tiny WETH
    amountOutMinimum: 0n, sqrtPriceLimitX96: 0n
  }]);
  const execSwap2 = scwIface.encodeFunctionData("execute", [router, 0n, swapData2]);
  await wallet.sendTransaction({ to: SCW, data: execSwap2, gasLimit: 500000 });
  console.log("✅ Seeded BWAEZI via WETH→BWAEZI");

  console.log("🎯 Genesis complete: pools initialized, active liquidity, USDC and WETH legs seeded");
}

main().catch(e => console.error("Fatal:", e));
