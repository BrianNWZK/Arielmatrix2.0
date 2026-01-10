// main.js - Flash Loan Arbitrage Receiver Deployer - COMPILE + DEPLOY VERSION
// January 2026 - Ethereum Mainnet (Adaptive Gas + Optional Flash Loan Trigger)

import dotenv from "dotenv";
import { ethers } from "ethers";
import solc from "solc";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY missing in .env");

const RPC_URLS = [
  "https://ethereum-rpc.publicnode.com",
  "https://rpc.ankr.com/eth",
  "https://eth.llamarpc.com"
];

// Optional: trigger a flash loan after deployment (amount in USDC, 6 decimals)
// e.g., FLASH_AMOUNT=1000000 for 1,000,000 USDC (1,000,000 * 10^6)
const FLASH_AMOUNT = process.env.FLASH_AMOUNT ? BigInt(process.env.FLASH_AMOUNT) : null;

// ── Solidity contract source ──
const contractSource = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IUniswapV3Router {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

interface ISushiSwapRouter {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
}

interface IChainlinkOracle {
    function latestAnswer() external view returns (int256);
}

interface IAavePool {
    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 referralCode
    ) external;
}

contract FlashArbReceiver {
    address public immutable owner;
    address public immutable AAVE_POOL;

    address public constant UNI_ROUTER    = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    address public constant SUSHI_ROUTER  = 0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F;
    address public constant USDC          = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address public constant WETH          = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address public constant CHAINLINK_ETH_USD = 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419;

    uint24 public constant UNI_FEE_TIER = 3000;
    uint256 public constant MIN_PROFIT_BPS = 20;        // 0.2%
    uint256 public constant MAX_SLIPPAGE_BPS = 50;      // 0.5%

    constructor(address _aavePool) {
        owner = msg.sender;
        AAVE_POOL = _aavePool;
    }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata
    ) external returns (bool) {
        require(msg.sender == AAVE_POOL, "Only Aave Pool");
        require(initiator == address(this), "Invalid initiator");
        require(asset == USDC, "Only USDC supported");

        uint256 totalDebt = amount + premium;

        int256 ethPriceInt = IChainlinkOracle(CHAINLINK_ETH_USD).latestAnswer();
        require(ethPriceInt > 0, "Invalid oracle price");
        uint256 ethPrice = uint256(ethPriceInt);

        // USDC(6) -> WETH(18): scale by 1e12, divide by 8-decimal price
        uint256 expectedWethOut = (amount * 1e12) / ethPrice;
        uint256 minWethOut = expectedWethOut * (10000 - MAX_SLIPPAGE_BPS) / 10000;

        IERC20(USDC).approve(UNI_ROUTER, amount);

        IUniswapV3Router.ExactInputSingleParams memory uniParams = IUniswapV3Router.ExactInputSingleParams({
            tokenIn: USDC,
            tokenOut: WETH,
            fee: UNI_FEE_TIER,
            recipient: address(this),
            deadline: block.timestamp + 600,
            amountIn: amount,
            amountOutMinimum: minWethOut,
            sqrtPriceLimitX96: 0
        });

        uint256 wethReceived = IUniswapV3Router(UNI_ROUTER).exactInputSingle(uniParams);
        IERC20(WETH).approve(SUSHI_ROUTER, wethReceived);

        address[] memory path = new address[](2);
        path[0] = WETH;
        path[1] = USDC;

        uint256 minUsdcOut = totalDebt * (10000 + MIN_PROFIT_BPS) / 10000;
        uint[] memory amounts = ISushiSwapRouter(SUSHI_ROUTER).swapExactTokensForTokens(
            wethReceived,
            minUsdcOut,
            path,
            address(this),
            block.timestamp + 600
        );

        uint256 usdcReceived = amounts[1];
        require(usdcReceived >= totalDebt + (totalDebt * MIN_PROFIT_BPS / 10000), "Insufficient profit");

        uint256 profit = usdcReceived - totalDebt;
        if (profit > 0) {
            IERC20(USDC).transfer(owner, profit);
        }

        IERC20(USDC).approve(AAVE_POOL, totalDebt);
        return true;
    }

    function executeFlashLoan(uint256 amount) external {
        IAavePool(AAVE_POOL).flashLoanSimple(address(this), USDC, amount, "", 0);
    }

    function emergencyWithdraw(address token) external {
        require(msg.sender == owner, "Only owner");
        uint256 bal = IERC20(token).balanceOf(address(this));
        if (bal > 0) IERC20(token).transfer(owner, bal);
    }
}
`;

// ── Helper: pick the first healthy RPC ──
async function getHealthyProvider() {
  for (const rpcUrl of RPC_URLS) {
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      await provider.getBlockNumber();
      console.log(`✅ Using RPC: ${rpcUrl}`);
      return provider;
    } catch {}
  }
  throw new Error("No healthy RPC endpoint available");
}

// ── Adaptive gas policy ──
async function getAdaptiveFees(provider) {
  const feeData = await provider.getFeeData();
  let maxFeePerGas = feeData.maxFeePerGas ?? ethers.parseUnits("20", "gwei");
  let maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? ethers.parseUnits("2", "gwei");

  const MIN_TIP = ethers.parseUnits("2", "gwei");   // tiny floor
  const MAX_TIP = ethers.parseUnits("80", "gwei");  // cap tip
  const MAX_FEE = ethers.parseUnits("120", "gwei"); // cap max fee

  if (maxPriorityFeePerGas < MIN_TIP) maxPriorityFeePerGas = MIN_TIP;
  if (maxPriorityFeePerGas > MAX_TIP) maxPriorityFeePerGas = MAX_TIP;
  if (maxFeePerGas > MAX_FEE) maxFeePerGas = MAX_FEE;

  return { maxFeePerGas, maxPriorityFeePerGas };
}

// ── Compile Contract ──
function compileContract() {
  console.log("🔨 Compiling contract...");
  const input = {
    language: "Solidity",
    sources: { "FlashArbReceiver.sol": { content: contractSource } },
    settings: {
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
      optimizer: { enabled: true, runs: 200 }
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors) {
    const errors = output.errors.filter((e) => e.severity === "error");
    if (errors.length) {
      errors.forEach((e) => console.error(e.formattedMessage));
      throw new Error("Compilation failed");
    }
  }

  const contract = output.contracts["FlashArbReceiver.sol"].FlashArbReceiver;
  if (!contract) throw new Error("Contract not found in compilation output");

  const abi = contract.abi;
  const bytecodeObject = contract.evm.bytecode.object;
  if (!bytecodeObject || bytecodeObject.length === 0) {
    throw new Error("Empty bytecode object from compiler");
  }
  const bytecode = "0x" + bytecodeObject;

  console.log("✅ Compilation successful!");
  console.log(`📏 Bytecode length: ${bytecode.length} characters`);
  console.log(`🔗 ABI has ${abi.length} entries`);

  return { abi, bytecode };
}

// ── Deployment ──
async function deployContract() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║ UPDATED PATCHED ARB RECEIVER DEPLOY START ║");
  console.log("╚══════════════════════════════════════════╝\n");

  const { abi, bytecode } = compileContract();
  const provider = await getHealthyProvider();
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`👤 Deployer address: ${wallet.address}`);
  const balance = await provider.getBalance(wallet.address);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH\n`);

  // Fetch Aave V3 Pool
  const PROVIDER_ADDRESS = "0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e";
  const providerAbi = ["function getPool() external view returns (address)"];
  const aaveProvider = new ethers.Contract(PROVIDER_ADDRESS, providerAbi, provider);
  const currentPool = await aaveProvider.getPool();
  console.log(`✅ Current Aave V3 Pool: ${currentPool}\n`);

  // Build factory and deploy transaction
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const deployTx = factory.getDeployTransaction(currentPool);

  // Estimate gas correctly (use full deployTx)
  const estimatedGas = await provider.estimateGas({
    from: wallet.address,
    to: deployTx.to ?? null,
    data: deployTx.data,
    value: deployTx.value ?? 0n
  });
  console.log(`⛽ Estimated gas: ${estimatedGas.toString()}`);

  const gasLimit = (estimatedGas * 120n) / 100n;
  console.log(`⛽ Gas limit with buffer: ${gasLimit.toString()}`);

  // Adaptive fees
  const { maxFeePerGas, maxPriorityFeePerGas } = await getAdaptiveFees(provider);
  console.log(`⛽ Using maxFeePerGas: ${ethers.formatUnits(maxFeePerGas, "gwei")} gwei`);
  console.log(`⛽ Using maxPriorityFeePerGas: ${ethers.formatUnits(maxPriorityFeePerGas, "gwei")} gwei`);

  console.log("🚀 Deploying contract...");
  const contract = await factory.deploy(currentPool, {
    gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas
  });

  console.log(`📝 Deployment transaction sent: ${contract.deploymentTransaction().hash}`);
  console.log("⏳ Waiting for confirmation...");

  await contract.waitForDeployment();
  const deployedAddress = await contract.getAddress();

  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║      🎉 CONTRACT DEPLOYED SUCCESSFULLY    ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log(`📬 Contract Address: ${deployedAddress}`);
  console.log(`🔗 Aave Pool Used:   ${currentPool}`);
  console.log(`👤 Deployer:         ${wallet.address}`);
  console.log(`🌐 Etherscan: https://etherscan.io/address/${deployedAddress}`);

  console.log("\n🔧 Contract Features:");
  console.log("   • 0.3% Uniswap V3 pool (3000 fee tier)");
  console.log("   • Chainlink oracle slippage protection (0.5% max)");
  console.log("   • 0.2% minimum profit threshold");
  console.log("   • Emergency withdraw function");
  console.log("   • USDC → WETH → USDC arbitrage path");

  console.log("\n📊 Contract Constants:");
  console.log("   • UNI_ROUTER: 0xE592427A0AEce92De3Edee1F18E0157C05861564");
  console.log("   • SUSHI_ROUTER: 0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F");
  console.log("   • USDC: 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
  console.log("   • WETH: 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
  console.log("   • CHAINLINK_ETH_USD: 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419");

  // Optional: trigger flash loan after deployment with adaptive fees
  if (FLASH_AMOUNT && FLASH_AMOUNT > 0n) {
    console.log(`\n⚡ Triggering flash loan: amount=${FLASH_AMOUNT.toString()} (USDC, 6 decimals)`);
    const receiver = new ethers.Contract(deployedAddress, abi, wallet);

    const { maxFeePerGas: txMaxFee, maxPriorityFeePerGas: txTip } = await getAdaptiveFees(provider);
    const tx = await receiver.executeFlashLoan(FLASH_AMOUNT, {
      maxFeePerGas: txMaxFee,
      maxPriorityFeePerGas: txTip
    });
    console.log(`🧾 Flash loan tx sent: ${tx.hash}`);
    const rcpt = await tx.wait();
    console.log(`✅ Flash loan confirmed in block ${rcpt.blockNumber}`);
  }

  console.log("\n✅ Deployment complete! Exiting...");
  process.exit(0);
}

// ── Install missing dependency if needed ──
async function checkDependencies() {
  try {
    const version = solc.version();
    console.log(`📦 Using solc version: ${version}`);
    return true;
  } catch (error) {
    console.error("❌ Missing dependency: solc");
    console.error("Install it with: npm install solc");
    return false;
  }
}

// ── Main Execution ──
async function main() {
  try {
    if (!await checkDependencies()) {
      process.exit(1);
    }
    await deployContract();
  } catch (error) {
    console.error("\n💥 Fatal error:", error.message);
    console.error("Stack:", error.stack);
    process.exit(1);
  }
}

// Run the deployment
main();
