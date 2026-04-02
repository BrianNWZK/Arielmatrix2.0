/**
 * DEBUG SCRIPT - ZERO GAS COST
 * Run this BEFORE attempting bootstrap to diagnose all issues
 * 
 * Usage: node debug.js
 */

import { ethers } from 'ethers';

// =========================================================================
// CONFIGURATION
// =========================================================================
const CONFIG = {
    // Contract Addresses
    WAREHOUSE: "0x9098Fe6512b2d00b1dc7bFa63C62904476BA7fE6",
    SCW: "0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2",
    BWAEZI: "0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2",
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    BALANCER_VAULT: "0xba12222222228d8ba445958a75a0704d566bf2c8",
    ENTRY_POINT: "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
    
    // Pool IDs (from your deployment)
    BAL_BW_USDC_ID: "0x6659db7c55c701bc627fa2855bfbbc6d75d6fd7a000200000000000000000706",
    BAL_BW_WETH_ID: "0x9b143788f52daa8c91cf5162fb1b981663a8a1ef000200000000000000000707",
    
    // RPC Endpoints (free, reliable)
    RPC_URLS: [
        "https://ethereum-rpc.publicnode.com",
        "https://rpc.ankr.com/eth",
        "https://1rpc.io/eth",
        "https://eth.public-rpc.com",
        "https://cloudflare-eth.com"
    ]
};

// =========================================================================
// HELPER FUNCTIONS
// =========================================================================
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function tryRpc(rpcUrl) {
    try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        await provider.getBlockNumber();
        return provider;
    } catch (e) {
        return null;
    }
}

async function getWorkingProvider() {
    for (const url of CONFIG.RPC_URLS) {
        const provider = await tryRpc(url);
        if (provider) {
            console.log(`✅ Connected to: ${url.split('/')[2]}`);
            return provider;
        }
    }
    throw new Error("No working RPC found");
}

// =========================================================================
// ABI DEFINITIONS (MINIMAL - JUST WHAT WE NEED)
// =========================================================================
const ERC20_ABI = [
    'function balanceOf(address) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function allowance(address,address) view returns (uint256)'
];

const BALANCER_VAULT_ABI = [
    'function getPoolTokens(bytes32) view returns (address[], uint256[], uint256)'
];

const WAREHOUSE_ABI = [
    'function cycleCount() view returns (uint256)',
    'function bootstrapCompleted() view returns (bool)',
    'function paused() view returns (bool)',
    'function getCurrentSpread() view returns (uint256)',
    'function getMinRequiredSpread() view returns (uint256)',
    'function lastCycleTimestamp() view returns (uint256)'
];

