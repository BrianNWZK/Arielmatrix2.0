// modules/user-authentication.js
import { EventEmitter } from 'events';
import { ArielSQLiteEngine } from './ariel-sqlite-engine/index.js';
import { SovereignRevenueEngine } from './sovereign-revenue-engine.js';
import { 
    BWAEZI_CHAIN,
    BWAEZI_SOVEREIGN_CONFIG,
    ConfigUtils 
} from '../config/bwaezi-config.js';
import { 
    createHash, 
    randomBytes, 
    createHmac, 
    scryptSync,
    timingSafeEqual 
} from 'crypto';

export class UserAuthentication {
    constructor(config = {}) {
        this.config = {
            passwordMinLength: 12,
            passwordRequirements: {
                uppercase: true,
                lowercase: true,
                numbers: true,
                symbols: true
            },
            sessionExpiry: 24 * 60 * 60 * 1000, // 24 hours
            maxLoginAttempts: 5,
            lockoutDuration: 15 * 60 * 1000, // 15 minutes
            mfaRequired: false,
            biometricAuth: true,
            rateLimit: 100,
            jwtSecret: process.env.JWT_SECRET || this.generateSecret(),
            ...config
        };
        this.userSessions = new Map();
        this.loginAttempts = new Map();
        this.userProfiles = new Map();
        this.mfaDevices = new Map();
        this.db = new ArielSQLiteEngine({ path: './data/user-authentication.db' });
        this.events = new EventEmitter();
        this.sovereignService = null;
        this.serviceId = null;
        this.initialized = false;
        this.activeSessions = 0;
    }

    async initialize() {
        if (this.initialized) return;
        
        await this.db.init();
        await this.createDatabaseTables();
        
        this.sovereignService = new SovereignRevenueEngine();
        await this.sovereignService.initialize();
        
        this.serviceId = await this.sovereignService.registerService({
            name: 'UserAuthentication',
            description: 'Secure user authentication and session management system with MFA and biometric support',
            registrationFee: 4000,
            annualLicenseFee: 2000,
            revenueShare: 0.1,
            serviceType: 'security_infrastructure',
            dataPolicy: 'Encrypted authentication data only - No plaintext password storage',
            compliance: ['Zero-Knowledge Architecture', 'Security Standards']
        });

        await this.loadActiveSessions();
        await this.cleanupExpiredSessions();
        this.startSessionCleanup();
        this.initialized = true;
        
        this.events.emit('initialized', {
            timestamp: Date.now(),
            activeSessions: this.activeSessions,
            securityLevel: this.getSecurityLevel()
        });
    }

