// server.js

// Import necessary modules
import express from 'express';
// Removed 'cors' import as per your request, previous instruction was to remove it.
// import cors from 'cors';

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// External modules as used across both original files
import axios from 'axios';
import cron from 'node-cron';
import * as crypto from 'node:crypto'; // For Quantum Security Core
import Web3 from 'web3'; // For wallet validation in getWalletBalances and crypto operations in PayoutAgent
import { ethers } from 'ethers'; // For Ethereum crypto operations in PayoutAgent
import { Connection, Keypair, LAMPORTS_PER_SOL, Transaction, SystemProgram, PublicKey } from '@solana/web3.js'; // For Solana crypto operations in PayoutAgent
import * as tf from '@tensorflow/tfjs-node'; // Imported if used by agents, but not directly in server.js logic
import { TwitterApi } from 'twitter-api-v2'; // Imported if used by agents
import Redis from 'ioredis'; // Imported if used by agents

// Helper to get correct path in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// === 🔐 Quantum Security Core ===
const QuantumSecurity = {
    /**
     * Generates a hexadecimal string of entropy using various system-level data.
     * @returns {string} A SHA256 hashed string of combined entropy.
     */
    generateEntropy: () => {
        const buffer = Buffer.concat([
            crypto.randomBytes(16), // Cryptographically strong pseudo-random data
            Buffer.from(Date.now().toString()), // Current timestamp
            Buffer.from(process.uptime().toString()) // System uptime
        ]);
        return crypto.createHash('sha256').update(buffer).digest('hex');
    },
    /**
     * Generates a secure key prefixed with 'qkey_'.
     * @returns {string} A secure key.
     */
    generateSecureKey: () => `qkey_${crypto.randomBytes(24).toString('hex')}`
};

// === 🌐 Self-Healing Config Loader ===
// CONFIG will now be mutable and reflect updates from agents and environment variables.
// Initialize as an empty object; its content will be populated by loadConfig.
let CONFIG = {};

/**
 * Loads and initializes the global CONFIG object from process.env and sets defaults.
 * This function should be called at the start of each autonomous cycle to ensure the latest
 * environment variables are always loaded. Agents can also modify CONFIG in-memory for
 * immediate use within a cycle, and `renderApiAgent` is responsible for persisting
 * critical changes back to the Render environment variables.
 * @returns {object} The current configuration object.
 */
