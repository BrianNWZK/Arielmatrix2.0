import { ServiceManager, deriveQuantumKeys } from '../../arielsql_suite/serviceManager.js';
import { v4 as uuidv4 } from 'uuid';
import {
  getSolanaBalance,
  sendSOL,
  getUSDTBalance,
  sendUSDT
} from '../../WalletUtility.js';

/**
 * Enhanced OmnichainInteroperabilityService for production use
 * Integrates with WalletUtility for actual cross-chain transactions
 */
class EnhancedOmnichainInteroperabilityService {
  constructor() {
    this.pendingBridges = new Map();
    this.bridgeStatus = new Map();
    this.bridgeCallbacks = new Map();
  }

  /**
   * Bridge assets between chains using WalletUtility
   * @param {Object} bridgeData - Bridge transaction data
   * @param {string} targetChain - Target blockchain identifier
   * @returns {Promise<Object>} Bridge operation result
   */
  async bridgeTransaction(bridgeData, targetChain) {
    const bridgeId = bridgeData.id || uuidv4();
    
    try {
      // Validate bridge parameters
      if (!bridgeData.amount || bridgeData.amount <= 0) {
        throw new Error("Invalid bridge amount");
      }
      
      if (!bridgeData.currency) {
        throw new Error("Currency not specified");
      }
      
      // Store bridge data with status
      this.bridgeStatus.set(bridgeId, {
        id: bridgeId,
        sourceChain: bridgeData.sourceChain,
        targetChain: targetChain,
        amount: bridgeData.amount,
        currency: bridgeData.currency,
        sourceTxHash: bridgeData.sourceTxHash,
        status: 'processing',
        timestamp: Date.now()
      });

      // Execute the bridge based on currency and target chain
      let result;
      
      if (bridgeData.currency === 'SOL' && targetChain === 'solana') {
        result = await this.bridgeSOL(bridgeData, targetChain);
      } else if (bridgeData.currency === 'USDT') {
        result = await this.bridgeUSDT(bridgeData, targetChain);
      } else if (bridgeData.currency === 'ETH' && targetChain === 'ethereum') {
        result = await this.bridgeETH(bridgeData, targetChain);
      } else {
        throw new Error(`Unsupported currency/chain combination: ${bridgeData.currency} to ${targetChain}`);
      }

      // Update bridge status
      this.bridgeStatus.set(bridgeId, {
        ...this.bridgeStatus.get(bridgeId),
        status: 'completed',
        targetTxHash: result.signature || result.hash,
        completedAt: Date.now()
      });

      // Execute any registered callbacks
      if (this.bridgeCallbacks.has(bridgeId)) {
        this.bridgeCallbacks.get(bridgeId).forEach(callback => {
          callback(this.bridgeStatus.get(bridgeId));
        });
      }

      return {
        success: true,
        bridgeId,
        targetTxHash: result.signature || result.hash,
        message: `Successfully bridged ${bridgeData.amount} ${bridgeData.currency} to ${targetChain}`
      };

    } catch (error) {
      console.error(`Bridge ${bridgeId} failed:`, error);
      
      // Update bridge status to failed
      if (this.bridgeStatus.has(bridgeId)) {
        this.bridgeStatus.set(bridgeId, {
          ...this.bridgeStatus.get(bridgeId),
          status: 'failed',
          error: error.message,
          completedAt: Date.now()
        });
      }

      // Execute any registered callbacks for failure
      if (this.bridgeCallbacks.has(bridgeId)) {
        this.bridgeCallbacks.get(bridgeId).forEach(callback => {
          callback(this.bridgeStatus.get(bridgeId));
        });
      }

      return {
        success: false,
        bridgeId,
        error: error.message
      };
    }
  }

  /**
   * Bridge SOL to Solana
   * @param {Object} bridgeData - Bridge transaction data
   * @param {string} targetChain - Target blockchain identifier
   * @returns {Promise<Object>} Transaction result
   */
  async bridgeSOL(bridgeData, targetChain) {
    // Validate we have enough SOL balance
    const balance = await getSolanaBalance();
    if (balance < bridgeData.amount) {
      throw new Error(`Insufficient SOL balance. Available: ${balance}, Required: ${bridgeData.amount}`);
    }

    // Send SOL using WalletUtility
    return await sendSOL(bridgeData.toAddress, bridgeData.amount);
  }

  /**
   * Bridge USDT to target chain
   * @param {Object} bridgeData - Bridge transaction data
   * @param {string} targetChain - Target blockchain identifier
   * @returns {Promise<Object>} Transaction result
   */
  async bridgeUSDT(bridgeData, targetChain) {
    // Validate we have enough USDT balance
    const balance = await getUSDTBalance(targetChain === 'ethereum' ? 'eth' : 'sol');
    if (balance < bridgeData.amount) {
      throw new Error(`Insufficient USDT balance. Available: ${balance}, Required: ${bridgeData.amount}`);
    }

    // Send USDT using WalletUtility
    return await sendUSDT(bridgeData.toAddress, bridgeData.amount);
  }

