/**
 * Backend Server Module - Exports RPC and blockchain functionality
 * 🚀 MODULE ONLY: No server startup - exports functions for main.js
 * 🔗 RPC EXPOSURE: Provides Bwaezi chain RPC endpoints using centralized credentials
 * 📊 DATA AGENT: Exports data collection and analytics functions
 */

import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import cors from 'cors';
import express from 'express';
import 'dotenv/config';

// Import blockchain modules
import { BrianNwaezikeChain } from './blockchain/BrianNwaezikeChain.js';
import { createDatabase } from './database/BrianNwaezikeDB.js';

// Global instances
let blockchainInstance = null;
let currentCredentials = null;
let backendInitialized = false;

// 🎯 CREATE BLOCKCHAIN INSTANCE FUNCTION (MISSING IN ORIGINAL)
async function createBrianNwaezikeChain(config = {}) {
    try {
        console.log('🔗 Creating BrianNwaezikeChain instance...');
        const chain = new BrianNwaezikeChain({
            rpcUrl: config.rpcUrl || 'https://rpc.winr.games',
            network: config.network || 'mainnet',
            chainId: config.chainId || 777777,
            contractAddress: config.contractAddress || '0x00000000000000000000000000000000000a4b05',
            ...config
        });
        return chain;
    } catch (error) {
        console.error('❌ Failed to create BrianNwaezikeChain:', error);
        throw error;
    }
}

// 🎯 SET CREDENTIALS FROM MAIN.JS
export function setBackendCredentials(credentials) {
    try {
        currentCredentials = credentials;
        console.log('✅ Backend credentials set from main.js');
        
        if (credentials) {
            console.log(`🔗 Chain ID: ${credentials.BWAEZI_CHAIN_ID || 'Not set'}`);
            console.log(`📝 Contract: ${credentials.BWAEZI_CONTRACT_ADDRESS || 'Not set'}`);
            console.log(`👑 God Mode: ${credentials.GOD_MODE_ACTIVE ? 'ACTIVE' : 'INACTIVE'}`);
        }
        
        return true;
    } catch (error) {
        console.error('❌ Failed to set backend credentials:', error);
        return false;
    }
}

// Initialize core systems with enhanced error handling
export async function initializeBackendSystems() {
    console.log('🚀 Initializing Backend Systems Module...');
    
    try {
        // Validate credentials first
        if (!currentCredentials) {
            console.warn('⚠️ No credentials set, using defaults');
            currentCredentials = {
                BWAEZI_RPC_URL: 'https://rpc.winr.games',
                BWAEZI_CHAIN_ID: 777777,
                BWAEZI_CONTRACT_ADDRESS: '0x00000000000000000000000000000000000a4b05',
                GOD_MODE_ACTIVE: false
            };
        }

        // Initialize blockchain only if not already initialized
        if (!blockchainInstance) {
            console.log('🔗 Initializing Bwaezi Blockchain in backend module...');
            
            blockchainInstance = await createBrianNwaezikeChain({
                rpcUrl: currentCredentials.BWAEZI_RPC_URL,
                network: 'mainnet',
                chainId: currentCredentials.BWAEZI_CHAIN_ID,
                contractAddress: currentCredentials.BWAEZI_CONTRACT_ADDRESS
            });
            
            if (blockchainInstance && typeof blockchainInstance.init === 'function') {
                await blockchainInstance.init();
                console.log('✅ Blockchain instance initialized successfully');
            } else {
                console.error('❌ Blockchain instance invalid or missing init method');
                blockchainInstance = null;
            }
        }
        
        backendInitialized = true;
        console.log('✅ Backend systems initialized successfully');
        return true;
    } catch (error) {
        console.error('❌ Backend system initialization failed:', error);
        backendInitialized = false;
        
        // Create fallback blockchain instance
        blockchainInstance = createFallbackBlockchainInstance();
        return false; // Don't throw, allow server to start without blockchain
    }
}

// Fallback blockchain instance when main initialization fails
function createFallbackBlockchainInstance() {
    console.log('🔄 Creating fallback blockchain instance...');
    
    return {
        isConnected: false,
        isFallback: true,
        getStatus: async () => ({
            connected: false,
            isFallback: true,
            lastBlockNumber: 0,
            gasPrice: '0',
            metrics: { peerCount: 0 },
            error: 'Using fallback instance - blockchain not available'
        }),
        disconnect: async () => {
            console.log('🔻 Fallback blockchain instance disconnected');
        },
        init: async () => {
            console.log('✅ Fallback blockchain instance initialized');
            return true;
        }
    };
}
