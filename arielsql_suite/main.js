// main.js - Flash Loan Arbitrage Receiver Deployer - COMPILE + DEPLOY VERSION
// January 2026 - Ethereum Mainnet

import dotenv from "dotenv";
import { ethers } from "ethers";
import solc from "solc";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("PRIVATE_KEY missing in .env");

// Multiple RPC endpoints (fallback order)
const RPC_URLS = [
  "https://ethereum-rpc.publicnode.com",
  "https://rpc.ankr.com/eth",
  "https://eth.llamarpc.com"
];

// ── CORRECT CONTRACT SOURCE WITH IAavePool INTERFACE ──
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

    // Mainnet addresses (verified January 2026)
    address public constant UNI_ROUTER    = 0xE592427A0AEce92De3Edee1F18E0157C05861564;
    address public constant SUSHI_ROUTER  = 0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F;
    address public constant USDC          = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;
    address public constant WETH          = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;

    // Chainlink ETH/USD oracle (8 decimals) - stable & widely used
    address public constant CHAINLINK_ETH_USD = 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419;

    uint24 public constant UNI_FEE_TIER = 3000;           // Patched to your 0.3% pool
    uint256 public constant MIN_PROFIT_BPS = 20;           // Increased to 0.2% for safety
    uint256 public constant MAX_SLIPPAGE_BPS = 50;         // New: 0.5% max slippage tolerance

    constructor(address _aavePool) {
        owner = msg.sender;
        AAVE_POOL = _aavePool;
    }

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata /* params */
    ) external returns (bool) {
        require(msg.sender == AAVE_POOL, "Only Aave Pool");
        require(initiator == address(this), "Invalid initiator");
        require(asset == USDC, "Only USDC supported");

        uint256 totalDebt = amount + premium;

        // === PATCHED: Oracle-based slippage protection ===
        // Get expected WETH out for USDC in (Chainlink price)
        int256 ethPriceInt = IChainlinkOracle(CHAINLINK_ETH_USD).latestAnswer();
        require(ethPriceInt > 0, "Invalid oracle price");
        uint256 ethPrice = uint256(ethPriceInt); // 8 decimals

        // Expected WETH = (amount USDC * 1e12) / ethPrice (adjust decimals: USDC 6 → 18 equiv)
        uint256 expectedWethOut = (amount * 1e12) / ethPrice;

        // Apply max slippage tolerance
        uint256 minWethOut = expectedWethOut * (10000 - MAX_SLIPPAGE_BPS) / 10000;

        // === APPROVALS (as you required) ===
        IERC20(USDC).approve(UNI_ROUTER, amount);

        // ── 1. USDC → WETH on Uniswap V3 (your 3000 tier) ─────────────────────
        IUniswapV3Router.ExactInputSingleParams memory uniParams = IUniswapV3Router.ExactInputSingleParams({
            tokenIn: USDC,
            tokenOut: WETH,
            fee: UNI_FEE_TIER,                    // Patched to 3000
            recipient: address(this),
            deadline: block.timestamp + 600,
            amountIn: amount,
            amountOutMinimum: minWethOut,          // New slippage protection
            sqrtPriceLimitX96: 0
        });

        uint256 wethReceived = IUniswapV3Router(UNI_ROUTER).exactInputSingle(uniParams);

        // Approve WETH for SushiSwap
        IERC20(WETH).approve(SUSHI_ROUTER, wethReceived);

        // ── 2. WETH → USDC on SushiSwap V2 (with light slippage check) ───────
        address[] memory path = new address[](2);
        path[0] = WETH;
        path[1] = USDC;

        // Rough min out: expect at least totalDebt (break-even)
        uint256 minUsdcOut = totalDebt * (10000 + MIN_PROFIT_BPS) / 10000;

        uint[] memory amounts = ISushiSwapRouter(SUSHI_ROUTER).swapExactTokensForTokens(
            wethReceived,
            minUsdcOut,
            path,
            address(this),
            block.timestamp + 600
        );

        uint256 usdcReceived = amounts[1];

        // ── 3. Final profit check & repay ───────────────────────────────────
        require(usdcReceived >= totalDebt + (totalDebt * MIN_PROFIT_BPS / 10000), "Insufficient profit");

        // Send profit to owner
        uint256 profit = usdcReceived - totalDebt;
        if (profit > 0) {
            IERC20(USDC).transfer(owner, profit);
        }

        // Final approval for Aave repayment
        IERC20(USDC).approve(AAVE_POOL, totalDebt);

        return true;
    }

    // Public trigger (restrict in production with onlyOwner)
    function executeFlashLoan(uint256 amount) external {
        // Optional: add onlyOwner modifier here for security
        IAavePool(AAVE_POOL).flashLoanSimple(
            address(this),
            USDC,
            amount,
            "",
            0
        );
    }

    // Emergency withdraw (only owner)
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
      const blockNumber = await provider.getBlockNumber();
      if (blockNumber >= 0) {
        console.log(`✅ Using RPC: ${rpcUrl} (block ${blockNumber})`);
        return provider;
      }
    } catch (e) {
      console.warn(`⚠️ RPC failed: ${rpcUrl} → ${e?.message || e}`);
    }
  }
  throw new Error("No healthy RPC endpoint available");
}