const loadConfig = () => {
    // Populate CONFIG directly from process.env, with robust fallbacks
    Object.assign(CONFIG, {
        // Core system parameters
        PORT: process.env.PORT || 10000,
        ENVIRONMENT: process.env.NODE_ENV || 'development',
        AI_MODEL: process.env.AI_MODEL || 'gemini-2.5-flash-preview-05-20',
        AI_API_KEY: process.env.AI_API_KEY || '', // Canvas will inject this if empty

        // Render API specific for self-healing/persistence
        RENDER_API_TOKEN: process.env.RENDER_API_TOKEN,
        RENDER_SERVICE_ID: process.env.RENDER_SERVICE_ID, // Critical for Render API calls

        // Advertising Platform Credentials (preferring ENV variables for sensitivity)
        AD_PLATFORMS: {
            FACEBOOK_ADS: {
                username: process.env.FACEBOOK_ADS_USERNAME || 'test_fb_user',
                password: process.env.FACEBOOK_ADS_PASSWORD || 'test_fb_password'
            },
            GOOGLE_ADS: {
                username: process.env.GOOGLE_ADS_USERNAME || 'test_google_user',
                password: process.env.GOOGLE_ADS_PASSWORD || 'test_google_password'
            },
        },

        // Payment Method Details (sensitive, should be from ENV)
        PAYMENT_METHODS: {
            STRIPE: {
                apiKey: process.env.STRIPE_API_KEY || 'sk_test_123',
                secretKey: process.env.STRIPE_SECRET_KEY || 'sec_test_abc'
            },
            PAYPAL: {
                clientId: process.env.PAYPAL_CLIENT_ID || 'client_id_test',
                clientSecret: process.env.PAYPAL_CLIENT_SECRET || 'client_secret_test'
            },
            CRYPTOCURRENCY: {
                walletAddress: process.env.CRYPTO_WALLET_ADDRESS || '0xMockCryptoWalletAddress123',
                privateKey: process.env.PRIVATE_KEY, // Ethereum private key from ENV
                solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY, // Solana private key from ENV
                network: process.env.CRYPTO_NETWORK || 'ethereum', // Default crypto network
                ethereumRpcUrl: process.env.ETHEREUM_RPC_URL || 'https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID', // For Ethereum RPC
                solanaRpcUrl: process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com', // For Solana RPC
            }
        },

        // Budgeting and risk management
        BUDGET: parseFloat(process.env.BUDGET || '1000'), // Total budget for revenue generation operations
        RISK_TOLERANCE: parseFloat(process.env.RISK_TOLERANCE || '0.1'), // Max percentage of budget to risk

        // Specific API Keys and Credentials from old file
        BSCSCAN_API_KEY: process.env.BSCSCAN_API_KEY,
        ADFLY_API_KEY: process.env.ADFLY_API_KEY,
        ADFLY_USER_ID: process.env.ADFLY_USER_ID,
        ADFLY_PASS: process.env.ADFLY_PASS, // Password for Adfly
        SHORTIO_API_KEY: process.env.SHORTIO_API_KEY,
        SHORTIO_USER_ID: process.env.SHORTIO_USER_ID,
        SHORTIO_URL: process.env.SHORTIO_URL?.trim() || 'https://api.short.io',
        AI_EMAIL: process.env.AI_EMAIL || 'arielmatrix_ai_fallback@atomicmail.io',
        AI_PASSWORD: process.env.AI_PASSWORD,
        USDT_WALLETS: process.env.USDT_WALLETS?.split(',').map(w => w.trim()).filter(Boolean) || [],
        GAS_WALLET: process.env.GAS_WALLET,
        STORE_URL: process.env.STORE_URL,
        ADMIN_SHOP_SECRET: process.env.ADMIN_SHOP_SECRET,
        PRIVATE_KEY: process.env.PRIVATE_KEY, // Re-affirmed as the primary crypto private key
        BSC_NODE: process.env.BSC_NODE || 'https://bsc-dataseed.binance.org',
        NEWS_API_KEY: process.env.NEWS_API_KEY,
        DOG_API_KEY: process.env.DOG_API_KEY,
        COINGECKO_API: process.env.COINGECKO_API || 'https://api.coingecko.com/api/v3',
        UPTIMEROBOT_AFFILIATE_LINK: process.env.UPTIMEROBOT_AFFILIATE_LINK,
        AMAZON_AFFILIATE_TAG: process.env.AMAZON_AFFILIATE_TAG,
        X_API_KEY: process.env.X_API_KEY,
        X_USERNAME: process.env.X_USERNAME,
        X_PASSWORD: process.env.X_PASSWORD,
        PINTEREST_EMAIL: process.env.PINTEREST_EMAIL,
        PINTEREST_PASS: process.env.PINTEREST_PASS,
        REDDIT_USER: process.env.REDDIT_USER,
        REDDIT_PASS: process.env.REDDIT_PASS,
        LINKVERTISE_EMAIL: process.env.LINKVERTISE_EMAIL,
        LINKVERTISE_PASSWORD: process.env.LINKVERTISE_PASSWORD,
        NOWPAYMENTS_API_KEY: process.env.NOWPAYMENTS_API_KEY,
    });

    // Derived or default properties, not directly from ENV but used by agents
    CONFIG.WALLETS = {
        USDT: CONFIG.USDT_WALLETS[0] || '0x55d398326f99059fF775485246999027B3197955', // Example, actual wallets will come from GAS_WALLET / USDT_WALLETS
        BNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' // Example: BNB token contract address (not a wallet)
    };
    CONFIG.PLATFORMS = {
        SHOPIFY: CONFIG.STORE_URL,
        REDDIT: 'https://www.reddit.com/api/v1',
        X: 'https://api.x.com/2',
        PINTEREST: 'https://api.pinterest.com/v5'
    };
    CONFIG.PROXIES = {}; // Placeholder for proxy configurations
    CONFIG.LANGUAGES = { // Placeholder for language configurations
        'en-US': 'Hello world',
        'ar-AE': 'مرحبا بالعالم',
        'zh-CN': '你好世界'
    };

    return CONFIG;
};

// --- Logger Utility ---
const logger = {
    info: (...args) => console.log('[INFO]', ...args),
    warn: (...args) => console.warn('[WARN]', ...args),
    error: (...args) => console.error('[ERROR]', ...args),
};

// --- Browser Manager Utility (Puppeteer/Playwright Abstraction) ---
class BrowserManager {
    constructor() {
        this.browser = null;
        this.page = null;
        this.browserType = null; // 'puppeteer' or 'playwright'
    }

    /**
     * Initializes the browser instance.
     * @param {'puppeteer' | 'playwright'} type - The type of browser automation library to use.
     */
    async initialize(type = 'puppeteer') {
        this.browserType = type;
        try {
            if (this.browser) {
                logger.info(`${this.browserType} browser already initialized.`);
                return;
            }

            logger.info(`Initializing ${this.browserType} browser...`);
            if (this.browserType === 'puppeteer') {
                const puppeteer = await import('puppeteer');
                // 'new' headless mode is generally recommended
                this.browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
            } else if (this.browserType === 'playwright') {
                const { chromium } = await import('playwright');
                this.browser = await chromium.launch({ headless: true });
            } else {
                throw new Error('Unsupported browser type specified for initialization.');
            }
            this.page = await this.browser.newPage();
            logger.info(`${this.browserType} browser initialized and new page created.`);
        } catch (error) {
            logger.error(`Failed to initialize browser (${this.browserType}): ${error.message}`);
            throw error;
        }
    }

