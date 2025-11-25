import { createHash, randomBytes } from 'crypto';
import { ArielSQLiteEngine } from '../ariel-sqlite-engine/index.js';
import { QuantumResistantCrypto } from '../quantum-resistant-crypto/index.js';

export class QuantumShield {
  constructor(config = {}) {
    this.config = {
      dbPath: './data/quantum_shield.db',
      ...config
    };
    
    // FIXED: Proper database initialization
    this.db = new ArielSQLiteEngine({
      dbPath: this.config.dbPath,
      autoBackup: true
    });
    
    this.qrCrypto = new QuantumResistantCrypto();
    this.threatIntel = new Map();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      // FIXED: Use connect/initialize instead of init
      if (typeof this.db.connect === 'function') {
        await this.db.connect();
      } else if (typeof this.db.initialize === 'function') {
        await this.db.initialize();
      }
      
      await this.qrCrypto.initialize();

      await this.createSecurityTables();
      await this.loadThreatIntelligence();

      this.initialized = true;
      console.log('✅ Quantum Shield initialized successfully');

    } catch (error) {
      console.error('❌ Failed to initialize Quantum Shield:', error);
      throw error;
    }
  }

  async createSecurityTables() {
    const tables = [
      `CREATE TABLE IF NOT EXISTS security_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        description TEXT,
        related_address TEXT,
        block_number INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        resolved BOOLEAN DEFAULT FALSE
      )`,
      
      `CREATE TABLE IF NOT EXISTS threat_intelligence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        threat_type TEXT NOT NULL,
        threat_value TEXT NOT NULL,
        severity TEXT NOT NULL,
        reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        active BOOLEAN DEFAULT TRUE
      )`
    ];

    for (const tableSql of tables) {
      await this.db.execute(tableSql);
    }
  }

  async loadThreatIntelligence() {
    // Load from database first
    try {
      const threats = await this.db.query(
        "SELECT * FROM threat_intelligence WHERE active = TRUE"
      );
      
      threats.forEach(threat => {
        this.threatIntel.set(threat.threat_value.toLowerCase(), threat);
      });
      
      // Add default threats if none exist
      if (threats.length === 0) {
        await this.initializeDefaultThreats();
      }
      
    } catch (error) {
      console.warn('Could not load threat intelligence from DB, using defaults:', error.message);
      await this.initializeDefaultThreats();
    }
  }

  async initializeDefaultThreats() {
    const defaultThreats = [
      { type: 'address', value: '0x8576acc5c05d6cc88f4b6a4a8c6c8e5b0a1b2c3d', severity: 'critical', reason: 'Known exploit address' },
      { type: 'address', value: '0x1234567890abcdef1234567890abcdef12345678', severity: 'high', reason: 'Phishing scam' },
      { type: 'pattern', value: 'reentrancy', severity: 'critical' },
      { type: 'pattern', value: 'overflow', severity: 'high' }
    ];

    for (const threat of defaultThreats) {
      await this.db.execute(
        `INSERT INTO threat_intelligence (threat_type, threat_value, severity, reason) 
         VALUES (?, ?, ?, ?)`,
        [threat.type, threat.value, threat.severity, threat.reason || '']
      );
      
      this.threatIntel.set(threat.value.toLowerCase(), threat);
    }
  }

  async generateQuantumSeal(data) {
    try {
      const dataHash = createHash('sha3-512').update(JSON.stringify(data)).digest('hex');
      const timestamp = Date.now();
      const nonce = randomBytes(16).toString('hex');
      const sealData = `${dataHash}|${timestamp}|${nonce}`;

      // For demo purposes, use a simple encryption
      // In production, use proper quantum-resistant encryption
      const encryptedSeal = Buffer.from(sealData).toString('base64');
      
      return `qseal:${encryptedSeal}`;
      
    } catch (error) {
      console.error('Failed to generate quantum seal:', error);
      throw error;
    }
  }

  async verifyQuantumSeal(seal, originalData) {
    try {
      if (!seal || !seal.startsWith('qseal:')) {
        await this.logSecurityEvent('invalid_seal', 'medium', 'Invalid seal format', originalData.from);
        return false;
      }

      const encryptedSeal = seal.slice(6);
      const sealData = Buffer.from(encryptedSeal, 'base64').toString();
      const [dataHash, timestamp] = sealData.split('|');
      
      const currentHash = createHash('sha3-512').update(JSON.stringify(originalData)).digest('hex');

      // Check if seal is expired (24 hours)
      if (Date.now() - parseInt(timestamp) > 24 * 60 * 60 * 1000) {
        await this.logSecurityEvent('seal_expired', 'medium', 'Quantum seal expired', originalData.from);
        return false;
      }

      const isValid = dataHash === currentHash;
      
      if (!isValid) {
        await this.logSecurityEvent('seal_tampered', 'high', 'Seal verification failed - data tampered', originalData.from);
      }
      
      return isValid;
      
    } catch (error) {
      await this.logSecurityEvent('seal_verification_error', 'high', `Seal verification failed: ${error.message}`, originalData.from);
      return false;
    }
  }

  async monitorTransaction(txData) {
    const threatsDetected = [];

    // Check sender address
    if (txData.from) {
      const senderAddress = txData.from.toLowerCase();
      if (this.threatIntel.has(senderAddress)) {
        const threat = this.threatIntel.get(senderAddress);
        threatsDetected.push(`known_malicious_address: ${threat.reason}`);
      }
    }

    // Check transaction value
    if (txData.value && parseFloat(txData.value) > 1000) {
      threatsDetected.push('large_transaction_value');
    }

    // Check for known attack patterns in data
    if (txData.data) {
      const dataStr = txData.data.toLowerCase();
      
      // Check for reentrancy patterns
      if (dataStr.includes('5c60da1b') || dataStr.includes('reentrancy')) {
        threatsDetected.push('reentrancy_pattern_detected');
      }
      
      // Check for overflow patterns
      if (dataStr.includes('overflow') || dataStr.match(/[0-9a-f]{64}ff/)) {
        threatsDetected.push('overflow_pattern_detected');
      }
    }

    // Log and return results
    if (threatsDetected.length > 0) {
      await this.logSecurityEvent(
        'suspicious_transaction',
        'high',
        `Detected threats: ${threatsDetected.join(', ')}`,
        txData.from
      );
      return {
        safe: false,
        threats: threatsDetected
      };
    }

    return {
      safe: true,
      threats: []
    };
  }

  async logSecurityEvent(eventType, severity, description, relatedAddress = null, blockNumber = null) {
    try {
      await this.db.execute(
        'INSERT INTO security_events (event_type, severity, description, related_address, block_number) VALUES (?, ?, ?, ?, ?)',
        [eventType, severity, description, relatedAddress, blockNumber]
      );
    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }

  async getSecurityReport(days = 7) {
    try {
      return await this.db.query(`
        SELECT event_type, severity, COUNT(*) as count 
        FROM security_events 
        WHERE timestamp > datetime('now', ?)
        GROUP BY event_type, severity
        ORDER BY severity DESC, count DESC
      `, [`-${days} days`]);
    } catch (error) {
      console.error('Failed to get security report:', error);
      return [];
    }
  }

  async addThreatIntelligence(threatType, threatValue, severity, reason = '') {
    try {
      await this.db.execute(
        `INSERT INTO threat_intelligence (threat_type, threat_value, severity, reason) 
         VALUES (?, ?, ?, ?)`,
        [threatType, threatValue, severity, reason]
      );
      
      this.threatIntel.set(threatValue.toLowerCase(), {
        type: threatType,
        value: threatValue,
        severity,
        reason
      });
      
      return true;
    } catch (error) {
      console.error('Failed to add threat intelligence:', error);
      return false;
    }
  }

  async getSystemStatus() {
    try {
      const recentEvents = await this.db.query(
        "SELECT COUNT(*) as count FROM security_events WHERE timestamp > datetime('now', '-1 hour')"
      );
      
      const totalThreats = this.threatIntel.size;
      
      return {
        initialized: this.initialized,
        threatIntelligenceCount: totalThreats,
        recentEvents: recentEvents[0]?.count || 0,
        databaseConnected: true,
        quantumCryptoInitialized: this.qrCrypto.initialized
      };
    } catch (error) {
      return {
        initialized: this.initialized,
        error: error.message
      };
    }
  }
}
