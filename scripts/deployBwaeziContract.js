const { ethers } = require("hardhat");

async function main() {
  const RevenueDistributor = await ethers.getContractFactory("RevenueDistributor");
  const distributor = await RevenueDistributor.deploy();
  await distributor.waitForDeployment();
  console.log("Deployed to:", distributor.target);
}

main();
