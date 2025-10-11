/**
 * Backend Server Module - Exports RPC and blockchain functionality
 * 🚀 MODULE ONLY: No server startup - exports functions for main.js
 * 🔗 RPC EXPOSURE: Provides Bwaezi chain RPC endpoints using centralized credentials
 * 📊 DATA AGENT: Exports data collection and analytics functions
 */

import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import cors from 'cors';
import express from 'express';
import 'dotenv/config';

// Import blockchain modules
import { createBrianNwaezikeChain, getInitializedChain, isChainInitialized } from './blockchain/BrianNwaezikeChain.js';
import { createDatabase } from './database/BrianNwaezikeDB.js';

// Global instances
let blockchainInstance = null;
let currentCredentials = null;

// 🎯 SET CREDENTIALS FROM MAIN.JS
export function setBackendCredentials(credentials) {
    currentCredentials = credentials;
    console.log('✅ Backend credentials set from main.js');
    if (credentials && credentials.BWAEZI_CHAIN_ID) {
        console.log(`🔗 Chain ID: ${credentials.BWAEZI_CHAIN_ID}`);
        console.log(`📝 Contract: ${credentials.BWAEZI_CONTRACT_ADDRESS}`);
    }
}

// Initialize core systems
export async function initializeBackendSystems() {
    console.log('🚀 Initializing Backend Systems Module...');
    
    try {
        // Initialize blockchain only if not already initialized by main.js
        if (!blockchainInstance) {
            console.log('🔗 Initializing Bwaezi Blockchain in backend module...');
            blockchainInstance = await createBrianNwaezikeChain({
                rpcUrl: 'https://rpc.winr.games',
                network: 'mainnet'
            });
            await blockchainInstance.init();
        }
        
        console.log('✅ Backend systems initialized successfully');
        return true;
    } catch (error) {
        console.error('❌ Backend system initialization failed:', error);
        return false;
    }
}

// 🌐 Public RPC Broadcast Function - Uses centralized credentials
export async function getBwaeziRPCData() {
    try {
        if (!currentCredentials) {
            throw new Error('Credentials not set - call setBackendCredentials() first');
        }

        let status = {};
        if (blockchainInstance) {
            status = await blockchainInstance.getStatus();
        }
        
        return {
            status: 'LIVE',
            rpcUrl: 'https://arielmatrix2-0-t2hc.onrender.com/bwaezi-rpc',
            chainId: currentCredentials.BWAEZI_CHAIN_ID,
            chainName: 'Bwaezi Mainnet',
            blockNumber: status.lastBlockNumber || currentCredentials.blockNumber || 0,
            gasPrice: status.gasPrice || '0',
            health: status.connected ? 'HEALTHY' : 'UNHEALTHY',
            peerCount: status.metrics?.peerCount || 0,
            timestamp: new Date().toISOString(),
            version: 'ArielSQL Ultimate Suite v4.3',
            networkId: 777777,
            nativeCurrency: {
                name: 'Bwaezi',
                symbol: 'BWAEZI',
                decimals: 18
            },
            credentialSource: 'Centralized from main.js'
        };
    } catch (error) {
        throw new Error(`RPC data error: ${error.message}`);
    }
}

// 🔍 Blockchain Status Function
export async function getBlockchainStatus() {
    try {
        if (!blockchainInstance) {
            throw new Error('Blockchain service starting up');
        }

        const status = await blockchainInstance.getStatus();
        return {
            status: 'SUCCESS',
            data: status,
            timestamp: new Date().toISOString(),
            credentialSource: 'Centralized from main.js'
        };
    } catch (error) {
        throw new Error(`Blockchain status error: ${error.message}`);
    }
}

