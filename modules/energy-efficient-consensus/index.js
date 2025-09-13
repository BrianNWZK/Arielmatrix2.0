// Energy-Efficient Consensus Module
// Implements BFT consensus with validator registry, staking, and block validation

import { ArielSQLiteEngine } from "../ariel-sqlite-engine/index.js";
import { QuantumResistantCrypto } from "../quantum-resistant-crypto/index.js";
import { createHash } from "crypto";
import Web3 from "web3";
import { Connection } from "@solana/web3.js";

export class EnergyEfficientConsensus {
  constructor() {
    this.db = new ArielSQLiteEngine("./data/consensus.db");
    this.qrCrypto = new QuantumResistantCrypto();
    this.validators = new Map();
    this.stakingContract = null;
  }

  async initialize(networkConfig = {}) {
    await this.db.init();
    await this.qrCrypto.initialize();

    // Tables
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS validators (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        address TEXT UNIQUE NOT NULL,
        public_key TEXT NOT NULL,
        stake_amount REAL DEFAULT 0,
        status TEXT DEFAULT 'active',
        slashed_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS blocks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        block_hash TEXT UNIQUE NOT NULL,
        previous_hash TEXT NOT NULL,
        validator_address TEXT NOT NULL,
        transactions_count INTEGER DEFAULT 0,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        signature TEXT NOT NULL
      )
    `);

    // Optional blockchain connections
    if (networkConfig.ethereum) {
      this.web3 = new Web3(networkConfig.ethereum.rpc);
      this.stakingContract = new this.web3.eth.Contract(
        networkConfig.ethereum.stakingABI,
        networkConfig.ethereum.stakingAddress
      );
    }

    if (networkConfig.solana) {
      this.solanaConnection = new Connection(networkConfig.solana.rpc);
    }
  }

  async registerValidator(validatorAddress, publicKey, initialStake, keyId) {
    if (this.stakingContract) {
      await this.stakingContract.methods
        .stake(validatorAddress, initialStake)
        .send({
          from: validatorAddress,
          value: this.web3.utils.toWei(initialStake.toString(), "ether")
        });
    }

    await this.db.run(
      `INSERT OR IGNORE INTO validators (address, public_key, stake_amount) VALUES (?, ?, ?)`,
      [validatorAddress, publicKey, initialStake]
    );

    this.validators.set(validatorAddress, {
      publicKey,
      stake: initialStake,
      keyId,
      status: "active"
    });

    return true;
  }

  async proposeBlock(transactions) {
    const validators = await this.getActiveValidators();
    if (validators.length === 0) throw new Error("No active validators");

    const selectedValidator = this.selectValidator(validators);

    const block = {
      transactions,
      validator: selectedValidator.address,
      timestamp: Date.now(),
      previousHash: await this.getLastBlockHash()
    };

    block.blockHash = this.calculateBlockHash(block);

    const signature = await this.qrCrypto.signTransaction(
      block,
      selectedValidator.keyId
    );
    block.signature = signature;

    if (await this.validateBlock(block)) {
      await this.db.run(
        `INSERT INTO blocks (block_hash, previous_hash, validator_address, transactions_count, signature)
         VALUES (?, ?, ?, ?, ?)`,
        [
          block.blockHash,
          block.previousHash,
          block.validator,
          transactions.length,
          JSON.stringify(signature)
        ]
      );
      return block;
    }

    throw new Error("Block validation failed");
  }

  async validateBlock(block) {
    const validators = await this.getActiveValidators();
    const votes = await this.collectVotes(block, validators);
    return votes >= Math.floor(validators.length * 2 / 3);
  }

  async collectVotes(block, validators) {
    let approvals = 0;
    for (const validator of validators) {
      const isValid = await this.verifyValidatorSignature(block, validator);
      if (isValid) approvals++;
      else await this.slashValidator(validator.address);
    }
    return approvals;
  }

  async slashValidator(validatorAddress) {
    const validator = await this.db.get(
      `SELECT * FROM validators WHERE address = ?`,
      [validatorAddress]
    );
    if (!validator) return;

    const newSlashedCount = validator.slashed_count + 1;
    let newStatus = validator.status;
    let slashedAmount = 0;

    if (newSlashedCount >= 3) {
      newStatus = "slashed";
      slashedAmount = validator.stake_amount * 0.1; // 10% slash
    }

    await this.db.run(
      `UPDATE validators SET slashed_count = ?, status = ?, stake_amount = stake_amount - ? WHERE address = ?`,
      [newSlashedCount, newStatus, slashedAmount, validatorAddress]
    );

    if (this.stakingContract && slashedAmount > 0) {
      await this.stakingContract.methods.slash(validatorAddress, slashedAmount).send();
    }
  }

  async getActiveValidators() {
    return await this.db.all(
      `SELECT * FROM validators WHERE status = "active" AND stake_amount > 0 ORDER BY stake_amount DESC`
    );
  }

  async getLastBlockHash() {
    const row = await this.db.get(
      `SELECT block_hash FROM blocks ORDER BY id DESC LIMIT 1`
    );
    return row ? row.block_hash : "genesis";
  }

  selectValidator(validators) {
    const totalStake = validators.reduce((sum, v) => sum + v.stake_amount, 0);
    let r = Math.random() * totalStake;
    for (const v of validators) {
      r -= v.stake_amount;
      if (r <= 0) return v;
    }
    return validators[0];
  }

  calculateBlockHash(block) {
    return createHash("sha3-256")
      .update(JSON.stringify({ ...block, signature: undefined }))
      .digest("hex");
  }

  async verifyValidatorSignature(block, validator) {
    if (!block.signature) return false;
    return this.qrCrypto.verifySignature(
      block,
      block.signature.signature,
      validator.public_key
    );
  }
}
