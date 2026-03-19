import { ethers } from "ethers";

// 1. CONFIGURATION
const RPC_URL = "https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161";
// staticNetwork: true prevents unnecessary "getNetwork" calls to the RPC
const provider = new ethers.JsonRpcProvider(RPC_URL, undefined, { staticNetwork: true });

const ADDRESSES = {
    WAREHOUSE: ethers.getAddress("0x78043417f7E15CF29cbB52cC584e11Ae33FE1542"),
    VAULT: ethers.getAddress("0xBA12222222228d8Ba445958a75a0704d566BF2C8"),
    SCW: ethers.getAddress("0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2"),
    USDC: ethers.getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
    BWZC: ethers.getAddress("0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2"),
    SIGNER: "0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA"
};

const ERROR_MAP = {
    '0x96c13538': 'SpreadTooLow()',
    '0x1eae4139': 'InsufficientBalance()',
    '0x2a3c3bf2': 'SCWInsufficientBWZC()',
    '0x5c4483c3': 'InsufficientBalancerLiquidity()',
    '0x2a0c88ae': 'SwapFailed()',
    '0x8b1145fb': 'BadEthPrice()',
    '0x99ef4c96': 'BootstrapAlreadyCompleted()'
};

// 2. VAULT & SCW INSPECTOR
async function checkInventory(usdTarget) {
    const usdc = new ethers.Contract(ADDRESSES.USDC, ['function balanceOf(address) view returns (uint256)'], provider);
    const bwzc = new ethers.Contract(ADDRESSES.BWZC, ['function balanceOf(address) view returns (uint256)'], provider);

    const vaultUsdc = await usdc.balanceOf(ADDRESSES.VAULT);
    const scwBwzc = await bwzc.balanceOf(ADDRESSES.SCW);
    const requiredUsdcFlash = usdTarget / 2n;

    console.log("\n💰 INVENTORY CHECK");
    console.log(`Vault USDC: ${ethers.formatUnits(vaultUsdc, 6)} | Required: ${ethers.formatUnits(requiredUsdcFlash, 6)}`);
    console.log(`SCW BWZC:   ${ethers.formatUnits(scwBwzc, 18)}`);

    if (vaultUsdc < requiredUsdcFlash) {
        console.log(`❌ Vault short by ${ethers.formatUnits(requiredUsdcFlash - vaultUsdc, 6)} USDC`);
    }
}

// 3. SIMULATION ENGINE
async function simulate(label, bwzcSeed, usdAmount, ethPrice) {
    const warehouse = new ethers.Contract(ADDRESSES.WAREHOUSE, [
        'function globalInitialBootstrap(uint256,uint256,uint256) external'
    ], provider);

    console.log(`\n🧪 SIMULATING: ${label}`);
    
    try {
        await warehouse.globalInitialBootstrap.staticCall(
            bwzcSeed, usdAmount, ethPrice, 
            { from: ADDRESSES.SIGNER }
        );
        console.log("✅ SUCCESS: Transaction is valid.");
        return true;
    } catch (error) {
        let data = error.data || error.error?.data;
        console.log("❌ REVERTED");
        
        if (data && data.startsWith('0x08c379a0')) {
            const reason = ethers.AbiCoder.defaultAbiCoder().decode(['string'], '0x' + data.slice(10))[0];
            console.log(`📋 Reason: "${reason}"`);
        } else if (data) {
            const selector = data.slice(0, 10);
            console.log(`📋 Error: ${ERROR_MAP[selector] || selector}`);
        } else {
            console.log(`📋 Message: ${error.message}`);
        }
        return false;
    }
}

// 4. MAIN EXECUTION LOOP
async function main() {
    try {
        const block = await provider.getBlockNumber();
        console.log(`✅ Connected to Infura (Block: ${block})`);
    } catch (e) {
        console.error("❌ Connection Failed. Check RPC URL.");
        return;
    }

    const usd600k = ethers.parseUnits("600000", 6);
    const usd300k = ethers.parseUnits("300000", 6);
    const ethPrice = ethers.parseUnits("2200", 18);
    const bwzc600k = ethers.parseUnits("25531.91", 18);
    const bwzc300k = ethers.parseUnits("12765.96", 18);

    await checkInventory(usd600k);
    
    // Check 600k first
    const success600 = await simulate("$600k Strike", bwzc600k, usd600k, ethPrice);
    
    // If 600k fails, check 300k
    if (!success600) {
        await simulate("$300k Strike", bwzc300k, usd300k, ethPrice);
    }
}

main().catch(console.error);