    /**
     * Navigates the current page to a given URL.
     * @param {string} url - The URL to navigate to.
     */
    async navigate(url) {
        if (!this.page) throw new Error('Browser page not initialized. Call initialize() first.');
        logger.info(`Navigating to ${url}`);
        // 'networkidle0' waits until there are no more than 0 network connections for at least 500 ms.
        await this.page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 }); // 60 seconds timeout
    }

    /**
     * Types text into an element identified by a CSS selector.
     * @param {string} selector - The CSS selector of the input field.
     * @param {string} text - The text to type.
     */
    async type(selector, text) {
        if (!this.page) throw new Error('Browser page not initialized.');
        logger.info(`Typing into ${selector}`);
        await this.page.type(selector, text);
    }

    /**
     * Clicks an element identified by a CSS selector.
     * @param {string} selector - The CSS selector of the element to click.
     */
    async click(selector) {
        if (!this.page) throw new Error('Browser page not initialized.');
        logger.info(`Clicking ${selector}`);
        await this.page.click(selector);
    }

    /**
     * Gets the full HTML content of the current page.
     * @returns {Promise<string>} - The HTML content of the page.
     */
    async getPageContent() {
        if (!this.page) throw new Error('Browser page not initialized.');
        return await this.page.content();
    }

    /**
     * Closes the browser instance.
     */
    async close() {
        if (this.browser) {
            logger.info(`Closing ${this.browserType} browser...`);
            await this.browser.close();
            this.browser = null;
            this.page = null;
            logger.info(`${this.browserType} browser closed.`);
        }
    }
}

// Global browser manager instance, initialized once.
const browserManager = new BrowserManager();
let browserManagerInitialized = false; // Flag to ensure browserManager is only initialized once

// --- Payment Agent Class ---
class PayoutAgent {
    /**
     * @param {string} paymentMethod - The payment method to use (e.g., 'STRIPE', 'PAYPAL', 'CRYPTOCURRENCY').
     */
    constructor(paymentMethod) {
        this.paymentMethod = paymentMethod;
        this.config = CONFIG.PAYMENT_METHODS[paymentMethod.toUpperCase()];
        if (!this.config) {
            logger.error(`Payment method ${paymentMethod} not configured.`);
            throw new Error(`Payment method ${paymentMethod} not configured.`);
        }

        // Initialize Web3 for Ethereum if crypto is the method and network is ethereum
        if (paymentMethod.toUpperCase() === 'CRYPTOCURRENCY' && this.config.network === 'ethereum') {
            this.web3 = new Web3(this.config.ethereumRpcUrl);
        }
    }

