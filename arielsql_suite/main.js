// main.js
import 'dotenv/config';
import { ethers } from 'ethers';
import fs from 'fs';

// --- Solidity contract source as a string ---
const source = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IEntryPoint {
    function depositTo(address account) external payable;
    function balanceOf(address account) external view returns (uint256);
    function withdrawTo(address withdrawAddress, uint256 amount) external;
}

contract BWAEZIPaymaster {
    address public immutable entryPoint;
    IERC20 public immutable bwaeziToken;
    address public immutable weth;
    address public immutable owner;

    constructor(address _entryPoint, IERC20 _bwaeziToken, address _weth) {
        require(_entryPoint != address(0));
        require(address(_bwaeziToken) != address(0));
        require(_weth != address(0));

        entryPoint = _entryPoint;
        bwaeziToken = _bwaeziToken;
        weth = _weth;
        owner = msg.sender;
    }

    // withdraw BWAEZI tokens
    function withdraw(uint256 amount) external {
        require(msg.sender == owner, "not owner");
        bwaeziToken.transfer(owner, amount);
    }

    // withdraw ETH deposit from EntryPoint
    function withdrawEntryPoint(uint256 amount) external {
        require(msg.sender == owner, "not owner");
        IEntryPoint(entryPoint).withdrawTo(owner, amount);
    }

    function withdrawAllEntryPoint() external {
        require(msg.sender == owner, "not owner");
        uint256 bal = IEntryPoint(entryPoint).balanceOf(address(this));
        require(bal > 0, "no deposit");
        IEntryPoint(entryPoint).withdrawTo(owner, bal);
    }
}
`;

// --- Runtime constants ---
const RPC_URLS = [
  'https://ethereum-rpc.publicnode.com',
  'https://rpc.ankr.com/eth',
  'https://eth.llamarpc.com'
];

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ENTRY_POINT = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'; // mainnet EntryPoint
const BWAEZI = '0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

// --- Minimal ABI for interaction after deploy ---
const paymasterAbi = [
  'function owner() view returns (address)',
  'function withdraw(uint256 amount) external',
  'function withdrawEntryPoint(uint256 amount) external',
  'function withdrawAllEntryPoint() external'
];

const entryPointAbi = [
  'function balanceOf(address) view returns (uint256)'
];

// --- Provider helper ---
async function getProvider() {
  for (const url of RPC_URLS) {
    try {
      const p = new ethers.JsonRpcProvider(url, { chainId: 1, name: 'mainnet' });
      await p.getBlockNumber();
      console.log(`✅ Connected to RPC: ${url}`);
      return p;
    } catch (e) {
      console.log(`⚠️ RPC failed: ${url}`);
    }
  }
  throw new Error('No RPC endpoints available');
}

async function main() {
  if (!PRIVATE_KEY) throw new Error('PRIVATE_KEY missing');

  const provider = await getProvider();
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  // 1. Deploy contract (requires compiled bytecode)
  // Normally you’d compile source with Hardhat/Foundry. Here we assume artifact exists.
  const artifact = JSON.parse(fs.readFileSync('./artifacts/contracts/BWAEZIPaymaster.json', 'utf8'));
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

  console.log('⏳ Deploying BWAEZIPaymaster...');
  const contract = await factory.deploy(ENTRY_POINT, BWAEZI, WETH);
  await contract.waitForDeployment();
  console.log(`✅ Deployed at ${contract.target}`);

  // 2. Withdraw all ETH deposit from EntryPoint
  const entryPoint = new ethers.Contract(ENTRY_POINT, entryPointAbi, provider);
  const depositWei = await entryPoint.balanceOf(contract.target);
  console.log(`EntryPoint deposit: ${ethers.formatEther(depositWei)} ETH`);

  if (depositWei > 0n) {
    console.log('▶ Withdrawing all ETH deposit...');
    const tx = await contract.withdrawAllEntryPoint();
    await tx.wait();
    console.log('✅ ETH withdrawn to owner');
  } else {
    console.log('ℹ️ No ETH deposit to withdraw.');
  }
}

main().catch(console.error);
