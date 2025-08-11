// backend/agents/contractDeployAgent.js
import { exec } from 'child_process';
import util from 'util';
import Web3 from 'web3';
import fs from 'fs/promises';
import path from 'path';
const execPromise = util.promisify(exec);

export const contractDeployAgent = async (CONFIG) => {
  try {
    if (!CONFIG.GAS_WALLET || !process.env.PRIVATE_KEY) {
      throw new Error('Gas wallet or private key missing');
    }

    const web3 = new Web3(CONFIG.BSC_NODE);

    // Compile contracts
    console.log('📦 Compiling contracts...');
    await execPromise('cd backend && npx hardhat compile', { cwd: path.resolve(__dirname, '..') });

    // Get gas price
    const gasResponse = await fetch(
      `https://api.bscscan.com/api?module=gastracker&action=gasoracle&apikey=${process.env.BSCSCAN_API_KEY || CONFIG.BSCSCAN_API_KEY}`
    ).then(res => res.json());

    const gasPrice = web3.utils.toWei(gasResponse.result.SafeGasPrice, 'gwei');

    // Load wallet
    const account = web3.eth.accounts.privateKeyToAccount(process.env.PRIVATE_KEY);
    web3.eth.accounts.wallet.add(account);

    const deployContract = async (abiPath, bytecodePath, args = []) => {
      const abi = JSON.parse(await fs.readFile(abiPath, 'utf8')).abi;
      const bytecode = JSON.parse(await fs.readFile(bytecodePath, 'utf8')).bytecode.object;

      const contract = new web3.eth.Contract(abi);
      const deployTx = contract.deploy({ data: bytecode, arguments: args });
      const estimatedGas = await deployTx.estimateGas({ from: CONFIG.GAS_WALLET });

      const deployedContract = await deployTx.send({
        from: CONFIG.GAS_WALLET,
        gas: estimatedGas,
        gasPrice,
      });

      return deployedContract;
    };

    // Deploy RevenueDistributor
    const revenueDistributor = await deployContract(
      path.resolve(__dirname, '../artifacts/contracts/RevenueDistributor.sol/RevenueDistributor.json'),
      path.resolve(__dirname, '../artifacts/contracts/RevenueDistributor.sol/RevenueDistributor.json'),
      [CONFIG.USDT_WALLETS, CONFIG.GAS_WALLET, '0x55d398326f99059ff775485246999027b3197955'] // USDT on BSC
    );

    console.log('✅ RevenueDistributor deployed at:', revenueDistributor.options.address);

    // Deploy APIKeyGenerator
    const apiKeyGenerator = await deployContract(
      path.resolve(__dirname, '../artifacts/contracts/APIKeyGenerator.sol/APIKeyGenerator.json'),
      path.resolve(__dirname, '../artifacts/contracts/APIKeyGenerator.sol/APIKeyGenerator.json')
    );

    console.log('✅ APIKeyGenerator deployed at:', apiKeyGenerator.options.address);

    // Update CONFIG
    CONFIG.REVENUE_DISTRIBUTOR_ADDRESS = revenueDistributor.options.address;
    CONFIG.API_KEY_GENERATOR_ADDRESS = apiKeyGenerator.options.address;

    // Save to file for other agents
    await fs.writeFile('contracts.json', JSON.stringify({
      RevenueDistributor: revenueDistributor.options.address,
      APIKeyGenerator: apiKeyGenerator.options.address,
    }, null, 2));

    console.log('💾 Contract addresses saved to contracts.json');

  } catch (error) {
    console.error('🚨 ContractDeployAgent Error:', error.message);
    throw error;
  }
};