// =========================================================================
// MAIN DEBUG FUNCTION
// =========================================================================
async function debugBootstrap() {
    console.log("\n" + "=".repeat(80));
    console.log("🔍 BOOTSTRAP DEBUG DIAGNOSIS - ZERO GAS");
    console.log("=".repeat(80));
    
    // Get working provider
    const provider = await getWorkingProvider();
    
    // Initialize contracts
    const usdc = new ethers.Contract(CONFIG.USDC, ERC20_ABI, provider);
    const weth = new ethers.Contract(CONFIG.WETH, ERC20_ABI, provider);
    const bwaezi = new ethers.Contract(CONFIG.BWAEZI, ERC20_ABI, provider);
    const vault = new ethers.Contract(CONFIG.BALANCER_VAULT, BALANCER_VAULT_ABI, provider);
    const warehouse = new ethers.Contract(CONFIG.WAREHOUSE, WAREHOUSE_ABI, provider);
    
    // =====================================================================
    // 1. CHECK CONTRACT STATE
    // =====================================================================
    console.log("\n📋 1. CONTRACT STATE");
    console.log("-".repeat(40));
    
    try {
        const cycleCount = await warehouse.cycleCount();
        const bootstrapCompleted = await warehouse.bootstrapCompleted();
        const paused = await warehouse.paused();
        const spread = await warehouse.getCurrentSpread();
        const minSpread = await warehouse.getMinRequiredSpread();
        const lastCycle = await warehouse.lastCycleTimestamp();
        
        console.log(`   Warehouse Contract: ${CONFIG.WAREHOUSE}`);
        console.log(`   Cycle Count: ${cycleCount.toString()}`);
        console.log(`   Bootstrap Completed: ${bootstrapCompleted}`);
        console.log(`   Paused: ${paused}`);
        console.log(`   Current Spread: ${spread.toString()} bps`);
        console.log(`   Min Required Spread: ${minSpread.toString()} bps`);
        console.log(`   Last Cycle: ${lastCycle.toString() > 0 ? new Date(Number(lastCycle) * 1000).toISOString() : 'never'}`);
        
        if (bootstrapCompleted) {
            console.log("\n⚠️ BOOTSTRAP ALREADY COMPLETED! No action needed.");
            return;
        }
    } catch (e) {
        console.log(`   ❌ Cannot read contract state: ${e.message}`);
    }
    
    // =====================================================================
    // 2. CHECK SCW BALANCES
    // =====================================================================
    console.log("\n📋 2. SCW BALANCES");
    console.log("-".repeat(40));
    
    const scwBwaezi = await bwaezi.balanceOf(CONFIG.SCW);
    const scwUsdc = await usdc.balanceOf(CONFIG.SCW);
    const scwWeth = await weth.balanceOf(CONFIG.SCW);
    const scwEth = await provider.getBalance(CONFIG.SCW);
    
    const bwaeziDecimals = await bwaezi.decimals();
    const usdcDecimals = await usdc.decimals();
    const wethDecimals = await weth.decimals();
    
    console.log(`   SCW Address: ${CONFIG.SCW}`);
    console.log(`   BWAEZI: ${ethers.formatUnits(scwBwaezi, bwaeziDecimals)} BWZC`);
    console.log(`   USDC: ${ethers.formatUnits(scwUsdc, usdcDecimals)} USDC`);
    console.log(`   WETH: ${ethers.formatEther(scwWeth)} WETH`);
    console.log(`   ETH: ${ethers.formatEther(scwEth)} ETH (for gas)`);
    
    // Required amounts
    const requiredBwzcSeed = ethers.parseEther("42553"); // 42,553 BWZC
    const requiredBwzcArb = requiredBwzcSeed / 2n; // 21,276.5 BWZC
    const totalRequiredBwzc = requiredBwzcSeed + requiredBwzcArb;
    
    console.log(`\n   Required for Bootstrap:`);
    console.log(`   - BWZC Seed: ${ethers.formatEther(requiredBwzcSeed)} BWZC`);
    console.log(`   - BWZC for Arb: ${ethers.formatEther(requiredBwzcArb)} BWZC`);
    console.log(`   - Total BWZC Needed: ${ethers.formatEther(totalRequiredBwzc)} BWZC`);
    
    const hasEnoughBwzc = scwBwaezi >= totalRequiredBwzc;
    console.log(`   ✅ SCW has enough BWZC: ${hasEnoughBwzc ? 'YES' : 'NO'}`);
    
    if (!hasEnoughBwzc) {
        console.log(`   ⚠️ Short by: ${ethers.formatEther(totalRequiredBwzc - scwBwaezi)} BWZC`);
    }
    
    // Check approval
    const allowance = await bwaezi.allowance(CONFIG.SCW, CONFIG.WAREHOUSE);
    console.log(`\n   BWAEZI Allowance to Warehouse: ${ethers.formatUnits(allowance, bwaeziDecimals)} BWZC`);
    const hasAllowance = allowance >= totalRequiredBwzc;
    console.log(`   ✅ Allowance sufficient: ${hasAllowance ? 'YES' : 'NO'}`);
    
    if (!hasAllowance) {
        console.log(`   ⚠️ Need to approve warehouse contract for at least ${ethers.formatEther(totalRequiredBwzc)} BWZC`);
    }
    
    // =====================================================================
    // 3. CHECK BALANCER VAULT LIQUIDITY
    // =====================================================================
    console.log("\n📋 3. BALANCER VAULT LIQUIDITY");
    console.log("-".repeat(40));
    
    const vaultUsdc = await usdc.balanceOf(CONFIG.BALANCER_VAULT);
    const vaultWeth = await weth.balanceOf(CONFIG.BALANCER_VAULT);
    
    console.log(`   Vault Address: ${CONFIG.BALANCER_VAULT}`);
    console.log(`   USDC in Vault: ${ethers.formatUnits(vaultUsdc, usdcDecimals)} USDC`);
    console.log(`   WETH in Vault: ${ethers.formatEther(vaultWeth)} WETH`);
    
    // Flashloan requirements
    const requiredFlashUsdc = ethers.parseUnits("250000", usdcDecimals); // 250,000 USDC
    const requiredFlashWeth = ethers.parseEther("116.28"); // ~116.28 WETH at $2,150
    
    console.log(`\n   Flashloan Requirements (25% of $1M):`);
    console.log(`   - Required USDC: ${ethers.formatUnits(requiredFlashUsdc, usdcDecimals)} USDC`);
    console.log(`   - Required WETH: ${ethers.formatEther(requiredFlashWeth)} WETH`);
    
    const vaultHasEnoughUsdc = vaultUsdc >= requiredFlashUsdc;
    const vaultHasEnoughWeth = vaultWeth >= requiredFlashWeth;
    
    console.log(`\n   ✅ Vault has enough USDC: ${vaultHasEnoughUsdc ? 'YES' : 'NO'}`);
    if (!vaultHasEnoughUsdc) {
        const deficit = ethers.formatUnits(requiredFlashUsdc - vaultUsdc, usdcDecimals);
        console.log(`   ⚠️ USDC deficit: ${deficit} USDC`);
    }
    
    console.log(`   ✅ Vault has enough WETH: ${vaultHasEnoughWeth ? 'YES' : 'NO'}`);
    if (!vaultHasEnoughWeth) {
        const deficit = ethers.formatEther(requiredFlashWeth - vaultWeth);
        console.log(`   ⚠️ WETH deficit: ${deficit} WETH`);
    }
    
    // =====================================================================
    // 4. CHECK BALANCER POOLS
    // =====================================================================
    console.log("\n📋 4. BALANCER POOL CONFIGURATION");
    console.log("-".repeat(40));
    
    // Check USDC Pool
    console.log(`\n   Pool: BWAEZI/USDC`);
    console.log(`   Pool ID: ${CONFIG.BAL_BW_USDC_ID}`);
    
    let poolUsdcTokens = [];
    let poolUsdcBalances = [];
    let poolUsdcValid = false;
    
    try {
        const [tokens, balances] = await vault.getPoolTokens(CONFIG.BAL_BW_USDC_ID);
        poolUsdcTokens = tokens;
        poolUsdcBalances = balances;
        poolUsdcValid = true;
        
        console.log(`   ✅ Pool exists!`);
        console.log(`   Token0: ${tokens[0]} ${tokens[0] === CONFIG.BWAEZI ? '(BWAEZI)' : tokens[0] === CONFIG.USDC ? '(USDC)' : ''}`);
        console.log(`   Token1: ${tokens[1]} ${tokens[1] === CONFIG.BWAEZI ? '(BWAEZI)' : tokens[1] === CONFIG.USDC ? '(USDC)' : ''}`);
        console.log(`   Balance0: ${ethers.formatUnits(balances[0], tokens[0] === CONFIG.USDC ? usdcDecimals : bwaeziDecimals)}`);
        console.log(`   Balance1: ${ethers.formatUnits(balances[1], tokens[1] === CONFIG.USDC ? usdcDecimals : bwaeziDecimals)}`);
        
        // Determine token positions
        const bwzcIndex = tokens.findIndex(t => t.toLowerCase() === CONFIG.BWAEZI.toLowerCase());
        const stableIndex = tokens.findIndex(t => t.toLowerCase() === CONFIG.USDC.toLowerCase());
        
        if (bwzcIndex !== -1 && stableIndex !== -1) {
            console.log(`   ✅ BWAEZI at index ${bwzcIndex}, USDC at index ${stableIndex}`);
            console.log(`   Pool Liquidity: ${ethers.formatUnits(balances[stableIndex], usdcDecimals)} USDC / ${ethers.formatUnits(balances[bwzcIndex], bwaeziDecimals)} BWZC`);
        }
    } catch (e) {
        console.log(`   ❌ Pool lookup failed: ${e.message}`);
        console.log(`   ⚠️ Pool ID may be incorrect or pool doesn't exist!`);
    }
    
    // Check WETH Pool
    console.log(`\n   Pool: BWAEZI/WETH`);
    console.log(`   Pool ID: ${CONFIG.BAL_BW_WETH_ID}`);
    
    let poolWethTokens = [];
    let poolWethValid = false;
    
    try {
        const [tokens, balances] = await vault.getPoolTokens(CONFIG.BAL_BW_WETH_ID);
        poolWethTokens = tokens;
        poolWethValid = true;
        
        console.log(`   ✅ Pool exists!`);
        console.log(`   Token0: ${tokens[0]} ${tokens[0] === CONFIG.BWAEZI ? '(BWAEZI)' : tokens[0] === CONFIG.WETH ? '(WETH)' : ''}`);
        console.log(`   Token1: ${tokens[1]} ${tokens[1] === CONFIG.BWAEZI ? '(BWAEZI)' : tokens[1] === CONFIG.WETH ? '(WETH)' : ''}`);
        console.log(`   Balance0: ${ethers.formatUnits(balances[0], tokens[0] === CONFIG.WETH ? wethDecimals : bwaeziDecimals)}`);
        console.log(`   Balance1: ${ethers.formatUnits(balances[1], tokens[1] === CONFIG.WETH ? wethDecimals : bwaeziDecimals)}`);
        
        const bwzcIndex = tokens.findIndex(t => t.toLowerCase() === CONFIG.BWAEZI.toLowerCase());
        const wethIndex = tokens.findIndex(t => t.toLowerCase() === CONFIG.WETH.toLowerCase());
        
        if (bwzcIndex !== -1 && wethIndex !== -1) {
            console.log(`   ✅ BWAEZI at index ${bwzcIndex}, WETH at index ${wethIndex}`);
            console.log(`   Pool Liquidity: ${ethers.formatEther(balances[wethIndex])} WETH / ${ethers.formatUnits(balances[bwzcIndex], bwaeziDecimals)} BWZC`);
        }
    } catch (e) {
        console.log(`   ❌ Pool lookup failed: ${e.message}`);
        console.log(`   ⚠️ Pool ID may be incorrect or pool doesn't exist!`);
    }
    
    // =====================================================================
    // 5. CHECK ENTRY POINT NONCE
    // =====================================================================
    console.log("\n📋 5. ENTRY POINT NONCE");
    console.log("-".repeat(40));
    
    const entryPoint = new ethers.Contract(
        CONFIG.ENTRY_POINT,
        ['function getNonce(address,uint192) view returns (uint256)'],
        provider
    );
    
    try {
        const nonce = await entryPoint.getNonce(CONFIG.SCW, 0);
        console.log(`   SCW Nonce: ${nonce.toString()}`);
        console.log(`   ✅ Nonce is valid`);
    } catch (e) {
        console.log(`   ❌ Failed to get nonce: ${e.message}`);
    }
    
    // =====================================================================
    // 6. SIMULATE BOOTSTRAP REQUIREMENTS
    // =====================================================================
    console.log("\n📋 6. BOOTSTRAP SIMULATION");
    console.log("-".repeat(40));
    
    const issues = [];
    const warnings = [];
    
    // Check all requirements
    if (!hasEnoughBwzc) issues.push("SCW has insufficient BWZC balance");
    if (!hasAllowance) issues.push("Warehouse contract not approved for BWZC");
    if (!vaultHasEnoughUsdc) issues.push(`Vault USDC insufficient. Need ${ethers.formatUnits(requiredFlashUsdc, usdcDecimals)} USDC`);
    if (!vaultHasEnoughWeth) issues.push(`Vault WETH insufficient. Need ${ethers.formatEther(requiredFlashWeth)} WETH`);
    if (!poolUsdcValid) issues.push("BWAEZI/USDC Balancer pool not found or invalid");
    if (!poolWethValid) issues.push("BWAEZI/WETH Balancer pool not found or invalid");
    
    if (scwEth < ethers.parseEther("0.01")) {
        warnings.push(`SCW ETH balance low (${ethers.formatEther(scwEth)} ETH). Need at least 0.01 ETH for gas`);
    }
    
    console.log("\n   Issues Found:");
    if (issues.length === 0) {
        console.log("   ✅ NO CRITICAL ISSUES!");
    } else {
        issues.forEach(issue => console.log(`   ❌ ${issue}`));
    }
    
    if (warnings.length > 0) {
        console.log("\n   Warnings:");
        warnings.forEach(warning => console.log(`   ⚠️ ${warning}`));
    }
    
    // =====================================================================
    // 7. RECOMMENDATIONS
    // =====================================================================
    console.log("\n📋 7. RECOMMENDATIONS");
    console.log("-".repeat(40));
    
    if (issues.length === 0) {
        console.log("\n✅ ALL CHECKS PASSED! Bootstrap should succeed.");
        console.log("\n🚀 To execute bootstrap:");
        console.log(`   Call globalInitialBootstrap with:`);
        console.log(`   - bwzcSeedAmount: ${ethers.formatEther(requiredBwzcSeed)} BWZC`);
        console.log(`   - usdAmount: ${ethers.formatUnits(requiredFlashUsdc * 4n, usdcDecimals)} USDC`);
        console.log(`   - ethPrice: 2150000000000000000000 ($${2150})`);
    } else {
        console.log("\n❌ ISSUES DETECTED. Fix before bootstrap:");
        
        if (!hasAllowance) {
            console.log("\n   1. APPROVE WAREHOUSE CONTRACT:");
            console.log(`      ```javascript`);
            console.log(`      const bwaezi = new ethers.Contract("${CONFIG.BWAEZI}", ERC20_ABI, signer);`);
            console.log(`      await bwaezi.appendApproval("${CONFIG.WAREHOUSE}", ethers.MaxUint256);`);
            console.log(`      ````);
        }
        
        if (!vaultHasEnoughUsdc || !vaultHasEnoughWeth) {
            console.log("\n   2. REDUCE BOOTSTRAP AMOUNT:");
            const maxSafeUsdc = vaultUsdc * 80n / 100n;
            const maxSafeUsdAmount = maxSafeUsdc * 4n;
            const maxSafeBwzcSeed = maxSafeUsdAmount * requiredBwzcSeed / ethers.parseUnits("1000000", usdcDecimals);
            
            console.log(`      Recommended values:`);
            console.log(`      - usdAmount: ${ethers.formatUnits(maxSafeUsdAmount, usdcDecimals)} USDC`);
            console.log(`      - bwzcSeedAmount: ${ethers.formatEther(maxSafeBwzcSeed)} BWZC`);
            console.log(`      - ethPrice: 2150000000000000000000 ($${2150})`);
        }
        
        if (!poolUsdcValid) {
            console.log("\n   3. FIX BWAEZI/USDC BALANCER POOL:");
            console.log(`      Pool ID appears invalid. Verify correct pool ID for BWAEZI/USDC pool.`);
        }
        
        if (!poolWethValid) {
            console.log("\n   4. FIX BWAEZI/WETH BALANCER POOL:");
            console.log(`      Pool ID appears invalid. Verify correct pool ID for BWAEZI/WETH pool.`);
        }
    }
    
    // =====================================================================
    // 8. SUMMARY
    // =====================================================================
    console.log("\n" + "=".repeat(80));
    console.log("📊 DEBUG SUMMARY");
    console.log("=".repeat(80));
    console.log(`   SCW: ${CONFIG.SCW}`);
    console.log(`   Warehouse: ${CONFIG.WAREHOUSE}`);
    console.log(`   Critical Issues: ${issues.length}`);
    console.log(`   Warnings: ${warnings.length}`);
    console.log(`   Ready for Bootstrap: ${issues.length === 0 ? '✅ YES' : '❌ NO'}`);
    console.log("=".repeat(80) + "\n");
    
    return {
        ready: issues.length === 0,
        issues,
        warnings,
        data: {
            scwBwaezi: ethers.formatEther(scwBwaezi),
            scwUsdc: ethers.formatUnits(scwUsdc, usdcDecimals),
            scwWeth: ethers.formatEther(scwWeth),
            scwEth: ethers.formatEther(scwEth),
            vaultUsdc: ethers.formatUnits(vaultUsdc, usdcDecimals),
            vaultWeth: ethers.formatEther(vaultWeth),
            poolUsdcValid,
            poolWethValid
        }
    };
}

// =========================================================================
// RUN THE DEBUG
// =========================================================================
debugBootstrap().catch(console.error);
