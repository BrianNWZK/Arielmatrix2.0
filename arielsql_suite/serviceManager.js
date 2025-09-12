import { v4 as uuidv4 } from 'uuid';
import { Mutex } from 'async-mutex';
import { EventEmitter } from 'events';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import express from 'express';
import winston from 'winston';
import betterSqlite3 from 'better-sqlite3';

// Import actual agent classes from their respective files
import AdRevenueAgent from '../backend/agents/adRevenueAgent.js';
import CryptoAgent from '../backend/agents/cryptoAgent.js';
import ShopifyAgent from '../backend/agents/shopifyAgent.js';
import SocialAgent from '../backend/agents/socialAgent.js';
import ForexSignalAgent from '../backend/agents/forexSignalAgent.js';
import PayoutAgent from '../backend/agents/payoutAgent.js';
import DataAgent from '../backend/agents/dataAgent.js';
import AdsenseApi from '../backend/agents/adsenseApi.js';
import ContractDeployAgent from '../backend/agents/contractDeployAgent.js';

// Custom Errors & Utilities
export class DatabaseError extends Error {
    constructor(message, originalError) {
        super(message);
        this.name = 'DatabaseError';
        this.originalError = originalError;
    }
}

export class SecurityError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SecurityError';
    }
}

export class ServiceInitializationError extends Error {
    constructor(serviceName, message) {
        super(`Failed to initialize ${serviceName}: ${message}`);
        this.name = 'ServiceInitializationError';
        this.serviceName = serviceName;
    }
}

// Production Logger
class ProductionLogger {
    constructor() {
        this.logger = winston.createLogger({
            level: process.env.LOG_LEVEL || 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json()
            ),
            defaultMeta: { service: 'ariel-sql-service' },
            transports: [
                new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
                new winston.transports.File({ filename: 'logs/combined.log' }),
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.simple()
                    )
                })
            ],
        });
    }

    info(message, meta = {}) {
        this.logger.info(message, meta);
    }

    error(message, meta = {}) {
        this.logger.error(message, meta);
    }

    warn(message, meta = {}) {
        this.logger.warn(message, meta);
    }

    debug(message, meta = {}) {
        this.logger.debug(message, meta);
    }
}

// Global logger instance
const logger = new ProductionLogger();

