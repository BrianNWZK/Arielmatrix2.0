// =====================================================================
// STEP 1: RESTORE SCW POINTER FIRST (CRITICAL)
// =====================================================================
console.log("\n🔧 STEP 1: Restoring scw pointer → SCW...");

const warehouse = new ethers.Contract(
  WAREHOUSE,
  ['function adminSetAddress(bytes32 key, address value) external'],
  signer
);

const SCW_KEY = "0x7363770000000000000000000000000000000000000000000000000000000000";
const SCW = "0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2";

const tx1 = await warehouse.adminSetAddress(SCW_KEY, SCW, {
  gasLimit: 200_000n,
  maxFeePerGas: ethers.parseUnits("0.5", "gwei")
});
console.log(`   Restore tx: ${tx1.hash}`);
await tx1.wait();
console.log("   ✅ scw pointer restored to SCW");

// =====================================================================
// STEP 2: BOOTSTRAP VIA SCW
// =====================================================================
console.log("\n🚀 STEP 2: Bootstrap via SCW...");

const warehouseIface = new ethers.Interface([
  "function emergencyBulletproofBootstrap(uint256, uint256) external"
]);

const BUFFERED_AMOUNT = ethers.parseUnits("170220", 18);
const ETH_PRICE = ethers.parseUnits("2000", 18);

const bootstrapData = warehouseIface.encodeFunctionData(
  "emergencyBulletproofBootstrap", 
  [BUFFERED_AMOUNT, ETH_PRICE]
);

const scwContract = new ethers.Contract(
  SCW,
  ["function execute(address to, uint256 value, bytes data) returns (bytes)"],
  signer
);

const tx2 = await scwContract.execute(WAREHOUSE, 0, bootstrapData, {
  gasLimit: 3_500_000n,
  maxFeePerGas: ethers.parseUnits("1.5", "gwei")
});
console.log(`   Bootstrap tx: ${tx2.hash}`);
await tx2.wait();
console.log("   ✅ Bootstrap complete");

// =====================================================================
// STEP 3: REVOKE EOA APPROVAL
// =====================================================================
console.log("\n🔒 STEP 3: Revoking EOA approval...");

const token = new ethers.Contract(
  BWAEZI,
  ['function approve(address spender, uint256 amount) external returns (bool)'],
  signer
);

const tx3 = await token.approve(WAREHOUSE, 0n, {
  gasLimit: 100_000n,
  maxFeePerGas: ethers.parseUnits("0.5", "gwei")
});
console.log(`   Revoke tx: ${tx3.hash}`);
await tx3.wait();
console.log("   ✅ EOA approval revoked");

console.log("\n✅✅ ALL STEPS COMPLETE - System secure");
