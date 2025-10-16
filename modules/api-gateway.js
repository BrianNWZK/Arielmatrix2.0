// modules/api-gateway.js
import { EventEmitter } from 'events';
import { ArielSQLiteEngine } from './ariel-sqlite-engine/index.js';
import { SovereignRevenueEngine } from './sovereign-revenue-engine.js';
import { 
    BWAEZI_CHAIN,
    BWAEZI_SOVEREIGN_CONFIG,
    ConfigUtils 
} from '../config/bwaezi-config.js';
import { createHash, randomBytes, createHmac, createCipheriv, createDecipheriv } from 'crypto';
import { createServer } from 'http';
import { parse } from 'url';

export class APIGateway {
    constructor(config = {}) {
        this.config = {
            port: 8443,
            rateLimit: {
                windowMs: 60000,
                maxRequests: 1000
            },
            endpoints: {
                public: ['/health', '/status', '/docs'],
                authenticated: ['/trading', '/account', '/orders'],
                institutional: ['/institutional/*']
            },
            security: {
                jwtSecret: process.env.JWT_SECRET || randomBytes(64).toString('hex'),
                encryptionKey: process.env.ENCRYPTION_KEY || randomBytes(32).toString('hex'),
                hmacSecret: process.env.HMAC_SECRET || randomBytes(64).toString('hex')
            },
            caching: {
                enabled: true,
                ttl: 300000
            },
            ...config
        };
        this.httpServer = null;
        this.routes = new Map();
        this.middleware = new Map();
        this.rateLimiters = new Map();
        this.apiKeys = new Map();
        this.sessions = new Map();
        this.cache = new Map();
        this.db = new ArielSQLiteEngine({ path: './data/api-gateway.db' });
        this.events = new EventEmitter();
        this.sovereignService = null;
        this.serviceId = null;
        this.initialized = false;
        this.metrics = {
            requests: 0,
            errors: 0,
            activeConnections: 0,
            responseTimes: []
        };
    }

    async initialize() {
        if (this.initialized) return;
        
        await this.db.init();
        await this.createDatabaseTables();
        
        this.sovereignService = new SovereignRevenueEngine();
        await this.sovereignService.initialize();
        
        this.serviceId = await this.sovereignService.registerService({
            name: 'APIGateway',
            description: 'High-performance API gateway with advanced security and rate limiting',
            registrationFee: 8000,
            annualLicenseFee: 4000,
            revenueShare: 0.15,
            serviceType: 'api_infrastructure',
            dataPolicy: 'Encrypted API data only - No sensitive data storage',
            compliance: ['API Security', 'Data Protection', 'Rate Limiting']
        });

        await this.loadAPIKeys();
        await this.initializeRoutes();
        await this.initializeMiddleware();
        this.startMetricsCollection();
        this.initialized = true;
        
        this.events.emit('initialized', {
            timestamp: Date.now(),
            endpoints: Object.keys(this.config.endpoints).length,
            security: Object.keys(this.config.security).length
        });
    }

