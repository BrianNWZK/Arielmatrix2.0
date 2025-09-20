// modules/infinite-scalability-engine/index.js
import cluster from 'cluster';
import os from 'os';
import { createServer } from 'http';
import { ArielSQLiteEngine } from '../ariel-sqlite-engine/index.js';
import { Logger } from '../enterprise-logger/index.js';
import { cpus, totalmem, freemem, loadavg } from 'os';
import process from 'process';
import { EventEmitter } from 'events';

export class InfiniteScalabilityEngine extends EventEmitter {
  constructor(config = {}) {
    super();
    this.numCPUs = config.cpuLimit || cpus().length;
    this.workers = new Map();
    this.db = new ArielSQLiteEngine(config.databaseConfig);
    this.logger = new Logger('ClusterEngine');
    this.healthCheckInterval = config.healthCheckInterval || 30000;
    this.maxWorkerRestarts = config.maxWorkerRestarts || 10;
    this.workerRestarts = new Map();
    this.shuttingDown = false;
    
    // Graceful shutdown handlers
    process.on('SIGINT', () => this.gracefulShutdown());
    process.on('SIGTERM', () => this.gracefulShutdown());
    process.on('SIGHUP', () => this.gracefulRestart());
  }

  async initialize(appServer) {
    if (cluster.isPrimary) {
      await this.db.init();
      
      // Create necessary tables if they don't exist
      await this.createClusterTables();
      
      this.logger.info(`Primary process ${process.pid} is running with ${this.numCPUs} workers configured`);

      // Initialize cluster state in SQLite
      await this.db.run(
        'INSERT OR REPLACE INTO cluster_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
        ['primary_process', process.pid]
      );

      // Fork workers based on CPU cores
      for (let i = 0; i < this.numCPUs; i++) {
        await this.forkWorker();
      }

      // Set up cluster event handlers
      cluster.on('exit', this.handleWorkerExit.bind(this));
      cluster.on('online', this.handleWorkerOnline.bind(this));
      cluster.on('message', this.handleWorkerMessage.bind(this));

      // Start health monitoring using SQLite
      this.startHealthMonitoring();

      // Set up master HTTP server for health checks and administration
      this.setupAdminServer();

    } else {
      // Worker process initialization
      this.logger.info(`Worker process ${process.pid} started`);
      
      // Initialize worker-specific application
      if (appServer && typeof appServer === 'function') {
        await appServer();
      }
      
      // Worker health reporting using SQLite pub/sub
      setInterval(async () => {
        try {
          await this.db.publish('cluster:worker:health', {
            pid: process.pid,
            memory: process.memoryUsage(),
            uptime: process.uptime(),
            timestamp: Date.now()
          });
        } catch (error) {
          console.error('Health report failed:', error);
        }
      }, 15000);
    }
  }

  async createClusterTables() {
    // Create cluster_state table
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS cluster_state (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create worker_health table
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS worker_health (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        worker_id INTEGER NOT NULL,
        pid INTEGER NOT NULL,
        memory_rss INTEGER,
        memory_heap_total INTEGER,
        memory_heap_used INTEGER,
        memory_external INTEGER,
        uptime REAL,
        cpu_usage REAL,
        last_update DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create worker_status table
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS worker_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        worker_id INTEGER NOT NULL,
        pid INTEGER NOT NULL,
        status TEXT DEFAULT 'online',
        last_checked DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create cluster_metrics table for historical data
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS cluster_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        total_memory INTEGER,
        free_memory INTEGER,
        load_avg_1min REAL,
        load_avg_5min REAL,
        load_avg_15min REAL,
        active_workers INTEGER
      )
    `);
  }

  async forkWorker() {
    const worker = cluster.fork();
    this.workers.set(worker.id, worker);
    this.workerRestarts.set(worker.id, 0);
    
    this.logger.info(`Forked worker ${worker.id} with PID ${worker.process.pid}`);
    
    // Store worker info in database
    await this.db.run(
      'INSERT OR REPLACE INTO cluster_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [`worker_${worker.id}`, worker.process.pid]
    );
    
    return worker;
  }

  async handleWorkerExit(worker, code, signal) {
    this.logger.warn(`Worker ${worker.process.pid} died with code ${code} and signal ${signal}`);
    
    const restarts = this.workerRestarts.get(worker.id) || 0;
    
    if (restarts < this.maxWorkerRestarts && !this.shuttingDown) {
      this.logger.info(`Restarting worker ${worker.id} (${restarts + 1}/${this.maxWorkerRestarts})`);
      this.workerRestarts.set(worker.id, restarts + 1);
      
      // Update database with worker status
      await this.db.run(
        'INSERT OR REPLACE INTO worker_status (worker_id, pid, status, last_checked) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
        [worker.id, worker.process.pid, 'restarting']
      );
      
      // Fork a new worker
      await this.forkWorker();
    } else {
      this.logger.error(`Worker ${worker.id} exceeded maximum restart attempts or shutdown in progress`);
      this.workers.delete(worker.id);
      this.workerRestarts.delete(worker.id);
    }
  }

  handleWorkerOnline(worker) {
    this.logger.info(`Worker ${worker.process.pid} is online`);
    this.db.run(
      'INSERT OR REPLACE INTO worker_status (worker_id, pid, status, last_checked) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
      [worker.id, worker.process.pid, 'online']
    ).catch(err => this.logger.error(`Failed to update worker status: ${err.message}`));
  }

  async handleWorkerMessage(worker, message) {
    try {
      if (message.type === 'health') {
        // Store worker health in SQLite
        await this.db.run(
          `INSERT INTO worker_health 
           (worker_id, pid, memory_rss, memory_heap_total, memory_heap_used, memory_external, uptime, cpu_usage) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            worker.id, 
            message.pid, 
            message.memory.rss, 
            message.memory.heapTotal, 
            message.memory.heapUsed, 
            message.memory.external,
            message.uptime,
            message.cpuUsage || 0
          ]
        );

