// modules/sharding-manager/index.js
import { createHash, randomBytes } from 'crypto';
import ArielSQLiteEngine from '../ariel-sqlite-engine/index.js';
import { EnterpriseLogger } from '../enterprise-logger/index.js';
import { EventEmitter } from 'events';

export class ShardingManager extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      shards: config.shards || 4,
      rebalanceThreshold: config.rebalanceThreshold || 0.2,
      maxShardLoad: config.maxShardLoad || 1000,
      minShardLoad: config.minShardLoad || 100,
      migrationBatchSize: config.migrationBatchSize || 50,
      healthCheckInterval: config.healthCheckInterval || 30000,
      ...config
    };

    this.db = new ArielSQLiteEngine(config.databaseConfig);
    this.logger = new Logger('ShardingManager');
    this.shards = new Map();
    this.shardLoad = new Map();
    this.shardHealth = new Map();
    this.migrationQueue = [];
    this.isRebalancing = false;
  }

  async initialize() {
    try {
      await this.db.init();
      
      // Create shard management tables
      await this.createShardTables();
      
      // Initialize shards
      await this.initializeShards();

      // Start monitoring and rebalancing
      this.startMonitoring();

      this.logger.info(`Sharding manager initialized with ${this.config.shards} shards`);
      
    } catch (error) {
      this.logger.error(`Failed to initialize sharding manager: ${error.message}`);
      throw error;
    }
  }

  async createShardTables() {
    // Create shard_stats table
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS shard_stats (
        shard_id TEXT PRIMARY KEY,
        load_count INTEGER DEFAULT 0,
        item_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        capacity INTEGER DEFAULT 1000,
        region TEXT DEFAULT 'global',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_health_check DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create shard_mappings table with indexes
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS shard_mappings (
        key_hash TEXT PRIMARY KEY,
        shard_id TEXT,
        original_key TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP,
        access_count INTEGER DEFAULT 0,
        FOREIGN KEY (shard_id) REFERENCES shard_stats (shard_id) ON DELETE CASCADE
      )
    `);

    // Create indexes for performance
    await this.db.run('CREATE INDEX IF NOT EXISTS idx_shard_mappings_shard_id ON shard_mappings(shard_id)');
    await this.db.run('CREATE INDEX IF NOT EXISTS idx_shard_mappings_last_accessed ON shard_mappings(last_accessed)');

    // Create shard_migrations table
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS shard_migrations (
        migration_id TEXT PRIMARY KEY,
        source_shard TEXT,
        target_shard TEXT,
        key_hash TEXT,
        status TEXT DEFAULT 'pending',
        retry_count INTEGER DEFAULT 0,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        started_at DATETIME,
        completed_at DATETIME,
        FOREIGN KEY (source_shard) REFERENCES shard_stats (shard_id),
        FOREIGN KEY (target_shard) REFERENCES shard_stats (shard_id)
      )
    `);

    // Create shard_health table
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS shard_health (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shard_id TEXT,
        latency_ms INTEGER,
        error_rate REAL,
        available BOOLEAN DEFAULT true,
        checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (shard_id) REFERENCES shard_stats (shard_id)
      )
    `);
  }

  async initializeShards() {
    try {
      // Check for existing shards
      const existingShards = await this.db.all('SELECT shard_id, load_count, item_count, status FROM shard_stats');
      
      if (existingShards.length > 0) {
        // Recover from existing configuration
        for (const row of existingShards) {
          this.shards.set(row.shard_id, {
            id: row.shard_id,
            load: row.load_count,
            itemCount: row.item_count,
            status: row.status,
            capacity: row.capacity || 1000
          });
          
          this.shardLoad.set(row.shard_id, {
            load: row.load_count,
            lastUpdated: Date.now()
          });
        }
        
        this.logger.info(`Recovered ${existingShards.length} existing shards from database`);
      } else {
        // Create new shards with geographic distribution awareness
        const regions = ['us-east', 'us-west', 'eu-central', 'ap-southeast'];
        
        for (let i = 0; i < this.config.shards; i++) {
          const region = regions[i % regions.length];
          const shardId = `shard-${region}-${i}-${randomBytes(6).toString('hex')}`;
          const capacity = this.calculateShardCapacity(region);
          
          await this.db.run(
            'INSERT INTO shard_stats (shard_id, load_count, item_count, capacity, region) VALUES (?, ?, ?, ?, ?)',
            [shardId, 0, 0, capacity, region]
          );
          
          this.shards.set(shardId, {
            id: shardId,
            load: 0,
            itemCount: 0,
            status: 'active',
            capacity: capacity,
            region: region
          });
          
          this.shardLoad.set(shardId, {
            load: 0,
            lastUpdated: Date.now()
          });
        }
        
        this.logger.info(`Created ${this.config.shards} new shards with regional distribution`);
      }

      // Load initial statistics and health checks
      await this.updateShardStatistics();
      await this.performHealthChecks();

    } catch (error) {
      this.logger.error(`Failed to initialize shards: ${error.message}`);
      throw error;
    }
  }

  calculateShardCapacity(region) {
    // Calculate capacity based on region (simulate different capacities)
    const capacityMap = {
      'us-east': 1500,
      'us-west': 1200,
      'eu-central': 1000,
      'ap-southeast': 800
    };
    
    return capacityMap[region] || 1000;
  }

  hashKey(key) {
    // Use SHA-256 for consistent hashing
    return createHash('sha256').update(key).digest('hex');
  }

  async getShardForKey(key, incrementLoad = true) {
    const keyHash = this.hashKey(key);
    
    try {
      // Check if we have an existing mapping with cache
      const cachedMapping = await this.db.get(
        'SELECT shard_id FROM shard_mappings WHERE key_hash = ?',
        [keyHash]
      );

      if (cachedMapping) {
        const shardId = cachedMapping.shard_id;
        
        // Update access statistics
        await this.db.run(
          'UPDATE shard_mappings SET last_accessed = CURRENT_TIMESTAMP, access_count = access_count + 1 WHERE key_hash = ?',
          [keyHash]
        );
        
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

      // Emit event for new mapping
      this.emit('shardMappingCreated', {
        keyHash,
        shardId,
        key: key.substring(0, 100)
      });

      return shardId;

    } catch (error) {
      this.logger.error(`Failed to get shard for key ${key}: ${error.message}`);
      throw error;
    }
  }

  async selectShardWithLoadBalancing(keyHash) {
    // Get all active shards with their current load
    const activeShards = Array.from(this.shards.values()).filter(shard => 
      shard.status === 'active' && this.isShardHealthy(shard.id)
    );

    if (activeShards.length === 0) {
      throw new Error('No active shards available');
    }

    // Convert hash to numerical value for consistent hashing
    const hashValue = parseInt(keyHash.substring(0, 8), 16);
    
    // Use consistent hashing with load awareness
    const weightedShards = activeShards.map(shard => {
      const loadFactor = 1 - (shard.load / shard.capacity);
      return {
        shard,
        weight: Math.max(0.1, loadFactor) // Ensure minimum weight
      };
    });

    // Normalize weights
    const totalWeight = weightedShards.reduce((sum, ws) => sum + ws.weight, 0);
    let cumulative = 0;
    const weightedSelection = weightedShards.map(ws => {
      cumulative += ws.weight / totalWeight;
      return { shard: ws.shard, cumulative };
    });

    // Select shard based on hash value
    const selection = hashValue / Math.pow(2, 32); // Normalize to 0-1
    for (const ws of weightedSelection) {
      if (selection <= ws.cumulative) {
        return ws.shard.id;
      }
    }

    // Fallback to last shard
    return weightedShards[weightedShards.length - 1].shard.id;
  }

  async incrementLoad(shardId) {
    try {
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

      // Update shard object
      if (this.shards.has(shardId)) {
        const shard = this.shards.get(shardId);
        shard.load += 1;
      }

      // Publish load update event
      await this.db.publish('shard:load', {
        shardId,
        action: 'increment',
        timestamp: Date.now(),
        currentLoad: this.shardLoad.get(shardId)?.load || 0
      });

      // Check if rebalancing is needed
      this.checkRebalancingNeeded(shardId);

    } catch (error) {
      this.logger.error(`Failed to increment load for shard ${shardId}: ${error.message}`);
    }
  }

  async incrementItemCount(shardId) {
    try {
      // Update database
      await this.db.run(
        'UPDATE shard_stats SET item_count = item_count + 1 WHERE shard_id = ?',
        [shardId]
      );

      // Update shard object
      if (this.shards.has(shardId)) {
        const shard = this.shards.get(shardId);
        shard.itemCount += 1;
      }

    } catch (error) {
      this.logger.error(`Failed to increment item count for shard ${shardId}: ${error.message}`);
    }
  }

  async startMonitoring() {
    try {
      // Subscribe to load events
      await this.db.subscribe('shard:load', 'sharding-manager', (message) => {
        this.handleLoadUpdate(message);
      });

      // Subscribe to health events
      await this.db.subscribe('shard:health', 'sharding-manager', (message) => {
        this.handleHealthUpdate(message);
      });

      // Update statistics every 30 seconds
      this.statsInterval = setInterval(() => {
        this.updateShardStatistics().catch(error => {
          this.logger.error(`Failed to update shard statistics: ${error.message}`);
        });
      }, 30000);

      // Health checks every minute
      this.healthCheckInterval = setInterval(() => {
        this.performHealthChecks().catch(error => {
          this.logger.error(`Failed to perform health checks: ${error.message}`);
        });
      }, 60000);

      // Check for rebalancing every 5 minutes
      this.rebalanceInterval = setInterval(() => {
        this.checkRebalancing().catch(error => {
          this.logger.error(`Failed to check rebalancing: ${error.message}`);
        });
      }, 300000);

      // Process migration queue every 30 seconds
      this.migrationInterval = setInterval(() => {
        this.processMigrationQueue().catch(error => {
          this.logger.error(`Failed to process migration queue: ${error.message}`);
        });
      }, 30000);

      // Clean up old mappings every hour
      this.cleanupInterval = setInterval(() => {
        this.cleanupMappings().catch(error => {
          this.logger.error(`Failed to cleanup mappings: ${error.message}`);
        });
      }, 3600000);

      this.logger.info('Sharding monitoring started');

    } catch (error) {
      this.logger.error(`Failed to start monitoring: ${error.message}`);
    }
  }

  async handleLoadUpdate(message) {
    try {
      const { shardId, action, currentLoad } = message;
      
      if (this.shardLoad.has(shardId)) {
        const stats = this.shardLoad.get(shardId);
        
        if (action === 'increment') {
          stats.load = currentLoad || stats.load + 1;
        } else if (action === 'decrement') {
          stats.load = Math.max(0, currentLoad || stats.load - 1);
        } else if (action === 'set') {
          stats.load = currentLoad;
        }
        
        stats.lastUpdated = Date.now();
        
        // Update shard object
        if (this.shards.has(shardId)) {
          this.shards.get(shardId).load = stats.load;
        }
      }
    } catch (error) {
      this.logger.error(`Failed to handle load update: ${error.message}`);
    }
  }

  async handleHealthUpdate(message) {
    try {
      const { shardId, healthy, latency, errorRate } = message;
      
      this.shardHealth.set(shardId, {
        healthy,
        latency,
        errorRate,
        lastChecked: Date.now()
      });
      
      // Update shard status if unhealthy
      if (!healthy && this.shards.has(shardId)) {
        this.shards.get(shardId).status = 'unhealthy';
        await this.db.run(
          'UPDATE shard_stats SET status = ? WHERE shard_id = ?',
          ['unhealthy', shardId]
        );
        
        this.logger.warn(`Shard ${shardId} marked as unhealthy`);
      }
      
    } catch (error) {
      this.logger.error(`Failed to handle health update: ${error.message}`);
    }
  }

  async updateShardStatistics() {
    try {
      // Update local statistics from database
      const stats = await this.db.all(
        'SELECT shard_id, load_count, item_count, status FROM shard_stats'
      );
      
      for (const row of stats) {
        if (this.shards.has(row.shard_id)) {
          const shard = this.shards.get(row.shard_id);
          shard.load = row.load_count;
          shard.itemCount = row.item_count;
          shard.status = row.status;
        }
        
        if (this.shardLoad.has(row.shard_id)) {
          this.shardLoad.get(row.shard_id).load = row.load_count;
        }
      }
      
    } catch (error) {
      this.logger.error(`Failed to update shard statistics: ${error.message}`);
    }
  }

  async performHealthChecks() {
    try {
      const shardIds = Array.from(this.shards.keys());
      
      for (const shardId of shardIds) {
        try {
          // Simulate health check - in real implementation, this would ping the shard
          const latency = Math.random() * 100; // Simulated latency
          const errorRate = Math.random() * 0.1; // Simulated error rate
          const healthy = errorRate < 0.05; // Consider healthy if error rate < 5%
          
          // Store health check result
          await this.db.run(
            'INSERT INTO shard_health (shard_id, latency_ms, error_rate, available) VALUES (?, ?, ?, ?)',
            [shardId, Math.round(latency), errorRate, healthy]
          );
          
          await this.db.run(
            'UPDATE shard_stats SET last_health_check = CURRENT_TIMESTAMP WHERE shard_id = ?',
            [shardId]
          );
          
          // Update local health cache
          this.shardHealth.set(shardId, {
            healthy,
            latency,
            errorRate,
            lastChecked: Date.now()
          });
          
          // Publish health event
          await this.db.publish('shard:health', {
            shardId,
            healthy,
            latency,
            errorRate,
            timestamp: Date.now()
          });
          
        } catch (error) {
          this.logger.error(`Health check failed for shard ${shardId}: ${error.message}`);
          
          // Mark shard as unhealthy
          this.shardHealth.set(shardId, {
            healthy: false,
            latency: null,
            errorRate: 1.0,
            lastChecked: Date.now()
          });
        }
      }
      
    } catch (error) {
      this.logger.error(`Failed to perform health checks: ${error.message}`);
    }
  }

  isShardHealthy(shardId) {
    const health = this.shardHealth.get(shardId);
    return health ? health.healthy : true; // Assume healthy if no data
  }

  async checkRebalancing() {
    if (this.isRebalancing) {
      this.logger.debug('Rebalancing already in progress, skipping check');
      return;
    }
    
    try {
      this.isRebalancing = true;
      
      // Get current load distribution
      const shardStats = await this.db.all(`
        SELECT shard_id, load_count, capacity, status 
        FROM shard_stats 
        WHERE status = 'active'
      `);
      
      if (shardStats.length === 0) return;
      
      // Calculate average load
      const totalLoad = shardStats.reduce((sum, stat) => sum + stat.load_count, 0);
      const averageLoad = totalLoad / shardStats.length;
      
      // Identify overloaded and underloaded shards
      const overloadedShards = shardStats.filter(stat => 
        stat.load_count > averageLoad * (1 + this.config.rebalanceThreshold)
      );
      
      const underloadedShards = shardStats.filter(stat => 
        stat.load_count < averageLoad * (1 - this.config.rebalanceThreshold)
      );
      
      if (overloadedShards.length === 0 || underloadedShards.length === 0) {
        this.logger.debug('No rebalancing needed - load distribution is balanced');
        return;
      }
      
      this.logger.info(`Rebalancing needed: ${overloadedShards.length} overloaded, ${underloadedShards.length} underloaded shards`);
      
      // Plan migrations from overloaded to underloaded shards
      for (const sourceShard of overloadedShards) {
        for (const targetShard of underloadedShards) {
          if (sourceShard.load_count <= targetShard.load_count) continue;
          
          const loadToMove = Math.min(
            sourceShard.load_count - averageLoad,
            averageLoad - targetShard.load_count
          );
          
          if (loadToMove > 0) {
            await this.planMigrations(sourceShard.shard_id, targetShard.shard_id, loadToMove);
          }
        }
      }
      
    } catch (error) {
      this.logger.error(`Failed to check rebalancing: ${error.message}`);
    } finally {
      this.isRebalancing = false;
    }
  }

  async planMigrations(sourceShardId, targetShardId, itemsToMove) {
    try {
      // Get least recently accessed items from source shard
      const itemsToMigrate = await this.db.all(`
        SELECT key_hash, original_key 
        FROM shard_mappings 
        WHERE shard_id = ? 
        ORDER BY last_accessed ASC 
        LIMIT ?
      `, [sourceShardId, itemsToMove]);
      
      if (itemsToMigrate.length === 0) {
        this.logger.debug(`No items to migrate from ${sourceShardId} to ${targetShardId}`);
        return;
      }
      
      this.logger.info(`Planning migration of ${itemsToMigrate.length} items from ${sourceShardId} to ${targetShardId}`);
      
      // Add to migration queue
      for (const item of itemsToMigrate) {
        const migrationId = `mig-${randomBytes(8).toString('hex')}`;
        
        await this.db.run(
          'INSERT INTO shard_migrations (migration_id, source_shard, target_shard, key_hash, status) VALUES (?, ?, ?, ?, ?)',
          [migrationId, sourceShardId, targetShardId, item.key_hash, 'pending']
        );
        
        this.migrationQueue.push({
          migrationId,
          sourceShardId,
          targetShardId,
          keyHash: item.key_hash,
          key: item.original_key
        });
      }
      
    } catch (error) {
      this.logger.error(`Failed to plan migrations from ${sourceShardId} to ${targetShardId}: ${error.message}`);
    }
  }

  async processMigrationQueue() {
    if (this.migrationQueue.length === 0) return;
    
    try {
      // Process up to batch size migrations
      const batch = this.migrationQueue.splice(0, this.config.migrationBatchSize);
      
      for (const migration of batch) {
        try {
          await this.db.run(
            'UPDATE shard_migrations SET status = ?, started_at = CURRENT_TIMESTAMP WHERE migration_id = ?',
            ['processing', migration.migrationId]
          );
          
          // Perform the actual migration
          await this.performMigration(migration);
          
          await this.db.run(
            'UPDATE shard_migrations SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE migration_id = ?',
            ['completed', migration.migrationId]
          );
          
          this.logger.debug(`Migration completed: ${migration.migrationId}`);
          
        } catch (error) {
          this.logger.error(`Migration failed: ${migration.migrationId} - ${error.message}`);
          
          // Update migration status with error
          await this.db.run(
            'UPDATE shard_migrations SET status = ?, error_message = ?, retry_count = retry_count + 1 WHERE migration_id = ?',
            ['failed', error.message.substring(0, 255), migration.migrationId]
          );
          
          // Requeue if retry count is below threshold
          const migrationRecord = await this.db.get(
            'SELECT retry_count FROM shard_migrations WHERE migration_id = ?',
            [migration.migrationId]
          );
          
          if (migrationRecord.retry_count < 3) {
            this.migrationQueue.push(migration);
          }
        }
      }
      
    } catch (error) {
      this.logger.error(`Failed to process migration queue: ${error.message}`);
    }
  }

  async performMigration(migration) {
    try {
      // Update the shard mapping
      await this.db.run(
        'UPDATE shard_mappings SET shard_id = ?, last_accessed = CURRENT_TIMESTAMP WHERE key_hash = ?',
        [migration.targetShardId, migration.keyHash]
      );
      
      // Update load counts
      await this.db.run(
        'UPDATE shard_stats SET load_count = load_count - 1 WHERE shard_id = ?',
        [migration.sourceShardId]
      );
      
      await this.db.run(
        'UPDATE shard_stats SET load_count = load_count + 1 WHERE shard_id = ?',
        [migration.targetShardId]
      );
      
      // Update local caches
      if (this.shards.has(migration.sourceShardId)) {
        this.shards.get(migration.sourceShardId).load -= 1;
      }
      
      if (this.shards.has(migration.targetShardId)) {
        this.shards.get(migration.targetShardId).load += 1;
      }
      
      if (this.shardLoad.has(migration.sourceShardId)) {
        this.shardLoad.get(migration.sourceShardId).load -= 1;
      }
      
      if (this.shardLoad.has(migration.targetShardId)) {
        this.shardLoad.get(migration.targetShardId).load += 1;
      }
      
      // Emit migration event
      this.emit('shardMigrationCompleted', {
        migrationId: migration.migrationId,
        sourceShardId: migration.sourceShardId,
        targetShardId: migration.targetShardId,
        keyHash: migration.keyHash
      });
      
    } catch (error) {
      this.logger.error(`Failed to perform migration ${migration.migrationId}: ${error.message}`);
      throw error;
    }
  }

  async cleanupMappings() {
    try {
      // Clean up mappings that haven't been accessed in 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      
      const result = await this.db.run(
        'DELETE FROM shard_mappings WHERE last_accessed < ?',
        [thirtyDaysAgo]
      );
      
      if (result.changes > 0) {
        this.logger.info(`Cleaned up ${result.changes} old shard mappings`);
      }
      
    } catch (error) {
      this.logger.error(`Failed to cleanup mappings: ${error.message}`);
    }
  }

  checkRebalancingNeeded(shardId) {
    const shard = this.shards.get(shardId);
    if (!shard) return;
    
    const loadPercentage = shard.load / shard.capacity;
    
    if (loadPercentage > 0.8) {
      this.logger.warn(`Shard ${shardId} is heavily loaded (${loadPercentage.toFixed(2)}%)`);
      this.checkRebalancing().catch(error => {
        this.logger.error(`Failed to trigger rebalancing for shard ${shardId}: ${error.message}`);
      });
    }
  }

  async getShardStats() {
    return await this.db.all(`
      SELECT shard_id, load_count, item_count, status, capacity, region, 
             last_updated, last_health_check
      FROM shard_stats 
      ORDER BY region, shard_id
    `);
  }

  async getShardHealth(shardId) {
    return await this.db.all(`
      SELECT shard_id, latency_ms, error_rate, available, checked_at
      FROM shard_health 
      WHERE shard_id = ? 
      ORDER BY checked_at DESC 
      LIMIT 24
    `, [shardId]);
  }

  async getMigrationStats() {
    return await this.db.all(`
      SELECT status, COUNT(*) as count, 
             AVG(retry_count) as avg_retries
      FROM shard_migrations 
      GROUP BY status
    `);
  }

  async addNewShard(region = 'global', capacity = 1000) {
    try {
      const shardId = `shard-${region}-${Date.now()}-${randomBytes(4).toString('hex')}`;
      
      await this.db.run(
        'INSERT INTO shard_stats (shard_id, load_count, item_count, capacity, region, status) VALUES (?, ?, ?, ?, ?, ?)',
        [shardId, 0, 0, capacity, region, 'active']
      );
      
      this.shards.set(shardId, {
        id: shardId,
        load: 0,
        itemCount: 0,
        status: 'active',
        capacity: capacity,
        region: region
      });
      
      this.shardLoad.set(shardId, {
        load: 0,
        lastUpdated: Date.now()
      });
      
      this.logger.info(`Added new shard: ${shardId} in region ${region}`);
      
      return shardId;
      
    } catch (error) {
      this.logger.error(`Failed to add new shard: ${error.message}`);
      throw error;
    }
  }

  async removeShard(shardId) {
    try {
      // Check if shard is empty
      const shardInfo = await this.db.get(
        'SELECT load_count, item_count FROM shard_stats WHERE shard_id = ?',
        [shardId]
      );
      
      if (shardInfo.load_count > 0 || shardInfo.item_count > 0) {
        throw new Error(`Cannot remove shard ${shardId} - it still contains data`);
      }
      
      // Mark shard as inactive
      await this.db.run(
        'UPDATE shard_stats SET status = ? WHERE shard_id = ?',
        ['inactive', shardId]
      );
      
      // Remove from local caches
      this.shards.delete(shardId);
      this.shardLoad.delete(shardId);
      this.shardHealth.delete(shardId);
      
      this.logger.info(`Removed shard: ${shardId}`);
      
    } catch (error) {
      this.logger.error(`Failed to remove shard ${shardId}: ${error.message}`);
      throw error;
    }
  }

  async gracefulShutdown() {
    this.logger.info('Initiating graceful shutdown of sharding manager');
    
    // Clear all intervals
    if (this.statsInterval) clearInterval(this.statsInterval);
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
    if (this.rebalanceInterval) clearInterval(this.rebalanceInterval);
    if (this.migrationInterval) clearInterval(this.migrationInterval);
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    
    // Complete pending migrations
    await this.processMigrationQueue();
    
    this.logger.info('Sharding manager shutdown complete');
  }
}

// Export factory function for dependency injection
export function createShardingManager(config = {}) {
  return new ShardingManager(config);
}