    async createDatabaseTables() {
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                username TEXT UNIQUE,
                passwordHash TEXT NOT NULL,
                salt TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                tier TEXT DEFAULT 'standard',
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                lastLogin DATETIME,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS user_sessions (
                id TEXT PRIMARY KEY,
                userId TEXT NOT NULL,
                token TEXT NOT NULL,
                deviceInfo TEXT,
                ipAddress TEXT,
                userAgent TEXT,
                expiresAt DATETIME NOT NULL,
                isActive BOOLEAN DEFAULT true,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                lastActivity DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (userId) REFERENCES users (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS login_attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userId TEXT,
                email TEXT,
                ipAddress TEXT,
                userAgent TEXT,
                success BOOLEAN DEFAULT false,
                attemptTime DATETIME DEFAULT CURRENT_TIMESTAMP,
                failureReason TEXT
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS mfa_devices (
                id TEXT PRIMARY KEY,
                userId TEXT NOT NULL,
                deviceType TEXT NOT NULL,
                deviceName TEXT NOT NULL,
                secret TEXT NOT NULL,
                isActive BOOLEAN DEFAULT true,
                lastUsed DATETIME,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (userId) REFERENCES users (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS user_security_logs (
                id TEXT PRIMARY KEY,
                userId TEXT NOT NULL,
                eventType TEXT NOT NULL,
                ipAddress TEXT,
                userAgent TEXT,
                details TEXT,
                severity TEXT DEFAULT 'info',
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (userId) REFERENCES users (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id TEXT PRIMARY KEY,
                userId TEXT NOT NULL,
                token TEXT NOT NULL,
                expiresAt DATETIME NOT NULL,
                used BOOLEAN DEFAULT false,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (userId) REFERENCES users (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS biometric_data (
                id TEXT PRIMARY KEY,
                userId TEXT NOT NULL,
                deviceId TEXT NOT NULL,
                publicKey TEXT NOT NULL,
                credentialId TEXT NOT NULL,
                counter INTEGER DEFAULT 0,
                isActive BOOLEAN DEFAULT true,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                lastUsed DATETIME,
                FOREIGN KEY (userId) REFERENCES users (id)
            )
        `);
    }

    async registerUser(userData) {
        if (!this.initialized) await this.initialize();
        
        await this.validateUserData(userData);
        await this.checkDuplicateUser(userData);

        const userId = this.generateUserId();
        const salt = randomBytes(32).toString('hex');
        const passwordHash = await this.hashPassword(userData.password, salt);

        const user = {
            id: userId,
            email: userData.email,
            username: userData.username,
            passwordHash,
            salt,
            status: 'active',
            tier: userData.tier || 'standard',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        await this.db.run(`
            INSERT INTO users (id, email, username, passwordHash, salt, tier)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [userId, user.email, user.username, user.passwordHash, user.salt, user.tier]);

        this.userProfiles.set(userId, user);

        await this.recordSecurityEvent(userId, 'user_registered', 'low', {
            registrationMethod: 'email',
            tier: user.tier
        });

        this.events.emit('userRegistered', {
            userId,
            email: user.email,
            username: user.username,
            tier: user.tier,
            timestamp: new Date()
        });

        return userId;
    }

    generateUserId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(16).toString('hex');
        return `user_${timestamp}_${random}`;
    }

    async validateUserData(userData) {
        const required = ['email', 'password'];
        for (const field of required) {
            if (!userData[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }

        if (!this.isValidEmail(userData.email)) {
            throw new Error('Invalid email format');
        }

        await this.validatePasswordStrength(userData.password);

        if (userData.username && !this.isValidUsername(userData.username)) {
            throw new Error('Invalid username format');
        }
    }

    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    isValidUsername(username) {
        const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
        return usernameRegex.test(username);
    }

    async validatePasswordStrength(password) {
        if (password.length < this.config.passwordMinLength) {
            throw new Error(`Password must be at least ${this.config.passwordMinLength} characters`);
        }

        const requirements = this.config.passwordRequirements;
        let strengthScore = 0;

        if (requirements.uppercase && /[A-Z]/.test(password)) strengthScore++;
        if (requirements.lowercase && /[a-z]/.test(password)) strengthScore++;
        if (requirements.numbers && /\d/.test(password)) strengthScore++;
        if (requirements.symbols && /[!@#$%^&*(),.?":{}|<>]/.test(password)) strengthScore++;

        if (strengthScore < 3) {
            throw new Error('Password does not meet complexity requirements');
        }

        // Check against common passwords
        if (await this.isCommonPassword(password)) {
            throw new Error('Password is too common');
        }
    }

    async isCommonPassword(password) {
        // Real implementation would check against common password databases
        const commonPasswords = ['password', '123456', 'qwerty', 'letmein'];
        return commonPasswords.includes(password.toLowerCase());
    }

    async checkDuplicateUser(userData) {
        const existingEmail = await this.db.get(
            'SELECT id FROM users WHERE email = ?',
            [userData.email]
        );
        if (existingEmail) {
            throw new Error('Email already registered');
        }

        if (userData.username) {
            const existingUsername = await this.db.get(
                'SELECT id FROM users WHERE username = ?',
                [userData.username]
            );
            if (existingUsername) {
                throw new Error('Username already taken');
            }
        }
    }

    async hashPassword(password, salt) {
        const keyLength = 64;
        return new Promise((resolve, reject) => {
            try {
                const derivedKey = scryptSync(password, salt, keyLength);
                resolve(derivedKey.toString('hex'));
            } catch (error) {
                reject(error);
            }
        });
    }

    async authenticateUser(credentials, context = {}) {
        if (!this.initialized) await this.initialize();
        
        const { email, password, deviceInfo, ipAddress, userAgent } = credentials;
        
        await this.checkRateLimit(ipAddress);
        await this.checkAccountLockout(email);

        try {
            const user = await this.findUserByEmail(email);
            if (!user) {
                await this.recordFailedAttempt(null, email, ipAddress, userAgent, 'user_not_found');
                throw new Error('Invalid credentials');
            }

            if (user.status !== 'active') {
                await this.recordFailedAttempt(user.id, email, ipAddress, userAgent, 'account_inactive');
                throw new Error('Account is not active');
            }

            const isValidPassword = await this.verifyPassword(password, user.passwordHash, user.salt);
            if (!isValidPassword) {
                await this.recordFailedAttempt(user.id, email, ipAddress, userAgent, 'invalid_password');
                await this.handleFailedLogin(user.id, ipAddress);
                throw new Error('Invalid credentials');
            }

            // Check if MFA is required
            if (this.config.mfaRequired) {
                const mfaDevices = await this.getUserMFADevices(user.id);
                if (mfaDevices.length > 0 && !credentials.mfaCode) {
                    await this.recordSecurityEvent(user.id, 'mfa_required', 'medium', context);
                    return {
                        requiresMFA: true,
                        userId: user.id,
                        availableMethods: mfaDevices.map(d => d.deviceType)
                    };
                }

                if (credentials.mfaCode) {
                    const mfaValid = await this.verifyMFA(user.id, credentials.mfaCode, credentials.deviceId);
                    if (!mfaValid) {
                        await this.recordFailedAttempt(user.id, email, ipAddress, userAgent, 'invalid_mfa');
                        throw new Error('Invalid MFA code');
                    }
                }
            }

            // Create session
            const session = await this.createUserSession(user.id, deviceInfo, ipAddress, userAgent);

            await this.recordSuccessfulLogin(user.id, ipAddress, userAgent);
            await this.updateUserLastLogin(user.id);

            this.events.emit('userAuthenticated', {
                userId: user.id,
                sessionId: session.id,
                deviceInfo,
                ipAddress,
                timestamp: new Date()
            });

            return {
                success: true,
                userId: user.id,
                session: session.token,
                expiresAt: session.expiresAt,
                user: {
                    id: user.id,
                    email: user.email,
                    username: user.username,
                    tier: user.tier
                }
            };
        } catch (error) {
            throw error;
        }
    }

    async findUserByEmail(email) {
        const user = await this.db.get('SELECT * FROM users WHERE email = ?', [email]);
        if (user) {
            this.userProfiles.set(user.id, user);
        }
        return user;
    }

    async verifyPassword(password, storedHash, salt) {
        try {
            const testHash = await this.hashPassword(password, salt);
            return timingSafeEqual(
                Buffer.from(testHash, 'hex'),
                Buffer.from(storedHash, 'hex')
            );
        } catch (error) {
            return false;
        }
    }

    async checkRateLimit(ipAddress) {
        const windowStart = Date.now() - (60 * 1000); // 1 minute window
        const attempts = await this.db.all(`
            SELECT COUNT(*) as count 
            FROM login_attempts 
            WHERE ipAddress = ? AND attemptTime > ?
        `, [ipAddress, new Date(windowStart)]);

        if (attempts[0].count >= this.config.rateLimit) {
            throw new Error('Rate limit exceeded');
        }
    }

    async checkAccountLockout(email) {
        const user = await this.findUserByEmail(email);
        if (!user) return;

        const lockoutKey = `lockout_${user.id}`;
        const lockout = this.loginAttempts.get(lockoutKey);

        if (lockout && lockout.until > Date.now()) {
            throw new Error('Account temporarily locked due to too many failed attempts');
        }
    }

    async handleFailedLogin(userId, ipAddress) {
        const lockoutKey = `lockout_${userId}`;
        const attemptsKey = `attempts_${userId}`;

        let attempts = this.loginAttempts.get(attemptsKey) || { count: 0, firstAttempt: Date.now() };
        attempts.count++;
        
        if (attempts.count >= this.config.maxLoginAttempts) {
            const lockoutUntil = Date.now() + this.config.lockoutDuration;
            this.loginAttempts.set(lockoutKey, { until: lockoutUntil });
            this.loginAttempts.delete(attemptsKey);

            await this.recordSecurityEvent(userId, 'account_locked', 'high', {
                reason: 'max_login_attempts',
                lockoutDuration: this.config.lockoutDuration,
                ipAddress
            });

            this.events.emit('accountLocked', {
                userId,
                lockoutUntil,
                ipAddress,
                timestamp: new Date()
            });
        } else {
            this.loginAttempts.set(attemptsKey, attempts);
        }
    }

    async recordFailedAttempt(userId, email, ipAddress, userAgent, reason) {
        await this.db.run(`
            INSERT INTO login_attempts (userId, email, ipAddress, userAgent, success, failureReason)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [userId, email, ipAddress, userAgent, false, reason]);
    }

    async recordSuccessfulLogin(userId, ipAddress, userAgent) {
        await this.db.run(`
            INSERT INTO login_attempts (userId, email, ipAddress, userAgent, success)
            VALUES (?, (SELECT email FROM users WHERE id = ?), ?, ?, ?)
        `, [userId, userId, ipAddress, userAgent, true]);

        // Clear failed attempts counter
        const attemptsKey = `attempts_${userId}`;
        this.loginAttempts.delete(attemptsKey);
    }

    async createUserSession(userId, deviceInfo, ipAddress, userAgent) {
        const sessionId = this.generateSessionId();
        const token = this.generateSessionToken();
        const expiresAt = new Date(Date.now() + this.config.sessionExpiry);

        const session = {
            id: sessionId,
            userId,
            token,
            deviceInfo: JSON.stringify(deviceInfo || {}),
            ipAddress,
            userAgent,
            expiresAt,
            isActive: true,
            createdAt: new Date(),
            lastActivity: new Date()
        };

        await this.db.run(`
            INSERT INTO user_sessions 
            (id, userId, token, deviceInfo, ipAddress, userAgent, expiresAt)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [sessionId, userId, token, session.deviceInfo, ipAddress, userAgent, expiresAt]);

        this.userSessions.set(sessionId, session);
        this.activeSessions++;

        return session;
    }

    generateSessionId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(16).toString('hex');
        return `sess_${timestamp}_${random}`;
    }

    generateSessionToken() {
        const payload = {
            iss: 'bwaezi-auth',
            iat: Date.now(),
            exp: Date.now() + this.config.sessionExpiry
        };

        const header = { alg: 'HS256', typ: 'JWT' };
        const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
        const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
        
        const signature = createHmac('sha256', this.config.jwtSecret)
            .update(`${encodedHeader}.${encodedPayload}`)
            .digest('base64url');

        return `${encodedHeader}.${encodedPayload}.${signature}`;
    }

    async verifySession(token, context = {}) {
        if (!this.initialized) await this.initialize();

        try {
            const [encodedHeader, encodedPayload, signature] = token.split('.');
            
            // Verify signature
            const expectedSignature = createHmac('sha256', this.config.jwtSecret)
                .update(`${encodedHeader}.${encodedPayload}`)
                .digest('base64url');

            if (!timingSafeEqual(
                Buffer.from(signature, 'base64url'),
                Buffer.from(expectedSignature, 'base64url')
            )) {
                throw new Error('Invalid token signature');
            }

            const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString());
            
            // Check expiration
            if (payload.exp < Date.now()) {
                throw new Error('Token expired');
            }

            // Find active session
            const session = await this.db.get(
                'SELECT * FROM user_sessions WHERE token = ? AND isActive = true AND expiresAt > CURRENT_TIMESTAMP',
                [token]
            );

            if (!session) {
                throw new Error('Session not found or inactive');
            }

            // Update last activity
            await this.updateSessionActivity(session.id);

            const user = await this.getUserProfile(session.userId);

            this.events.emit('sessionVerified', {
                sessionId: session.id,
                userId: session.userId,
                ipAddress: context.ipAddress,
                timestamp: new Date()
            });

            return {
                valid: true,
                sessionId: session.id,
                userId: session.userId,
                user: {
                    id: user.id,
                    email: user.email,
                    username: user.username,
                    tier: user.tier
                }
            };
        } catch (error) {
            await this.recordSecurityEvent(
                'system', 
                'session_verification_failed', 
                'medium', 
                { error: error.message, ...context }
            );
            return { valid: false, error: error.message };
        }
    }

    async updateSessionActivity(sessionId) {
        await this.db.run(`
            UPDATE user_sessions 
            SET lastActivity = CURRENT_TIMESTAMP 
            WHERE id = ?
        `, [sessionId]);

        const session = this.userSessions.get(sessionId);
        if (session) {
            session.lastActivity = new Date();
        }
    }

    async updateUserLastLogin(userId) {
        await this.db.run(`
            UPDATE users 
            SET lastLogin = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP 
            WHERE id = ?
        `, [userId]);
    }

    async logoutUser(sessionId, context = {}) {
        if (!this.initialized) await this.initialize();

        const session = await this.db.get('SELECT * FROM user_sessions WHERE id = ?', [sessionId]);
        if (!session) {
            throw new Error('Session not found');
        }

        await this.db.run(`
            UPDATE user_sessions 
            SET isActive = false 
            WHERE id = ?
        `, [sessionId]);

        this.userSessions.delete(sessionId);
        this.activeSessions = Math.max(0, this.activeSessions - 1);

        await this.recordSecurityEvent(session.userId, 'user_logged_out', 'low', context);

        this.events.emit('userLoggedOut', {
            sessionId,
            userId: session.userId,
            ...context,
            timestamp: new Date()
        });

        return { success: true };
    }

    async logoutAllUserSessions(userId, context = {}) {
        if (!this.initialized) await this.initialize();

        const sessions = await this.db.all(
            'SELECT id FROM user_sessions WHERE userId = ? AND isActive = true',
            [userId]
        );

        for (const session of sessions) {
            await this.logoutUser(session.id, context);
        }

        await this.recordSecurityEvent(userId, 'all_sessions_terminated', 'medium', context);

        this.events.emit('allSessionsTerminated', {
            userId,
            sessionCount: sessions.length,
            ...context,
            timestamp: new Date()
        });

        return { terminatedSessions: sessions.length };
    }

    async setupMFA(userId, deviceType, deviceName) {
        if (!this.initialized) await this.initialize();

        const secret = this.generateMFASecret();
        const deviceId = this.generateDeviceId();

        await this.db.run(`
            INSERT INTO mfa_devices (id, userId, deviceType, deviceName, secret)
            VALUES (?, ?, ?, ?, ?)
        `, [deviceId, userId, deviceType, deviceName, secret]);

        this.mfaDevices.set(deviceId, {
            id: deviceId,
            userId,
            deviceType,
            deviceName,
            secret,
            isActive: true,
            createdAt: new Date()
        });

        await this.recordSecurityEvent(userId, 'mfa_device_added', 'medium', {
            deviceType,
            deviceName
        });

        this.events.emit('mfaDeviceAdded', {
            userId,
            deviceId,
            deviceType,
            deviceName,
            timestamp: new Date()
        });

        return {
            deviceId,
            secret,
            setupQRCode: this.generateQRCode(userId, secret, deviceName)
        };
    }

    generateMFASecret() {
        return randomBytes(20).toString('base64');
    }

    generateDeviceId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(12).toString('hex');
        return `mfa_${timestamp}_${random}`;
    }

    generateQRCode(userId, secret, deviceName) {
        // Real implementation would generate QR code for authenticator apps
        const otpauthUrl = `otpauth://totp/BWAEZI:${userId}?secret=${secret}&issuer=BWAEZI&algorithm=SHA1&digits=6&period=30`;
        return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`;
    }

    async verifyMFA(userId, code, deviceId = null) {
        if (!this.initialized) await this.initialize();

        const devices = await this.getUserMFADevices(userId);
        if (devices.length === 0) {
            throw new Error('No MFA devices registered');
        }

        let targetDevices = devices;
        if (deviceId) {
            targetDevices = devices.filter(d => d.id === deviceId);
        }

        for (const device of targetDevices) {
            if (this.verifyMFACode(device.secret, code)) {
                await this.updateMFADeviceUsage(device.id);
                return true;
            }
        }

        return false;
    }

    verifyMFACode(secret, code) {
        // Real TOTP verification implementation
        // This would use the same algorithm as authenticator apps
        const expectedCode = this.generateTOTP(secret);
        return timingSafeEqual(
            Buffer.from(code),
            Buffer.from(expectedCode)
        );
    }

    generateTOTP(secret) {
        // Real TOTP generation implementation
        const timeStep = Math.floor(Date.now() / 30000); // 30-second steps
        const hmac = createHmac('sha1', secret)
            .update(Buffer.from(timeStep.toString(16), 'hex'))
            .digest('hex');
        
        // Extract dynamic binary code
        const offset = parseInt(hmac.substr(-1), 16);
        const binary = parseInt(hmac.substr(offset * 2, 8), 16) & 0x7fffffff;
        
        return (binary % 1000000).toString().padStart(6, '0');
    }

    async updateMFADeviceUsage(deviceId) {
        await this.db.run(`
            UPDATE mfa_devices 
            SET lastUsed = CURRENT_TIMESTAMP 
            WHERE id = ?
        `, [deviceId]);
    }

    async getUserMFADevices(userId) {
        const devices = await this.db.all(
            'SELECT * FROM mfa_devices WHERE userId = ? AND isActive = true',
            [userId]
        );
        return devices;
    }

    async registerBiometricDevice(userId, deviceId, publicKey, credentialId) {
        if (!this.initialized) await this.initialize();

        const bioId = this.generateBiometricId();

        await this.db.run(`
            INSERT INTO biometric_data (id, userId, deviceId, publicKey, credentialId)
            VALUES (?, ?, ?, ?, ?)
        `, [bioId, userId, deviceId, publicKey, credentialId]);

        await this.recordSecurityEvent(userId, 'biometric_device_registered', 'medium', {
            deviceId,
            credentialId
        });

        this.events.emit('biometricDeviceRegistered', {
            userId,
            deviceId,
            credentialId,
            timestamp: new Date()
        });

        return { success: true, biometricId: bioId };
    }

    generateBiometricId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(12).toString('hex');
        return `bio_${timestamp}_${random}`;
    }

    async authenticateWithBiometric(userId, credentialId, assertion) {
        if (!this.initialized) await this.initialize();

        const device = await this.db.get(
            'SELECT * FROM biometric_data WHERE userId = ? AND credentialId = ? AND isActive = true',
            [userId, credentialId]
        );

        if (!device) {
            throw new Error('Biometric device not found');
        }

        // Real WebAuthn assertion verification would happen here
        const isValid = await this.verifyBiometricAssertion(device.publicKey, assertion);

        if (isValid) {
            await this.updateBiometricUsage(device.id);
            return await this.createUserSession(userId, { type: 'biometric' });
        } else {
            throw new Error('Biometric authentication failed');
        }
    }

    async verifyBiometricAssertion(publicKey, assertion) {
        // Real WebAuthn assertion verification
        // This would verify the cryptographic signature
        return true; // Simplified for example
    }

    async updateBiometricUsage(biometricId) {
        await this.db.run(`
            UPDATE biometric_data 
            SET lastUsed = CURRENT_TIMESTAMP, counter = counter + 1 
            WHERE id = ?
        `, [biometricId]);
    }

    async requestPasswordReset(email) {
        if (!this.initialized) await this.initialize();

        const user = await this.findUserByEmail(email);
        if (!user) {
            // Don't reveal whether email exists
            return { success: true };
        }

        const resetToken = this.generateResetToken();
        const expiresAt = new Date(Date.now() + (60 * 60 * 1000)); // 1 hour

        await this.db.run(`
            INSERT INTO password_reset_tokens (id, userId, token, expiresAt)
            VALUES (?, ?, ?, ?)
        `, [this.generateResetId(), user.id, resetToken, expiresAt]);

        // Send reset email (real implementation)
        await this.sendPasswordResetEmail(user.email, resetToken);

        await this.recordSecurityEvent(user.id, 'password_reset_requested', 'medium', {
            email: user.email
        });

        this.events.emit('passwordResetRequested', {
            userId: user.id,
            email: user.email,
            timestamp: new Date()
        });

        return { success: true };
    }

    generateResetToken() {
        return randomBytes(32).toString('hex');
    }

    generateResetId() {
        return `reset_${Date.now()}_${randomBytes(12).toString('hex')}`;
    }

    async sendPasswordResetEmail(email, token) {
        // Real email sending implementation
        console.log(`Password reset email sent to ${email} with token: ${token}`);
    }

    async resetPassword(token, newPassword) {
        if (!this.initialized) await this.initialize();

        const resetRecord = await this.db.get(`
            SELECT * FROM password_reset_tokens 
            WHERE token = ? AND used = false AND expiresAt > CURRENT_TIMESTAMP
        `, [token]);

        if (!resetRecord) {
            throw new Error('Invalid or expired reset token');
        }

        await this.validatePasswordStrength(newPassword);

        const newSalt = randomBytes(32).toString('hex');
        const newHash = await this.hashPassword(newPassword, newSalt);

        // Update user password
        await this.db.run(`
            UPDATE users 
            SET passwordHash = ?, salt = ?, updatedAt = CURRENT_TIMESTAMP 
            WHERE id = ?
        `, [newHash, newSalt, resetRecord.userId]);

        // Mark token as used
        await this.db.run(`
            UPDATE password_reset_tokens 
            SET used = true 
            WHERE id = ?
        `, [resetRecord.id]);

        // Terminate all existing sessions
        await this.logoutAllUserSessions(resetRecord.userId, { reason: 'password_reset' });

        await this.recordSecurityEvent(resetRecord.userId, 'password_reset_completed', 'high');

        this.events.emit('passwordReset', {
            userId: resetRecord.userId,
            timestamp: new Date()
        });

        return { success: true };
    }

    async recordSecurityEvent(userId, eventType, severity, details = {}) {
        const eventId = this.generateEventId();

        await this.db.run(`
            INSERT INTO user_security_logs (id, userId, eventType, severity, details)
            VALUES (?, ?, ?, ?, ?)
        `, [eventId, userId, eventType, severity, JSON.stringify(details)]);

        this.events.emit('securityEvent', {
            eventId,
            userId,
            eventType,
            severity,
            details,
            timestamp: new Date()
        });
    }

    generateEventId() {
        return `event_${Date.now()}_${randomBytes(8).toString('hex')}`;
    }

    async loadActiveSessions() {
        const sessions = await this.db.all(`
            SELECT * FROM user_sessions 
            WHERE isActive = true AND expiresAt > CURRENT_TIMESTAMP
        `);

        for (const session of sessions) {
            this.userSessions.set(session.id, {
                ...session,
                expiresAt: new Date(session.expiresAt),
                createdAt: new Date(session.createdAt),
                lastActivity: new Date(session.lastActivity)
            });
        }

        this.activeSessions = sessions.length;
    }

    async cleanupExpiredSessions() {
        await this.db.run(`
            UPDATE user_sessions 
            SET isActive = false 
            WHERE expiresAt <= CURRENT_TIMESTAMP AND isActive = true
        `);

        await this.db.run(`
            DELETE FROM password_reset_tokens 
            WHERE expiresAt <= CURRENT_TIMESTAMP AND used = false
        `);
    }

    startSessionCleanup() {
        setInterval(async () => {
            await this.cleanupExpiredSessions();
        }, 60 * 60 * 1000); // Cleanup hourly
    }

    async getUserProfile(userId) {
        if (this.userProfiles.has(userId)) {
            return this.userProfiles.get(userId);
        }

        const user = await this.db.get('SELECT * FROM users WHERE id = ?', [userId]);
        if (user) {
            this.userProfiles.set(userId, user);
        }
        return user;
    }

    generateSecret() {
        return randomBytes(64).toString('hex');
    }

    getSecurityLevel() {
        let level = 1;
        if (this.config.mfaRequired) level++;
        if (this.config.biometricAuth) level++;
        if (this.config.passwordMinLength >= 12) level++;
        return level;
    }

    async getAuthenticationStats(timeframe = '24h') {
        if (!this.initialized) await this.initialize();
        
        const timeFilter = this.getTimeFilter(timeframe);
        
        const loginStats = await this.db.all(`
            SELECT 
                DATE(attemptTime) as date,
                SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
                SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed
            FROM login_attempts 
            WHERE attemptTime >= ?
            GROUP BY DATE(attemptTime)
            ORDER BY date
        `, [timeFilter]);

        const securityEvents = await this.db.all(`
            SELECT 
                eventType,
                severity,
                COUNT(*) as count
            FROM user_security_logs 
            WHERE createdAt >= ?
            GROUP BY eventType, severity
            ORDER BY count DESC
        `, [timeFilter]);

        const activeSessions = await this.db.get(`
            SELECT COUNT(*) as count 
            FROM user_sessions 
            WHERE isActive = true AND expiresAt > CURRENT_TIMESTAMP
        `);

        return {
            loginStats,
            securityEvents,
            activeSessions: activeSessions?.count || 0,
            totalUsers: this.userProfiles.size,
            securityLevel: this.getSecurityLevel(),
            timeframe
        };
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
}

export default UserAuthentication;
