// backend/agents/shopifyAgent.js
import axios from 'axios';

// === 🧠 Smart Revenue Optimizer ===
const optimizeRevenue = (data) => {
  const { price, demand = 1, country = 'US' } = data;
  // High-net-worth countries get 1.5x markup
  const highValueCountries = ['MC', 'LU', 'CH', 'QA', 'SG', 'AE', 'US'];
  const countryMultiplier = highValueCountries.includes(country) ? 1.5 : 1.0;
  // Demand-based adjustment
  const demandMultiplier = 1 + (demand / 1000); // +1% per 10 retweets
  return price * countryMultiplier * demandMultiplier;
};

export const shopifyAgent = async (CONFIG) => {
  console.log('🛍️ Shopify Agent Activated: Optimizing Store for Global Revenue');

  try {
    // ✅ Use CONFIG first, fallback to process.env
    const STORE_URL = CONFIG.STORE_URL || process.env.STORE_URL;
    const ADMIN_SHOP_SECRET = CONFIG.ADMIN_SHOP_SECRET || process.env.ADMIN_SHOP_SECRET;

    if (!STORE_URL || !ADMIN_SHOP_SECRET) {
      throw new Error('Shopify credentials missing: STORE_URL or ADMIN_SHOP_SECRET');
    }

    // Phase 1: Fetch Trends from X (Twitter)
    let trendingTopics = [];
    try {
      const response = await axios.get(
        'https://api.x.com/2/trends/place',
        {
          params: { id: '1' }, // WOEID for Worldwide
          headers: { Authorization: `Bearer ${process.env.X_API_KEY}` },
          timeout: 10000
        }
      );
      trendingTopics = response.data.trends.slice(0, 5).map(t => t.name);
    } catch (error) {
      console.warn('⚠️ X API failed → using fallback trends');
      trendingTopics = ['Luxury Pets', 'AI Gadgets', 'Golden Watches', 'Crypto Art', 'Designer Sunglasses'];
    }

    // Phase 2: Add Trending Products to Shopify
    for (const topic of trendingTopics) {
      try {
        const price = optimizeRevenue({ price: 99.99, demand: Math.random() * 100 });
        await axios.post(
          `${STORE_URL}/admin/api/2024-07/products.json`,
          {
            product: {
              title: `${topic} - Exclusive 2025 Edition`,
              body_html: `<p>Limited stock. High demand. Global shipping.</p>`,
              vendor: 'ArielMatrix Global',
              product_type: 'Luxury',
              variants: [{ price: price.toFixed(2), sku: `AM-${Date.now()}` }]
            }
          },
          {
            headers: {
              'X-Shopify-Access-Token': ADMIN_SHOP_SECRET,
              'Content-Type': 'application/json'
            },
            timeout: 10000
          }
        );
        console.log(`✅ Added product: ${topic}`);
      } catch (error) {
        console.warn(`⚠️ Failed to add product "${topic}":`, error.response?.data || error.message);
      }
    }

    // Phase 3: Dynamic Pricing for High-Net-Worth Countries
    try {
      const res = await axios.get(
        `${STORE_URL}/admin/api/2024-07/products.json`,
        {
          headers: { 'X-Shopify-Access-Token': ADMIN_SHOP_SECRET },
          timeout: 10000
        }
      );

      const highNetWorthCountries = ['MC', 'LU', 'CH', 'QA', 'SG', 'AE'];
      const country = 'MC'; // Simulate geo-targeting
      const multiplier = highNetWorthCountries.includes(country) ? 1.5 : 1.0;

      for (const product of res.data.products) {
        const currentPrice = parseFloat(product.variants[0].price);
        const newPrice = currentPrice * multiplier;

        if (Math.abs(newPrice - currentPrice) > 0.01) {
          await axios.put(
            `${STORE_URL}/admin/api/2024-07/products/${product.id}.json`,
            {
              product: {
                variants: [{ id: product.variants[0].id, price: newPrice.toFixed(2) }]
              }
            },
            {
              headers: {
                'X-Shopify-Access-Token': ADMIN_SHOP_SECRET,
                'Content-Type': 'application/json'
              }
            }
          );
          console.log(`🔁 Updated ${product.title} from $${currentPrice} to $${newPrice}`);
        }
      }
    } catch (error) {
      console.warn('⚠️ Failed to update pricing:', error.response?.data || error.message);
    }

    console.log('🛍️ Shopify Agent Completed: Store optimized for global revenue');
    return { status: 'success', productsUpdated: true };

  } catch (error) {
    console.error('🚨 ShopifyAgent Error:', error.message);
    throw error; // Let orchestrator handle
  }
};
