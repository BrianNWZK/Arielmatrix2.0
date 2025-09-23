// backend/agents/shopifyAgent.js
import { BrianNwaezikeChain } from '../blockchain/BrianNwaezikeChain.js';
import { QuantumShield } from '../../modules/quantum-shield/index.js';
import { AIThreatDetector } from '../../modules/ai-security-module/index.js';
import { yourSQLite } from '../../modules/your-sqlite/index.js';
import axios from 'axios';
import crypto from 'crypto';
import apiScoutAgent from './apiScoutAgent.js';
import { QuantumBrowserManager } from './browserManager.js';

// Import wallet functions (single import to avoid duplicates)
import {
  initializeConnections,
    getWalletBalances,
    getWalletAddresses,
    sendSOL,
    sendETH,
    sendUSDT,
    processRevenuePayment,
    checkBlockchainHealth,
    validateAddress,
    formatBalance,
    testAllConnections,
} from './wallet.js'; // Consolidated import

// Constants for configuration
const DEFAULT_STORE_DOMAIN = 'store';
const API_VERSION = '2024-01';
const DEFAULT_STATUS = 'idle';
const DEFAULT_LAST_EXECUTION = 'Never';
const DEFAULT_REVENUE = 0;

// Database optimization constants
const QUANTUM_COMPRESSION = 'QUANTUM_COMPRESSION';
const QUANTUM_FAST_LOOKUP = 'QUANTUM_FAST_LOOKUP';

// Marketing constants
const MARKETING_BUDGET_PERCENTAGE = 0.2;
const MINIMUM_MARKETING_BUDGET = 10;
const MARKETING_IMPACT_CAP = 5.0;
const DEFAULT_RATE_LIMIT_DELAY = 2000;
const INFLUENCER_CONTACT_LIMIT = 3;
const SALES_DATA_LOOKBACK_DAYS = 7;
const SALES_DATA_LIMIT = 250;

// Country-specific weights for marketing budget calculation
const COUNTRY_WEIGHTS = {
  'US': 1.0, 'CA': 0.8, 'GB': 0.9, 'AU': 0.8,
  'DE': 0.9, 'FR': 0.85, 'JP': 0.9, 'CN': 0.95
};

// Google Ads targeting presets
const GOOGLE_ADS_TARGETING_PRESETS = {
  'US': { locations: ['2840'], languages: ['1000'] },
  'CA': { locations: ['2124'], languages: ['1000'] },
  'GB': { locations: ['2826'], languages: ['1000'] },
  'AU': { locations: ['2036'], languages: ['1000'] }
};

// Ad copy templates by country
const AD_COPY_TEMPLATES = {
  'US': "🔥 New in {productTitle}! Limited time offer for US customers. Free shipping!",
  'CA': "🇨🇦 Exclusive Canadian offer: {productTitle}. Special pricing for Canada!",
  'GB': "🇬🇧 Discover {productTitle}! Exclusive UK offer with fast delivery.",
  'EU': "🇪🇺 European exclusive: {productTitle}. EU-wide shipping available."
};

const DEFAULT_AD_COPY = "Discover {productTitle}! Now available in your country.";
const SOCIAL_MEDIA_PLATFORMS = ['twitter', 'linkedin', 'instagram', 'tiktok'];

