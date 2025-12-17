// arielsql_suite/main.js — Settlement-only (no microseed, no loops)
// Env required:
// - SOVEREIGN_PRIVATE_KEY: EOA private key
// Optional overrides: EOA_OWNER, OLD_SCW, ACCOUNT_FACTORY, BUNDLER_RPC_URL

import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';

import {
  ENHANCED_CONFIG as AA_CONFIG,
  EnhancedRPCManager,
  EnterpriseAASDK,
  EnhancedMevExecutor,
  SCW_FACTORY_ABI,
  findSaltForSCW,
  buildInitCodeForSCW
} from '../modules/aa-loaves-fishes.js';

/**
 * Minimal settlement server for AA v15.12
 * - No trading loops
 * - No microseed
 * - Settlement-only endpoint to submit SCW.execute user operations
 */

function nowTs() { return Date.now(); }

async function initProvider() {
  const mgr = new EnhancedRPCManager(AA_CONFIG.PUBLIC_RPC_ENDPOINTS, AA_CONFIG.NETWORK.chainId);
  await mgr.init();
  return mgr.getProvider();
}

async function alignSCWIfPossible(provider, factoryAddr, ownerAddr, configuredScw) {
  try {
    if (!factoryAddr || !ownerAddr) return configuredScw;
    const factory = new ethers.Contract(factoryAddr, SCW_FACTORY_ABI, provider);
    const predictedRaw = await factory.getAddress(ownerAddr, 0n);
    const predicted = ethers.getAddress(predictedRaw);
    const factoryChecksum = ethers.getAddress(factoryAddr);
    const configured = ethers.getAddress(configuredScw);

    // Guard: predicted must not equal factory address
    if (predicted.toLowerCase() === factoryChecksum.toLowerCase()) {
      console.warn(`SCW coalescing guard: predicted equals factory — keeping configured SCW ${configured}`);
      return configured;
    }
    if (predicted !== configured) {
      console.warn(`SCW ${configured} not derivable via salt=0; aligning to predicted ${predicted}`);
      return predicted;
    }
    return configured;
  } catch (e) {
    console.warn(`SCW alignment skipped: ${e.message}`);
    return configuredScw;
  }
}

async function prepareInitCodeIfUndeployed(provider, factoryAddr, ownerAddr, scwAddr) {
  const code = await provider.getCode(scwAddr);
  if (code && code !== '0x') return { initCode: '0x', usedSalt: null, sender: scwAddr };

  const factoryChecksum = factoryAddr ? ethers.getAddress(factoryAddr) : null;
  if (!factoryChecksum) throw new Error('ACCOUNT_FACTORY is required to deploy SCW via initCode');

  let salt = await findSaltForSCW(provider, factoryChecksum, ownerAddr, scwAddr, AA_CONFIG.MAX_SALT_TRIES);
  if (salt == null) {
    // Fallback to predicted sender for salt=0
    const factory = new ethers.Contract(factoryChecksum, SCW_FACTORY_ABI, provider);
    const predictedRaw = await factory.getAddress(ownerAddr, 0n);
    const predicted = ethers.getAddress(predictedRaw);
    if (predicted.toLowerCase() === factoryChecksum.toLowerCase()) {
      throw new Error('Factory.getAddress(owner,0) equals factory — check ACCOUNT_FACTORY address/ABI');
    }
    if (predicted !== scwAddr) {
      console.warn(`Aligning undeployed SCW sender to predicted ${predicted} (salt=0)`);
      scwAddr = predicted;
    }
    salt = 0n;
  }
  const { initCode, salt: usedSalt } = await buildInitCodeForSCW(provider, factoryChecksum, ownerAddr, scwAddr, salt);
  return { initCode, usedSalt, sender: scwAddr };
}

class SettlementServer {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.aa = null;
    this.mev = null;

    this.scw = null;
    this.factory = null;
    this.owner = null;
    this.initCode = '0x';