        // Also publish to pub/sub for real-time monitoring
        await this.db.publish('cluster:worker:health', {
          workerId: worker.id,
          pid: message.pid,
          memory: message.memory,
          uptime: message.uptime,
          cpuUsage: message.cpuUsage,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      this.logger.error(`Failed to handle worker message: ${error.message}`);
    }
  }

  async startHealthMonitoring() {
    // Subscribe to worker health events
    await this.db.subscribe('cluster:worker:health', 'cluster-monitor', (message) => {
      this.handleHealthUpdate(message);
    });

    // Also use setInterval for active checking
    this.healthCheckIntervalId = setInterval(async () => {
      try {
        // Record cluster metrics
        const load = loadavg();
        await this.db.run(
          `INSERT INTO cluster_metrics 
           (total_memory, free_memory, load_avg_1min, load_avg_5min, load_avg_15min, active_workers) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [totalmem(), freemem(), load[0], load[1], load[2], this.workers.size]
        );
        
        for (const [id, worker] of this.workers) {
          try {
            // Check if worker is responsive
            worker.send({ type: 'ping', timestamp: Date.now() });
            
            // Update SQLite with worker status
            await this.db.run(
              `INSERT OR REPLACE INTO worker_status 
               (worker_id, pid, status, last_checked) 
               VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
              [id, worker.process.pid, 'online']
            );
          } catch (error) {
            this.logger.error(`Health check failed for worker ${id}: ${error.message}`);
            
            await this.db.run(
              `INSERT OR REPLACE INTO worker_status 
               (worker_id, pid, status, last_checked) 
               VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
              [id, worker.process.pid, 'unresponsive']
            );
          }
        }
      } catch (error) {
        this.logger.error(`Health monitoring error: ${error.message}`);
      }
    }, this.healthCheckInterval);
  }

  async handleHealthUpdate(message) {
    // Update in-memory state based on pub/sub messages
    const { workerId, pid, memory, uptime, cpuUsage } = message;
    
    if (this.workers.has(workerId)) {
      const worker = this.workers.get(workerId);
      // Update worker health metrics
      worker.health = {
        memory,
        uptime,
        cpuUsage,
        lastUpdate: Date.now()
      };
      
      // Emit health update event
      this.emit('workerHealthUpdate', {
        workerId,
        pid,
        health: worker.health
      });
    }
  }

  setupAdminServer() {
    this.adminServer = createServer(async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      
      try {
        if (req.url === '/health' && req.method === 'GET') {
          const status = await this.getDetailedStatus();
          res.statusCode = 200;
          res.end(JSON.stringify(status));
        } else if (req.url === '/metrics' && req.method === 'GET') {
          const metrics = await this.getMetrics();
          res.statusCode = 200;
          res.end(JSON.stringify(metrics));
        } else if (req.url === '/restart' && req.method === 'POST') {
          // Graceful restart endpoint
          this.gracefulRestart();
          res.statusCode = 202;
          res.end(JSON.stringify({ message: 'Restart initiated' }));
        } else if (req.url === '/workers' && req.method === 'GET') {
          const workers = await this.getWorkerDetails();
          res.statusCode = 200;
          res.end(JSON.stringify(workers));
        } else if (req.url === '/scale' && req.method === 'POST') {
          // Dynamic scaling endpoint
          let body = '';
          req.on('data', chunk => body += chunk);
          req.on('end', async () => {
            try {
              const { count } = JSON.parse(body);
              await this.scaleWorkers(count);
              res.statusCode = 200;
              res.end(JSON.stringify({ message: `Scaled to ${count} workers` }));
            } catch (error) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: error.message }));
            }
          });
          return;
        } else {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      } catch (error) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    
    const adminPort = process.env.ADMIN_PORT || 3001;
    this.adminServer.listen(adminPort, () => {
      this.logger.info(`Admin server running on port ${adminPort}`);
    });
  }

  async getDetailedStatus() {
    const workerStatuses = [];
    
    for (const [id, worker] of this.workers) {
      const health = await this.db.get(
        'SELECT * FROM worker_health WHERE worker_id = ? ORDER BY last_update DESC LIMIT 1',
        [id]
      );
      
      const status = await this.db.get(
        'SELECT status FROM worker_status WHERE worker_id = ? ORDER BY last_checked DESC LIMIT 1',
        [id]
      );
      
      workerStatuses.push({
        id,
        pid: worker.process.pid,
        status: status ? status.status : 'unknown',
        health: health || {}
      });
    }

    return {
      primary: process.pid,
      workers: workerStatuses,
      totalWorkers: this.workers.size,
      cpuCores: this.numCPUs,
      systemLoad: loadavg(),
      memory: {
        total: totalmem(),
        free: freemem(),
        used: totalmem() - freemem()
      }
    };
  }

  async getMetrics() {
    const workerMetrics = [];
    
    for (const [id, worker] of this.workers) {
      const healthRecords = await this.db.all(
        'SELECT * FROM worker_health WHERE worker_id = ? ORDER BY last_update DESC LIMIT 10',
        [id]
      );
      
      workerMetrics.push({
        id,
        pid: worker.process.pid,
        healthHistory: healthRecords
      });
    }
    
    // Get cluster metrics history
    const clusterMetrics = await this.db.all(
      'SELECT * FROM cluster_metrics ORDER BY timestamp DESC LIMIT 24'
    );
    
    return {
      timestamp: Date.now(),
      workers: workerMetrics,
      clusterMetrics,
      system: {
        load: loadavg(),
        memory: {
          total: totalmem(),
          free: freemem(),
          usage: (totalmem() - freemem()) / totalmem() * 100
        }
      }
    };
  }
  
  async getWorkerDetails() {
    const details = [];
    for (const [id, worker] of this.workers) {
      const health = await this.db.get(
        'SELECT * FROM worker_health WHERE worker_id = ? ORDER BY last_update DESC LIMIT 1',
        [id]
      );
      details.push({
        id,
        pid: worker.process.pid,
        restartCount: this.workerRestarts.get(id) || 0,
        health: health || {}
      });
    }
    return details;
  }
  
  async scaleWorkers(count) {
    const currentCount = this.workers.size;
    
    if (count > currentCount) {
      // Scale up
      for (let i = currentCount; i < count; i++) {
        await this.forkWorker();
      }
      this.logger.info(`Scaled up from ${currentCount} to ${count} workers`);
    } else if (count < currentCount) {
      // Scale down
      const workersToRemove = Array.from(this.workers.values()).slice(0, currentCount - count);
      for (const worker of workersToRemove) {
        this.logger.info(`Disconnecting worker ${worker.id} for scaling down`);
        worker.disconnect();
        this.workers.delete(worker.id);
        this.workerRestarts.delete(worker.id);
      }
      this.logger.info(`Scaled down from ${currentCount} to ${count} workers`);
    }
    
    this.numCPUs = count;
  }

  async gracefulShutdown() {
    if (this.shuttingDown) return;
    
    this.shuttingDown = true;
    this.logger.info('Initiating graceful shutdown');
    
    // Clear intervals
    if (this.healthCheckIntervalId) {
      clearInterval(this.healthCheckIntervalId);
    }
    
    // Close admin server
    if (this.adminServer) {
      this.adminServer.close();
    }
    
    // Update cluster state
    await this.db.run(
      'INSERT OR REPLACE INTO cluster_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      ['shutdown_initiated', Date.now()]
    );
    
    // Disconnect all workers
    for (const [id, worker] of this.workers) {
      this.logger.info(`Disconnecting worker ${id}`);
      worker.disconnect();
    }
    
    // Wait for workers to exit
    const checkInterval = setInterval(async () => {
      if (this.workers.size === 0) {
        clearInterval(checkInterval);
        await this.db.run(
          'INSERT OR REPLACE INTO cluster_state (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
          ['shutdown_completed', Date.now()]
        );
        this.logger.info('Shutdown complete');
        process.exit(0);
      }
    }, 1000);
    
    // Force exit after 30 seconds
    setTimeout(() => {
      this.logger.warn('Forcing shutdown after timeout');
      process.exit(1);
    }, 30000);
  }

  async gracefulRestart() {
    this.logger.info('Initiating graceful restart');
    
    // Store current workers
    const oldWorkers = new Map(this.workers);
    this.workers.clear();
    
    // Fork new workers
    for (let i = 0; i < this.numCPUs; i++) {
      await this.forkWorker();
    }
    
    // Then disconnect old workers
    setTimeout(() => {
      for (const [id, worker] of oldWorkers) {
        if (worker.exitedAfterDisconnect === false) {
          worker.disconnect();
        }
      }
    }, 1000);
  }
}