  /**
   * Bridge ETH to Ethereum
   * @param {Object} bridgeData - Bridge transaction data
   * @param {string} targetChain - Target blockchain identifier
   * @returns {Promise<Object>} Transaction result
   */
  async bridgeETH(bridgeData, targetChain) {
    // This would require additional ETH-specific functions in WalletUtility
    // For now, we'll throw an error as ETH bridging needs implementation
    throw new Error("ETH bridging not yet implemented");
  }

  /**
   * Get bridge status by ID
   * @param {string} bridgeId - Bridge transaction ID
   * @returns {Object|null} Bridge status object or null if not found
   */
  getBridgeStatus(bridgeId) {
    return this.bridgeStatus.get(bridgeId) || null;
  }

  /**
   * Register a callback for bridge status updates
   * @param {string} bridgeId - Bridge transaction ID
   * @param {Function} callback - Callback function
   */
  onBridgeUpdate(bridgeId, callback) {
    if (!this.bridgeCallbacks.has(bridgeId)) {
      this.bridgeCallbacks.set(bridgeId, []);
    }
    this.bridgeCallbacks.get(bridgeId).push(callback);
  }

  /**
   * Get all bridges for a specific address
   * @param {string} address - User address
   * @returns {Array} Array of bridge transactions
   */
  getBridgesForAddress(address) {
    const bridges = [];
    for (const [id, bridge] of this.bridgeStatus) {
      if (bridge.fromAddress === address || bridge.toAddress === address) {
        bridges.push(bridge);
      }
    }
    return bridges;
  }
}

/**
 * BrianNwaezikeChainFacade provides a simplified interface for ArielMatrix2.0
 * components to interact with the underlying Brian Nwaezike Chain and its
 * associated services managed by the ArielSQL Alltimate Suite.
 * It delegates core blockchain operations to the initialized ServiceManager.
 */
class BrianNwaezikeChainFacade {
  constructor() {
    // Ensure the ServiceManager is globally accessible. In a deployed Render setup,
    // 'arielsql_suite/main.js' would set global.arielSQLServiceManager upon startup.
    if (typeof global.arielSQLServiceManager === 'undefined' || !global.arielSQLServiceManager) {
      console.error("ArielSQL ServiceManager not initialized. Ensure 'arielsql_suite/main.js' has run.");
      throw new Error("ArielSQL ServiceManager is not available. Check ArielSQL Suite deployment.");
    }
    this.serviceManager = global.arielSQLServiceManager;
    
    // Retrieve the actual BrianNwaezikeChain instance and other services from the ServiceManager
    this.bwaeziCoreChain = this.serviceManager.getService('BrianNwaezikeChain');
    this.quantumCryptoService = this.serviceManager.getService('QuantumResistantCrypto');
    this.dbService = this.serviceManager.getService('BrianNwaezikeDB'); // Access to the integrated DB service
    
    // Replace the mock omnichain service with the enhanced production version
    this.omnichainService = new EnhancedOmnichainInteroperabilityService();

    this.nativeToken = this.bwaeziCoreChain.config.NATIVE_TOKEN || 'BWAEZI'; // Get native token from the core chain config
    console.log("BrianNwaezikeChainFacade initialized with enhanced OmnichainInteroperabilityService.");
  }

  /**
   * Gets the latest block from the Brian Nwaezike Chain's local replica.
   * @returns {Promise<Object|null>} The latest block object or null if none exists.
   */
  async getLatestBlock() {
    return await this.bwaeziCoreChain.getLatestBlock();
  }

  /**
   * Creates and adds a new transaction to the Brian Nwaezike Chain's transaction pool.
   * This transaction will be picked up by the ArielSQL Suite's block producer.
   * This method directly utilizes the quantumCryptoService for signing.
   *
   * @param {string} fromAddress - Sender's address.
   * @param {string} toAddress - Receiver's address.
   * @param {number} amount - Amount to transfer.
   * @param {string} currency - Currency of the transaction (e.g., 'BWAEZI', 'USD').
   * @param {string} privateKey - Sender's private key (hex string) for signing.
   * @returns {Promise<Object>} The created transaction object with a unique ID.
   */
  async createAndAddTransaction(fromAddress, toAddress, amount, currency, privateKey) {
    const timestamp = Date.now();
    const id = uuidv4(); // Unique ID for the transaction
    
    // Data string to be signed. Ensure consistency with how the core chain verifies.
    const dataToSign = `${id}${fromAddress}${toAddress}${amount}${currency}${timestamp}`;
    const signature = this.quantumCryptoService.sign(dataToSign, privateKey); // Use the quantum-crypto service for signing

    const transaction = {
      id,
      from_address: fromAddress,
      to_address: toAddress,
      amount,
      currency,
      timestamp,
      fee: 0, // Brian Nwaezike Chain is zero-cost for transactions
      signature,
      // threat_score and quantum_proof will be added by the core chain service
    };
    
    // Add the transaction to the core BrianNwaezikeChain service's transaction pool
    await this.bwaeziCoreChain.addTransactionToPool(transaction);
    console.log(`Transaction ${id.substring(0,8)}... created and added to Bwaezi pool by facade.`);
    return transaction;
  }