    /**
     * Processes a payout transaction using the configured payment method.
     * @param {number} amount - The amount to pay out.
     * @param {object} recipientDetails - Details of the recipient (e.g., email, wallet address, bank info).
     * @returns {Promise<{success: boolean, transactionId?: string, error?: string}>} - Result of the payout.
     */
    async processPayout(amount, recipientDetails) {
        logger.info(`Processing payout of ${amount} via ${this.paymentMethod} to ${JSON.stringify(recipientDetails)}`);
        try {
            let result;
            switch (this.paymentMethod.toUpperCase()) {
                case 'STRIPE':
                    result = await this.mockStripePayout(amount, recipientDetails);
                    break;
                case 'PAYPAL':
                    result = await this.mockPayPalPayout(amount, recipientDetails);
                    break;
                case 'CRYPTOCURRENCY':
                    result = await this.performCryptoTransfer(amount, recipientDetails);
                    break;
                default:
                    throw new Error(`Unsupported payment method: ${this.paymentMethod}`);
            }
            logger.info(`Payout successful: ${JSON.stringify(result)}`);
            return { success: true, transactionId: result.id || 'mock_txn_id_' + Date.now() };
        } catch (error) {
            logger.error(`Payout failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    // Mock payment methods (for Stripe and PayPal as their actual APIs are not integrated)
    async mockStripePayout(amount, recipientDetails) {
        logger.info(`[MOCK] Stripe: Initiating transfer for $${amount} to ${recipientDetails.bankAccount}`);
        return new Promise(resolve => setTimeout(() => resolve({ id: `stripe_txn_${Date.now()}`, amount, status: 'completed' }), 1000));
    }

    async mockPayPalPayout(amount, recipientDetails) {
        logger.info(`[MOCK] PayPal: Sending $${amount} to ${recipientDetails.paypalEmail}`);
        return new Promise(resolve => setTimeout(() => resolve({ id: `paypal_txn_${Date.now()}`, amount, status: 'processed' }), 1000));
    }

    /**
     * Performs an actual cryptocurrency transfer using Web3.js, Ethers.js, or Solana Web3.js.
     * It uses the private keys and RPC URLs from the global CONFIG.
     * @param {number} amount - The amount of cryptocurrency to transfer.
     * @param {object} recipientDetails - Contains `walletAddress` for the recipient.
     * @returns {Promise<object>} - Transaction details.
     */
    async performCryptoTransfer(amount, recipientDetails) {
        logger.info(`Crypto: Transferring ${amount} to ${recipientDetails.walletAddress} on ${this.config.network}`);

        if (this.config.network === 'ethereum' && this.web3 && this.config.privateKey) {
            // Using Web3.js for Ethereum
            const account = this.web3.eth.accounts.privateKeyToAccount(this.config.privateKey);
            this.web3.eth.accounts.wallet.add(account);

            const gasPrice = await this.web3.eth.getGasPrice();
            const tx = {
                from: account.address,
                to: recipientDetails.walletAddress,
                value: this.web3.utils.toWei(amount.toString(), 'ether'),
                gas: 21000, // Standard gas limit for simple ETH transfer
                gasPrice: gasPrice
            };

            logger.info(`Ethereum: Sending transaction from ${account.address} to ${recipientDetails.walletAddress}`);
            const signedTx = await account.signTransaction(tx);
            const receipt = await this.web3.eth.sendSignedTransaction(signedTx.rawTransaction);
            logger.info(`Ethereum transaction confirmed: ${receipt.transactionHash}`);
            return { id: receipt.transactionHash, amount, currency: 'ETH', to: recipientDetails.walletAddress, status: 'confirmed' };

        } else if (this.config.network === 'solana' && this.config.solanaPrivateKey) {
            // Using Solana Web3.js
            const connection = new Connection(this.config.solanaRpcUrl);
            try {
                // Ensure the private key is in a format suitable for Keypair.fromSecretKey
                // For demonstration, assuming it's a comma-separated string of numbers or similar.
                // In a real app, securely handle private keys (e.g., Uint8Array from environment).
                const privateKeyArray = Uint8Array.from(this.config.solanaPrivateKey.split(',').map(Number));
                const fromWallet = Keypair.fromSecretKey(privateKeyArray);

                const toPublicKey = new PublicKey(recipientDetails.walletAddress);

                const transaction = new Transaction().add(
                    SystemProgram.transfer({
                        fromPubkey: fromWallet.publicKey,
                        toPubkey: toPublicKey,
                        lamports: amount * LAMPORTS_PER_SOL, // Convert SOL to lamports
                    })
                );

                const signature = await connection.sendAndConfirmTransaction(transaction, [fromWallet]);
                logger.info(`Solana transaction confirmed: ${signature}`);
                return { id: signature, amount, currency: 'SOL', to: recipientDetails.walletAddress, status: 'confirmed' };
            } catch (solanaError) {
                logger.error(`Solana crypto transfer failed: ${solanaError.message}`);
                throw solanaError;
            }

        } else {
            logger.warn(`Crypto network ${this.config.network} not fully implemented or configured, or private key is missing.`);
            // Fallback to a mock if specific crypto setup isn't active
            return new Promise(resolve => setTimeout(() => resolve({
                id: `crypto_txn_mock_${Date.now()}`,
                amount,
                currency: 'UNKNOWN_CRYPTO',
                to: recipientDetails.walletAddress,
                status: 'simulated'
            }), 1500));
        }
    }
}

// Global function to configure a PayoutAgent instance
const configurePaymentMethod = (method) => {
    try {
        const payoutAgent = new PayoutAgent(method);
        logger.info(`Payout agent configured for ${method}`);
        return payoutAgent;
    } catch (error) {
        logger.error(`Failed to configure payment method: ${error.message}`);
        return null;
    }
};

// --- Revenue Agent Class (from new server.js, handles AI-driven ad campaign ops) ---
// This class encapsulates logic for market analysis, ad content generation, and ad campaign management.
// It can be instantiated and used within the runAutonomousCycle or by other agents.
class RevenueAgent {
    /**
     * @param {BrowserManager} browserManager - An instance of BrowserManager for UI automation.
     */
    constructor(browserManager) {
        this.browserManager = browserManager;
        // Use the global CONFIG for AI details
        this.aiApiKey = CONFIG.AI_API_KEY;
        this.aiModel = CONFIG.AI_MODEL;
    }

    /**
     * Logs into a specified ad platform using browser automation.
     * @param {'FACEBOOK_ADS' | 'GOOGLE_ADS'} platform - The ad platform to log into.
     * @param {object} credentials - Username and password for login.
     * @returns {Promise<boolean>} - True if login is successful, false otherwise.
     */
    async loginToAdPlatform(platform, credentials) {
        logger.info(`Attempting to login to ${platform}`);
        const loginUrl = {
            FACEBOOK_ADS: 'https://facebook.com/adsmanager',
            GOOGLE_ADS: 'https://ads.google.com/home/',
        }[platform.toUpperCase()];

        if (!loginUrl) {
            throw new Error(`Unknown ad platform: ${platform}`);
        }

        try {
            await this.browserManager.initialize('puppeteer'); // Using puppeteer by default for ad platforms
            await this.browserManager.navigate(loginUrl);

            // Selectors might need to be adjusted based on actual login pages
            await this.browserManager.type('input[type="email"], input[name*="user"], input[name*="email"]', credentials.username);
            await this.browserManager.type('input[type="password"], input[name*="pass"]', credentials.password);
            await this.browserManager.click('button[type="submit"], input[type="submit"]');

            // Wait for navigation after submit to confirm login
            await this.browserManager.page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }).catch(e => {
                logger.warn(`Login navigation timeout for ${platform}: ${e.message}`);
                // This might mean a redirect, or an error. Check URL.
            });

            const currentUrl = this.browserManager.page.url();
            // Basic check if the URL changed to an expected dashboard URL
            if (currentUrl.includes('adsmanager') || currentUrl.includes('ads.google.com')) {
                logger.info(`Successfully navigated to ${platform} dashboard.`);
                return true;
            } else {
                logger.error(`Login to ${platform} failed. Current URL: ${currentUrl}`);
                // You might need to add more robust checks here (e.g., look for specific elements on the page)
                return false;
            }
        } catch (error) {
            logger.error(`Error during ${platform} login: ${error.message}`);
            return false;
        }
    }

    /**
     * Analyzes market trends using the configured AI model.
     * @param {string} query - The topic or query for market trend analysis.
     * @returns {Promise<string>} - AI-generated market analysis insights.
     */
    async analyzeMarketTrends(query) {
        logger.info(`Analyzing market trends for: ${query}`);
        try {
            const prompt = `Analyze current market trends and potential revenue opportunities for "${query}". Provide insights on target demographics, optimal advertising channels, and content strategies.`;
            const payload = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.aiModel}:generateContent?key=${this.aiApiKey}`;

            const response = await axios.post(apiUrl, payload, {
                headers: { 'Content-Type': 'application/json' }
            });

            const result = response.data;
            if (result.candidates && result.candidates.length > 0 && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts.length > 0) {
                const text = result.candidates[0].content.parts[0].text;
                logger.info('Market trend analysis received from AI.');
                return text;
            } else {
                logger.error('AI response for market trend analysis was empty or malformed.');
                return 'No market trend analysis available.';
            }
        } catch (error) {
            logger.error(`Error analyzing market trends with AI: ${error.message}`);
            return `Error: ${error.message}`;
        }
    }

    /**
     * Identifies revenue opportunities based on market analysis using the AI model.
     * @param {string} marketAnalysis - The market analysis text.
     * @returns {Promise<string>} - AI-generated specific revenue opportunities and action steps.
     */
    async identifyRevenueOpportunities(marketAnalysis) {
        logger.info('Identifying revenue opportunities based on market analysis.');
        try {
            const prompt = `Based on the following market analysis, identify specific, actionable revenue opportunities and suggest concrete steps to capitalize on them:\n\n${marketAnalysis}`;
            const payload = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.aiModel}:generateContent?key=${this.aiApiKey}`;

            const response = await axios.post(apiUrl, payload, {
                headers: { 'Content-Type': 'application/json' }
            });

            const result = response.data;
            if (result.candidates && result.candidates.length > 0 && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts.length > 0) {
                const text = result.candidates[0].content.parts[0].text;
                logger.info('Revenue opportunities identified by AI.');
                return text;
            } else {
                logger.error('AI response for revenue opportunities was empty or malformed.');
                return 'No revenue opportunities identified.';
            }
        } catch (error) {
            logger.error(`Error identifying revenue opportunities with AI: ${error.message}`);
            return `Error: ${error.message}`;
        }
    }

    /**
     * Generates ad content using the AI model.
     * @param {string} opportunityDetails - Details of the revenue opportunity to generate ads for.
     * @returns {Promise<string>} - AI-generated ad content.
     */
    async generateAdContent(opportunityDetails) {
        logger.info('Generating ad content based on identified opportunities.');
        try {
            const prompt = `Generate compelling ad content (headlines, body, call to action) for the following revenue opportunity: ${opportunityDetails}`;
            const payload = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.aiModel}:generateContent?key=${this.aiApiKey}`;

            const response = await axios.post(apiUrl, payload, {
                headers: { 'Content-Type': 'application/json' }
            });

            const result = response.data;
            if (result.candidates && result.candidates.length > 0 && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts.length > 0) {
                const text = result.candidates[0].content.parts[0].text;
                logger.info('Ad content generated by AI.');
                return text;
            } else {
                logger.error('AI response for ad content was empty or malformed.');
                return 'No ad content generated.';
            }
        } catch (error) {
            logger.error(`Error generating ad content with AI: ${error.message}`);
            return `Error: ${error.message}`;
        }
    }

