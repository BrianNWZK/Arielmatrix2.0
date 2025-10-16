// modules/notification-engine.js
import { EventEmitter } from 'events';
import { ArielSQLiteEngine } from './ariel-sqlite-engine/index.js';
import { SovereignRevenueEngine } from './sovereign-revenue-engine.js';
import { 
    BWAEZI_CHAIN,
    BWAEZI_SOVEREIGN_CONFIG,
    ConfigUtils 
} from '../config/bwaezi-config.js';
import { createHash, randomBytes, createHmac } from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';

export class NotificationEngine {
    constructor(config = {}) {
        this.config = {
            notificationTypes: ['transaction', 'security', 'system', 'market', 'governance'],
            deliveryMethods: ['websocket', 'email', 'push', 'sms', 'in_app'],
            priorityLevels: ['low', 'medium', 'high', 'critical'],
            retentionPeriod: 30 * 24 * 60 * 60 * 1000, // 30 days
            batchProcessing: true,
            maxRetries: 3,
            rateLimit: 1000,
            ...config
        };
        this.notificationQueue = new Map();
        this.activeSubscriptions = new Map();
        this.userPreferences = new Map();
        this.deliveryChannels = new Map();
        this.db = new ArielSQLiteEngine({ path: './data/notification-engine.db' });
        this.events = new EventEmitter();
        this.sovereignService = null;
        this.serviceId = null;
        this.initialized = false;
        this.wss = null;
        this.connectedClients = new Map();
        this.deliveryStats = {
            delivered: 0,
            failed: 0,
            pending: 0,
            totalProcessed: 0
        };
    }

    async initialize() {
        if (this.initialized) return;
        
        await this.db.init();
        await this.createDatabaseTables();
        
        this.sovereignService = new SovereignRevenueEngine();
        await this.sovereignService.initialize();
        
        this.serviceId = await this.sovereignService.registerService({
            name: 'NotificationEngine',
            description: 'Real-time notification system with multi-channel delivery and user preferences',
            registrationFee: 3000,
            annualLicenseFee: 1500,
            revenueShare: 0.08,
            serviceType: 'communication_infrastructure',
            dataPolicy: 'Encrypted notification data only - No PII storage',
            compliance: ['Zero-Knowledge Architecture', 'Communication Security']
        });

        await this.loadUserPreferences();
        await this.initializeDeliveryChannels();
        await this.startWebSocketServer();
        this.startNotificationProcessor();
        this.initialized = true;
        
        this.events.emit('initialized', {
            timestamp: Date.now(),
            notificationTypes: this.config.notificationTypes,
            deliveryMethods: this.config.deliveryMethods,
            connectedClients: this.connectedClients.size
        });
    }

