import express from 'express';
import { ethers } from 'ethers';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import ccxt from 'ccxt';
import Database from 'better-sqlite3';

dotenv.config();

class QRAFLiveCore {
    constructor() {
        this.app = express();
        this.app.use(express.json());
        this.provider = new ethers.providers.JsonRpcProvider('https://rpc.ankr.com/eth');
        this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY || '0x0000000000000000000000000000000000000000000000000000000000000000', this.provider);
        this.contract = new ethers.Contract(
            process.env.REVENUE_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000',
            ['function getRevenue() view returns (uint256)', 'function distributeRevenue(address) external'],
            this.wallet
        );
        this.adsense = google.adsense({ version: 'v2', auth: process.env.GOOGLE_API_KEY });
        this.exchange = new ccxt.binance({ apiKey: process.env.BINANCE_API_KEY, secret: process.env.BINANCE_SECRET });
        this.db = new Database('data/arielsql.db');
        this.setupDatabase();
        this.setupRoutes();
        this.startRevenueLoop();
        this.app.listen(3000, () => console.log('🚀 QRAF Live on 3000'));
    }

    setupDatabase() {
        this.db.exec(`
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
        try {
            const response = await this.adsense.accounts.reports.generate({
                accountId: process.env.ADSENSE_ACCOUNT_ID,
                dateRange: 'LAST_7_DAYS',
                metrics: ['EARNINGS']
            });
            const amount = response.data.totals ? parseFloat(response.data.totals[1]) : 0;
            this.db.prepare('INSERT INTO revenue_log (source, amount) VALUES (?, ?)').run('adsense', amount);
            return response.data;
        } catch (e) {
            console.error('AdSense Error:', e.message);
            return { totals: [0, 0] };
        }
    }

    async generateForexSignal() {
        try {
            const ticker = await this.exchange.fetchTicker('EUR/USD');
            const ohlcv = await this.exchange.fetchOHLCV('EUR/USD', '1h', undefined, 50);
            const maShort = ohlcv.slice(-10).reduce((sum, candle) => sum + candle[4], 0) / 10;
            const maLong = ohlcv.slice(-50).reduce((sum, candle) => sum + candle[4], 0) / 50;
            const signal = maShort > maLong ? 'buy' : 'sell';
            this.db.prepare('INSERT INTO revenue_log (source, amount) VALUES (?, ?)').run('forex_signal', maShort);
            return signal;
        } catch (e) {
            console.error('Forex Error:', e.message);
            return 'hold';
        }
    }

    async autonomousLoop() {
        try {
            const revenue = await this.contract.getRevenue();
            if (revenue > ethers.utils.parseEther(process.env.PAYOUT_THRESHOLD || '0.1')) {
                const tx = await this.contract.distributeRevenue(process.env.PAYMENT_ADDRESS);
                await tx.wait();
                this.db.prepare('INSERT INTO revenue_log (source, amount) VALUES (?, ?)').run('blockchain_payout', ethers.utils.formatEther(revenue));
                console.log('💸 Real Payout:', tx.hash);
            }
            const signal = await this.generateForexSignal();
            console.log(`📈 Real Forex Signal: ${signal}`);
            const earnings = await this.fetchAdEarnings();
            console.log(`💰 Real Ad Earnings: ${earnings.totals ? earnings.totals[1] : 0}`);
        } catch (e) {
            console.error('Loop Error:', e.message);
            // AI self-repair
            if (e.message.includes('network')) {
                console.log('🧠 Retrying after network error...');
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
        setTimeout(() => this.autonomousLoop(), 60000);
    }
}

new QRAFLiveCore();