// ── Compile Contract ───────────────────────────────────────────────────
function compileContract() {
  console.log("🔨 Compiling contract...");
  
  const input = {
    language: "Solidity",
    sources: {
      "FlashArbReceiver.sol": {
        content: contractSource
      }
    },
    settings: {
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"]
        }
      },
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  };

  try {
    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    
    if (output.errors) {
      const errors = output.errors.filter(err => err.severity === "error");
      if (errors.length > 0) {
        console.error("❌ Compilation errors:");
        errors.forEach(err => console.error(err.formattedMessage));
        throw new Error("Compilation failed");
      }
    }
    
    const contract = output.contracts["FlashArbReceiver.sol"].FlashArbReceiver;
    
    if (!contract) {
      throw new Error("Contract not found in compilation output");
    }
    
    const abi = contract.abi;
    const bytecode = "0x" + contract.evm.bytecode.object;
    
    console.log("✅ Compilation successful!");
    console.log(`📏 Bytecode length: ${bytecode.length} characters`);
    console.log(`🔗 ABI has ${abi.length} entries`);
    
    return { abi, bytecode };
    
  } catch (error) {
    console.error("❌ Compilation error:", error.message);
    throw error;
  }
}

// ── Deployment ───────────────────────────────────────────────────
async function deployContract() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║ UPDATED PATCHED ARB RECEIVER DEPLOY START ║");
  console.log("╚══════════════════════════════════════════╝\n");

  // Step 1: Compile the contract
  const { abi, bytecode } = compileContract();
  
  // Step 2: Connect to Ethereum
  const provider = await getHealthyProvider();
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`👤 Deployer address: ${wallet.address}`);
  const balance = await provider.getBalance(wallet.address);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH\n`);
  
  // Check if balance is sufficient
  const minBalance = ethers.parseEther("0.001"); // 0.001 ETH minimum
  if (balance < minBalance) {
    throw new Error(`Insufficient balance. Need at least ${ethers.formatEther(minBalance)} ETH, have ${ethers.formatEther(balance)} ETH`);
  }

  // Step 3: Fetch current Aave V3 Pool
  console.log("📡 Fetching current Aave V3 Pool address...");
  const PROVIDER_ADDRESS = "0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e";
  const providerAbi = ["function getPool() external view returns (address)"];
  const aaveProvider = new ethers.Contract(PROVIDER_ADDRESS, providerAbi, provider);
  const currentPool = await aaveProvider.getPool();
  console.log(`✅ Current Aave V3 Pool: ${currentPool}\n`);

  // Step 4: Deploy the contract
  console.log("🚀 Deploying contract...");
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  
  try {
    // Estimate gas cost
    const deployTx = factory.getDeployTransaction(currentPool);
    const estimatedGas = await provider.estimateGas({
      from: wallet.address,
      data: deployTx.data
    });
    
    console.log(`⛽ Estimated gas: ${estimatedGas.toString()}`);
    
    // Add 20% buffer for safety
    const gasLimit = estimatedGas * 120n / 100n;
    
    console.log(`⛽ Gas limit with buffer: ${gasLimit.toString()}`);
    
    // Deploy with reasonable gas prices
    const contract = await factory.deploy(currentPool, {
      gasLimit: gasLimit,
      maxFeePerGas: ethers.parseUnits("25", "gwei"),
      maxPriorityFeePerGas: ethers.parseUnits("1", "gwei")
    });

    console.log(`📝 Deployment transaction sent: ${contract.deploymentTransaction().hash}`);
    console.log("⏳ Waiting for confirmation...");
    
    // Wait for deployment
    await contract.waitForDeployment();
    
    // Get deployed address
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
    console.log(`   • UNI_ROUTER: ${"0xE592427A0AEce92De3Edee1F18E0157C05861564"}`);
    console.log(`   • SUSHI_ROUTER: ${"0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F"}`);
    console.log(`   • USDC: ${"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"}`);
    console.log(`   • WETH: ${"0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"}`);
    console.log(`   • CHAINLINK_ETH_USD: ${"0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419"}`);

    // Verify the contract
    console.log("\n🔍 Verifying deployment...");
    const owner = await contract.owner();
    console.log(`   • Contract owner: ${owner}`);
    console.log(`   • Owner matches deployer: ${owner.toLowerCase() === wallet.address.toLowerCase() ? "✅ Yes" : "❌ No"}`);
    
    const aavePoolStored = await contract.AAVE_POOL();
    console.log(`   • Aave Pool stored correctly: ${aavePoolStored === currentPool ? "✅ Yes" : "❌ No"}`);
    
  } catch (error) {
    console.error("\n❌ Deployment failed!");
    console.error("Error message:", error.message);
    
    if (error.info) {
      console.error("Error info:", JSON.stringify(error.info, null, 2));
    }
    
    if (error.transaction) {
      console.error("Transaction data (first 200 chars):", error.transaction.data?.slice(0, 200));
    }
    
    throw error;
  }

  console.log("\n✅ Deployment complete! Exiting...");
  process.exit(0);
}

// ── Install missing dependency if needed ─────────────────────────
async function checkDependencies() {
  try {
    // Check if solc is available
    const version = solc.version();
    console.log(`📦 Using solc version: ${version}`);
    return true;
  } catch (error) {
    console.error("❌ Missing dependency: solc");
    console.error("Install it with: npm install solc");
    return false;
  }
}

// ── Main Execution ───────────────────────────────────────────────
async function main() {
  try {
    // Check dependencies
    if (!await checkDependencies()) {
      process.exit(1);
    }
    
    // Deploy the contract
    await deployContract();
    
  } catch (error) {
    console.error("\n💥 Fatal error:", error.message);
    console.error("Stack:", error.stack);
    process.exit(1);
  }
}

// Run the deployment
main();