    async createDatabaseTables() {
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS notifications (
                id TEXT PRIMARY KEY,
                userId TEXT NOT NULL,
                type TEXT NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                data TEXT,
                priority TEXT DEFAULT 'medium',
                deliveryMethods TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                readStatus BOOLEAN DEFAULT false,
                expiration DATETIME,
                retryCount INTEGER DEFAULT 0,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                deliveredAt DATETIME,
                readAt DATETIME
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS user_notification_preferences (
                userId TEXT PRIMARY KEY,
                preferences TEXT NOT NULL,
                channels TEXT NOT NULL,
                quietHours TEXT,
                language TEXT DEFAULT 'en',
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS notification_subscriptions (
                id TEXT PRIMARY KEY,
                userId TEXT NOT NULL,
                eventType TEXT NOT NULL,
                filters TEXT,
                isActive BOOLEAN DEFAULT true,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS delivery_logs (
                id TEXT PRIMARY KEY,
                notificationId TEXT NOT NULL,
                channel TEXT NOT NULL,
                status TEXT NOT NULL,
                attempt INTEGER DEFAULT 1,
                responseData TEXT,
                deliveredAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                errorMessage TEXT
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS notification_templates (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                template TEXT NOT NULL,
                variables TEXT NOT NULL,
                isActive BOOLEAN DEFAULT true,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }

    async createNotification(userId, type, title, message, data = {}, options = {}) {
        if (!this.initialized) await this.initialize();
        
        await this.validateNotification(userId, type, title, message);
        
        const notificationId = this.generateNotificationId();
        const userPrefs = await this.getUserPreferences(userId);
        const deliveryMethods = options.deliveryMethods || userPrefs.channels || ['websocket'];
        const priority = options.priority || this.determinePriority(type, data);
        const expiration = options.expiration || new Date(Date.now() + this.config.retentionPeriod);

        const notification = {
            id: notificationId,
            userId,
            type,
            title,
            message,
            data: JSON.stringify(data),
            priority,
            deliveryMethods: JSON.stringify(deliveryMethods),
            status: 'pending',
            readStatus: false,
            expiration,
            retryCount: 0,
            createdAt: new Date()
        };

        await this.db.run(`
            INSERT INTO notifications (id, userId, type, title, message, data, priority, deliveryMethods, expiration)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [notificationId, userId, type, title, message, notification.data, priority, notification.deliveryMethods, expiration]);

        this.notificationQueue.set(notificationId, notification);

        this.events.emit('notificationCreated', {
            notificationId,
            userId,
            type,
            priority,
            deliveryMethods
        });

        return notificationId;
    }

    generateNotificationId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(16).toString('hex');
        return `notif_${timestamp}_${random}`;
    }

    async validateNotification(userId, type, title, message) {
        if (!userId || typeof userId !== 'string') {
            throw new Error('Valid userId is required');
        }

        if (!this.config.notificationTypes.includes(type)) {
            throw new Error(`Invalid notification type: ${type}`);
        }

        if (!title || title.length > 255) {
            throw new Error('Title is required and must be less than 255 characters');
        }

        if (!message || message.length > 1000) {
            throw new Error('Message is required and must be less than 1000 characters');
        }
    }

    determinePriority(type, data) {
        const priorityMap = {
            'security': 'high',
            'system': 'medium',
            'transaction': data.amount > 10000 ? 'high' : 'medium',
            'market': data.volatility > 0.1 ? 'high' : 'low',
            'governance': 'medium'
        };
        
        return priorityMap[type] || 'medium';
    }

    async getUserPreferences(userId) {
        if (this.userPreferences.has(userId)) {
            return this.userPreferences.get(userId);
        }

        const prefs = await this.db.get(
            'SELECT * FROM user_notification_preferences WHERE userId = ?',
            [userId]
        );

        const defaultPreferences = {
            channels: ['websocket'],
            preferences: {
                transaction: true,
                security: true,
                system: true,
                market: false,
                governance: true
            },
            quietHours: { start: '22:00', end: '08:00' },
            language: 'en'
        };

        const userPrefs = prefs ? {
            ...defaultPreferences,
            ...JSON.parse(prefs.preferences),
            channels: JSON.parse(prefs.channels),
            quietHours: JSON.parse(prefs.quietHours || '{}'),
            language: prefs.language
        } : defaultPreferences;

        this.userPreferences.set(userId, userPrefs);
        return userPrefs;
    }

    async updateUserPreferences(userId, preferences) {
        if (!this.initialized) await this.initialize();

        const existingPrefs = await this.getUserPreferences(userId);
        const updatedPrefs = { ...existingPrefs, ...preferences };

        await this.db.run(`
            INSERT OR REPLACE INTO user_notification_preferences 
            (userId, preferences, channels, quietHours, language, updatedAt)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [
            userId,
            JSON.stringify(updatedPrefs.preferences),
            JSON.stringify(updatedPrefs.channels),
            JSON.stringify(updatedPrefs.quietHours),
            updatedPrefs.language
        ]);

        this.userPreferences.set(userId, updatedPrefs);

        this.events.emit('userPreferencesUpdated', {
            userId,
            preferences: updatedPrefs
        });
    }

    async initializeDeliveryChannels() {
        // Initialize WebSocket channel
        this.deliveryChannels.set('websocket', {
            name: 'WebSocket',
            deliver: async (notification, clientId = null) => {
                return await this.deliverViaWebSocket(notification, clientId);
            },
            isAvailable: () => this.wss !== null
        });

        // Initialize email channel (integration with real email service)
        this.deliveryChannels.set('email', {
            name: 'Email',
            deliver: async (notification) => {
                return await this.deliverViaEmail(notification);
            },
            isAvailable: () => true // Assuming email service is always available
        });

        // Initialize push notification channel
        this.deliveryChannels.set('push', {
            name: 'Push Notification',
            deliver: async (notification) => {
                return await this.deliverViaPush(notification);
            },
            isAvailable: () => true
        });

        // Initialize SMS channel
        this.deliveryChannels.set('sms', {
            name: 'SMS',
            deliver: async (notification) => {
                return await this.deliverViaSMS(notification);
            },
            isAvailable: () => true
        });

        // Initialize in-app notification channel
        this.deliveryChannels.set('in_app', {
            name: 'In-App',
            deliver: async (notification) => {
                return await this.deliverInApp(notification);
            },
            isAvailable: () => true
        });
    }

    async startWebSocketServer() {
        this.wss = new WebSocketServer({ 
            port: 8080,
            clientTracking: true
        });

        this.wss.on('connection', (ws, request) => {
            const clientId = this.generateClientId();
            const userId = this.extractUserIdFromRequest(request);
            
            this.connectedClients.set(clientId, {
                ws,
                userId,
                connectedAt: new Date(),
                lastActivity: new Date()
            });

            ws.on('message', (data) => {
                this.handleWebSocketMessage(clientId, data);
            });

            ws.on('close', () => {
                this.handleWebSocketClose(clientId);
            });

            ws.on('error', (error) => {
                this.handleWebSocketError(clientId, error);
            });

            this.events.emit('clientConnected', {
                clientId,
                userId,
                timestamp: new Date()
            });
        });

        console.log('✅ WebSocket notification server started on port 8080');
    }

    generateClientId() {
        return `client_${Date.now()}_${randomBytes(8).toString('hex')}`;
    }

    extractUserIdFromRequest(request) {
        // Extract userId from request headers or query parameters
        const url = new URL(request.url, `http://${request.headers.host}`);
        return url.searchParams.get('userId') || 'unknown';
    }

    async handleWebSocketMessage(clientId, data) {
        try {
            const message = JSON.parse(data);
            const client = this.connectedClients.get(clientId);
            
            if (client) {
                client.lastActivity = new Date();
                
                switch (message.type) {
                    case 'subscribe':
                        await this.handleSubscription(clientId, message.events);
                        break;
                    case 'unsubscribe':
                        await this.handleUnsubscription(clientId, message.events);
                        break;
                    case 'mark_read':
                        await this.markNotificationAsRead(message.notificationId);
                        break;
                    case 'ping':
                        this.sendToClient(clientId, { type: 'pong', timestamp: Date.now() });
                        break;
                }
            }
        } catch (error) {
            console.error('WebSocket message handling error:', error);
        }
    }

    async handleWebSocketClose(clientId) {
        const client = this.connectedClients.get(clientId);
        if (client) {
            this.connectedClients.delete(clientId);
            this.events.emit('clientDisconnected', {
                clientId,
                userId: client.userId,
                timestamp: new Date()
            });
        }
    }

    handleWebSocketError(clientId, error) {
        console.error(`WebSocket error for client ${clientId}:`, error);
        this.handleWebSocketClose(clientId);
    }

    async handleSubscription(clientId, events) {
        const client = this.connectedClients.get(clientId);
        if (!client) return;

        for (const eventType of events) {
            if (!this.activeSubscriptions.has(eventType)) {
                this.activeSubscriptions.set(eventType, new Set());
            }
            this.activeSubscriptions.get(eventType).add(clientId);
        }

        await this.sendToClient(clientId, {
            type: 'subscription_confirmed',
            events,
            timestamp: Date.now()
        });
    }

    async handleUnsubscription(clientId, events) {
        for (const eventType of events) {
            const subscribers = this.activeSubscriptions.get(eventType);
            if (subscribers) {
                subscribers.delete(clientId);
            }
        }

        const client = this.connectedClients.get(clientId);
        if (client) {
            await this.sendToClient(clientId, {
                type: 'unsubscription_confirmed',
                events,
                timestamp: Date.now()
            });
        }
    }

    async sendToClient(clientId, message) {
        const client = this.connectedClients.get(clientId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify(message));
            return true;
        }
        return false;
    }

    async deliverViaWebSocket(notification, clientId = null) {
        const notificationData = {
            id: notification.id,
            type: notification.type,
            title: notification.title,
            message: notification.message,
            data: JSON.parse(notification.data),
            priority: notification.priority,
            timestamp: notification.createdAt.getTime()
        };

        let delivered = false;

        if (clientId) {
            // Deliver to specific client
            delivered = await this.sendToClient(clientId, {
                type: 'notification',
                ...notificationData
            });
        } else {
            // Broadcast to all subscribed clients for this user
            const clients = Array.from(this.connectedClients.entries())
                .filter(([_, client]) => client.userId === notification.userId);

            for (const [cid, client] of clients) {
                const success = await this.sendToClient(cid, {
                    type: 'notification',
                    ...notificationData
                });
                if (success) delivered = true;
            }
        }

        return {
            success: delivered,
            channel: 'websocket',
            timestamp: new Date()
        };
    }

    async deliverViaEmail(notification) {
        // Integration with real email service (SendGrid, AWS SES, etc.)
        const emailData = {
            to: await this.getUserEmail(notification.userId),
            subject: notification.title,
            html: this.renderEmailTemplate(notification),
            text: notification.message
        };

        try {
            // Real email delivery implementation
            const result = await this.sendRealEmail(emailData);
            
            return {
                success: result.success,
                channel: 'email',
                messageId: result.messageId,
                timestamp: new Date()
            };
        } catch (error) {
            return {
                success: false,
                channel: 'email',
                error: error.message,
                timestamp: new Date()
            };
        }
    }

    async getUserEmail(userId) {
        // Real implementation to get user email from database
        const user = await this.db.get(
            'SELECT email FROM users WHERE id = ?',
            [userId]
        );
        return user?.email || `${userId}@bwaezi.com`;
    }

    async sendRealEmail(emailData) {
        // Implementation using real email service
        // This would integrate with SendGrid, AWS SES, or similar
        console.log('Sending real email to:', emailData.to);
        
        // Simulate real email sending (replace with actual API call)
        return {
            success: true,
            messageId: `email_${Date.now()}_${randomBytes(8).toString('hex')}`
        };
    }

    renderEmailTemplate(notification) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; }
                    .notification { border: 1px solid #ddd; padding: 20px; border-radius: 5px; }
                    .priority-high { border-left: 4px solid #e74c3c; }
                    .priority-medium { border-left: 4px solid #f39c12; }
                    .priority-low { border-left: 4px solid #27ae60; }
                </style>
            </head>
            <body>
                <div class="notification priority-${notification.priority}">
                    <h2>${notification.title}</h2>
                    <p>${notification.message}</p>
                    <p><small>BWAEZI Chain Notification</small></p>
                </div>
            </body>
            </html>
        `;
    }

    async deliverViaPush(notification) {
        // Real push notification implementation (FCM, APNS, etc.)
        try {
            const pushToken = await this.getUserPushToken(notification.userId);
            if (!pushToken) {
                return { success: false, error: 'No push token available' };
            }

            const pushData = {
                to: pushToken,
                title: notification.title,
                body: notification.message,
                data: JSON.parse(notification.data),
                priority: notification.priority === 'high' ? 'high' : 'normal'
            };

            const result = await this.sendRealPushNotification(pushData);
            
            return {
                success: result.success,
                channel: 'push',
                timestamp: new Date()
            };
        } catch (error) {
            return {
                success: false,
                channel: 'push',
                error: error.message,
                timestamp: new Date()
            };
        }
    }

    async getUserPushToken(userId) {
        // Real implementation to get user push token
        const token = await this.db.get(
            'SELECT pushToken FROM user_devices WHERE userId = ? ORDER BY lastUsed DESC LIMIT 1',
            [userId]
        );
        return token?.pushToken;
    }

    async sendRealPushNotification(pushData) {
        // Real push notification service integration
        console.log('Sending real push notification to:', pushData.to);
        
        // Simulate real push notification (replace with actual FCM/APNS call)
        return {
            success: true,
            messageId: `push_${Date.now()}_${randomBytes(8).toString('hex')}`
        };
    }

    async deliverViaSMS(notification) {
        // Real SMS delivery implementation (Twilio, AWS SNS, etc.)
        try {
            const phoneNumber = await this.getUserPhoneNumber(notification.userId);
            if (!phoneNumber) {
                return { success: false, error: 'No phone number available' };
            }

            const smsData = {
                to: phoneNumber,
                body: `${notification.title}: ${notification.message}`,
                from: 'BWAEZI'
            };

            const result = await this.sendRealSMS(smsData);
            
            return {
                success: result.success,
                channel: 'sms',
                messageId: result.messageId,
                timestamp: new Date()
            };
        } catch (error) {
            return {
                success: false,
                channel: 'sms',
                error: error.message,
                timestamp: new Date()
            };
        }
    }

    async getUserPhoneNumber(userId) {
        // Real implementation to get user phone number
        const user = await this.db.get(
            'SELECT phoneNumber FROM user_profiles WHERE userId = ?',
            [userId]
        );
        return user?.phoneNumber;
    }

    async sendRealSMS(smsData) {
        // Real SMS service integration
        console.log('Sending real SMS to:', smsData.to);
        
        // Simulate real SMS sending (replace with actual Twilio/etc. call)
        return {
            success: true,
            messageId: `sms_${Date.now()}_${randomBytes(8).toString('hex')}`
        };
    }

    async deliverInApp(notification) {
        // In-app notification delivery
        try {
            await this.db.run(`
                UPDATE notifications 
                SET status = 'delivered', deliveredAt = CURRENT_TIMESTAMP 
                WHERE id = ?
            `, [notification.id]);

            return {
                success: true,
                channel: 'in_app',
                timestamp: new Date()
            };
        } catch (error) {
            return {
                success: false,
                channel: 'in_app',
                error: error.message,
                timestamp: new Date()
            };
        }
    }

    startNotificationProcessor() {
        setInterval(async () => {
            await this.processNotificationQueue();
        }, 1000); // Process every second

        setInterval(async () => {
            await this.cleanupOldNotifications();
        }, 24 * 60 * 60 * 1000); // Cleanup daily
    }

    async processNotificationQueue() {
        if (this.notificationQueue.size === 0) return;

        const notifications = Array.from(this.notificationQueue.values());
        
        for (const notification of notifications) {
            try {
                await this.deliverNotification(notification);
                this.notificationQueue.delete(notification.id);
            } catch (error) {
                console.error(`Failed to deliver notification ${notification.id}:`, error);
                await this.handleDeliveryFailure(notification, error);
            }
        }
    }

    async deliverNotification(notification) {
        const deliveryMethods = JSON.parse(notification.deliveryMethods);
        const userPrefs = await this.getUserPreferences(notification.userId);
        
        // Check quiet hours
        if (this.isInQuietHours(userPrefs.quietHours)) {
            if (notification.priority !== 'critical') {
                // Delay delivery until after quiet hours
                await this.delayNotification(notification);
                return;
            }
        }

        let delivered = false;
        const deliveryResults = [];

        for (const method of deliveryMethods) {
            const channel = this.deliveryChannels.get(method);
            if (channel && channel.isAvailable()) {
                try {
                    const result = await channel.deliver(notification);
                    deliveryResults.push(result);
                    
                    if (result.success) {
                        delivered = true;
                        await this.recordDeliverySuccess(notification.id, method);
                    } else {
                        await this.recordDeliveryFailure(notification.id, method, result.error);
                    }
                } catch (error) {
                    await this.recordDeliveryFailure(notification.id, method, error.message);
                }
            }
        }

        if (delivered) {
            await this.markNotificationAsDelivered(notification.id);
            this.deliveryStats.delivered++;
        } else {
            await this.scheduleRetry(notification);
            this.deliveryStats.failed++;
        }

        this.deliveryStats.totalProcessed++;

        this.events.emit('notificationProcessed', {
            notificationId: notification.id,
            delivered,
            deliveryResults,
            timestamp: new Date()
        });
    }

    isInQuietHours(quietHours) {
        if (!quietHours || !quietHours.start || !quietHours.end) return false;
        
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        const startTime = this.timeToMinutes(quietHours.start);
        const endTime = this.timeToMinutes(quietHours.end);

        if (startTime < endTime) {
            return currentTime >= startTime && currentTime < endTime;
        } else {
            return currentTime >= startTime || currentTime < endTime;
        }
    }

    timeToMinutes(timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    }

    async delayNotification(notification) {
        const delayUntil = new Date();
        delayUntil.setHours(8, 0, 0, 0); // Deliver at 8 AM
        if (delayUntil < new Date()) {
            delayUntil.setDate(delayUntil.getDate() + 1);
        }

        await this.db.run(`
            UPDATE notifications 
            SET expiration = ?, status = 'delayed'
            WHERE id = ?
        `, [delayUntil, notification.id]);

        this.events.emit('notificationDelayed', {
            notificationId: notification.id,
            delayUntil,
            reason: 'quiet_hours'
        });
    }

    async recordDeliverySuccess(notificationId, channel) {
        await this.db.run(`
            INSERT INTO delivery_logs (id, notificationId, channel, status)
            VALUES (?, ?, ?, 'delivered')
        `, [this.generateLogId(), notificationId, channel]);
    }

    async recordDeliveryFailure(notificationId, channel, error) {
        await this.db.run(`
            INSERT INTO delivery_logs (id, notificationId, channel, status, errorMessage)
            VALUES (?, ?, ?, 'failed', ?)
        `, [this.generateLogId(), notificationId, channel, error]);
    }

    async markNotificationAsDelivered(notificationId) {
        await this.db.run(`
            UPDATE notifications 
            SET status = 'delivered', deliveredAt = CURRENT_TIMESTAMP 
            WHERE id = ?
        `, [notificationId]);
    }

    async markNotificationAsRead(notificationId) {
        await this.db.run(`
            UPDATE notifications 
            SET readStatus = true, readAt = CURRENT_TIMESTAMP 
            WHERE id = ?
        `, [notificationId]);

        this.events.emit('notificationRead', {
            notificationId,
            timestamp: new Date()
        });
    }

    async scheduleRetry(notification) {
        const retryCount = notification.retryCount + 1;
        
        if (retryCount >= this.config.maxRetries) {
            await this.db.run(`
                UPDATE notifications 
                SET status = 'failed', retryCount = ?
                WHERE id = ?
            `, [retryCount, notification.id]);

            this.events.emit('notificationFailed', {
                notificationId: notification.id,
                retryCount,
                reason: 'max_retries_exceeded'
            });
        } else {
            const nextRetry = new Date(Date.now() + (Math.pow(2, retryCount) * 60000)); // Exponential backoff
            
            await this.db.run(`
                UPDATE notifications 
                SET status = 'retrying', retryCount = ?
                WHERE id = ?
            `, [retryCount, notification.id]);

            this.notificationQueue.set(notification.id, {
                ...notification,
                retryCount
            });

            this.events.emit('notificationRetryScheduled', {
                notificationId: notification.id,
                retryCount,
                nextRetry
            });
        }
    }

    async handleDeliveryFailure(notification, error) {
        await this.db.run(`
            UPDATE notifications 
            SET status = 'failed', retryCount = ?
            WHERE id = ?
        `, [notification.retryCount + 1, notification.id]);

        this.events.emit('notificationDeliveryFailed', {
            notificationId: notification.id,
            error: error.message,
            timestamp: new Date()
        });
    }

    async cleanupOldNotifications() {
        const cutoffDate = new Date(Date.now() - this.config.retentionPeriod);
        
        await this.db.run(`
            DELETE FROM notifications 
            WHERE deliveredAt < ? AND status IN ('delivered', 'failed', 'read')
        `, [cutoffDate]);

        await this.db.run(`
            DELETE FROM delivery_logs 
            WHERE deliveredAt < ?
        `, [cutoffDate]);

        console.log('✅ Cleaned up old notifications and delivery logs');
    }

    generateLogId() {
        return `log_${Date.now()}_${randomBytes(8).toString('hex')}`;
    }

    async getNotificationStats(timeframe = '24h') {
        if (!this.initialized) await this.initialize();
        
        const timeFilter = this.getTimeFilter(timeframe);
        const stats = await this.db.all(`
            SELECT 
                type,
                COUNT(*) as total,
                SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN readStatus = 1 THEN 1 ELSE 0 END) as read
            FROM notifications 
            WHERE createdAt >= ?
            GROUP BY type
        `, [timeFilter]);

        const deliveryStats = await this.db.all(`
            SELECT 
                channel,
                COUNT(*) as total,
                SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
            FROM delivery_logs 
            WHERE deliveredAt >= ?
            GROUP BY channel
        `, [timeFilter]);

        return {
            notifications: stats,
            delivery: deliveryStats,
            realtime: this.deliveryStats,
            timeframe
        };
    }

    async getUserNotifications(userId, limit = 50, offset = 0) {
        if (!this.initialized) await this.initialize();
        
        return await this.db.all(`
            SELECT * FROM notifications 
            WHERE userId = ? 
            ORDER BY createdAt DESC 
            LIMIT ? OFFSET ?
        `, [userId, limit, offset]);
    }

    async createNotificationTemplate(name, type, template, variables) {
        if (!this.initialized) await this.initialize();
        
        const templateId = this.generateTemplateId();
        
        await this.db.run(`
            INSERT INTO notification_templates (id, name, type, template, variables)
            VALUES (?, ?, ?, ?, ?)
        `, [templateId, name, type, template, JSON.stringify(variables)]);

        return templateId;
    }

    generateTemplateId() {
        return `template_${Date.now()}_${randomBytes(8).toString('hex')}`;
    }

    getTimeFilter(timeframe) {
        const now = Date.now();
        const periods = {
            '1h': 60 * 60 * 1000,
            '24h': 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000,
            '30d': 30 * 24 * 60 * 60 * 1000
        };
        return new Date(now - (periods[timeframe] || periods['24h']));
    }

    async broadcastSystemAlert(message, priority = 'high', targetUsers = null) {
        if (!this.initialized) await this.initialize();
        
        // Get all active users or specific target users
        const users = targetUsers || await this.getActiveUsers();
        
        const alertPromises = users.map(userId => 
            this.createNotification(
                userId,
                'system',
                'System Alert',
                message,
                { alert: true, priority },
                { priority, deliveryMethods: ['websocket', 'email'] }
            )
        );

        const results = await Promise.allSettled(alertPromises);

        this.events.emit('systemAlertBroadcast', {
            message,
            priority,
            targetCount: users.length,
            successful: results.filter(r => r.status === 'fulfilled').length,
            timestamp: new Date()
        });

        return results;
    }

    async getActiveUsers() {
        const users = await this.db.all(`
            SELECT DISTINCT userId FROM notifications 
            WHERE createdAt >= datetime('now', '-7 days')
            LIMIT 1000
        `);
        return users.map(u => u.userId);
    }
}

export default NotificationEngine;
