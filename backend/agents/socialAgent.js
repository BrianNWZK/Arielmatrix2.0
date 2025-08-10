import axios from 'axios';

export const socialAgent = async (CONFIG) => {
  try {
    if (!process.env.TWITTER_API_KEY || process.env.TWITTER_API_KEY.includes('fallback')) {
      console.log('Fallback keys detected, skipping social revenue generation');
      return {};
    }
    const trends = await axios.get(`${CONFIG.TWITTER_API}?query=trending`, {
      headers: { Authorization: `Bearer ${process.env.TWITTER_API_KEY}` },
    });
    await axios.post(
      'https://api.twitter.com/2/tweets',
      { text: `Discover trending products on ${CONFIG.STORE_URL}! #Arielmatrix2.0` },
      { headers: { Authorization: `Bearer ${process.env.TWITTER_API_KEY}` } }
    );
    return trends.data;
  } catch (error) {
    console.error('SocialAgent Error:', error);
    throw error;
  }
};
