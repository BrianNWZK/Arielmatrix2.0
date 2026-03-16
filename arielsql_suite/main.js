// main.js — Test Transfer 1 BWAEZI
// NO RETRIES - Exits immediately on any failure

import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

const RPC_URL = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY; // EOA private key
if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");

// Addresses
const BWAEZI_TOKEN = "0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2";
const WAREHOUSE = "0x39539214246390bA6F852c519b6AB4DC45dF0469";
const SCW = "0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2";
const EOA = "0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA";

// ABIs
const erc20Abi = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)"
];
const scwAbi = ["function execute(address to, uint256 value, bytes data) returns (bytes)"];

async function main() {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    console.log(`\n🔍 TEST: Transfer 1 BWAEZI`);
    console.log(`=================================`);
    console.log(`EOA: ${wallet.address}`);
    console.log(`SCW: ${SCW}`);
    console.log(`Warehouse: ${WAREHOUSE}`);
    console.log(`Token: ${BWAEZI_TOKEN}`);

    // Check initial balances
    const token = new ethers.Contract(BWAEZI_TOKEN, erc20Abi, provider);
    const scwBalance = await token.balanceOf(SCW);
    const warehouseBalance = await token.balanceOf(WAREHOUSE);
    const eoaBalance = await token.balanceOf(EOA);

    console.log(`\n💰 Initial Balances:`);
    console.log(`   SCW: ${ethers.formatEther(scwBalance)} BWAEZI`);
    console.log(`   Warehouse: ${ethers.formatEther(warehouseBalance)} BWAEZI`);
    console.log(`   EOA: ${ethers.formatEther(eoaBalance)} BWAEZI`);

    const amount1 = ethers.parseEther("1"); // 1 BWAEZI

    // =====================================================================
    // TEST 1: Transfer 1 BWAEZI from SCW → WAREHOUSE
    // =====================================================================
    console.log(`\n📤 TEST 1: Transfer 1 BWAEZI from SCW → Warehouse`);

    const erc20Iface = new ethers.Interface(erc20Abi);
    const transferData = erc20Iface.encodeFunctionData("transfer", [WAREHOUSE, amount1]);

    const scwIface = new ethers.Interface(scwAbi);
    const execData = scwIface.encodeFunctionData("execute", [BWAEZI_TOKEN, 0n, transferData]);

    const tx1 = await wallet.sendTransaction({
      to: SCW,
      data: execData,
      gasLimit: 300_000n,
      maxFeePerGas: ethers.parseUnits("0.5", "gwei")
    });

    console.log(`   TX sent: ${tx1.hash}`);
    console.log(`   View: https://etherscan.io/tx/${tx1.hash}`);
    
    // Wait for confirmation - throws on revert
    const receipt1 = await tx1.wait();
    
    if (receipt1.status === 1) {
      console.log(`   ✅ TEST 1 SUCCESS - Warehouse can receive tokens`);
    } else {
      throw new Error(`TEST 1 FAILED - Transaction reverted`);
    }

    // Check balances after TEST 1
    const scwBalanceAfter1 = await token.balanceOf(SCW);
    const warehouseBalanceAfter1 = await token.balanceOf(WAREHOUSE);
    console.log(`\n💰 After TEST 1:`);
    console.log(`   SCW: ${ethers.formatEther(scwBalanceAfter1)} BWAEZI`);
    console.log(`   Warehouse: ${ethers.formatEther(warehouseBalanceAfter1)} BWAEZI`);

    // =====================================================================
    // TEST 2: Transfer 1 BWAEZI from SCW → EOA
    // =====================================================================
    console.log(`\n📤 TEST 2: Transfer 1 BWAEZI from SCW → EOA`);

    const transferData2 = erc20Iface.encodeFunctionData("transfer", [EOA, amount1]);
    const execData2 = scwIface.encodeFunctionData("execute", [BWAEZI_TOKEN, 0n, transferData2]);

    const tx2 = await wallet.sendTransaction({
      to: SCW,
      data: execData2,
      gasLimit: 300_000n,
      maxFeePerGas: ethers.parseUnits("0.5", "gwei")
    });

    console.log(`   TX sent: ${tx2.hash}`);
    console.log(`   View: https://etherscan.io/tx/${tx2.hash}`);
    
    const receipt2 = await tx2.wait();
    
    if (receipt2.status === 1) {
      console.log(`   ✅ TEST 2 SUCCESS - SCW can send to EOA`);
    } else {
      throw new Error(`TEST 2 FAILED - Transaction reverted`);
    }

    // Final balances
    const scwBalanceFinal = await token.balanceOf(SCW);
    const warehouseBalanceFinal = await token.balanceOf(WAREHOUSE);
    const eoaBalanceFinal = await token.balanceOf(EOA);

    console.log(`\n💰 Final Balances:`);
    console.log(`   SCW: ${ethers.formatEther(scwBalanceFinal)} BWAEZI`);
    console.log(`   Warehouse: ${ethers.formatEther(warehouseBalanceFinal)} BWAEZI`);
    console.log(`   EOA: ${ethers.formatEther(eoaBalanceFinal)} BWAEZI`);

    console.log(`\n🎯 TEST COMPLETE - All transfers succeeded`);
    process.exit(0);

  } catch (error) {
    console.error(`\n❌ ERROR: ${error.message}`);
    if (error.transactionHash) {
      console.log(`Failed tx: https://etherscan.io/tx/${error.transactionHash}`);
    }
    console.log(`\n🛑 Stopping immediately - no retries`);
    process.exit(1);
  }
}

main();
