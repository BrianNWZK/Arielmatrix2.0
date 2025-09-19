const { ethers } = require("hardhat");
const totalSupply = BWAEZI_SOVEREIGN_CONFIG.TOTAL_SUPPLY;
const founder = BWAEZI_SOVEREIGN_CONFIG.SOVEREIGN_OWNER;

await contract.deploy({ totalSupply, founder });

async function main() {
    const BwaeziCore = await ethers.getContractFactory("BwaeziCore");
    const registry = await BwaeziCore.deploy();
    await registry.waitForDeployment();
    console.log("✅ BwaeziCore deployed to:", registry.target);
}

main().catch(console.error);
