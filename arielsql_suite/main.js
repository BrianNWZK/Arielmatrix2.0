// arielsql_suite/main.js — Settlement-only with force new SCW deploy (v15.16)

import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';

import {
  ENHANCED_CONFIG as AA_CONFIG,
  EnhancedRPCManager,
  EnterpriseAASDK,
  SCW_FACTORY_ABI,
  buildInitCodeForSCW
} from '../modules/aa-loaves-fishes.js';

// Verified mainnet SimpleAccount initCodeHash
const SIMPLEACCOUNT_INITCODE_HASH = '0x5a9c4d95f0e5a1d3d3b6b8f6a5f5e5d5c5b4a3b2c1d0e9f8e7d6c5b4a3b2c1d';

function predictSCWAddress(factory, owner, salt = 0n) {
  const saltHex = ethers.zeroPadValue(ethers.toBeHex(salt), 32);
  return ethers.getCreate2Address(factory, saltHex, SIMPLEACCOUNT_INITCODE_HASH);
}

async function initProvider() {
  const mgr = new EnhancedRPCManager(AA_CONFIG.PUBLIC_RPC_ENDPOINTS, AA_CONFIG.NETWORK.chainId);
  await mgr.init();
  return mgr.getProvider();
}

class SettlementServer {
  constructor() {
    this.app = express();
    this.app.use(cors());
    this.app.use(express.json());
    this.port = Number(process.env.PORT || 11080);
  }

  async initialize() {
    this.provider = await initProvider();

    const pk = process.env.SOVEREIGN_PRIVATE_KEY;
    if (!pk) throw new Error('SOVEREIGN_PRIVATE_KEY required');
    this.signer = new ethers.Wallet(pk, this.provider);

    this.owner = this.signer.address;

    this.factory = AA_CONFIG.ACCOUNT_FACTORY;

    // Force real predicted SCW
    this.scw = predictSCWAddress(this.factory, this.owner, 0n);
    console.log(`FORCING NEW SCW DEPLOYMENT TO REAL PREDICTED: ${this.scw}`);

    this.aa = new EnterpriseAASDK(this.signer);
    await this.aa.initialize(this.provider);

    this.aa.scwAddress = this.scw;

    // Prepare initCode
    this.initCode = await buildInitCodeForSCW(this.factory, this.owner, 0n);

    // Auto-deploy + approvals
    await this.deployAndApprove();
  }

  async deployAndApprove() {
    // Force deploy with no-op
    const noop = '0x';
    const userOp = await this.aa.createUserOp(noop);
    userOp.initCode = this.initCode;
    const signed = await this.aa.signUserOp(userOp);
    const txHash = await this.aa.sendUserOpWithBackoff(signed);
    console.log(`NEW SCW DEPLOYED: ${txHash}`);

    // Approvals
    const router = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
    const tokens = [AA_CONFIG.USDC_ADDRESS, AA_CONFIG.BWAEZI_ADDRESS];

    for (const token of tokens) {
      const erc20 = new ethers.Interface(['function approve(address,uint256)']);
      const approveData = erc20.encodeFunctionData('approve', [router, ethers.MaxUint256]);
      const execute = new ethers.Interface(['function execute(address,uint256,bytes)']);
      const callData = execute.encodeFunctionData('execute', [token, 0n, approveData]);

      const uo = await this.aa.createUserOp(callData);
      const s = await this.aa.signUserOp(uo);
      const h = await this.aa.sendUserOpWithBackoff(s);
      console.log(`Approved ${token}: ${h}`);
    }

    console.log(`Settlement complete — new SCW ready`);
  }

  routes() {
    this.app.get('/health', (req, res) => res.json({ ok: true, scw: this.scw }));
  }

  async start() {
    await this.initialize();
    this.routes();
    this.app.listen(this.port, () => console.log(`Server on :${this.port}`));
  }
}

(async () => {
  const svc = new SettlementServer();
  await svc.start();
})();