    this.app = express();
    this.server = null;
    this.port = Number(process.env.PORT || 8081);
    this.startedAt = nowTs();
  }

  async initialize() {
    // Provider
    this.provider = await initProvider();

    // Signer
    const pk = process.env.SOVEREIGN_PRIVATE_KEY;
    if (!pk) throw new Error('SOVEREIGN_PRIVATE_KEY env is required');
    this.signer = new ethers.Wallet(pk, this.provider);

    // Resolve overrides
    this.owner = (process.env.EOA_OWNER && process.env.EOA_OWNER.startsWith('0x'))
      ? ethers.getAddress(process.env.EOA_OWNER)
      : this.signer.address;

    this.factory = (process.env.ACCOUNT_FACTORY && process.env.ACCOUNT_FACTORY.startsWith('0x'))
      ? ethers.getAddress(process.env.ACCOUNT_FACTORY)
      : (AA_CONFIG.ACCOUNT_FACTORY && AA_CONFIG.ACCOUNT_FACTORY.startsWith('0x')
          ? ethers.getAddress(AA_CONFIG.ACCOUNT_FACTORY)
          : null);

    let configuredScw = (process.env.OLD_SCW && process.env.OLD_SCW.startsWith('0x'))
      ? ethers.getAddress(process.env.OLD_SCW)
      : AA_CONFIG.SCW_ADDRESS;

    // Align SCW to predicted (salt=0) if possible
    this.scw = await alignSCWIfPossible(this.provider, this.factory, this.owner, configuredScw);

    // AA SDK
    const bundlerUrl = process.env.BUNDLER_RPC_URL || AA_CONFIG.BUNDLER.RPC_URL;
    this.aa = new EnterpriseAASDK(this.signer, AA_CONFIG.ENTRY_POINTS.V07);
    await this.aa.initialize(this.provider, this.scw, bundlerUrl);

    // Prepare initCode if undeployed
    try {
      const ic = await prepareInitCodeIfUndeployed(this.provider, this.factory, this.owner, this.scw);
      this.initCode = ic.initCode || '0x';
      this.scw = ic.sender;
      this.aa.scwAddress = this.scw;
    } catch (e) {
      console.warn(`initCode preparation skipped: ${e.message}`);
      this.initCode = '0x';
    }

    // MEV executor wrapper
    this.mev = new EnhancedMevExecutor(this.aa, this.scw);
  }

  routes() {
    this.app.use(cors());
    this.app.use(express.json({ limit: '1mb' }));

    this.app.get('/health', async (req, res) => {
      try {
        const blockNumber = await this.provider.getBlockNumber();
        res.json({
          ok: true,
          network: AA_CONFIG.NETWORK,
          scw: this.scw,
          factory: this.factory,
          owner: this.owner,
          blockNumber,
          startedAt: this.startedAt,
          timestamp: nowTs()
        });
      } catch (e) {
        res.status(500).json({ ok: false, error: e.message, timestamp: nowTs() });
      }
    });

    this.app.get('/aa/stats', (req, res) => {
      try {
        res.json({
          ok: true,
          aa: this.aa.getStats(),
          scw: this.scw,
          bundlerUrl: (process.env.BUNDLER_RPC_URL || AA_CONFIG.BUNDLER.RPC_URL),
          hasInitCode: this.initCode !== '0x',
          timestamp: nowTs()
        });
      } catch (e) {
        res.status(500).json({ ok: false, error: e.message, timestamp: nowTs() });
      }
    });

    // Settlement-only endpoint: submit SCW.execute as a user operation
    // Body: { target: "0x...", data: "0x...", value?: "0", gasLimit?: number }
    this.app.post('/aa/settle', async (req, res) => {
      try {
        const { target, data, value, gasLimit, maxFeePerGas, maxPriorityFeePerGas, description } = req.body || {};
        if (!target || !ethers.isHexString(data || '0x')) {
          return res.status(400).json({ ok: false, error: 'Invalid target or data' });
        }

        // Build SCW.execute calldata
        const valueBN = value ? BigInt(value) : 0n;
        const scwCalldata = this.mev.buildSCWExecute(ethers.getAddress(target), data, valueBN);

        // Create AA userOp (forceDeploy if SCW undeployed)
        const defaults = {
          gasLimit: gasLimit ? BigInt(gasLimit) : 700_000n,
          maxFeePerGas: maxFeePerGas ? BigInt(maxFeePerGas) : undefined,
          maxPriorityFeePerGas: maxPriorityFeePerGas ? BigInt(maxPriorityFeePerGas) : undefined
        };

        const userOp = await this.aa.createUserOp(scwCalldata, {
          callGasLimit: defaults.gasLimit,
          verificationGasLimit: 500_000n,
          preVerificationGas: 80_000n,
          maxFeePerGas: defaults.maxFeePerGas,
          maxPriorityFeePerGas: defaults.maxPriorityFeePerGas,
          forceDeploy: this.initCode !== '0x' // trigger initCode inclusion if undeployed
        });

        // If we prepared initCode externally, overwrite to guarantee AA20 safety
        if (this.initCode !== '0x') {
          userOp.initCode = this.initCode;
        }

        const signed = await this.aa.signUserOp(userOp);
        const txHash = await this.aa.sendUserOpWithBackoff(signed, 5);

        res.json({
          ok: true,
          txHash,
          sender: userOp.sender,
          forceDeploy: this.initCode !== '0x',
          description: description || 'settlement_scw_execute',
          timestamp: nowTs()
        });
      } catch (e) {
        res.status(500).json({ ok: false, error: e.message, timestamp: nowTs() });
      }
    });

    // Simple root page
    this.app.get('/', (req, res) => {
      res.send(`
        <h1>Settlement server v15.12</h1>
        <p>Network: ${AA_CONFIG.NETWORK.name} (${AA_CONFIG.NETWORK.chainId})</p>
        <p>SCW: ${this.scw}</p>
        <p>Factory: ${this.factory || 'n/a'}</p>
        <p>Owner: ${this.owner}</p>
        <p><a href="/health">/health</a> | <a href="/aa/stats">/aa/stats</a></p>
      `);
    });
  }

  async start() {
    await this.initialize();
    this.routes();
    this.server = this.app.listen(this.port, () => {
      console.log(`🌐 Settlement server on :${this.port}`);
    });
  }
}

(async () => {
  try {
    const svc = new SettlementServer();
    await svc.start();
    console.log('✅ Settlement-only server ready');
  } catch (e) {
    console.error('❌ Settlement server failed:', e.message);
    process.exit(1);
  }
})();