    /**
     * Simulates deployment of an ad campaign. In a real scenario, this would interact with ad platform APIs.
     * @param {string} platform - The ad platform (e.g., 'GOOGLE_ADS').
     * @param {string} adContent - The content of the ad.
     * @param {string} targetAudience - Description of the target audience.
     * @returns {Promise<{success: boolean, campaignId?: string}>} - Result of the deployment.
     */
    async deployAdCampaign(platform, adContent, targetAudience) {
        logger.info(`Deploying ad campaign on ${platform} with content: ${adContent.substring(0, 50)}... and target: ${targetAudience}`);
        return new Promise(resolve => {
            setTimeout(() => {
                const campaignId = `campaign_${platform}_${Date.now()}`;
                logger.info(`Mock ad campaign ${campaignId} deployed on ${platform}.`);
                resolve({ success: true, campaignId });
            }, 2000);
        });
    }

    /**
     * Simulates monitoring ad campaign performance. In a real scenario, this would fetch metrics.
     * @param {string} campaignId - The ID of the campaign to monitor.
     * @returns {Promise<{success: boolean, revenue: number, cost: number}>} - Mock performance data.
     */
    async monitorCampaignPerformance(campaignId) {
        logger.info(`Monitoring campaign performance for ${campaignId}`);
        return new Promise(resolve => {
            setTimeout(() => {
                const revenue = Math.random() * 500; // Mock revenue
                const cost = Math.random() * 100;    // Mock cost
                logger.info(`Mock performance for ${campaignId}: Revenue $${revenue.toFixed(2)}, Cost $${cost.toFixed(2)}`);
                resolve({ success: true, revenue, cost });
            }, 1500);
        });
    }

