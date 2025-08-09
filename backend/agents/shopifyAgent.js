import axios from 'axios';

export const shopifyAgent = async (CONFIG) => {
  try {
    if (!CONFIG.STORE_KEY || !CONFIG.STORE_SECRET || !CONFIG.ADMIN_SHOP_SECRET) {
      throw new Error('Shopify credentials missing');
    }
    // Fetch trending products from Twitter
    const trends = await axios.get(`${CONFIG.TWITTER_API}?query=trending products`, {
      headers: { Authorization: `Bearer ${process.env.TWITTER_API_KEY}` },
    });
    const productsToAdd = trends.data.data.map((tweet) => ({
      title: tweet.text.slice(0, 50),
      price: optimizeRevenue({ price: 100, demand: tweet.public_metrics.retweet_count }),
    }));

    // Add products to Shopify
    for (const product of productsToAdd) {
      await axios.post(
        `${CONFIG.STORE_URL}/admin/api/2023-10/products.json`,
        {
          product: {
            title: product.title,
            variants: [{ price: product.price.toFixed(2) }],
          },
        },
        { headers: { 'X-Shopify-Access-Token': CONFIG.ADMIN_SHOP_SECRET } }
      );
    }

    // Dynamic pricing for high-net-worth countries
    const response = await axios.get(`${CONFIG.STORE_URL}/admin/api/2023-10/products.json`, {
      headers: { 'X-Shopify-Access-Token': CONFIG.ADMIN_SHOP_SECRET },
    });
    const products = response.data.products;
    const highNetWorthCountries = ['MC', 'LU', 'CH', 'QA', 'SG'];
    for (const product of products) {
      const price = parseFloat(product.variants[0].price);
      const newPrice = highNetWorthCountries.includes('MC') ? price * 1.5 : price;
      await axios.put(
        `${CONFIG.STORE_URL}/admin/api/2023-10/products/${product.id}.json`,
        { product: { variants: [{ id: product.variants[0].id, price: newPrice.toFixed(2) }] } },
        { headers: { 'X-Shopify-Access-Token': CONFIG.ADMIN_SHOP_SECRET } }
      );
    }
    return products;
  } catch (error) {
    console.error('ShopifyAgent Error:', error);
    throw error;
  }
};
