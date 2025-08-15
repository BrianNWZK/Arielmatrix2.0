// backend/agents/contractDeployAgent.js
import { exec } from 'child_process';
import util from 'util';
import Web3 from 'web3';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import axios from 'axios';

const execPromise = util.promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// === 🌀 Quantum Jitter (Anti-Detection) ===
const quantumDelay = (ms) => new Promise(resolve => {
  const jitter = Math.floor(Math.random() * 5000) + 1000;
  setTimeout(resolve, ms + jitter);
});

// === 💰 Self-Funding: Get Initial Capital from Revenue Agents ===
async function getInitialCapital(CONFIG) {
  const web3 = new Web3(CONFIG.BSC_NODE);
  const balance = await web3.eth.getBalance(CONFIG.GAS_WALLET);
  const bnbBalance = web3.utils.fromWei(balance, 'ether');

  // If we have less than 0.01 BNB, generate capital
  if (bnbBalance < 0.01) {
    console.log(`⚠️ Low gas: ${bnbBalance} BNB. Generating initial capital...`);

    try {
      const payoutAgent = await import('./payoutAgent.js');
      const socialAgent = await import('./socialAgent.js');
      const shopifyAgent = await import('./shopifyAgent.js');

      // Run social and e-commerce agents to generate revenue
      await socialAgent.socialAgent(CONFIG);
      await shopifyAgent.shopifyAgent(CONFIG);

      // Trigger payout to refill gas wallet
      await payoutAgent.payoutAgent({ ...CONFIG, earnings: 5 });

      // Wait for blockchain to update
      await quantumDelay(10000);

      const newBalance = await web3.eth.getBalance(CONFIG.GAS_WALLET);
      const newBnbBalance = web3.utils.fromWei(newBalance, 'ether');
      console.log(`✅ Gas wallet refilled: ${newBnbBalance} BNB`);
      return newBnbBalance >= 0.01;
    } catch (error) {
      console.warn('⚠️ Failed to generate capital:', error.message);
      return false;
    }
  }

  console.log(`✅ Sufficient gas: ${bnbBalance} BNB`);
  return true;
}

// === 🔐 Secure Key Access (No Direct Exposure) ===
const getPrivateKey = () => {
  if (!process.env.PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY missing in environment');
  }
  return process.env.PRIVATE_KEY;
};

// === 🧩 Contract Deploy Agent (BSC Mainnet) ===
export const contractDeployAgent = async (CONFIG) => {
  try {
    if (!CONFIG.GAS_WALLET || !getPrivateKey()) {
      console.warn('⚠️ Gas wallet or private key missing → skipping contract deployment');
      return;
    }

    // ===== 1. SELF-FUNDING: GET INITIAL CAPITAL =====
    const hasCapital = await getInitialCapital(CONFIG);
    if (!hasCapital) {
      console.warn('⚠️ Failed to generate initial capital. Skipping contract deployment.');
      return;
    }

    const web3 = new Web3(CONFIG.BSC_NODE || 'https://bsc-dataseed.binance.org');

    // 1. Compile Contracts
    console.log('📦 Compiling contracts with Hardhat...');
    try {
      await execPromise('npx hardhat compile', { cwd: path.resolve(__dirname, '..') });
      await quantumDelay(2000);
    } catch (compileError) {
      console.error('❌ Hardhat compile failed:', compileError.stderr || compileError.message);
      throw new Error('Contract compilation failed');
    }

    // 2. Get Gas Price from BscScan
    let gasPrice;
    try {
      const gasResponse = await axios.get('https://api.bscscan.com/api', {
        params: {
          module: 'gastracker',
          action: 'gasoracle',
          apikey: CONFIG.BSCSCAN_API_KEY
        },
        timeout: 10000
      });

      gasPrice = web3.utils.toWei(gasResponse.data.result.SafeGasPrice, 'gwei');
    } catch (gasError) {
      console.warn('⚠️ Failed to fetch gas price → using default 5 Gwei');
      gasPrice = web3.utils.toWei('5', 'gwei');
    }

    // 3. Load Wallet
    const account = web3.eth.accounts.privateKeyToAccount(getPrivateKey());
    web3.eth.accounts.wallet.add(account);

    // 4. Deploy Function
    const deployContract = async (contractName, args = []) => {
      const artifactPath = path.resolve(__dirname, `../artifacts/contracts/${contractName}.sol/${contractName}.json`);

      try {
        const artifact = JSON.parse(await fs.readFile(artifactPath, 'utf8'));
        const { abi, bytecode } = artifact;

        const contract = new web3.eth.Contract(abi);
        const deployTx = contract.deploy({ data: '0x' + bytecode, arguments: args });

        const estimatedGas = await deployTx.estimateGas({ from: CONFIG.GAS_WALLET });

        console.log(`🚀 Deploying ${contractName}...`);
        const deployedContract = await deployTx.send({
          from: CONFIG.GAS_WALLET,
          gas: estimatedGas,
          gasPrice
        });

        console.log(`✅ ${contractName} deployed at: ${deployedContract.options.address}`);
        return deployedContract;
      } catch (deployError) {
        console.error(`❌ Failed to deploy ${contractName}:`, deployError.message);
        throw deployError;
      }
    };

    // 5. Deploy RevenueDistributor
    const revenueDistributor = await deployContract('RevenueDistributor', [
      CONFIG.USDT_WALLETS?.split(',') || [],
      CONFIG.GAS_WALLET,
      '0x55d398326f99059fF775485246999027B3197955' // USDT on BSC
    ]);

    // 6. Save contract address
    const contracts = {
      RevenueDistributor: revenueDistributor.options.address,
      deployedAt: new Date().toISOString(),
      network: 'bsc-mainnet'
    };

    await fs.writeFile(
      path.join(__dirname, '../contracts.json'),
      JSON.stringify(contracts, null, 2),
      { mode: 0o600 }
    );

    console.log('💾 Contract address saved to contracts.json');

    // 7. Optional: Update Render ENV
    if (process.env.RENDER_API_TOKEN && process.env.RENDER_SERVICE_ID) {
      try {
        await axios.put(
          `https://api.render.com/v1/services/${process.env.RENDER_SERVICE_ID}/env-vars`,
          {
            envVars: [
              { key: 'REVENUE_DISTRIBUTOR_ADDRESS', value: revenueDistributor.options.address }
            ]
          },
          {
            headers: { Authorization: `Bearer ${process.env.RENDER_API_TOKEN}` },
            timeout: 10000
          }
        );
        console.log('🔄 Revenue contract address synced to Render environment');
      } catch (err) {
        console.warn('⚠️ Failed to update Render env:', err.message);
      }
    }

  } catch (error) {
    console.error('🚨 ContractDeployAgent Error:', error.message);
    throw error;
  }
};