    /**
     * Simulates optimizing an ad campaign.
     * @param {string} campaignId - The ID of the campaign to optimize.
     * @param {object} performanceData - Data used for optimization decisions.
     * @returns {Promise<{success: boolean, message: string}>} - Result of the optimization.
     */
    async optimizeCampaign(campaignId, performanceData) {
        logger.info(`Optimizing campaign ${campaignId} based on performance data.`);
        return new Promise(resolve => {
            setTimeout(() => {
                logger.info(`Mock optimization applied for ${campaignId}.`);
                resolve({ success: true, message: 'Campaign optimized.' });
            }, 1000);
        });
    }
}

// --- Autonomous Agent Orchestration ---
let isRunning = false;

/**
 * Orchestrates the autonomous revenue generation cycle by invoking various agents.
 * This is the core loop that drives the Ariel Matrix 2.0 system.
 */
const runAutonomousCycle = async () => {
    if (isRunning) {
        console.warn('⏳ Autonomous cycle already running. Skipping new cycle initiation.');
        return;
    }

    isRunning = true;
    const startTime = Date.now();

    try {
        console.log(`⚡ [${new Date().toISOString()}] Starting Autonomous Revenue Cycle`);
        // Always load config freshly from process.env at the start of each cycle.
        // This allows picking up any Render ENV updates from previous cycle's remediation.
        loadConfig();

        // Initialize global browser manager only once for the application's lifetime
        if (!browserManagerInitialized) {
            console.log('Initializing global browser manager...');
            await browserManager.initialize('puppeteer'); // Default to puppeteer
            browserManagerInitialized = true;
            console.log('✅ Global browser manager initialized.');
        }

        // Phase 0: Scout for new APIs and remediate base configurations
        try {
            // Dynamically import agents. Ensure these files exist in your 'agents' directory.
            const apiScoutAgent = await import('./agents/apiScoutAgent.js');
            await apiScoutAgent.apiScoutAgent(CONFIG); // Pass the mutable CONFIG object
            console.log('✅ apiScoutAgent completed. CONFIG potentially updated in-memory.');
        } catch (error) {
            console.warn('⚠️ apiScoutAgent failed, continuing with existing (or default) config. Error:', error.message);
        }

        // Phase 1: Deploy & Monetize
        // These agents utilize the latest CONFIG, which might have been updated by apiScoutAgent.
        try {
            const socialAgent = await import('./agents/socialAgent.js');
            await socialAgent.socialAgent(CONFIG);
            console.log('✅ socialAgent completed.');
        } catch (error) {
            console.error('🚨 socialAgent failed:', error.message);
        }

        try {
            const shopifyAgent = await import('./agents/shopifyAgent.js');
            await shopifyAgent.shopifyAgent(CONFIG);
            console.log('✅ shopifyAgent completed.');
        } catch (error) {
            console.error('🚨 shopifyAgent failed:', error.message);
        }

        try {
            const cryptoAgent = await import('./agents/cryptoAgent.js');
            await cryptoAgent.cryptoAgent(CONFIG);
            console.log('✅ cryptoAgent completed.');
        } catch (error) {
            console.error('🚨 cryptoAgent failed:', error.message);
        }

        // Integrating RevenueAgent's AI-driven ad operations within the main cycle
        // You could also create a dedicated 'adOpsAgent.js' to wrap this logic.
        logger.info('Initiating AI-driven ad operations...');
        const revenueAgent = new RevenueAgent(browserManager);
        const adTopic = 'innovative software solutions'; // Example topic for AI
        try {
            logger.info('Step: Analyzing market trends with AI...');
            const marketAnalysis = await revenueAgent.analyzeMarketTrends(adTopic);
            logger.info('Step: Identifying revenue opportunities with AI...');
            const revenueOpportunities = await revenueAgent.identifyRevenueOpportunities(marketAnalysis);
            logger.info('Step: Generating ad content with AI...');
            const adContent = await revenueAgent.generateAdContent(revenueOpportunities);

            // Assuming Google Ads login and deployment for demonstration
            logger.info('Step: Logging into ad platform (Google Ads)...');
            const googleAdsCredentials = CONFIG.AD_PLATFORMS.GOOGLE_ADS;
            const loggedIn = await revenueAgent.loginToAdPlatform('GOOGLE_ADS', googleAdsCredentials);

            if (loggedIn) {
                logger.info('Step: Deploying ad campaign...');
                const targetAudience = 'Tech enthusiasts, developers, startups';
                const deploymentResult = await revenueAgent.deployAdCampaign('GOOGLE_ADS', adContent, targetAudience);
                if (deploymentResult.success) {
                    logger.info(`Ad campaign ${deploymentResult.campaignId} deployed. Monitoring...`);
                    const performance = await revenueAgent.monitorCampaignPerformance(deploymentResult.campaignId);
                    logger.info('Campaign performance:', performance);
                    await revenueAgent.optimizeCampaign(deploymentResult.campaignId, performance);
                    logger.info('Ad campaign optimized.');
                } else {
                    logger.error('Failed to deploy ad campaign.');
                }
            } else {
                logger.error('Could not log in to ad platform, skipping ad campaign operations.');
            }
        } catch (error) {
            logger.error(`🚨 AI-driven ad operations failed: ${error.message}`);
        }


        // Phase 2: Payouts
        try {
            const payoutAgent = await import('./agents/payoutAgent.js');
            await payoutAgent.payoutAgent(CONFIG);
            console.log('✅ payoutAgent completed.');
        } catch (error) {
            console.error('🚨 payoutAgent failed:', error.message);
        }

        // Phase 3: Self-Healing & ENV Update
        // This agent is crucial for *persisting* the learned config back to Render.
        // Ensure RENDER_API_TOKEN and RENDER_SERVICE_ID are set in Render ENV.
        try {
            const renderApiAgent = await import('./agents/renderApiAgent.js');
            // This agent doesn't modify config directly, but ensures previous changes are persisted
            await renderApiAgent.renderApiAgent(CONFIG);
            console.log('✅ renderApiAgent completed. Configuration synced to Render ENV.');
        } catch (error) {
            console.error('🚨 renderApiAgent failed (crucial for persistence):', error.message);
        }

        console.log(`✅ Autonomous Revenue Cycle completed in ${Date.now() - startTime}ms`);
    } catch (error) {
        console.error('🔥 Autonomous cycle experienced a critical unhandled failure:', error.message);
    } finally {
        isRunning = false;
        // The global browserManager instance is NOT closed here to persist across cycles.
        // A dedicated graceful shutdown hook would handle browserManager.close() if needed.
    }
};

