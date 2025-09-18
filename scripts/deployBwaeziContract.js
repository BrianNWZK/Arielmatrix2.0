const { ethers } = require("hardhat");

async function main() {
    const BwaeziCore = await ethers.getContractFactory("BwaeziCore");
    const registry = await BwaeziCore.deploy();
    await registry.waitForDeployment();
    console.log("✅ BwaeziCore deployed to:", registry.target);
}

main().catch(console.error);
