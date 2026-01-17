// RECOVER ALL FUNDS FROM BUGGED POOLS
async function recoverFunds() {
  console.log("🔄 RECOVERING ALL FUNDS...");
  
  // YOUR POOL DETAILS
  const POOLS = [
    {
      poolId: "0xaaed510c03df5a4c9d8d660fe477e01acdc9c5610002000000000000000006fe",
      bptAddr: "0xAaEd510C03df5A4c9D8D660fe477E01AcDC9c561",
      label: "USDC pool",
      bptBalance: ethers.parseEther("0.32004106")
    },
    {
      poolId: "0x76ee58af556857605516aafa10c3bbd31abbb0990002000000000000000006ff", 
      bptAddr: "0x76EE58AF556857605516aAFA10C3bBD31AbBB099",
      label: "WETH pool", 
      bptBalance: ethers.parseEther("0.06334135")
    }
  ];
  
  // APPROVE BPT TO VAULT
  const bptAbi = ["function approve(address,uint256) returns(bool)"];
  
  for (const pool of POOLS) {
    console.log(`\n💸 WITHDRAWING ${pool.label}...`);
    
    // 1. Approve BPT
    const bpt = new ethers.Contract(pool.bptAddr, bptAbi, signer);
    const approveTx = await bpt.approve(BALANCER_VAULT, pool.bptBalance);
    console.log(`BPT approve: https://etherscan.io/tx/${approveTx.hash}`);
    await approveTx.wait();
    
    // 2. EXIT POOL (send ALL BPT back → get tokens)
    const vaultIface = new ethers.Interface(vaultAbi);
    const userData = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "uint256", "uint256[]"], 
      [1n, pool.bptBalance, [0n, 0n]] // EXACT = 1, all BPT, min 0 tokens
    );
    
    const exitData = vaultIface.encodeFunctionData("exitPool", [
      pool.poolId,
      SCW_ADDRESS,
      SCW_ADDRESS,
      {
        assets: [BWZC_TOKEN, pool.label.includes("USDC") ? USDC : WETH],
        minAmountsOut: [0n, 0n],
        userData,
        toInternalBalance: false
      }
    ]);
    
    const execData = new ethers.Interface(scwAbi).encodeFunctionData("execute", [BALANCER_VAULT, 0n, exitData]);
    
    const withdrawTx = await signer.sendTransaction({
      to: SCW_ADDRESS,
      data: execData,
      gasLimit: 2000000
    });
    
    console.log(`WITHDRAW TX: https://etherscan.io/tx/${withdrawTx.hash}`);
    await withdrawTx.wait();
    console.log(`✅ ${pool.label} FUNDS BACK!`);
  }
  
  console.log("\n🎉 ALL FUNDS RECOVERED!");
  console.log("Your SCW now has:");
  console.log("- BWZC back (minus tiny fee)")
  console.log("- WETH back (minus tiny fee)") 
  console.log("- USDC: still 0 (was 2 wei)")
}

// RUN THIS FIRST
await recoverFunds();