// === 📊 Real-Time Revenue Endpoint ===
const app = express();

// Security Headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
    res.setHeader('X-Quantum-ID', QuantumSecurity.generateEntropy().slice(0, 16));
    next();
});

// Parse JSON
app.use(express.json({ limit: '10mb' }));

// Serve static frontend from 'public' directory
app.use(express.static(join(__dirname, 'public')));

// Real-Time Revenue Endpoint
app.get('/revenue', async (req, res) => {
    try {
        // Ensure config is loaded for API keys for this endpoint too
        loadConfig();

        // This assumes socialAgent.getRevenueStats() exists or provides mock data.
        // In a real scenario, this would aggregate data from various agents/sources.
        const socialAgent = await import('./agents/socialAgent.js'); // Assuming this agent tracks stats
        const stats = socialAgent.getRevenueStats?.() || { clicks: 0, conversions: 0, invoices: 0 };

        const balances = await getWalletBalances(CONFIG); // Pass CONFIG to getWalletBalances

        res.json({
            revenue: {
                adfly: parseFloat((stats.clicks * 0.02).toFixed(2)),
                amazon: parseFloat((stats.conversions * 5.50).toFixed(2)),
                crypto: parseFloat((stats.invoices * 0.15).toFixed(2))
            },
            wallets: balances,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('🚨 Failed to fetch revenue for dashboard:', error.message);
        res.status(500).json({ error: 'Failed to fetch revenue', details: error.message });
    }
});

// Endpoint to manually trigger the autonomous revenue system
app.post('/run-revenue-system', async (req, res) => {
    const { topic } = req.body; // Topic is now an optional hint for ad ops
    if (topic) {
        logger.info(`Manual trigger received with topic: "${topic}". Autonomous cycle will incorporate this.`);
        // You could pass the topic into the runAutonomousCycle if specific agents can utilize it.
        // For now, runAutonomousCycle will use its own internal topic for ad ops.
    } else {
        logger.info('Manual trigger received without specific topic.');
    }

    try {
        // Run the cycle in the background and respond immediately.
        // The client doesn't need to wait for the entire cycle to complete.
        runAutonomousCycle();
        res.json({ success: true, message: 'Autonomous revenue cycle initiated. Check server logs for progress.' });
    } catch (error) {
        logger.error(`API Error on /run-revenue-system: ${error.message}`);
        res.status(500).json({ success: false, message: 'Internal server error during revenue system initiation.' });
    }
});


// === 💰 Wallet Balance Retrieval (Using latest CONFIG) ===
/**
 * Fetches real-time wallet balances from BSCScan using the latest configuration.
 * @param {object} currentConfig - The current global configuration object.
 * @returns {Promise<Array<object>>} Array of wallet balances.
 */
const getWalletBalances = async (currentConfig) => {
    const bscscanUrl = 'https://api.bscscan.com/api';

    // Use the GAS_WALLET and USDT_WALLETS directly from the currentConfig
    const walletsToCheck = [];
    if (currentConfig.GAS_WALLET && Web3.utils.isAddress(currentConfig.GAS_WALLET)) {
        walletsToCheck.push({ coin: 'BNB (Gas)', address: currentConfig.GAS_WALLET });
    }
    // Convert comma-separated string to array and filter for valid addresses
    const usdtWalletAddresses = (currentConfig.USDT_WALLETS || []).filter(w => Web3.utils.isAddress(w));
    usdtWalletAddresses.forEach(addr => {
        walletsToCheck.push({ coin: 'USDT', address: addr });
    });

    if (walletsToCheck.length === 0) {
        console.warn('⚠️ No valid wallets configured to fetch balances for.');
        return [];
    }

    // Ensure BSCSCAN_API_KEY is available
    if (!currentConfig.BSCSCAN_API_KEY || String(currentConfig.BSCSCAN_API_KEY).includes('PLACEHOLDER')) {
        console.warn('⚠️ BSCSCAN_API_KEY is missing or a placeholder. Cannot fetch real wallet balances.');
        return walletsToCheck.map(w => ({ ...w, balance: 'N/A', error: 'Missing API key' }));
    }

    return await Promise.all(
        walletsToCheck.map(async (walletInfo) => {
            try {
                const response = await axios.get(bscscanUrl, {
                    params: {
                        module: 'account',
                        action: 'balance',
                        address: walletInfo.address,
                        tag: 'latest',
                        apikey: currentConfig.BSCSCAN_API_KEY // Use BSCSCAN_API_KEY from current CONFIG
                    },
                    timeout: 7000 // Increased timeout for external API
                });
                const balance = parseInt(response.data.result || '0');
                let formattedBalance = '0.0000';
                if (balance > 0) {
                    formattedBalance = (balance / 1e18).toFixed(4); // For BNB (18 decimals)
                    // For USDT (BEP20), it often has 18 decimals on BSCScan for balance API,
                    // but for true USDT value, a token-specific call (action=tokenbalance) would be needed.
                }
                return { ...walletInfo, balance: formattedBalance };
            } catch (error) {
                console.warn(`⚠️ Failed to fetch balance for ${walletInfo.coin} ${walletInfo.address.slice(0, 10)}...: ${error.message}`);
                return { ...walletInfo, balance: '0.0000', error: error.message };
            }
        })
    );
};

// === 🚀 Health & Init Endpoints ===
app.get('/health', (req, res) => {
    res.json({
        status: 'active',
        quantumId: QuantumSecurity.generateEntropy().slice(0, 12),
        timestamp: new Date().toISOString(),
        cycleRunning: isRunning,
        agents: ['apiScout', 'social', 'shopify', 'crypto', 'adOps', 'payout', 'renderApi'] // Added 'adOps'
    });
});

// Root route providing basic information and links
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>ArielMatrix 2.0</title>
            <style>
                body { font-family: sans-serif; margin: 2rem; background-color: #f0f2f5; color: #333; }
                h1 { color: #2c3e50; }
                ul { list-style-type: none; padding: 0; }
                li { margin-bottom: 0.5rem; }
                a { color: #3498db; text-decoration: none; }
                a:hover { text-decoration: underline; }
                strong { color: #e74c3c; }
            </style>
        </head>
        <body>
            <h1>🚀 ArielMatrix 2.0</h1>
            <p><strong>Autonomous Revenue Engine Active</strong></p>
            <ul>
                <li>📊 <a href="/revenue">Revenue Dashboard</a></li>
                <li>💚 <a href="/health">Health Check</a></li>
                <li>🔄 POST to /run-revenue-system to trigger a cycle</li>
            </ul>
            <p>Quantum ID: ${QuantumSecurity.generateEntropy().slice(0, 8)}</p>
            <p>Server running on port ${CONFIG.PORT || process.env.PORT || 10000}</p>
        </body>
        </html>
    `);
});

// Start server
const PORT = CONFIG.PORT || process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    logger.info(`🚀 Autonomous Revenue Engine Live | Quantum ID: ${QuantumSecurity.generateEntropy().slice(0, 8)}`);
    // Initial load of config upon server start
    loadConfig();
    // Start first autonomous cycle after a short delay to ensure server is fully up
    setTimeout(runAutonomousCycle, 5000);
});

// === ⏱️ Scheduled Execution ===
// Schedule the autonomous revenue cycle to run every 4 hours
cron.schedule('0 */4 * * *', runAutonomousCycle);

// Placeholder for future geo-scaling intelligence: runs every 6 hours.
cron.schedule('0 */6 * * *', async () => {
    console.log('🌍 Scaling to 195 countries (conceptual)...');
    // This could involve dynamically adjusting agent parameters, adding new target regions,
    // or activating new agent instances for different locales.
    // For now, it's a placeholder for future geo-scaling intelligence.
    // Example: You could trigger socialAgent with different countryCodes here.
    // await socialAgent.socialAgent({ ...CONFIG, targetCountry: 'DE' });
});

// Export for potential testing or external triggers if needed
export { runAutonomousCycle, loadConfig, CONFIG };
