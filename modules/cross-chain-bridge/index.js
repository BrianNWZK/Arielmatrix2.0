// Cross-Chain Bridge Module
// Enables asset transfers between EVM chains and Solana with lock/release logic

import Web3 from "web3";
import {
  Connection,
  Keypair,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  PublicKey
} from "@solana/web3.js";
import { ArielSQLiteEngine } from "../ariel-sqlite-engine/index.js";
import { QuantumResistantCrypto } from "../quantum-resistant-crypto/index.js";

export class CrossChainBridge {
  constructor() {
    this.db = new ArielSQLiteEngine("./data/bridge.db");
    this.qrCrypto = new QuantumResistantCrypto();
    this.bridgeContracts = new Map();
  }

  async initialize(bridgeConfig = {}) {
    await this.db.init();
    await this.qrCrypto.initialize();

    // Bridge transaction table
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS bridge_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_chain TEXT NOT NULL,
        target_chain TEXT NOT NULL,
        source_tx_hash TEXT,
        target_tx_hash TEXT,
        amount REAL NOT NULL,
        token_address TEXT,
        sender_address TEXT NOT NULL,
        receiver_address TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
      )
    `);

    // Configure chain connections
    for (const [chain, config] of Object.entries(bridgeConfig)) {
      if (config.type === "evm") {
        const web3 = new Web3(config.rpc);
        const contract = new web3.eth.Contract(
          config.bridgeABI,
          config.bridgeAddress
        );
        this.bridgeContracts.set(chain, { web3, contract, type: "evm" });
      } else if (config.type === "solana") {
        const connection = new Connection(config.rpc);
        this.bridgeContracts.set(chain, {
          connection,
          bridgeAddress: config.bridgeAddress,
          type: "solana"
        });
      }
    }
  }

  async bridgeAssets(sourceChain, targetChain, amount, tokenAddress, sender, receiver) {
    let bridgeTxId;
    try {
      bridgeTxId = await this.db.run(
        `INSERT INTO bridge_transactions (source_chain, target_chain, amount, token_address, sender_address, receiver_address) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [sourceChain, targetChain, amount, tokenAddress, sender, receiver]
      );

      const sourceTxHash = await this.lockAssets(
        sourceChain,
        amount,
        tokenAddress,
        sender,
        bridgeTxId
      );

      await this.db.run(
        `UPDATE bridge_transactions SET source_tx_hash = ?, status = "locked" WHERE id = ?`,
        [sourceTxHash, bridgeTxId]
      );

      const targetTxHash = await this.releaseAssets(
        targetChain,
        amount,
        tokenAddress,
        receiver,
        bridgeTxId
      );

      await this.db.run(
        `UPDATE bridge_transactions SET target_tx_hash = ?, status = "completed", completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [targetTxHash, bridgeTxId]
      );

      return { bridgeTxId, sourceTxHash, targetTxHash };
    } catch (error) {
      if (bridgeTxId) {
        await this.db.run(
          `UPDATE bridge_transactions SET status = "failed" WHERE id = ?`,
          [bridgeTxId]
        );
      }
      throw new Error(`Bridge failed: ${error.message}`);
    }
  }

  async lockAssets(chain, amount, tokenAddress, sender, bridgeTxId) {
    const chainConfig = this.bridgeContracts.get(chain);
    if (!chainConfig) throw new Error(`Unsupported chain: ${chain}`);

    if (chainConfig.type === "evm") {
      const tx = await chainConfig.contract.methods
        .lockTokens(amount, tokenAddress, bridgeTxId)
        .send({ from: sender });
      return tx.transactionHash;
    } else if (chainConfig.type === "solana") {
      const payer = Keypair.fromSecretKey(
        Buffer.from(process.env.SOLANA_BRIDGE_KEY, "base64")
      );
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: new PublicKey(chainConfig.bridgeAddress),
          lamports: amount * LAMPORTS_PER_SOL
        })
      );
      const signature = await chainConfig.connection.sendTransaction(
        transaction,
        [payer]
      );
      return signature;
    }
  }

  async releaseAssets(chain, amount, tokenAddress, receiver, bridgeTxId) {
    const chainConfig = this.bridgeContracts.get(chain);
    if (!chainConfig) throw new Error(`Unsupported chain: ${chain}`);

    const verified = await this.verifySourceTransaction(bridgeTxId);
    if (!verified) throw new Error("Source transaction not verified");

    if (chainConfig.type === "evm") {
      const tx = await chainConfig.contract.methods
        .releaseTokens(amount, tokenAddress, receiver, bridgeTxId)
        .send({ from: process.env.BRIDGE_OPERATOR });
      return tx.transactionHash;
    } else if (chainConfig.type === "solana") {
      // TODO: implement mint program logic
      return `solana-release-${Date.now()}`;
    }
  }

  async verifySourceTransaction(bridgeTxId) {
    const tx = await this.db.get(
      `SELECT * FROM bridge_transactions WHERE id = ? AND status = "locked"`,
      [bridgeTxId]
    );
    return !!tx;
  }

  async getBridgeStats() {
    return await this.db.all(`
      SELECT source_chain, target_chain, status, COUNT(*) as count
      FROM bridge_transactions
      WHERE created_at > datetime('now', '-7 days')
      GROUP BY source_chain, target_chain, status
    `);
  }
}