// Task Queue with SQLite
class SQLiteTaskQueue {
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.db = null;
    }

    async init() {
        this.db = betterSqlite3(this.dbPath);

        // Create tasks table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                data TEXT,
                status TEXT DEFAULT 'pending',
                priority INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                started_at DATETIME,
                completed_at DATETIME,
                result TEXT,
                error TEXT
            )
        `);

        // Create index for performance
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_tasks_status_priority 
            ON tasks(status, priority DESC, created_at)
        `);

        logger.info('SQLite task queue initialized');
    }

    async add(task) {
        const result = this.db.run(
            "INSERT INTO tasks (type, data, priority) VALUES (?, ?, ?)",
            [task.type, JSON.stringify(task.data || {}), task.priority || 0]
        );

        logger.debug('Task added to queue', { taskId: result.lastInsertRowid, type: task.type });
        return result.lastInsertRowid;
    }

    async getNextTask() {
        return this.db.get(`
            SELECT * FROM tasks 
            WHERE status = 'pending' 
            ORDER BY priority DESC, created_at 
            LIMIT 1
        `);
    }

    async startTask(taskId) {
        this.db.run(
            "UPDATE tasks SET status = 'processing', started_at = CURRENT_TIMESTAMP WHERE id = ?",
            [taskId]
        );

        const task = this.db.get("SELECT * FROM tasks WHERE id = ?", [taskId]);
        return task ? { ...task, data: JSON.parse(task.data || '{}') } : null;
    }

    async completeTask(taskId, result) {
        this.db.run(
            "UPDATE tasks SET status = 'completed', completed_at = CURRENT_TIMESTAMP, result = ? WHERE id = ?",
            [JSON.stringify(result || {}), taskId]
        );
    }

    async failTask(taskId, error) {
        this.db.run(
            "UPDATE tasks SET status = 'failed', completed_at = CURRENT_TIMESTAMP, error = ? WHERE id = ?",
            [error.message, taskId]
        );
    }

    async getQueueStats() {
        const stats = this.db.get(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
            FROM tasks
        `);

        return stats;
    }

    async close() {
        if (this.db) {
            this.db.close();
            logger.info('Task queue database closed');
        }
    }
}

// Database Adapter
class DatabaseAdapter {
    constructor(config) {
        this.config = config;
        this.db = null;
        this.mutex = new Mutex();
    }

    async init() {
        try {
            // Ensure directory exists
            const dir = path.dirname(this.config.path);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            this.db = betterSqlite3(this.config.path);

            // Enable WAL mode for better concurrency
            this.db.pragma('journal_mode = WAL');

            // Enable foreign keys
            this.db.pragma('foreign_keys = ON');

            logger.info('Database adapter initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize database adapter', { error: error.message });
            throw new DatabaseError('Database initialization failed', error);
        }
    }

    async execute(sql, params = []) {
        const release = await this.mutex.acquire();
        try {
            const stmt = this.db.prepare(sql);
            return stmt.run(...params);
        } catch (error) {
            logger.error('Database execute error', { sql, error: error.message });
            throw new DatabaseError('Database execution failed', error);
        } finally {
            release();
        }
    }

    async get(sql, params = []) {
        const release = await this.mutex.acquire();
        try {
            const stmt = this.db.prepare(sql);
            return stmt.get(...params);
        } catch (error) {
            logger.error('Database get error', { sql, error: error.message });
            throw new DatabaseError('Database query failed', error);
        } finally {
            release();
        }
    }

    async all(sql, params = []) {
        const release = await this.mutex.acquire();
        try {
            const stmt = this.db.prepare(sql);
            return stmt.all(...params);
        } catch (error) {
            logger.error('Database all error', { sql, error: error.message });
            throw new DatabaseError('Database query failed', error);
        } finally {
            release();
        }
    }

    async run(sql, params = []) {
        return this.execute(sql, params);
    }

    async close() {
        if (this.db) {
            this.db.close();
            logger.info('Database connection closed');
        }
    }
}

// Autonomous Agents (Real Revenue)
// Base Agent class
class BaseAgent {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.revenueGenerated = 0;
        this.lastExecution = null;
        this.executionCount = 0;
    }

    async initialize() {
        this.logger.info(`${this.constructor.name} initialized`);
    }

    async run() {
        this.executionCount++;
        this.lastExecution = new Date();
        this.logger.debug(`${this.constructor.name} execution started`);
    }

    getStatus() {
        return {
            name: this.constructor.name,
            revenueGenerated: this.revenueGenerated,
            lastExecution: this.lastExecution,
            executionCount: this.executionCount,
            status: 'active'
        };
    }

    recordRevenue(amount, source) {
        this.revenueGenerated += amount;
        this.logger.info('Revenue recorded', { 
            agent: this.constructor.name, 
            amount, 
            source,
            totalRevenue: this.revenueGenerated
        });
    }
}

// Main Service Manager
class ServiceManager extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.dbAdapter = new DatabaseAdapter({ path: this.config.dbPath });
        this.taskQueue = new SQLiteTaskQueue(this.config.dbPath);
        this.agents = {};
        this.app = express();
        this.server = createServer(this.app);
        this.wss = new WebSocketServer({ server: this.server });
    }

    async init() {
        try {
            logger.info('Initializing Service Manager...');

            // Initialize database and task queue
            await this.dbAdapter.init();
            await this.taskQueue.init();

            // Initialize and register all agents
            this.agents = {
                dataAgent: new DataAgent(this.config, logger),
                cryptoAgent: new CryptoAgent(this.config, logger),
                shopifyAgent: new ShopifyAgent(this.config, logger),
                forexSignalAgent: new ForexSignalAgent(this.config, logger),
                socialAgent: new SocialAgent(this.config, logger),
                adRevenueAgent: new AdRevenueAgent(this.config, logger),
                payoutAgent: new PayoutAgent(this.config, logger)
            };

            for (const agentName in this.agents) {
                await this.agents[agentName].initialize();
            }

            // Setup API routes
            this.setupApiRoutes();

            // Setup WebSocket
            this.setupWebSocket();

            logger.info('Service Manager initialized successfully.');
            this.emit('initialized');
        } catch (error) {
            logger.error('Failed to initialize Service Manager', { error: error.message });
            throw new ServiceInitializationError('Service Manager', error.message);
        }
    }

    setupApiRoutes() {
        this.app.use(express.json());

        // Health check route
        this.app.get('/health', (req, res) => {
            res.status(200).send('OK');
        });

        // Agents status route
        this.app.get('/agents/status', (req, res) => {
            const status = Object.values(this.agents).map(agent => agent.getStatus());
            res.json(status);
        });

        // Add task to queue route
        this.app.post('/tasks/add', async (req, res) => {
            const { type, data, priority } = req.body;
            if (!type) {
                return res.status(400).json({ error: 'Task type is required' });
            }
            try {
                const taskId = await this.taskQueue.add({ type, data, priority });
                res.status(201).json({ message: 'Task added', taskId });
            } catch (error) {
                res.status(500).json({ error: 'Failed to add task' });
            }
        });

        logger.info('API routes set up.');
    }

    setupWebSocket() {
        this.wss.on('connection', ws => {
            logger.info('New WebSocket client connected.');
            ws.on('message', message => {
                logger.debug('Received WebSocket message', { message: message.toString() });
                // Handle incoming messages from the frontend
            });
            ws.on('close', () => {
                logger.info('WebSocket client disconnected.');
            });
        });

        // Periodically send a message to all connected clients
        setInterval(() => {
            const data = {
                timestamp: new Date().toISOString(),
                agents: Object.values(this.agents).map(agent => agent.getStatus())
            };
            this.wss.clients.forEach(client => {
                if (client.readyState === 1) { // WebSocket.OPEN
                    client.send(JSON.stringify(data));
                }
            });
        }, 5000); // Update every 5 seconds

        logger.info('WebSocket server set up.');
    }

       start() {
        const PORT = process.env.PORT || 10000; // must match Docker EXPOSE
        const HOST = '0.0.0.0';
        this.server.listen(PORT, HOST, () => {
            logger.info(`🚀 ServiceManager listening on ${HOST}:${PORT}`);
        });
    }
}

const config = {
    dbPath: path.join(process.cwd(), 'data', 'bwaezi.db'), // safer than __dirname in ESM
};

const serviceManager = new ServiceManager(config);

serviceManager.init().then(() => {
    serviceManager.start();
}).catch(err => {
    logger.error('Critical failure during service initialization', { error: err.message });
    process.exit(1);
});

