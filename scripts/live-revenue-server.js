import express from 'express';
import { ethers } from 'ethers';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import ccxt from 'ccxt';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

dotenv.config();

class QRAFLiveCore {
    constructor() {
        this.app = express();
        this.app.use(express.json());
        this.provider = new ethers.JsonRpcProvider('https://rpc.ankr.com/eth');
        this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY, this.provider);
        this.contract = new ethers.Contract(process.env.REVENUE_CONTRACT_ADDRESS, [
            'function getRevenue() view returns (uint256)',
            'function distributeRevenue(address) external'
        ], this.wallet);
        this.adsense = google.adsense({ version: 'v2', auth: process.env.GOOGLE_API_KEY });
        this.exchange = new ccxt.binance({ apiKey: process.env.BINANCE_API_KEY, secret: process.env.BINANCE_SECRET });
        this.db = null;
        this.setupDatabase();
        this.setupRoutes();
        this.startRevenueLoop();
        this.app.listen(3000, () => console.log('🚀 QRAF Live on 3000'));
    }

    async setupDatabase() {
        this.db = await open({
            filename: 'data/arielsql.db',
            driver: sqlite3.Database
        });
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS revenue_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source TEXT,
                amount REAL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }

    setupRoutes() {
        this.app.get('/health', (req, res) => res.json({ status: 'live', timestamp: new Date().toISOString() }));
        this.app.get('/revenue', async (req, res) => {
            try {
                const earnings = await this.fetchAdEarnings();
                res.json({ adEarnings: earnings.totals ? earnings.totals[1] : 0 });
            } catch (e) { res.status(500).json({ error: e.message }); }
        });
    }

    async fetchAdEarnings() {
        const response = await this.adsense.accounts.reports.generate({
            accountId: process.env.ADSENSE_ACCOUNT_ID,
            dateRange: 'LAST_7_DAYS',
            metrics: ['EARNINGS']
        });
        await this.db.run('INSERT INTO revenue_log (source, amount) VALUES (?, ?)', 'adsense', response.data.totals[1]);
        return response.data;
    }

    async generateForexSignal() {
        const ticker = await this.exchange.fetchTicker('EUR/USD');
        const ohlcv = await this.exchange.fetchOHLCV('EUR/USD', '1h', undefined, 50);
        const maShort = ohlcv.slice(-10).reduce((sum, candle) => sum + candle[4], 0) / 10;
        const maLong = ohlcv.slice(-50).reduce((sum, candle) => sum + candle[4], 0) / 50;
        const signal = maShort > maLong ? 'buy' : 'sell';
        await this.db.run('INSERT INTO revenue_log (source, amount) VALUES (?, ?)', 'forex_signal', maShort);
        return signal;
    }

    async autonomousLoop() {
        try {
            const revenue = await this.contract.getRevenue();
            if (revenue > ethers.parseEther(process.env.PAYOUT_THRESHOLD || '0.1')) {
                const tx = await this.contract.distributeRevenue(process.env.PAYMENT_ADDRESS);
                await tx.wait();
                await this.db.run('INSERT INTO revenue_log (source, amount) VALUES (?, ?)', 'blockchain_payout', ethers.formatEther(revenue));
                console.log('💸 Real Payout:', tx.hash);
            }
            const signal = await this.generateForexSignal();
            console.log(`📈 Real Forex Signal: ${signal}`);
            const earnings = await this.fetchAdEarnings();
            console.log(`💰 Real Ad Earnings: ${earnings.totals ? earnings.totals[1] : 0}`);
        } catch (e) {
            console.error('Error:', e.message);
            // AI self-repair: predict and retry
            if (e.message.includes('network')) {
                console.log('🧠 Retrying after network error...');
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
        setTimeout(() => this.autonomousLoop(), 60000);
    }
}

new QRAFLiveCore();
