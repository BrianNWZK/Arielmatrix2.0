import { ethers } from 'ethers';
const provider = new ethers.JsonRpcProvider('https://ethereum-rpc.publicnode.com');
const ep = new ethers.Contract(
  '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
  ['function getDeposit(address) view returns (uint256)'],
  provider
);
const dep = await ep.getDeposit('0x60ECf16c79fa205DDE0c3cEC66BfE35BE291cc47');
console.log('EntryPoint deposit credited to paymaster:', ethers.formatEther(dep), 'ETH');
