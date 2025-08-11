import axios from 'axios';
import puppeteer from 'puppeteer';

export const payoutAgent = async (CONFIG) => {
  try {
    // Step 1: Check AdFly balance
    const adFlyResponse = await axios.get('https://api.adf.ly/v1/stats', {
      headers: { Authorization: `Bearer ${CONFIG.ADFLY_API_KEY}` },
      timeout: 10000,
    });
    const balance = adFlyResponse.data.earnings || 0;

    if (balance < 5) {
      console.log('AdFly balance below threshold ($5), skipping payout');
      return { status: 'skipped', balance };
    }

    // Step 2: Automate AdFly payout request to PayPal
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: '/home/appuser/.cache/puppeteer/chrome/linux-139.0.7258.66/chrome-linux64/chrome',
      userDataDir: '/home/appuser/.cache/puppeteer',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.goto('https://adf.ly/login', { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('#email, input[name="email"]', { timeout: 10000 });
    await page.type('#email, input[name="email"]', CONFIG.ADFLY_EMAIL || 'your_adfly_email');
    await page.type('#password, input[name="password"]', CONFIG.ADFLY_PASSWORD || 'your_adfly_password');
    await page.click('button[type="submit"], #login-button');
    await page.waitForNavigation({ timeout: 30000 });
    await page.goto('https://adf.ly/account/payout', { waitUntil: 'networkidle2', timeout: 30000 });
    await page.click('button[type="submit"], #payout-button'); // Request payout
    await browser.close();

    // Step 3: Convert PayPal USD to USDT via Changelly API
    const changellyResponse = await axios.post('https://api.changelly.com/v1/exchange', {
      from: 'usd',
      to: 'usdt',
      amount: balance,
      address: CONFIG.USDT_WALLET, // BSC USDT wallet
      extraId: '',
      refundAddress: '',
    }, {
      headers: { 'x-api-key': CONFIG.CHANGELLY_API_KEY },
      timeout: 10000,
    });
    const transactionId = changellyResponse.data.transactionId;

    // Step 4: Mint NFT receipt on Solana for additional revenue
    if (CONFIG.SOLANA_API_KEY && CONFIG.SOLANA_PRIVATE_KEY) {
      const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
      const keypair = Keypair.fromSecretKey(Buffer.from(CONFIG.SOLANA_PRIVATE_KEY, 'base64'));
      const umi = createUmi('https://api.mainnet-beta.solana.com').use(mplTokenMetadata());
      const umiKeypair = fromWeb3JsKeypair(keypair);
      const metadata = {
        name: 'AdFly Payout Receipt',
        description: `Payout of $${balance} to USDT wallet`,
        image: 'https://example.com/receipt-nft-image.png',
        attributes: [{ trait_type: 'Amount', value: balance.toString() }],
      };
      await createV1(umi, {
        mint: Keypair.generate().publicKey,
        authority: umiKeypair,
        name: metadata.name,
        uri: 'https://example.com/metadata.json',
        sellerFeeBasisPoints: 500,
      }).sendAndConfirm(umi);
    }

    console.log('Payout processed and NFT minted:', { balance, transactionId });
    return { status: 'success', balance, transactionId };
  } catch (error) {
    console.error('payoutAgent Error:', error);
    throw new Error('Failed to process payout');
  }
};
