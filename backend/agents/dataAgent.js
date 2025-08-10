import axios from 'axios';

export const dataAgent = async (CONFIG) => {
  try {
    if (!process.env.NEWS_API_KEY || !process.env.WEATHER_API_KEY || process.env.NEWS_API_KEY.includes('fallback')) {
      console.log('Fallback keys detected, skipping data revenue generation');
      return { news: [], weather: {} };
    }
    const news = await axios.get(`https://newsapi.org/v2/top-headlines?country=us&apiKey=${process.env.NEWS_API_KEY}`);
    const weather = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=London&appid=${process.env.WEATHER_API_KEY}`);
    return { news: news.data, weather: weather.data };
  } catch (error) {
    console.error('DataAgent Error:', error);
    throw error;
  }
};