  /**
   * Retrieves account balance for a given address and currency.
   * It queries the local database replica managed by BrianNwaezikeDB.
   * @param {string} address - The account address.
   * @param {string} currency - The currency type (e.g., 'BWAEZI', 'USD', or cross-chain token).
   * @returns {Promise<number>} The balance.
   */
  async getAccountBalance(address, currency = 'USD') {
    const account = await this.dbService.get(
      `SELECT balance, bwaezi_balance, cross_chain_balances FROM bwaezi_accounts WHERE address = ?`,
      [address]
    );

    if (!account) return 0;
    
    if (currency === this.nativeToken) {
      return account.bwaezi_balance || 0;
    } else if (currency !== 'USD') {
      const crossChainBalances = JSON.parse(account.cross_chain_balances || '{}');
      return crossChainBalances[currency] || 0;
    } else {
      return account.balance || 0; // Default balance for USD or other non-native
    }
  }

  /**
   * Retrieves transaction history for a given address.
   * @param {string} address - The account address.
   * @param {number} limit - Maximum number of transactions to retrieve.
   * @returns {Promise<Array<Object>>} List of transactions.
   */
  async getTransactionHistory(address, limit = 50) {
    return await this.dbService.all(
      `SELECT * FROM bwaezi_transactions WHERE from_address = ? OR to_address = ? ORDER BY timestamp DESC LIMIT ?`,
      [address, address, limit]
    );
  }

  /**
   * Enhanced cross-chain bridge operation using WalletUtility
   * @param {string} sourceChain - The source blockchain identifier.
   * @param {string} targetChain - The target blockchain identifier.
   * @param {string} sourceTxHash - Transaction hash on the source chain (if applicable).
   * @param {number} amount - Amount to bridge.
   * @param {string} currency - Currency to bridge.
   * @param {string} toAddress - Recipient address on target chain.
   * @param {string} fromAddress - Sender address on source chain.
   * @returns {Promise<Object>} Result of the bridge operation, including a bridge tracking ID.
   */
  async createCrossChainBridge(sourceChain, targetChain, sourceTxHash, amount, currency, toAddress, fromAddress) {
    return await this.omnichainService.bridgeTransaction({ 
      id: uuidv4(), // Internal bridge tracking ID
      sourceChain, 
      targetChain, 
      sourceTxHash, 
      amount, 
      currency,
      toAddress,
      fromAddress
    }, targetChain);
  }

  /**
   * Get status of a cross-chain bridge operation
   * @param {string} bridgeId - Bridge transaction ID
   * @returns {Object|null} Bridge status object or null if not found
   */
  async getBridgeStatus(bridgeId) {
    return this.omnichainService.getBridgeStatus(bridgeId);
  }

  /**
   * Register callback for bridge status updates
   * @param {string} bridgeId - Bridge transaction ID
   * @param {Function} callback - Callback function
   */
  async onBridgeUpdate(bridgeId, callback) {
    this.omnichainService.onBridgeUpdate(bridgeId, callback);
  }

  /**
   * Derives a quantum-resistant key pair from a passphrase using the suite's service.
   * @param {string} passphrase - User's passphrase.
   * @param {string|null} salt - Optional salt (hex string).
   * @returns {Object} { pk: publicKeyHex, sk: secretKeyHex, salt: saltHex, ... }
   */
  deriveQuantumKeys(passphrase, salt = null) {
    return deriveQuantumKeys(passphrase, salt); // Re-exporting from suite's utility
  }

  /**
   * Retrieves the RPC URL for the Brian Nwaezike Chain from the service configuration.
   * @returns {string|null} The RPC URL or null if not configured.
   */
  getRpcUrl() {
    // The RPC URL is part of the `blockchain` configuration passed to the
    // BrianNwaezikeChain service via the ServiceManager.
    // We can access it here through the `bwaeziCoreChain` instance's config.
    return this.bwaeziCoreChain.config.url || null;
  }

  // Helper to get raw DB access (use with caution)
  async executeDbQuery(sql, args = []) {
    return await this.dbService.execute(sql, args);
  }
}

export default BrianNwaezikeChainFacade;