// 📊 Data Agent Status Function
export async function getDataAgentStatus() {
    try {
        // Dynamic import to avoid circular dependencies
        const { getStatus } = await import('./agents/dataAgent.js');
        const status = getStatus();
        
        return {
            status: 'SUCCESS',
            data: status,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        throw new Error(`Data Agent status error: ${error.message}`);
    }
}

// 🎯 Start Data Collection Function
export async function startDataCollection() {
    try {
        // Dynamic import to avoid circular dependencies
        const DataAgent = await import('./agents/dataAgent.js');
        
        const logger = {
            info: (...args) => console.log('📊 [DataAgent]', ...args),
            error: (...args) => console.error('❌ [DataAgent]', ...args),
            success: (...args) => console.log('✅ [DataAgent]', ...args),
            warn: (...args) => console.warn('⚠️ [DataAgent]', ...args)
        };
        
        const dataAgent = new DataAgent.default({
            ANALYTICS_WRITE_KEY: process.env.ANALYTICS_WRITE_KEY,
            COMPANY_WALLET_ADDRESS: process.env.COMPANY_WALLET_ADDRESS,
            COMPANY_WALLET_PRIVATE_KEY: process.env.COMPANY_WALLET_PRIVATE_KEY
        }, logger);
        
        await dataAgent.initialize();
        const result = await dataAgent.run();
        
        return {
            status: 'SUCCESS',
            data: result,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        throw new Error(`Data collection error: ${error.message}`);
    }
}

// 💰 Revenue Analytics Function
export async function getRevenueAnalytics(timeframe = '7 days') {
    try {
        // Dynamic import to avoid circular dependencies
        const DataAgent = await import('./agents/dataAgent.js');
        
        const logger = {
            info: (...args) => console.log('📊 [DataAgent]', ...args),
            error: (...args) => console.error('❌ [DataAgent]', ...args),
            success: (...args) => console.log('✅ [DataAgent]', ...args),
            warn: (...args) => console.warn('⚠️ [DataAgent]', ...args)
        };
        
        const dataAgent = new DataAgent.default({
            ANALYTICS_WRITE_KEY: process.env.ANALYTICS_WRITE_KEY,
            COMPANY_WALLET_ADDRESS: process.env.COMPANY_WALLET_ADDRESS,
            COMPANY_WALLET_PRIVATE_KEY: process.env.COMPANY_WALLET_PRIVATE_KEY
        }, logger);
        
        await dataAgent.initialize();
        
        const stats = await dataAgent.getDataCollectionStats(timeframe);
        const revenue = await dataAgent.getRevenueAnalytics(timeframe);
        
        return {
            status: 'SUCCESS',
            data: {
                timeframe,
                collectionStats: stats,
                revenueAnalytics: revenue,
                timestamp: new Date().toISOString()
            }
        };
    } catch (error) {
        throw new Error(`Revenue analytics error: ${error.message}`);
    }
}

// 🔧 Health Check Function
export async function getBackendHealth() {
    const health = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        version: 'ArielMatrix 2.0',
        services: {
            blockchain: !!blockchainInstance && blockchainInstance.isConnected,
            credentials: !!currentCredentials,
            server: true
        },
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development',
        credentialInfo: currentCredentials ? {
            hasCredentials: true,
            chainId: currentCredentials.BWAEZI_CHAIN_ID,
            source: 'Centralized from main.js'
        } : {
            hasCredentials: false,
            source: 'Not set'
        }
    };

    // Check Data Agent status separately without blocking
    try {
        const { getStatus } = await import('./agents/dataAgent.js');
        const dataAgentStatus = getStatus();
        health.services.dataAgent = dataAgentStatus.lastStatus !== 'error';
    } catch (error) {
        health.services.dataAgent = false;
        health.dataAgentError = error.message;
    }

    return health;
}

// 🏠 Root Endpoint Data Function
export function getRootEndpointData() {
    return {
        message: '🚀 ArielMatrix 2.0 - Global Enterprise Blockchain Gateway',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        endpoints: {
            rpc: '/bwaezi-rpc',
            status: '/blockchain-status',
            data: '/data-agent-status',
            health: '/health',
            revenue: '/revenue-analytics'
        },
        documentation: 'https://github.com/arielmatrix/arielmatrix2.0',
        credentialSource: 'Centralized from main.js'
    };
}

// GraphQL Setup Functions
export function createGraphQLServer() {
    const typeDefs = `#graphql
        type Query {
            health: String
            blockchainStatus: String
            dataAgentStatus: String
        }
        
        type Mutation {
            startDataCollection: String
        }
    `;

    const resolvers = {
        Query: {
            health: () => 'OK',
            blockchainStatus: () => blockchainInstance ? 'CONNECTED' : 'DISCONNECTED',
            dataAgentStatus: async () => {
                try {
                    const { getStatus } = await import('./agents/dataAgent.js');
                    const status = getStatus();
                    return status.lastStatus || 'UNKNOWN';
                } catch (error) {
                    return 'ERROR: ' + error.message;
                }
            }
        },
        Mutation: {
            startDataCollection: async () => {
                try {
                    const DataAgent = await import('./agents/dataAgent.js');
                    const logger = {
                        info: (...args) => console.log('📊 [DataAgent]', ...args),
                        error: (...args) => console.error('❌ [DataAgent]', ...args)
                    };
                    
                    const dataAgent = new DataAgent.default({
                        ANALYTICS_WRITE_KEY: process.env.ANALYTICS_WRITE_KEY,
                        COMPANY_WALLET_ADDRESS: process.env.COMPANY_WALLET_ADDRESS
                    }, logger);
                    
                    await dataAgent.initialize();
                    const result = await dataAgent.run();
                    return `Data collection started: ${JSON.stringify(result)}`;
                } catch (error) {
                    return `Error: ${error.message}`;
                }
            }
        }
    };

    return new ApolloServer({
        typeDefs,
        resolvers,
        introspection: true,
        playground: true
    });
}

// Export route handlers for integration with main.js
export function getBackendRouteHandlers() {
    return {
        // RPC endpoint handler
        '/bwaezi-rpc': {
            method: 'GET',
            handler: async (req, res) => {
                try {
                    const rpcData = await getBwaeziRPCData();
                    res.json(rpcData);
                } catch (error) {
                    res.status(500).json({
                        status: 'ERROR',
                        message: error.message,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        },
        
        // Blockchain status handler
        '/blockchain-status': {
            method: 'GET',
            handler: async (req, res) => {
                try {
                    const status = await getBlockchainStatus();
                    res.json(status);
                } catch (error) {
                    res.status(500).json({
                        status: 'ERROR',
                        message: error.message,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        },
        
        // Data Agent status handler
        '/data-agent-status': {
            method: 'GET',
            handler: async (req, res) => {
                try {
                    const status = await getDataAgentStatus();
                    res.json(status);
                } catch (error) {
                    res.status(503).json({
                        status: 'ERROR',
                        message: error.message,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        },
        
        // Revenue analytics handler
        '/revenue-analytics': {
            method: 'GET',
            handler: async (req, res) => {
                try {
                    const timeframe = req.query.timeframe || '7 days';
                    const analytics = await getRevenueAnalytics(timeframe);
                    res.json(analytics);
                } catch (error) {
                    res.status(500).json({
                        status: 'ERROR',
                        message: error.message,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        },
        
        // Health check handler
        '/health': {
            method: 'GET',
            handler: async (req, res) => {
                try {
                    const health = await getBackendHealth();
                    res.json(health);
                } catch (error) {
                    res.status(500).json({
                        status: 'ERROR',
                        message: error.message,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        },
        
        // Root endpoint handler
        '/': {
            method: 'GET',
            handler: (req, res) => {
                const rootData = getRootEndpointData();
                res.json(rootData);
            }
        }
    };
}

// Export the blockchain instance for direct access
export function getBlockchainInstance() {
    return blockchainInstance;
}

// Graceful shutdown for backend systems
export async function shutdownBackendSystems() {
    console.log('\n🔻 Shutting down backend systems...');
    if (blockchainInstance) {
        await blockchainInstance.disconnect();
    }
    console.log('✅ Backend systems shutdown completed');
}

// Register shutdown handlers for module cleanup
process.on('SIGINT', async () => {
    await shutdownBackendSystems();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await shutdownBackendSystems();
    process.exit(0);
});

// Export initialization status
export function isBackendInitialized() {
    return !!blockchainInstance && !!currentCredentials;
}

// Note: Server startup code has been removed - this is now a pure module
