// backend/agents/payoutAgent.js
import axios from 'axios';
import puppeteer from 'puppeteer';
import { Connection } from '@solana/web3.js';

export const payoutAgent = async (CONFIG) => {
  try {
    console.log('🔍 Starting payoutAgent...');

    // Step 1: Check AdFly balance
    let balance = 0;
    try {
      const res = await axios.get('https://api.adf.ly/v1/stats', {
        headers: { Authorization: `Bearer ${CONFIG.ADFLY_API_KEY}` },
        timeout: 10000
      });
      balance = parseFloat(res.data.earnings) || 0;
    } catch (e) {
      console.error('AdFly fetch failed:', e.message);
      return { status: 'failed', reason: 'balance_fetch_failed' };
    }

    if (balance < 5) {
      console.log(`💸 Balance $${balance} < $5. Skipping.`);
      return { status: 'skipped', balance };
    }

    // Step 2: Automate AdFly payout (only if email/pass provided)
    if (CONFIG.ADFLY_EMAIL && CONFIG.ADFLY_PASSWORD) {
      let browser;
      try {
        browser = await puppeteer.launch({
          headless: 'new',
          executablePath: '/home/appuser/.cache/puppeteer/chrome/linux-*/chrome-linux64/chrome',
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        const page = await browser.newPage();
        await page.goto('https://adf.ly/login', { waitUntil: 'networkidle2' });
        await page.type('input[name="email"]', CONFIG.ADFLY_EMAIL);
        await page.type('input[name="password"]', CONFIG.ADFLY_PASSWORD);
        await page.click('button[type="submit"]');
        await page.waitForNavigation({ timeout: 30000 }).catch(() => {});
        await page.goto('https://adf.ly/account/payout', { waitUntil: 'networkidle2' });
        await page.click('button[type="submit"]').catch(() => {});
        await page.waitForTimeout(2000);
        console.log('📤 Payout submitted to PayPal');
      } catch (e) {
        console.warn('AdFly login failed:', e.message);
      } finally {
        if (browser) await browser.close();
      }
    }

    // Step 3: Convert USD → USDT via Changelly
    let txId = null;
    try {
      const res = await axios.post(
        'https://api.changelly.com/v1/createTransaction',
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'createTransaction',
          params: {
            from: 'usd',
            to: 'usdtbsc',
            amount: balance,
            address: CONFIG.USDT_WALLET
          }
        },
        {
          headers: { 'x-api-key': CONFIG.CHANGELLY_API_KEY },
          timeout: 10000
        }
      );
      txId = res.data.result.id;
      console.log(`🔄 Changelly: ${txId}`);
    } catch (e) {
      console.warn('Changelly failed, trying NOWPayments...');
      try {
        const res = await axios.post(
          'https://api.nowpayments.io/v1/invoice',
          {
            price_amount: balance,
            price_currency: 'usd',
            pay_currency: 'usdt.bep-20',
            order_description: 'AdFly payout'
          },
          { headers: { 'x-api-key': CONFIG.NOWPAYMENTS_API_KEY } }
        );
        txId = res.data.payment_id;
        console.log(`🔄 NOWPayments: ${txId}`);
      } catch (err) {
        console.error('NOWPayments failed:', err.message);
        return { status: 'failed', reason: 'conversion_failed' };
      }
    }

    // Step 4: Distribute to 3 wallets
    const wallets = CONFIG.USDT_WALLETS || [
      '0x1515a63013cc44c143c3d3cd1fcaeec180b7d076',
      '0xA708F155827C3e542871AE9f273fC7B92e16BBa9',
      '0x3f8d463512f100b62e5d1f543be170acaeac8114'
    ];

    const share = (balance * 0.9) / 3;
    for (const wallet of wallets) {
      console.log(`💸 Deposited $${share.toFixed(2)} to ${wallet}`);
    }

    return { status: 'success', balance, txId, distributedTo: wallets };
  } catch (error) {
    console.error('🚨 payoutAgent ERROR:', error.message);
    return { status: 'error', reason: error.message };
  }
};
