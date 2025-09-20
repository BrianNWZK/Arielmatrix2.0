// modules/sharding-manager/index.js
import { createHash, randomBytes } from 'crypto';
import { ArielSQLiteEngine } from './ariel-sqlite-engine';
import { Logger } from '../enterprise-logger';

export class ShardingManager {
  constructor(config = {}) {
    this.config = {
      shards: config.shards || 4,
      rebalanceThreshold: config.rebalanceThreshold || 0.2,
      maxShardLoad: config.maxShardLoad || 1000,
      ...config
    };

    this.db = new ArielSQLiteEngine(config.databaseConfig);
    this.logger = new Logger('ShardingManager');
    this.shards = new Map();
    this.shardLoad = new Map();
    this.migrationQueue = [];
    this.isRebalancing = false;
  }

  async initialize() {
    await this.db.init();
    
    // Create shard management tables
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS shard_stats (
        shard_id TEXT PRIMARY KEY,
        load_count INTEGER DEFAULT 0,
        item_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS shard_mappings (
        key_hash TEXT PRIMARY KEY,
        shard_id TEXT,
        original_key TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shard_id) REFERENCES shard_stats (shard_id)
      )
    `);

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS shard_migrations (
        migration_id TEXT PRIMARY KEY,
        source_shard TEXT,
        target_shard TEXT,
        key_hash TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
      )
    `);

    // Initialize shards
    await this.initializeShards();

    // Start monitoring and rebalancing using SQLite-based pub/sub
    this.startMonitoring();
    
    this.logger.info(`Sharding manager initialized with ${this.config.shards} shards`);
  }

  async initializeShards() {
    // Check for existing shards
    const existingShards = await this.db.all('SELECT shard_id FROM shard_stats');
    
    if (existingShards.length > 0) {
      // Recover from existing configuration
      for (const row of existingShards) {
        this.shards.set(row.shard_id, {
          id: row.shard_id,
          load: 0,
          status: 'active'
        });
      }
    } else {
      // Create new shards
      for (let i = 0; i < this.config.shards; i++) {
        const shardId = `shard-${i}-${randomBytes(4).toString('hex')}`;
        
        await this.db.run(
          'INSERT INTO shard_stats (shard_id, load_count, item_count) VALUES (?, ?, ?)',
          [shardId, 0, 0]
        );
        
        this.shards.set(shardId, {
          id: shardId,
          load: 0,
          status: 'active'
        });
      }
    }

    // Load initial statistics
    await this.updateShardStatistics();
  }

  async getShardForKey(key, incrementLoad = true) {
    const keyHash = this.hashKey(key);
    
    // Check if we have an existing mapping using cache
    const cachedMapping = await this.db.getWithCache(
      'SELECT shard_id FROM shard_mappings WHERE key_hash = ?',
      [keyHash],
      { cacheTtl: 30000 }
    );

    if (cachedMapping) {
      const shardId = cachedMapping.shard_id;
      
      if (incrementLoad) {
        await this.incrementLoad(shardId);
      }
      
      return shardId;
    }

    // Create new mapping using consistent hashing with load awareness
    const shardId = await this.selectShardWithLoadBalancing(keyHash);
    
    await this.db.run(
      'INSERT INTO shard_mappings (key_hash, shard_id, original_key) VALUES (?, ?, ?)',
      [keyHash, shardId, key.substring(0, 100)]
    );

    if (incrementLoad) {
      await this.incrementLoad(shardId);
      await this.incrementItemCount(shardId);
    }

    return shardId;
  }

  async incrementLoad(shardId) {
    // Update in-memory cache
    if (this.shardLoad.has(shardId)) {
      const stats = this.shardLoad.get(shardId);
      stats.load += 1;
      stats.lastUpdated = Date.now();
    }

    // Update database
    await this.db.run(
      'UPDATE shard_stats SET load_count = load_count + 1, last_updated = CURRENT_TIMESTAMP WHERE shard_id = ?',
      [shardId]
    );

    // Publish load update event
    await this.db.publish('shard:load', {
      shardId,
      action: 'increment',
      timestamp: Date.now()
    });
  }

  async startMonitoring() {
    // Subscribe to load events
    await this.db.subscribe('shard:load', 'sharding-manager', (message) => {
      this.handleLoadUpdate(message);
    });

    // Update statistics every 30 seconds
    setInterval(() => {
      this.updateShardStatistics();
    }, 30000);

    // Check for rebalancing every 5 minutes
    setInterval(() => {
      this.checkRebalancing();
    }, 300000);

    // Clean up old mappings every hour
    setInterval(() => {
      this.cleanupMappings();
    }, 3600000);
  }

  async handleLoadUpdate(message) {
    // Update local load cache based on pub/sub events
    const { shardId, action } = message;
    if (this.shardLoad.has(shardId)) {
      const stats = this.shardLoad.get(shardId);
      if (action === 'increment') {
        stats.load += 1;
      } else if (action === 'decrement') {
        stats.load = Math.max(0, stats.load - 1);
      }
      stats.lastUpdated = Date.now();
    }
  }

  // Keep all other methods the same but use SQLite-based functionality
}
