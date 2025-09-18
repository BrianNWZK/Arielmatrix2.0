// modules/infinite-scalability-engine/index.js
import cluster from 'cluster';
import os from 'os';
import { createServer } from 'http';
import { ArielSQLiteEngine } from '../ariel-sqlite-engine';
import { Logger } from '../enterprise-logger';

export class InfiniteScalabilityEngine {
  constructor(config = {}) {
    this.numCPUs = config.cpuLimit || os.cpus().length;
    this.workers = new Map();
    this.db = new ArielSQLiteEngine(config.databaseConfig);
    this.logger = new Logger('ClusterEngine');
    this.healthCheckInterval = config.healthCheckInterval || 30000;
    this.maxWorkerRestarts = config.maxWorkerRestarts || 10;
    this.workerRestarts = new Map();
    
    this.shuttingDown = false;
    process.on('SIGINT', () => this.gracefulShutdown());
    process.on('SIGTERM', () => this.gracefulShutdown());
  }

  async initialize(appServer) {
    if (cluster.isPrimary) {
      await this.db.init();
      
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

  async handleWorkerMessage(worker, message) {
    if (message.type === 'health') {
      // Store worker health in SQLite
      await this.db.run(
        `INSERT OR REPLACE INTO worker_health 
         (worker_id, pid, memory, uptime, last_update) 
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [worker.id, message.pid, JSON.stringify(message.memory), message.uptime]
      );

      // Also publish to pub/sub for real-time monitoring
      await this.db.publish('cluster:worker:health', {
        workerId: worker.id,
        pid: message.pid,
        memory: message.memory,
        uptime: message.uptime,
        timestamp: Date.now()
      });
    }
  }

  async startHealthMonitoring() {
    // Subscribe to worker health events
    await this.db.subscribe('cluster:worker:health', 'cluster-monitor', (message) => {
      this.handleHealthUpdate(message);
    });

    // Also use setInterval for active checking
    setInterval(async () => {
      for (const [id, worker] of this.workers) {
        try {
          // Check if worker is responsive
          worker.send({ type: 'ping' });
          
          // Update SQLite with worker status
          await this.db.run(
            `INSERT OR REPLACE INTO worker_status 
             (worker_id, pid, alive, last_checked) 
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
            [id, worker.process.pid, true]
          );
        } catch (error) {
          this.logger.error(`Health check failed for worker ${id}: ${error.message}`);
          
          await this.db.run(
            `INSERT OR REPLACE INTO worker_status 
             (worker_id, pid, alive, last_checked) 
             VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
            [id, worker.process.pid, false]
          );
        }
      }
    }, this.healthCheckInterval);
  }

  async handleHealthUpdate(message) {
    // Update in-memory state based on pub/sub messages
    const { workerId, pid, memory, uptime } = message;
    
    if (this.workers.has(workerId)) {
      const worker = this.workers.get(workerId);
      // Update worker health metrics
      worker.health = {
        memory,
        uptime,
        lastUpdate: Date.now()
      };
    }
  }

  async getDetailedStatus() {
    const workerStatuses = [];
    
    for (const [id, worker] of this.workers) {
      const health = await this.db.get(
        'SELECT * FROM worker_health WHERE worker_id = ? ORDER BY last_update DESC LIMIT 1',
        [id]
      );
      
      workerStatuses.push({
        id,
        pid: worker.process.pid,
        health: health || {}
      });
    }

    return {
      primary: process.pid,
      workers: workerStatuses,
      totalWorkers: this.workers.size,
      cpuCores: this.numCPUs,
      systemLoad: os.loadavg(),
      memory: {
        total: os.totalmem(),
        free: os.freemem()
      }
    };
  }

  // Keep all other methods but use SQLite-based functionality
}