    async createDatabaseTables() {
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS api_keys (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                keyHash TEXT UNIQUE NOT NULL,
                secretHash TEXT NOT NULL,
                permissions TEXT NOT NULL,
                rateLimit INTEGER DEFAULT 1000,
                isActive BOOLEAN DEFAULT true,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                lastUsed DATETIME,
                expiresAt DATETIME
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS api_requests (
                id TEXT PRIMARY KEY,
                apiKeyId TEXT,
                endpoint TEXT NOT NULL,
                method TEXT NOT NULL,
                statusCode INTEGER NOT NULL,
                responseTime INTEGER NOT NULL,
                ipAddress TEXT,
                userAgent TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                errorMessage TEXT,
                FOREIGN KEY (apiKeyId) REFERENCES api_keys (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS rate_limits (
                identifier TEXT NOT NULL,
                endpoint TEXT NOT NULL,
                requestCount INTEGER DEFAULT 1,
                windowStart DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (identifier, endpoint)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS api_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                totalRequests INTEGER DEFAULT 0,
                errorCount INTEGER DEFAULT 0,
                averageResponseTime REAL DEFAULT 0,
                activeConnections INTEGER DEFAULT 0
            )
        `);
    }

    async startServer() {
        if (!this.initialized) await this.initialize();

        this.httpServer = createServer((req, res) => {
            this.handleRequest(req, res);
        });

        this.httpServer.listen(this.config.port, () => {
            console.log(`🚀 BWAEZI API Gateway running on port ${this.config.port}`);
            this.events.emit('serverStarted', {
                port: this.config.port,
                timestamp: new Date()
            });
        });

        this.httpServer.on('error', (error) => {
            console.error('❌ API Gateway server error:', error);
            this.events.emit('serverError', { error, timestamp: new Date() });
        });
    }

    async handleRequest(req, res) {
        const startTime = Date.now();
        const requestId = this.generateRequestId();
        
        try {
            this.metrics.requests++;
            this.metrics.activeConnections++;

            const { pathname } = parse(req.url, true);
            const clientIP = this.getClientIP(req);
            const userAgent = req.headers['user-agent'] || 'unknown';

            // Apply rate limiting
            await this.checkRateLimit(clientIP, pathname, req.method);

            // Authenticate request
            const auth = await this.authenticateRequest(req, pathname);

            // Apply middleware
            await this.applyMiddleware(req, res, auth);

            // Route request
            const response = await this.routeRequest(req, res, pathname, auth);

            const responseTime = Date.now() - startTime;
            this.metrics.responseTimes.push(responseTime);

            await this.logRequest(requestId, auth?.apiKeyId, pathname, req.method, 200, responseTime, clientIP, userAgent);

            this.sendResponse(res, 200, response);

        } catch (error) {
            const responseTime = Date.now() - startTime;
            this.metrics.errors++;

            await this.logRequest(requestId, null, req.url, req.method, error.statusCode || 500, responseTime, this.getClientIP(req), req.headers['user-agent'], error.message);

            this.sendError(res, error.statusCode || 500, error.message);
        } finally {
            this.metrics.activeConnections--;
        }
    }

    async checkRateLimit(identifier, endpoint, method) {
        const windowMs = this.config.rateLimit.windowMs;
        const maxRequests = this.config.rateLimit.maxRequests;

        const now = Date.now();
        const windowStart = new Date(now - windowMs);

        const result = await this.db.get(`
            SELECT requestCount 
            FROM rate_limits 
            WHERE identifier = ? AND endpoint = ? AND windowStart >= ?
        `, [identifier, endpoint, windowStart]);

        if (result && result.requestCount >= maxRequests) {
            throw {
                statusCode: 429,
                message: 'Rate limit exceeded'
            };
        }

        if (result) {
            await this.db.run(`
                UPDATE rate_limits 
                SET requestCount = requestCount + 1 
                WHERE identifier = ? AND endpoint = ?
            `, [identifier, endpoint]);
        } else {
            await this.db.run(`
                INSERT OR REPLACE INTO rate_limits (identifier, endpoint, requestCount, windowStart)
                VALUES (?, ?, 1, CURRENT_TIMESTAMP)
            `, [identifier, endpoint]);
        }
    }

    async authenticateRequest(req, pathname) {
        // Check if endpoint is public
        if (this.isPublicEndpoint(pathname)) {
            return { type: 'public' };
        }

        // Extract API key from headers
        const apiKey = req.headers['x-api-key'];
        const signature = req.headers['x-signature'];
        const timestamp = req.headers['x-timestamp'];

        if (!apiKey || !signature || !timestamp) {
            throw {
                statusCode: 401,
                message: 'Missing authentication headers'
            };
        }

        // Validate timestamp (prevent replay attacks)
        const requestTime = parseInt(timestamp);
        const currentTime = Date.now();
        if (Math.abs(currentTime - requestTime) > 300000) { // 5 minutes
            throw {
                statusCode: 401,
                message: 'Invalid timestamp'
            };
        }

        // Verify API key
        const apiKeyInfo = await this.verifyAPIKey(apiKey);
        if (!apiKeyInfo) {
            throw {
                statusCode: 401,
                message: 'Invalid API key'
            };
        }

        // Verify signature
        const expectedSignature = this.calculateSignature(apiKey, apiKeyInfo.secretHash, timestamp, req.method, pathname, req.body);
        if (signature !== expectedSignature) {
            throw {
                statusCode: 401,
                message: 'Invalid signature'
            };
        }

        // Check permissions
        if (!this.hasPermission(apiKeyInfo.permissions, pathname)) {
            throw {
                statusCode: 403,
                message: 'Insufficient permissions'
            };
        }

        await this.updateAPIKeyUsage(apiKeyInfo.id);

        return {
            type: 'authenticated',
            apiKeyId: apiKeyInfo.id,
            permissions: apiKeyInfo.permissions,
            rateLimit: apiKeyInfo.rateLimit
        };
    }

    isPublicEndpoint(pathname) {
        return this.config.endpoints.public.some(pattern => 
            pathname === pattern || (pattern.endsWith('*') && pathname.startsWith(pattern.slice(0, -1)))
        );
    }

    async verifyAPIKey(apiKey) {
        const apiKeyHash = this.hashAPIKey(apiKey);
        
        const keyInfo = await this.db.get(`
            SELECT * FROM api_keys 
            WHERE keyHash = ? AND isActive = true AND (expiresAt IS NULL OR expiresAt > CURRENT_TIMESTAMP)
        `, [apiKeyHash]);

        return keyInfo;
    }

    hashAPIKey(apiKey) {
        return createHash('sha512').update(apiKey).digest('hex');
    }

    calculateSignature(apiKey, secretHash, timestamp, method, pathname, body = '') {
        const data = `${apiKey}${timestamp}${method}${pathname}${JSON.stringify(body)}`;
        return createHmac('sha512', secretHash)
            .update(data)
            .digest('hex');
    }

    hasPermission(permissions, pathname) {
        const permissionList = JSON.parse(permissions);
        return permissionList.some(pattern => 
            pathname === pattern || (pattern.endsWith('*') && pathname.startsWith(pattern.slice(0, -1)))
        );
    }

    async updateAPIKeyUsage(apiKeyId) {
        await this.db.run(`
            UPDATE api_keys SET lastUsed = CURRENT_TIMESTAMP WHERE id = ?
        `, [apiKeyId]);
    }

    async applyMiddleware(req, res, auth) {
        const middlewares = Array.from(this.middleware.values());
        
        for (const middleware of middlewares) {
            if (await middleware.shouldRun(req, auth)) {
                await middleware.execute(req, res, auth);
            }
        }
    }

    async routeRequest(req, res, pathname, auth) {
        const route = this.findRoute(pathname, req.method);
        
        if (!route) {
            throw {
                statusCode: 404,
                message: 'Endpoint not found'
            };
        }

        const handler = route.handler;
        const params = this.extractRouteParams(route.pattern, pathname);

        return await handler(req, res, { ...auth, params });
    }

    findRoute(pathname, method) {
        for (const [pattern, route] of this.routes) {
            if (this.matchesRoute(pattern, pathname) && route.methods.includes(method)) {
                return route;
            }
        }
        return null;
    }

    matchesRoute(pattern, pathname) {
        if (pattern === pathname) return true;
        if (pattern.endsWith('*')) {
            return pathname.startsWith(pattern.slice(0, -1));
        }
        return false;
    }

    extractRouteParams(pattern, pathname) {
        if (pattern === pathname) return {};
        
        const params = {};
        const patternParts = pattern.split('/');
        const pathParts = pathname.split('/');
        
        for (let i = 0; i < patternParts.length; i++) {
            if (patternParts[i].startsWith(':')) {
                const paramName = patternParts[i].slice(1);
                params[paramName] = pathParts[i];
            }
        }
        
        return params;
    }

    sendResponse(res, statusCode, data) {
        res.writeHead(statusCode, {
            'Content-Type': 'application/json',
            'X-API-Version': '1.0',
            'X-Request-ID': this.generateRequestId()
        });
        
        res.end(JSON.stringify({
            success: true,
            data,
            timestamp: new Date().toISOString()
        }));
    }

    sendError(res, statusCode, message) {
        res.writeHead(statusCode, {
            'Content-Type': 'application/json',
            'X-API-Version': '1.0'
        });
        
        res.end(JSON.stringify({
            success: false,
            error: {
                code: statusCode,
                message: message
            },
            timestamp: new Date().toISOString()
        }));
    }

    getClientIP(req) {
        return req.headers['x-forwarded-for'] || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress;
    }

    generateRequestId() {
        return `req_${Date.now().toString(36)}_${randomBytes(8).toString('hex')}`;
    }

    async logRequest(requestId, apiKeyId, endpoint, method, statusCode, responseTime, ipAddress, userAgent, errorMessage = null) {
        await this.db.run(`
            INSERT INTO api_requests (id, apiKeyId, endpoint, method, statusCode, responseTime, ipAddress, userAgent, errorMessage)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [requestId, apiKeyId, endpoint, method, statusCode, responseTime, ipAddress, userAgent, errorMessage]);
    }

    async registerRoute(pattern, methods, handler, options = {}) {
        const route = {
            pattern,
            methods: Array.isArray(methods) ? methods : [methods],
            handler,
            options: {
                authRequired: options.authRequired !== false,
                rateLimit: options.rateLimit || this.config.rateLimit,
                cache: options.cache || false,
                ...options
            }
        };

        this.routes.set(pattern, route);
        
        this.events.emit('routeRegistered', {
            pattern,
            methods: route.methods,
            options: route.options,
            timestamp: new Date()
        });
    }

    async registerMiddleware(name, middleware) {
        this.middleware.set(name, middleware);
        
        this.events.emit('middlewareRegistered', {
            name,
            timestamp: new Date()
        });
    }

    async createAPIKey(name, permissions, rateLimit = 1000, expiresAt = null) {
        if (!this.initialized) await this.initialize();

        const apiKey = this.generateAPIKey();
        const secret = this.generateAPISecret();
        const keyHash = this.hashAPIKey(apiKey);
        const secretHash = this.hashAPISecret(secret);

        const apiKeyId = this.generateAPIKeyId();

        await this.db.run(`
            INSERT INTO api_keys (id, name, keyHash, secretHash, permissions, rateLimit, expiresAt)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [apiKeyId, name, keyHash, secretHash, JSON.stringify(permissions), rateLimit, expiresAt]);

        this.apiKeys.set(apiKeyId, {
            id: apiKeyId,
            name,
            permissions,
            rateLimit,
            expiresAt,
            createdAt: new Date()
        });

        this.events.emit('apiKeyCreated', {
            apiKeyId,
            name,
            permissions,
            rateLimit,
            expiresAt
        });

        return { apiKeyId, apiKey, secret, expiresAt };
    }

    generateAPIKey() {
        return `bwz_api_${randomBytes(32).toString('hex')}`;
    }

    generateAPISecret() {
        return `bwz_sec_${randomBytes(64).toString('hex')}`;
    }

    hashAPISecret(secret) {
        return createHmac('sha512', this.config.security.hmacSecret)
            .update(secret)
            .digest('hex');
    }

    generateAPIKeyId() {
        return `key_${Date.now().toString(36)}_${randomBytes(8).toString('hex')}`;
    }

    async loadAPIKeys() {
        const keys = await this.db.all('SELECT * FROM api_keys WHERE isActive = true');
        
        for (const key of keys) {
            this.apiKeys.set(key.id, {
                ...key,
                permissions: JSON.parse(key.permissions)
            });
        }
    }

    async initializeRoutes() {
        // Health endpoint
        await this.registerRoute('/health', 'GET', async (req, res, auth) => {
            return {
                status: 'healthy',
                version: '1.0.0',
                timestamp: new Date(),
                uptime: process.uptime()
            };
        }, { authRequired: false });

        // Status endpoint
        await this.registerRoute('/status', 'GET', async (req, res, auth) => {
            return await this.getGatewayStatus();
        }, { authRequired: false });

        // API key management
        await this.registerRoute('/api-keys', 'POST', async (req, res, auth) => {
            const { name, permissions, rateLimit, expiresAt } = await this.parseRequestBody(req);
            return await this.createAPIKey(name, permissions, rateLimit, expiresAt);
        });

        await this.registerRoute('/api-keys/:id', 'DELETE', async (req, res, auth) => {
            const { id } = auth.params;
            await this.revokeAPIKey(id);
            return { success: true, message: 'API key revoked' };
        });

        // Metrics endpoint
        await this.registerRoute('/metrics', 'GET', async (req, res, auth) => {
            return await this.getMetrics();
        });
    }

    async initializeMiddleware() {
        // CORS middleware
        const corsMiddleware = {
            shouldRun: (req, auth) => true,
            execute: async (req, res) => {
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Signature, X-Timestamp');
            }
        };

        // Body parsing middleware
        const bodyParserMiddleware = {
            shouldRun: (req, auth) => ['POST', 'PUT', 'PATCH'].includes(req.method),
            execute: async (req, res) => {
                req.body = await this.parseRequestBody(req);
            }
        };

        // Caching middleware
        const cacheMiddleware = {
            shouldRun: (req, auth) => {
                const route = this.findRoute(req.url, req.method);
                return route && route.options.cache;
            },
            execute: async (req, res, auth) => {
                const cacheKey = this.generateCacheKey(req, auth);
                const cached = this.cache.get(cacheKey);
                
                if (cached && Date.now() - cached.timestamp < this.config.caching.ttl) {
                    this.sendResponse(res, 200, cached.data);
                    return true;
                }
                
                return false;
            }
        };

        await this.registerMiddleware('cors', corsMiddleware);
        await this.registerMiddleware('bodyParser', bodyParserMiddleware);
        await this.registerMiddleware('cache', cacheMiddleware);
    }

    async parseRequestBody(req) {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (error) {
                    reject({
                        statusCode: 400,
                        message: 'Invalid JSON body'
                    });
                }
            });
        });
    }

    generateCacheKey(req, auth) {
        return createHash('sha256')
            .update(`${req.method}:${req.url}:${auth.apiKeyId || 'public'}`)
            .digest('hex');
    }

    async getGatewayStatus() {
        const requestStats = await this.db.get(`
            SELECT 
                COUNT(*) as totalRequests,
                COUNT(CASE WHEN timestamp >= datetime('now', '-1 hour') THEN 1 END) as hourlyRequests,
                AVG(responseTime) as avgResponseTime,
                COUNT(CASE WHEN statusCode >= 400 THEN 1 END) as errorCount
            FROM api_requests
            WHERE timestamp >= datetime('now', '-24 hours')
        `);

        const activeKeys = await this.db.get(`
            SELECT COUNT(*) as activeKeys
            FROM api_keys
            WHERE isActive = true AND (expiresAt IS NULL OR expiresAt > CURRENT_TIMESTAMP)
        `);

        return {
            requests: requestStats,
            apiKeys: activeKeys,
            cache: {
                size: this.cache.size,
                hitRate: this.calculateCacheHitRate()
            },
            rateLimiting: {
                activeWindows: await this.getActiveRateLimitWindows()
            },
            timestamp: new Date()
        };
    }

    async getMetrics() {
        const hourlyMetrics = await this.db.all(`
            SELECT 
                strftime('%Y-%m-%d %H:00:00', timestamp) as hour,
                COUNT(*) as requestCount,
                AVG(responseTime) as avgResponseTime,
                COUNT(CASE WHEN statusCode >= 400 THEN 1 END) as errorCount
            FROM api_requests
            WHERE timestamp >= datetime('now', '-24 hours')
            GROUP BY hour
            ORDER BY hour
        `);

        const endpointMetrics = await this.db.all(`
            SELECT 
                endpoint,
                method,
                COUNT(*) as requestCount,
                AVG(responseTime) as avgResponseTime,
                COUNT(CASE WHEN statusCode >= 400 THEN 1 END) as errorCount
            FROM api_requests
            WHERE timestamp >= datetime('now', '-1 hour')
            GROUP BY endpoint, method
            ORDER BY requestCount DESC
        `);

        const clientMetrics = await this.db.all(`
            SELECT 
                ipAddress,
                COUNT(*) as requestCount,
                COUNT(DISTINCT apiKeyId) as uniqueKeys
            FROM api_requests
            WHERE timestamp >= datetime('now', '-1 hour')
            GROUP BY ipAddress
            ORDER BY requestCount DESC
            LIMIT 10
        `);

        return {
            hourly: hourlyMetrics,
            endpoints: endpointMetrics,
            clients: clientMetrics,
            current: this.metrics,
            timestamp: new Date()
        };
    }

    calculateCacheHitRate() {
        const totalRequests = this.metrics.requests;
        const cacheHits = this.metrics.responseTimes.filter(rt => rt < 10).length; // Simplified
        return totalRequests > 0 ? cacheHits / totalRequests : 0;
    }

    async getActiveRateLimitWindows() {
        const result = await this.db.get(`
            SELECT COUNT(DISTINCT identifier) as activeWindows
            FROM rate_limits
            WHERE windowStart >= datetime('now', '-1 minute')
        `);
        return result.activeWindows;
    }

    async revokeAPIKey(apiKeyId) {
        await this.db.run(`
            UPDATE api_keys SET isActive = false WHERE id = ?
        `, [apiKeyId]);

        this.apiKeys.delete(apiKeyId);

        this.events.emit('apiKeyRevoked', {
            apiKeyId,
            timestamp: new Date()
        });
    }

    startMetricsCollection() {
        setInterval(async () => {
            await this.recordMetrics();
        }, 60000); // Every minute
    }

    async recordMetrics() {
        const avgResponseTime = this.metrics.responseTimes.length > 0 
            ? this.metrics.responseTimes.reduce((a, b) => a + b, 0) / this.metrics.responseTimes.length 
            : 0;

        await this.db.run(`
            INSERT INTO api_metrics (totalRequests, errorCount, averageResponseTime, activeConnections)
            VALUES (?, ?, ?, ?)
        `, [this.metrics.requests, this.metrics.errors, avgResponseTime, this.metrics.activeConnections]);

        // Reset metrics for next period
        this.metrics.requests = 0;
        this.metrics.errors = 0;
        this.metrics.responseTimes = [];
    }

    async cleanupExpiredData() {
        // Clean up old rate limit data
        await this.db.run(`
            DELETE FROM rate_limits 
            WHERE windowStart < datetime('now', '-1 hour')
        `);

        // Clean up old request logs
        await this.db.run(`
            DELETE FROM api_requests 
            WHERE timestamp < datetime('now', '-30 days')
        `);

        // Clean up expired API keys
        await this.db.run(`
            UPDATE api_keys 
            SET isActive = false 
            WHERE expiresAt < CURRENT_TIMESTAMP AND isActive = true
        `);

        // Clean up cache
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > this.config.caching.ttl) {
                this.cache.delete(key);
            }
        }
    }
}

export default APIGateway;