// Rate Limiter Class
class RateLimiter {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.rateLimits = new Map();
  }

  async checkLimit(service) {
    const now = Date.now();
    const serviceLimits = this.rateLimits.get(service) || { count: 0, resetTime: now + 60000 };
    
    if (now > serviceLimits.resetTime) {
      serviceLimits.count = 0;
      serviceLimits.resetTime = now + 60000;
    }

    if (serviceLimits.count >= this.getServiceLimit(service)) {
      const waitTime = serviceLimits.resetTime - now;
      this.logger.warn(`Rate limit reached for ${service}. Waiting ${waitTime}ms`);
      await this.delay(waitTime);
      return this.checkLimit(service);
    }

    serviceLimits.count++;
    this.rateLimits.set(service, serviceLimits);
    return true;
  }

  async handleRateLimit(service) {
    const backoffTime = this.getBackoffTime(service);
    this.logger.warn(`Rate limited by ${service}. Backing off for ${backoffTime}ms`);
    await this.delay(backoffTime);
  }

  getServiceLimit(service) {
    const limits = {
      'shopify': 40, 'google_ads': 100, 'meta_ads': 200,
      'twitter': 300, 'linkedin': 100, 'instagram': 200, 'tiktok': 100
    };
    return limits[service] || 50;
  }

  getBackoffTime(service) {
    const backoffs = {
      'shopify': 2000, 'google_ads': 1000, 'meta_ads': 1500, 'default': 2000
    };
    return backoffs[service] || backoffs.default;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// API Queue Class
class ApiQueue {
  constructor(config, logger, rateLimiter) {
    this.config = config;
    this.logger = logger;
    this.rateLimiter = rateLimiter;
    this.queue = [];
    this.processing = false;
  }

  async enqueue(apiCall, service = 'default', priority = 1) {
    return new Promise((resolve, reject) => {
      this.queue.push({ apiCall, service, priority, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      this.queue.sort((a, b) => b.priority - a.priority);
      const task = this.queue.shift();

      try {
        await this.rateLimiter.checkLimit(task.service);
        const result = await task.apiCall();
        task.resolve(result);
      } catch (error) {
        if (error.response?.status === 429) {
          await this.rateLimiter.handleRateLimit(task.service);
          this.queue.unshift(task);
        } else {
          task.reject(error);
        }
      }

      await this.delay(100);
    }

    this.processing = false;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Content Generator Class
class ContentGenerator {
  constructor(config, logger, apiQueue) {
    this.config = config;
    this.logger = logger;
    this.apiQueue = apiQueue;
  }

  async generateProductContent(product, country, contentType = 'blog_post') {
    try {
      if (!this.config.OPENAI_API_KEY) throw new Error('OpenAI API key not configured');
      const prompt = this._createContentPrompt(product, country, contentType);
      const content = await this.apiQueue.enqueue(() => 
        this._callAdvancedAI(prompt, contentType), 'ai_content', 2
      );
      return this._formatContent(content, contentType);
    } catch (error) {
      this.logger.error(`Content generation failed: ${error.message}`);
      return this._generateFallbackContent(product, country, contentType);
    }
  }

  async _callAdvancedAI(prompt, contentType) {
    const models = {
      'blog_post': 'gpt-4', 'product_description': 'claude-v2',
      'ad_copy': 'jurassic-2', 'email': 'llama-2'
    };

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: models[contentType] || 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 2000,
        temperature: 0.7,
        top_p: 0.9
      },
      {
        headers: {
          'Authorization': `Bearer ${this.config.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    return response.data.choices[0].message.content;
  }

  _createContentPrompt(product, country, contentType) {
    const prompts = {
      'blog_post': `Write a comprehensive 2000-word blog post about ${product.title} focusing on its benefits for the ${country} market. Include detailed features, use cases, competitive advantages, testimonials, and technical specifications.`,
      'product_description': `Create an engaging product description for ${product.title} targeting ${country} customers. Focus on unique selling propositions, local market relevance, and emotional benefits.`,
      'ad_copy': `Generate compelling ad copy for ${product.title} in ${country}. Include attention-grabbing headline, key benefits, local references, and strong CTA.`
    };
    return prompts[contentType] || prompts.blog_post;
  }

  _formatContent(content, contentType) {
    const formatters = {
      'blog_post': (text) => text.split('\n').filter(line => line.trim()).map(line => 
        line.startsWith('#') ? line : `<p>${line}</p>`
      ).join('\n'),
      'product_description': (text) => text,
      'ad_copy': (text) => text
    };
    return formatters[contentType]?.(content) || content;
  }

  _generateFallbackContent(product, country, contentType) {
    return `Discover ${product.title} - the perfect solution for ${country} customers.`;
  }
}

// Backlink Builder Class
class BacklinkBuilder {
  constructor(config, logger, apiQueue, contentGenerator) {
    this.config = config;
    this.logger = logger;
    this.apiQueue = apiQueue;
    this.contentGenerator = contentGenerator;
    this.authoritativeSites = this._loadAuthoritativeSites();
  }

  initDatabase(db) {
    this.db = db;
    this.db.run(`
      CREATE TABLE IF NOT EXISTS backlink_campaigns (
        id TEXT PRIMARY KEY, product_id TEXT, country_code TEXT,
        target_url TEXT, target_domain TEXT, domain_authority INTEGER,
        outreach_date DATETIME, status TEXT, response_date DATETIME,
        notes TEXT, quantum_signature TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) WITH OPTIMIZATION=${QUANTUM_COMPRESSION}
    `);
  }

  async buildBacklinks(product, country) {
    try {
      this.logger.info(`🚀 Starting advanced backlink campaign for ${product.title} in ${country}`);
      const targetWebsites = await this._findAuthoritativeWebsites(product, country);
      const content = await this.contentGenerator.generateProductContent(product, country, 'blog_post');
      await this._conductStrategicOutreach(targetWebsites, product, country, content);
      await this._submitToPremiumDirectories(product, country);
      this.logger.info(`✅ Advanced backlink campaign initiated for ${product.title}`);
      return true;
    } catch (error) {
      this.logger.error(`Backlink building failed: ${error.message}`);
      throw error;
    }
  }

  async _findAuthoritativeWebsites(product, country) {
    const strategies = [
      this._findIndustryPublications(product.category, country),
      this._findGovernmentEducationalSites(country),
      this._findNewsMediaSites(product.category, country),
      this._findInfluentialBlogs(product.category, country)
    ];

    const results = await Promise.allSettled(strategies);
    let websites = [];
    for (const result of results) {
      if (result.status === 'fulfilled') websites = websites.concat(result.value);
    }
    return this._filterAndRankWebsites(websites);
  }

  async _findIndustryPublications(category, country) {
    try {
      if (!this.config.SEMRUSH_API_KEY) throw new Error('SEMRush API key not configured');
      const response = await this.apiQueue.enqueue(() => 
        axios.get('https://api.semrush.com/analytics/v1/', {
          params: {
            type: 'domain_organic_search',
            key: this.config.SEMRUSH_API_KEY,
            database: country.toLowerCase(),
            domain: category + '.com',
            export_columns: 'domain,domain_authority,organic_traffic'
          }
        }), 'industry_pub', 1
      );
      return response.data.data.map(site => ({
        domain: site.domain,
        domainAuthority: site.domain_authority,
        contactEmail: `info@${site.domain}`
      }));
    } catch (error) {
      this.logger.warn(`Industry publications search failed: ${error.message}`);
      return [];
    }
  }

  async _conductStrategicOutreach(websites, product, country, content) {
    let successfulOutreaches = 0;
    for (const website of websites.slice(0, 10)) {
      try {
        const outreachResult = await this._sendStrategicOutreach(website, product, country, content);
        if (outreachResult.success) {
          successfulOutreaches++;
          this.logger.info(`✅ Outreach sent to authoritative site: ${website.domain}`);
        }
        await this.delay(30000);
      } catch (error) {
        this.logger.warn(`Outreach to ${website.domain} failed: ${error.message}`);
      }
    }
    this.logger.info(`📧 Sent ${successfulOutreaches} strategic outreach emails`);
  }

  async _sendStrategicOutreach(website, product, country, content) {
    if (!this.config.SENDGRID_API_KEY) throw new Error('SendGrid API key not configured');
    const emailContent = await this._createStrategicEmailTemplate(website, product, country, content);
    const response = await this.apiQueue.enqueue(() =>
      axios.post('https://api.sendgrid.com/v3/mail/send', {
        personalizations: [{ to: [{ email: website.contactEmail }] }],
        from: { email: this.config.STORE_EMAIL, name: this.config.STORE_NAME },
        subject: `Expert Contribution: ${product.title} for ${website.domain}`,
        content: [{ type: 'text/html', value: emailContent }]
      }, {
        headers: { 
          'Authorization': `Bearer ${this.config.SENDGRID_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }), 'email', 2
    );
    return { success: true, messageId: response.data.id };
  }

  async _createStrategicEmailTemplate(website, product, country, content) {
    return `
      <!DOCTYPE html><html><head><meta charset="utf-8"><title>Expert Contribution</title></head>
      <body><p>Hello ${website.domain} Team,</p>
      <p>I've been following your excellent work in the ${product.category} space and would like to contribute an expert article about ${product.title}.</p>
      <p>${content.substring(0, 200)}...</p>
      <p>Best regards,<br>${this.config.STORE_NAME} Team</p></body></html>
    `;
  }

  _loadAuthoritativeSites() {
    return {
      government: ['*.gov', '*.edu', '*.ac.uk', '*.edu.au'],
      media: ['nytimes.com', 'washingtonpost.com', 'bbc.co.uk', 'theguardian.com'],
      industry: ['forbes.com', 'techcrunch.com', 'wired.com', 'entrepreneur.com']
    };
  }

  _filterAndRankWebsites(websites) {
    return websites
      .filter(site => site.domainAuthority >= 50)
      .sort((a, b) => b.domainAuthority - a.domainAuthority);
  }

  async _submitToPremiumDirectories(product, country) {
    const directories = [
      'https://directory.google.com',
      'https://www.business.com',
      'https://www.hotfrog.com'
    ];

    for (const directory of directories) {
      try {
        await this.apiQueue.enqueue(() =>
          axios.post(directory + '/submit', {
            url: `${this.config.STORE_URL}/products/${product.handle}`,
            title: product.title,
            description: product.description,
            category: product.category
          }), 'directory', 3
        );
        this.logger.info(`✅ Submitted to directory: ${directory}`);
      } catch (error) {
        this.logger.warn(`Directory submission failed for ${directory}: ${error.message}`);
      }
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// SEO Manager Class
class SEOManager {
  constructor(config, logger, apiQueue, backlinkBuilder) {
    this.config = config;
    this.logger = logger;
    this.apiQueue = apiQueue;
    this.backlinkBuilder = backlinkBuilder;
  }

  initDatabase(db) {
    this.db = db;
    this.db.run(`
      CREATE TABLE IF NOT EXISTS seo_optimizations (
        id TEXT PRIMARY KEY, product_id TEXT, country_code TEXT,
        optimization_type TEXT, details TEXT, score REAL,
        quantum_signature TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) WITH OPTIMIZATION=${QUANTUM_COMPRESSION}
    `);
  }

  async optimizeProduct(product, country) {
    try {
      await this._optimizeOnPageSEO(product, country);
      await this._optimizeTechnicalSEO(product);
      await this.backlinkBuilder.buildBacklinks(product, country);
      await this._optimizeContentSEO(product, country);
      this.logger.info(`✅ Comprehensive SEO optimization completed for ${product.title}`);
      return true;
    } catch (error) {
      this.logger.error(`SEO optimization failed: ${error.message}`);
      throw error;
    }
  }

  async _optimizeOnPageSEO(product, country) {
    const optimizations = {
      title: `${product.title} | Best ${product.category} in ${country} 2024`,
      description: await this._generateMetaDescription(product, country),
      schema: this._generateSchemaMarkup(product, country)
    };
    await this.apiQueue.enqueue(() => 
      this._applySEOOptimizations(product, optimizations), 'shopify', 1
    );
  }

  async _generateMetaDescription(product, country) {
    if (!this.config.OPENAI_API_KEY) throw new Error('OpenAI API key not configured');
    const prompt = `Write a compelling meta description for ${product.title} targeting ${country} customers.`;
    const description = await this.apiQueue.enqueue(() =>
      this._callAdvancedAI(prompt, 'ad_copy'), 'ai_content', 2
    );
    return description.substring(0, 160);
  }

  _generateSchemaMarkup(product, country) {
    return {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": product.title,
      "description": product.description,
      "offers": {
        "@type": "Offer",
        "price": product.price,
        "priceCurrency": this._getCurrencyForCountry(country)
      }
    };
  }

  async _applySEOOptimizations(product, optimizations) {
    if (!this.config.ADMIN_SHOP_SECRET) throw new Error('Shopify Admin API secret not configured');
    const response = await this.apiQueue.enqueue(() =>
      axios.put(`${this.config.STORE_URL}/admin/api/${this.apiVersion}/products/${product.id}.json`, {
        product: {
          id: product.id,
          metafields: [
            {
              key: 'seo_title',
              value: optimizations.title,
              type: 'string',
              namespace: 'global'
            },
            {
              key: 'description',
              value: optimizations.description,
              type: 'string',
              namespace: 'global'
            }
          ]
        }
      }, {
        headers: {
          'X-Shopify-Access-Token': this.config.ADMIN_SHOP_SECRET,
          'Content-Type': 'application/json'
        }
      }), 'shopify', 1
    );
    this.logger.info(`✅ Applied SEO optimizations for ${product.title}`);
  }

  async _optimizeTechnicalSEO(product) {
    if (!this.config.GOOGLE_SEARCH_API_KEY) throw new Error('Google Search API key not configured');
    await this.apiQueue.enqueue(() =>
      axios.post('https://api.google.com/search/url', {
        url: `${this.config.STORE_URL}/products/${product.handle}`,
        type: 'URL_UPDATED'
      }, {
        headers: {
          'Authorization': `Bearer ${this.config.GOOGLE_SEARCH_API_KEY}`
        }
      }), 'google_search', 2
    );
    this.logger.info(`✅ Technical SEO optimized for ${product.title}`);
  }

  async _optimizeContentSEO(product, country) {
    if (!this.config.OPENAI_API_KEY) throw new Error('OpenAI API key not configured');
    const content = await this.apiQueue.enqueue(() =>
      this._callAdvancedAI(`Optimize content for ${product.title} targeting ${country} market`, 'blog_post'), 'ai_content', 2
    );
    
    await this.db.run(`
      INSERT INTO seo_optimizations 
      (id, product_id, country_code, optimization_type, details, score)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [crypto.randomBytes(16).toString('hex'), product.id, country, 'content', content, 0.85]);
    
    this.logger.info(`✅ Content SEO optimized for ${product.title}`);
  }

  async _callAdvancedAI(prompt, contentType) {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000,
        temperature: 0.7
      },
      {
        headers: {
          'Authorization': `Bearer ${this.config.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data.choices[0].message.content;
  }

  _getCurrencyForCountry(country) {
    const currencies = { 'US': 'USD', 'GB': 'GBP', 'CA': 'CAD', 'AU': 'AUD', 'EU': 'EUR' };
    return currencies[country] || 'USD';
  }
}

// Marketing Manager Class
class MarketingManager {
  constructor(config, logger, apiQueue) {
    this.config = config;
    this.logger = logger;
    this.apiQueue = apiQueue;
    this.walletInitialized = false;
  }

  async initializeWalletConnections() {
    this.logger.info('🔗 Initializing multi-chain wallet connections for Marketing Manager...');
    
    try {
      await initializeConnections();
      this.walletInitialized = true;
      this.logger.info('✅ Multi-chain wallet connections initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize wallet connections: ${error.message}`);
    }
  }

  initDatabase(db) {
    this.db = db;
    this.db.run(`
      CREATE TABLE IF NOT EXISTS marketing_campaigns (
        id TEXT PRIMARY KEY, product_id TEXT, country_code TEXT,
        platform TEXT, campaign_type TEXT, budget REAL, spend REAL,
        impressions INTEGER, clicks INTEGER, conversions INTEGER, roi REAL,
        status TEXT, quantum_signature TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) WITH OPTIMIZATION=${QUANTUM_COMPRESSION}
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS real_sales_data (
        id TEXT PRIMARY KEY, product_id TEXT, country_code TEXT,
        quantity INTEGER, revenue REAL, currency TEXT, source TEXT,
        campaign_id TEXT, customer_id TEXT, quantum_proof TEXT,
        sale_timestamp DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) WITH INDEX=${QUANTUM_FAST_LOOKUP}
    `);
  }

  async executeStrategy(product, country) {
    try {
      const currency = this._getCurrencyForCountry(country);
      const campaigns = await Promise.allSettled([
        this._executeGoogleAdsCampaign(product, country, currency),
        this._executeMetaAdsCampaign(product, country, currency),
        this._executeEmailMarketing(product, country),
        this._executeOrganicSocialMedia(product, country),
        this._executeInfluencerMarketing(product, country)
      ]);
      this.logger.info(`✅ Executed multi-channel marketing for ${product.title} in ${country}`);
      return campaigns;
    } catch (error) {
      this.logger.error(`Marketing strategy execution failed: ${error.message}`);
      throw error;
    }
  }

  async _executeGoogleAdsCampaign(product, country, currency) {
    return this.apiQueue.enqueue(async () => {
      if (!this.config.GOOGLE_ADS_API_KEY || !this.config.GOOGLE_ADS_CUSTOMER_ID || !this.config.GOOGLE_ADS_DEVELOPER_TOKEN) {
        throw new Error('Google Ads configuration incomplete');
      }
      
      const campaignData = {
        name: `${product.title} - ${country} Campaign`,
        status: 'PAUSED',
        advertisingChannelType: 'PERFORMANCE_MAX',
        campaignBudget: {
          amountMicros: this._calculateMarketingBudget(product.price, country) * 1000000,
          deliveryMethod: 'STANDARD'
        },
        networkSettings: {
          targetGoogleSearch: true,
          targetSearchNetwork: true,
          targetContentNetwork: true,
          targetPartnerSearchNetwork: false
        },
        targeting: this._getGoogleAdsTargeting(country)
      };

      const response = await axios.post(
        `https://googleads.googleapis.com/v14/customers/${this.config.GOOGLE_ADS_CUSTOMER_ID}/campaigns:mutate`,
        {
          operations: [{
            create: campaignData
          }]
        },
        {
          headers: {
            'Authorization': `Bearer ${this.config.GOOGLE_ADS_API_KEY}`,
            'Content-Type': 'application/json',
            'developer-token': this.config.GOOGLE_ADS_DEVELOPER_TOKEN
          },
          timeout: 15000
        }
      );

      const campaignId = response.data.results[0].resourceName;
      const campaignDbId = `google_ads_${crypto.randomBytes(16).toString('hex')}`;
      
      await this.db.run(`
        INSERT INTO marketing_campaigns 
        (id, product_id, country_code, platform, campaign_type, budget, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [campaignDbId, product.id, country, 'google_ads', 'shopping', campaignData.campaignBudget.amountMicros / 1000000, 'active']);

      this.logger.info(`✅ Google Ads campaign created: ${campaignId}`);
      return campaignId;
    }, 'google_ads', 1);
  }

  async _executeMetaAdsCampaign(product, country, currency) {
    return this.apiQueue.enqueue(async () => {
      if (!this.config.FB_ADS_ACCESS_TOKEN || !this.config.FB_ADS_ACCOUNT_ID) {
        throw new Error('Meta Ads configuration incomplete');
      }
      const campaignData = {
        name: `${product.title} - ${country} Campaign`,
        objective: 'CONVERSIONS',
        status: 'PAUSED',
        special_ad_categories: [],
        daily_budget: this._calculateMarketingBudget(product.price, country) * 100,
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP'
      };

      const response = await axios.post(
        `https://graph.facebook.com/v18.0/act_${this.config.FB_ADS_ACCOUNT_ID}/campaigns`,
        campaignData,
        {
          headers: {
            'Authorization': `Bearer ${this.config.FB_ADS_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      this.logger.info(`✅ Meta Ads campaign created for ${product.title}`);
      return response.data.id;
    }, 'meta_ads', 1);
  }

  async _executeEmailMarketing(product, country) {
    return this.apiQueue.enqueue(async () => {
      if (!this.config.MAILCHIMP_API_KEY || !this.config.MAILCHIMP_LIST_ID) {
        throw new Error('Mailchimp configuration incomplete');
      }
      const emailContent = await this._generateEmailContent(product, country);
      
      const response = await axios.post(
        'https://api.mailchimp.com/3.0/campaigns',
        {
          type: 'regular',
          recipients: {
            list_id: this.config.MAILCHIMP_LIST_ID
          },
          settings: {
            subject_line: `Discover ${product.title} - Special Offer for ${country}`,
            from_name: this.config.STORE_NAME,
            reply_to: this.config.STORE_EMAIL
          },
          content: {
            html: emailContent
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${this.config.MAILCHIMP_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      this.logger.info(`✅ Email marketing campaign created for ${product.title}`);
      return response.data.id;
    }, 'email', 2);
  }

  async _executeOrganicSocialMedia(product, country) {
    return this.apiQueue.enqueue(async () => {
      for (const platform of SOCIAL_MEDIA_PLATFORMS) {
        try {
          await this._postToSocialPlatform(platform, product, country);
          await this.delay(2000);
        } catch (error) {
          this.logger.warn(`Failed to post to ${platform}: ${error.message}`);
        }
      }
      this.logger.info(`✅ Organic social media posts completed for ${product.title}`);
      return true;
    }, 'social_media', 3);
  }

  async _executeInfluencerMarketing(product, country) {
    return this.apiQueue.enqueue(async () => {
      if (!this.config.INFLUENCERDB_API_KEY) throw new Error('InfluencerDB API key not configured');
      const influencers = await this._findRelevantInfluencers(product.category, country);
      
      for (const influencer of influencers.slice(0, INFLUENCER_CONTACT_LIMIT)) {
        try {
          await this._contactInfluencer(influencer, product, country);
          await this.delay(5000);
        } catch (error) {
          this.logger.warn(`Failed to contact influencer ${influencer.name}: ${error.message}`);
        }
      }
      
      this.logger.info(`✅ Influencer outreach initiated for ${product.title}`);
      return true;
    }, 'influencer', 2);
  }

  async updateCampaignPerformance(productId, countryCode, revenue, units) {
    await this.db.run(`
      UPDATE marketing_campaigns 
      SET conversions = conversions + ?, spend = spend + (budget * 0.1), roi = ?
      WHERE product_id = ? AND country_code = ? AND status = 'active'
    `, [units, revenue / (units * 0.1 || 1), productId, countryCode]);
  }

  async processRevenuePayment(amount, currency, countryCode, productId) {
    try {
      if (!this.walletInitialized) {
        await this.initializeWalletConnections();
      }

      let settlementResult;
      
      if (['USD', 'EUR', 'GBP'].includes(currency)) {
        settlementResult = await sendUSDT(
          this.config.COMPANY_WALLET_ADDRESS,
          amount,
          'eth'
        );
      } else {
        const solAmount = await this._convertToSol(amount, currency);
        settlementResult = await sendSOL(
          this.config.COMPANY_WALLET_ADDRESS,
          solAmount
        );
      }

      if (settlementResult.hash || settlementResult.signature) {
        const revenueId = `rev_${crypto.randomBytes(8).toString('hex')}`;
        await this.db.run(`
          INSERT INTO revenue_streams 
          (id, source, amount, currency, country_code, product_id, blockchain_tx_hash)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          revenueId, 'marketing_campaign', amount, currency, 
          countryCode, productId, settlementResult.hash || settlementResult.signature
        ]);

        this.logger.info(`💰 Revenue payment processed: ${amount} ${currency}`);
        return true;
      }

      return false;

    } catch (error) {
      this.logger.error(`Revenue payment processing failed: ${error.message}`);
      return false;
    }
  }

  _calculateMarketingBudget(price, country) {
    const weight = COUNTRY_WEIGHTS[country] || 0.7;
    return Math.max(MINIMUM_MARKETING_BUDGET, price * MARKETING_BUDGET_PERCENTAGE * weight);
  }

  _getGoogleAdsTargeting(country) {
    return GOOGLE_ADS_TARGETING_PRESETS[country] || { locations: [country], languages: ['1000'] };
  }

  _getCurrencyForCountry(country) {
    const currencies = { 'US': 'USD', 'GB': 'GBP', 'CA': 'CAD', 'AU': 'AUD', 'EU': 'EUR' };
    return currencies[country] || 'USD';
  }

  async _convertToSol(amount, currency) {
    try {
      const response = await axios.get(
        `https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=${currency.toLowerCase()}`
      );
      const rate = response.data.solana[currency.toLowerCase()];
      return amount / rate;
    } catch (error) {
      this.logger.error('Currency conversion failed:', error);
      return amount / 100;
    }
  }

  async _generateEmailContent(product, country) {
    if (!this.config.OPENAI_API_KEY) throw new Error('OpenAI API key not configured');
    const prompt = `Create an engaging email about ${product.title} for customers in ${country}. Include special offers and compelling CTAs.`;
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000
      },
      {
        headers: {
          'Authorization': `Bearer ${this.config.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data.choices[0].message.content;
  }

  async _findRelevantInfluencers(category, country) {
    try {
      const response = await axios.get(
        'https://api.influencerdb.com/v1/influencers',
        {
          params: {
            category,
            country,
            min_followers: 10000,
            engagement_rate: '0.03+'
          },
          headers: {
            'Authorization': `Bearer ${this.config.INFLUENCERDB_API_KEY}`
          }
        }
      );
      return response.data.data;
    } catch (error) {
      this.logger.warn(`Influencer search failed: ${error.message}`);
      return [];
    }
  }

  async _contactInfluencer(influencer, product, country) {
    if (!this.config.SENDGRID_API_KEY) throw new Error('SendGrid API key not configured');
    const emailContent = await this._generateInfluencerEmail(influencer, product, country);
    
    await axios.post(
      'https://api.sendgrid.com/v3/mail/send',
      {
        personalizations: [{ to: [{ email: influencer.contact_email }] }],
        from: { email: this.config.STORE_EMAIL, name: this.config.STORE_NAME },
        subject: `Collaboration Opportunity: ${product.title}`,
        content: [{ type: 'text/html', value: emailContent }]
      },
      {
        headers: {
          'Authorization': `Bearer ${this.config.SENDGRID_API_KEY}`, // Corrected typo
          'Content-Type': 'application/json'
        }
      }
    );
  }

  async _generateInfluencerEmail(influencer, product, country) {
    if (!this.config.OPENAI_API_KEY) throw new Error('OpenAI API key not configured');
    const prompt = `Write a professional collaboration email to influencer ${influencer.name} about promoting ${product.title} to their ${country} audience.`;
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500
      },
      {
        headers: {
          'Authorization': `Bearer ${this.config.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data.choices[0].message.content;
  }

  async _postToSocialPlatform(platform, product, country) {
    if (!this.config[`${platform.toUpperCase()}_ACCESS_TOKEN`] && !this.config.TWITTER_BEARER_TOKEN) {
      throw new Error(`${platform} access token not configured`);
    }
    const content = await this._generateSocialMediaContent(platform, product, country);
    
    switch (platform) {
      case 'twitter':
        await axios.post(
          'https://api.twitter.com/2/tweets',
          { text: content },
          {
            headers: {
              'Authorization': `Bearer ${this.config.TWITTER_BEARER_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        );
        break;
        
      case 'linkedin':
        await axios.post(
          'https://api.linkedin.com/v2/ugcPosts',
          {
            author: `urn:li:person:${this.config.LINKEDIN_PERSON_URN}`,
            lifecycleState: 'PUBLISHED',
            specificContent: {
              'com.linkedin.ugc.ShareContent': {
                shareCommentary: { text: content },
                shareMediaCategory: 'NONE'
              }
            },
            visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
          },
          {
            headers: {
              'Authorization': `Bearer ${this.config.LINKEDIN_ACCESS_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        );
        break;
        
      case 'instagram':
        await axios.post(
          `https://graph.facebook.com/v18.0/${this.config.INSTAGRAM_BUSINESS_ACCOUNT_ID}/media`,
          {
            caption: content,
            access_token: this.config.INSTAGRAM_ACCESS_TOKEN
          }
        );
        break;
    }
  }

  async _generateSocialMediaContent(platform, product, country) {
    if (!this.config.OPENAI_API_KEY) throw new Error('OpenAI API key not configured');
    const prompt = `Create a ${platform} post about ${product.title} for ${country} audience. Platform-specific style and hashtags.`;
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 280
      },
      {
        headers: {
          'Authorization': `Bearer ${this.config.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    return response.data.choices[0].message.content;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main EnhancedShopifyAgent Class
class EnhancedShopifyAgent {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.blockchain = new BrianNwaezikeChain(config);
    this.quantumShield = new QuantumShield();
    this.threatDetector = new AIThreatDetector();
    this.walletInitialized = false;
    
    // Update base URL to use STORE_URL
    this.baseURL = this.config.STORE_URL || `https://${config.SHOPIFY_STORE_DOMAIN || DEFAULT_STORE_DOMAIN}.myshopify.com`;
    this.apiVersion = API_VERSION;
    this.lastExecutionTime = DEFAULT_LAST_EXECUTION;
    this.lastStatus = DEFAULT_STATUS;
    this.totalRevenue = DEFAULT_REVENUE;
    
    // Initialize specialized managers
    this.rateLimiter = new RateLimiter(config, logger);
    this.apiQueue = new ApiQueue(config, logger, this.rateLimiter);
    this.contentGenerator = new ContentGenerator(config, logger, this.apiQueue);
    this.backlinkBuilder = new BacklinkBuilder(config, logger, this.apiQueue, this.contentGenerator);
    this.seoManager = new SEOManager(config, logger, this.apiQueue, this.backlinkBuilder);
    this.marketingManager = new MarketingManager(config, logger, this.apiQueue);
    
    // Initialize databases
    this.initDatabases();
  }

  async initializeWalletConnections() {
    this.logger.info('🔗 Initializing multi-chain wallet connections for Shopify Agent...');
    
    try {
      await initializeConnections();
      this.walletInitialized = true;
      this.logger.info('✅ Multi-chain wallet connections initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize wallet connections: ${error.message}`);
    }
  }

  initDatabases() {
    this.db = yourSQLite.createDatabase('./data/shopify_agent.db');
    
    // Core tables
    this.db.run(`
      CREATE TABLE IF NOT EXISTS shopify_products (
        id TEXT PRIMARY KEY, shopify_id TEXT, title TEXT, price REAL,
        cost REAL, margin REAL, country_code TEXT, currency TEXT,
        inventory_quantity INTEGER, quantum_signature TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) WITH OPTIMIZATION=${QUANTUM_COMPRESSION}
    `);
    
    this.db.run(`
      CREATE TABLE IF NOT EXISTS shopify_orders (
        id TEXT PRIMARY KEY, shopify_id TEXT, total_price REAL,
        currency TEXT, financial_status TEXT, fulfillment_status TEXT,
        customer_id TEXT, country_code TEXT, items TEXT, quantum_proof TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) WITH INDEX=${QUANTUM_FAST_LOOKUP}
    `);
    
    this.db.run(`
      CREATE TABLE IF NOT EXISTS country_strategies (
        id TEXT PRIMARY KEY, country_code TEXT, currency TEXT,
        weight REAL, demand_factor REAL, success_rate REAL,
        total_revenue REAL, quantum_seal TEXT,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      ) WITH OPTIMIZATION=${QUANTUM_COMPRESSION}
    `);
    
    this.db.run(`
      CREATE TABLE IF NOT EXISTS revenue_streams (
        id TEXT PRIMARY KEY, source TEXT, amount REAL, currency TEXT,
        country_code TEXT, product_id TEXT, order_id TEXT,
        blockchain_tx_hash TEXT, quantum_signature TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      ) WITH INDEX=${QUANTUM_FAST_LOOKUP}
    `);

    // Initialize specialized manager databases
    this.seoManager.initDatabase(this.db);
    this.marketingManager.initDatabase(this.db);
    this.backlinkBuilder.initDatabase(this.db);
  }

  async _executeMarketingStrategy(product, country) {
    return this.marketingManager.executeStrategy(product, country);
  }

  async _executeSEOOptimization(product, country) {
    return this.seoManager.optimizeProduct(product, country);
  }

  async _buildProductBacklinks(product, country) {
    return this.backlinkBuilder.buildBacklinks(product, country);
  }

  async _trackRealProductSales(product, countryData) {
    try {
      const salesData = await this._fetchRealSalesData(product, countryData.country_code);
      let totalRevenue = 0;
      let totalUnits = 0;

      for (const sale of salesData) {
        const saleId = `sale_${crypto.randomBytes(16).toString('hex')}`;
        const quantumProof = this.quantumShield.createProof(sale);
        
        await this.db.run(`
          INSERT INTO real_sales_data 
          (id, product_id, country_code, quantity, revenue, currency, source, customer_id, quantum_proof, sale_timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          saleId, product.id, countryData.country_code, sale.quantity, 
          sale.revenue, sale.currency, sale.source, sale.customer_id, 
          quantumProof, sale.timestamp
        ]);

        totalRevenue += sale.revenue;
        totalUnits += sale.quantity;
      }

      await this.marketingManager.updateCampaignPerformance(product.id, countryData.country_code, totalRevenue, totalUnits);
      
      if (totalRevenue > 0) {
        await this.marketingManager.processRevenuePayment(
          totalRevenue, 
          countryData.currency, 
          countryData.country_code, 
          product.id
        );
      }

      this.logger.info(`📊 Tracked ${totalUnits} units sold for ${product.title} in ${countryData.country_code}`);
      return totalRevenue;

    } catch (error) {
      this.logger.error(`Sales tracking failed: ${error.message}`);
      return await this._calculateEstimatedSales(product, countryData);
    }
  }

  async _fetchRealSalesData(product, countryCode) {
    return this.apiQueue.enqueue(() => this._fetchSalesData(product, countryCode), 'shopify', 1);
  }

  async _fetchSalesData(product, countryCode) {
    try {
      if (!this.config.STORE_KEY || !this.config.STORE_SECRET) {
        throw new Error('Shopify API credentials not configured');
      }
      const response = await axios.get(
        `${this.baseURL}/admin/api/${this.apiVersion}/orders.json`,
        {
          auth: {
            username: this.config.STORE_KEY,
            password: this.config.STORE_SECRET
          },
          params: {
            financial_status: 'paid',
            fulfillment_status: 'fulfilled',
            created_at_min: new Date(Date.now() - SALES_DATA_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString(),
            limit: SALES_DATA_LIMIT
          },
          timeout: 15000
        }
      );

      const sales = [];
      for (const order of response.data.orders) {
        if (order.shipping_address?.country_code === countryCode) {
          for (const item of order.line_items) {
            if (item.product_id === product.shopify_id) {
              sales.push({
                product_id: product.id,
                quantity: item.quantity,
                revenue: parseFloat(item.price) * item.quantity,
                currency: order.currency,
                source: order.source_name || 'direct',
                customer_id: order.customer?.id,
                timestamp: order.created_at
              });
            }
          }
        }
      }

      return sales;

    } catch (error) {
      if (error.response?.status === 429) {
        await this.rateLimiter.handleRateLimit('shopify');
        return this._fetchSalesData(product, countryCode);
      }
      throw new Error(`Failed to fetch sales data: ${error.message}`);
    }
  }

  async _calculateEstimatedSales(product, countryData) {
    const baseDemand = await this._calculateBaseDemand(product, countryData);
    const priceSensitivity = this._calculatePriceSensitivity(product.price, countryData);
    const seasonalityFactor = this._getSeasonalityFactor();
    const marketingImpact = await this._calculateMarketingImpact(product.id, countryData.country_code);
    
    const estimatedSales = baseDemand * priceSensitivity * seasonalityFactor * marketingImpact;
    const estimatedRevenue = estimatedSales * product.price;

    const estimateId = `estimate_${crypto.randomBytes(16).toString('hex')}`;
    const quantumProof = this.quantumShield.createProof({
      product_id: product.id,
      country: countryData.country_code,
      estimated_sales: estimatedSales,
      estimated_revenue: estimatedRevenue,
      factors: { baseDemand, priceSensitivity, seasonalityFactor, marketingImpact }
    });

    await this.db.run(`
      INSERT INTO real_sales_data 
      (id, product_id, country_code, quantity, revenue, currency, source, quantum_proof)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      estimateId, product.id, countryData.country_code, estimatedSales, 
      estimatedRevenue, countryData.currency, 'estimation', quantumProof
    ]);

    return estimatedRevenue;
  }

  async _calculateBaseDemand(product, countryData) {
    const marketSize = await this._getMarketSize(product.category, countryData.country_code);
    const competitionFactor = await this._getCompetitionFactor(product, countryData.country_code);
    const economicIndicator = this._getEconomicIndicator(countryData.country_code);
    
    return marketSize * competitionFactor * economicIndicator * countryData.success_rate;
  }

  async _calculateMarketingImpact(productId, countryCode) {
    const campaigns = await this.db.all(`
      SELECT * FROM marketing_campaigns 
      WHERE product_id = ? AND country_code = ? AND status = 'active'
    `, [productId, countryCode]);

    let totalImpact = 1.0;
    
    for (const campaign of campaigns) {
      const platformImpact = this._getPlatformImpactFactor(campaign.platform);
      const budgetImpact = Math.log10(campaign.budget + 1) / 2;
      totalImpact *= (1 + (platformImpact * budgetImpact));
    }

    return Math.min(totalImpact, MARKETING_IMPACT_CAP);
  }

  // Utility methods
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _getPlatformImpactFactor(platform) {
    const impacts = {
      'google_ads': 0.8, 'meta_ads': 0.7, 'email': 0.5,
      'social_media': 0.4, 'influencer': 0.6
    };
    return impacts[platform] || 0.3;
  }

  async _getMarketSize(category, countryCode) {
    try {
      if (!this.config.MARKETDATA_API_KEY) throw new Error('MarketData API key not configured');
      const response = await axios.get(
        'https://api.marketdata.com/v1/size',
        {
          params: { category, country: countryCode },
          headers: { 'Authorization': `Bearer ${this.config.MARKETDATA_API_KEY}` }
        }
      );
      return response.data.market_size;
    } catch (error) {
      this.logger.warn(`Market size fetch failed: ${error.message}`);
      return 1000;
    }
  }

  async _getCompetitionFactor(product, countryCode) {
    try {
      if (!this.config.SEMRUSH_API_KEY) throw new Error('SEMRush API key not configured');
      const response = await axios.get(
        'https://api.semrush.com/analytics/v1/',
        {
          params: {
            type: 'domain_organic_search',
            key: this.config.SEMRUSH_API_KEY,
            database: countryCode.toLowerCase(),
            domain: product.category + '.com'
          }
        }
      );
      return 1 - (response.data.competition_index || 0.5);
    } catch (error) {
      this.logger.warn(`Competition analysis failed: ${error.message}`);
      return 0.8;
    }
  }

  async _getEconomicIndicator(countryCode) {
    try {
      const response = await axios.get(
        `https://api.worldbank.org/v2/country/${countryCode}/indicator/NY.GDP.MKTP.CD`
      );
      const gdpData = response.data[1][0];
      return gdpData.value > 1000000000000 ? 1.2 : 1.0;
    } catch (error) {
      this.logger.warn(`Economic indicator fetch failed: ${error.message}`);
      return 1.0;
    }
  }

  _getSeasonalityFactor() {
    const month = new Date().getMonth();
    // Higher in Q4 (holiday season)
    return month >= 9 && month <= 11 ? 1.3 : 
           month >= 5 && month <= 7 ? 1.1 : 1.0;
  }

  _calculatePriceSensitivity(price, countryData) {
    // Price sensitivity based on country economic factors
    return countryData.gdp_per_capita > 30000 ? 0.8 : 1.0;
  }
}

// Export the main class and extension
export { EnhancedShopifyAgent };
export default class apiScoutAgentExtension {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.apiScout = new apiScoutAgent(config, logger);
  }

  async initialize() {
    this.logger.info('🧠 Initializing apiScoutAgentExtension...');
    await this.apiScout.initialize();
  }

  async executeAcrossAllTargets() {
    const discoveredTargets = await this.apiScout.discoverAllAvailableTargets(); // Autonomous discovery

    for (const target of discoveredTargets) {
      try {
        const credentials = await this.apiScout.discoverCredentials(target.type, target.domain);

        if (credentials?.apiKey) {
          this.logger.info(`🔑 Retrieved API key for ${target.type}: ${credentials.apiKey}`);
          await this._executeTargetLogic(target, credentials.apiKey);
        } else {
          this.logger.warn(`⚠️ No valid API key retrieved for ${target.type}`);
        }
      } catch (error) {
        this.logger.error(`❌ Error executing ${target.type}: ${error.message}`);
      }
    }
  }

  async _executeTargetLogic(target, apiKey) {
    const handler = await this.apiScout.loadHandlerFor(target.type);
    if (!handler || typeof handler.execute !== 'function') {
      throw new Error(`No executable handler found for ${target.type}`);
    }

    const result = await handler.execute(apiKey);
    this.logger.info(`📊 Execution result for ${target.type}: ${JSON.stringify(result)}`);
  }
}
