// backend/agents/configAgent.js
import axios from 'axios';

/**
 * @function run
 * @description Comprehensive configuration agent for all autonomous revenue system agents.
 * Validates configuration for all agents and ensures proper setup.
 * @param {object} config - The global configuration object.
 * @param {object} logger - The global logger instance.
 * @returns {Promise<{status: string, message: string}>}
 */
export async function run(config, logger) {
    logger.info('⚙️ ConfigAgent: Starting comprehensive configuration check for all agents...');

    // Define essential configuration for each agent
    const agentConfigurations = {
        // Core System & Payout Agent
        payoutAgent: {
            required: ['COMPANY_WALLET_ADDRESS', 'COMPANY_WALLET_PRIVATE_KEY'],
            optional: ['USE_FALLBACK_PAYOUT']
        },
        
        // Data Agent
        dataAgent: {
            required: ['REDIS_URL'],
            optional: ['GITHUB_TOKEN', 'ALPHAVANTAGE_API_KEY', 'NEWS_API_KEY']
        },
        
        // Shopify Agent
        shopifyAgent: {
            required: ['SHOPIFY_STORE_DOMAIN', 'SHOPIFY_API_KEY', 'SHOPIFY_PASSWORD'],
            optional: []
        },
        
        // Browser Manager
        browserManager: {
            required: [],
            optional: ['BROWSER_HEADLESS', 'PROXY_LIST']
        },
        
        // Ad Revenue Agent
        adRevenueAgent: {
            required: [],
            optional: ['GOOGLE_ADS_API_KEY', 'META_ADS_API_KEY']
        },
        
        // API Scout Agent
        apiScoutAgent: {
            required: [],
            optional: ['RAPIDAPI_KEY', 'API_NINJAS_KEY']
        },
        
        // Crypto Agent
        cryptoAgent: {
            required: [],
            optional: ['COINMARKETCAP_API_KEY', 'CRYPTO_COMPARE_API_KEY']
        },
        
        // Forex Signal Agent
        forexSignalAgent: {
            required: [],
            optional: ['FOREX_API_KEY', 'OANDA_API_KEY']
        },
        
        // Social Agent
        socialAgent: {
            required: [],
            optional: ['TWITTER_API_KEY', 'LINKEDIN_API_KEY', 'INSTAGRAM_API_KEY']
        }
    };

    // Check configuration for all agents
    const configResults = {};
    let hasCriticalErrors = false;
    let hasWarnings = false;

    for (const [agentName, agentConfig] of Object.entries(agentConfigurations)) {
        const result = {
            agent: agentName,
            missingRequired: [],
            missingOptional: [],
            status: 'optimal'
        };

        // Check required configuration
        for (const configKey of agentConfig.required) {
            const value = process.env[configKey] || config[configKey];
            if (!value || String(value).includes('PLACEHOLDER')) {
                result.missingRequired.push(configKey);
            }
        }

        // Check optional configuration
        for (const configKey of agentConfig.optional) {
            const value = process.env[configKey] || config[configKey];
            if (!value || String(value).includes('PLACEHOLDER')) {
                result.missingOptional.push(configKey);
            }
        }

        // Determine status
        if (result.missingRequired.length > 0) {
            result.status = 'critical';
            hasCriticalErrors = true;
        } else if (result.missingOptional.length > 0) {
            result.status = 'degraded';
            hasWarnings = true;
        }

        configResults[agentName] = result;
    }

    // Log results
    for (const [agentName, result] of Object.entries(configResults)) {
        if (result.status === 'critical') {
            logger.error(`❌ ${agentName}: Missing required config - ${result.missingRequired.join(', ')}`);
        } else if (result.status === 'degraded') {
            logger.warn(`⚠️ ${agentName}: Missing optional config - ${result.missingOptional.join(', ')}`);
        } else {
            logger.success(`✅ ${agentName}: Configuration optimal`);
        }
    }

    // Optional: Sync to Render if credentials are available
    if (config.RENDER_API_TOKEN && config.RENDER_SERVICE_ID && 
        !String(config.RENDER_API_TOKEN).includes('PLACEHOLDER') &&
        !String(config.RENDER_SERVICE_ID).includes('PLACEHOLDER')) {
        
        try {
            await syncToRender(config, logger);
        } catch (error) {
            // Non-critical error - just log it
            logger.warn(`Render sync failed: ${error.message}`);
        }
    }

    // Return appropriate status
    if (hasCriticalErrors) {
        return { 
            status: 'failed', 
            message: 'Critical configuration errors detected. Some agents cannot function.',
            details: configResults
        };
    } else if (hasWarnings) {
        return { 
            status: 'degraded', 
            message: 'Configuration warnings detected. Some features may be limited.',
            details: configResults
        };
    } else {
        return { 
            status: 'success', 
            message: 'All agent configurations verified successfully',
            details: configResults
        };
    }
}

/**
 * @function syncToRender
 * @description Sync essential configuration to Render deployment platform
 */
async function syncToRender(config, logger) {
    logger.info('ConfigAgent: Syncing configuration to Render...');
    
    try {
        // Get all essential environment variables
        const essentialEnvVars = {};
        
        // Collect all configuration from process.env and config object
        for (const key in process.env) {
            if (key.startsWith('COMPANY_') || 
                key.startsWith('SHOPIFY_') || 
                key.startsWith('REDIS_') ||
                key.endsWith('_API_KEY') ||
                key.endsWith('_TOKEN')) {
                essentialEnvVars[key] = process.env[key];
            }
        }

        // Also include config object values
        for (const key in config) {
            if (key.startsWith('COMPANY_') || 
                key.startsWith('SHOPIFY_') || 
                key.startsWith('REDIS_') ||
                key.endsWith('_API_KEY') ||
                key.endsWith('_TOKEN')) {
                essentialEnvVars[key] = config[key];
            }
        }

        // Fetch current environment variables from Render
        const currentEnvResponse = await axios.get(
            `https://api.render.com/v1/services/${config.RENDER_SERVICE_ID}/envVars`, {
                headers: {
                    Authorization: `Bearer ${config.RENDER_API_TOKEN}`
                },
                timeout: 10000
            }
        );

        const existingEnvVars = currentEnvResponse.data;

        // Sync essential configuration to Render
        for (const [key, value] of Object.entries(essentialEnvVars)) {
            if (!value || String(value).includes('PLACEHOLDER')) continue;

            const existingVar = existingEnvVars.find(envVar => envVar.key === key);
            
            if (existingVar) {
                // Update existing variable if value changed
                if (existingVar.value !== value) {
                    await axios.patch(
                        `https://api.render.com/v1/services/${config.RENDER_SERVICE_ID}/envVars/${existingVar.id}`, {
                            value: value
                        }, {
                            headers: {
                                Authorization: `Bearer ${config.RENDER_API_TOKEN}`
                            },
                            timeout: 10000
                        }
                    );
                    logger.info(`🔄 Updated Render ENV var: ${key}`);
                }
            } else {
                // Add new variable
                await axios.post(
                    `https://api.render.com/v1/services/${config.RENDER_SERVICE_ID}/envVars`, {
                        key: key,
                        value: value,
                    }, {
                        headers: {
                            Authorization: `Bearer ${config.RENDER_API_TOKEN}`
                        },
                        timeout: 10000
                    }
                );
                logger.info(`➕ Added Render ENV var: ${key}`);
            }
        }

        logger.success('✅ Configuration synced to Render successfully');

    } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
            const status = error.response.status;
            let errorMessage = `API Error: Status ${status}`;
            
            if (status === 401) {
                errorMessage += '. Check if RENDER_API_TOKEN is valid.';
            } else if (status === 403) {
                errorMessage += '. Check API token permissions.';
            } else if (status === 404) {
                errorMessage += '. Service not found. Check RENDER_SERVICE_ID.';
            }
            
            logger.warn(`Render sync warning: ${errorMessage}`);
        } else {
            logger.warn(`Render sync warning: ${error.message}`);
        }
        throw error;
    }
}

/**
 * @function getStatus
 * @description Returns the current status of the configuration agent
 */
export function getStatus() {
    // Simplified status check for dashboard
    const essentialConfig = {
        'COMPANY_WALLET_ADDRESS': !!process.env.COMPANY_WALLET_ADDRESS,
        'COMPANY_WALLET_PRIVATE_KEY': !!process.env.COMPANY_WALLET_PRIVATE_KEY,
        'REDIS_URL': !!process.env.REDIS_URL,
        'SHOPIFY_API_KEY': !!process.env.SHOPIFY_API_KEY
    };

    const missingConfig = Object.entries(essentialConfig)
        .filter(([key, configured]) => !configured)
        .map(([key]) => key);

    return {
        status: missingConfig.length === 0 ? 'optimal' : 'degraded',
        missingConfig: missingConfig,
        lastChecked: new Date().toISOString(),
        timestamp: new Date().toISOString()
    };
}

/**
 * @function validateConfig
 * @description Validates a specific configuration key-value pair
 */
export function validateConfig(key, value) {
    const validators = {
        'COMPANY_WALLET_ADDRESS': (val) => val.startsWith('0x') && val.length === 42,
        'COMPANY_WALLET_PRIVATE_KEY': (val) => val.startsWith('0x') && val.length === 64,
        'REDIS_URL': (val) => val.startsWith('redis://'),
        'SHOPIFY_STORE_DOMAIN': (val) => val.endsWith('.myshopify.com'),
        'SHOPIFY_API_KEY': (val) => val.length === 32,
        'SHOPIFY_PASSWORD': (val) => val.length > 10
    };

    if (validators[key]) {
        return validators[key](value);
    }

    // Default validation for other keys
    return value && !String(value).includes('PLACEHOLDER') && value.length > 0;
}

/**
 * @function getConfigSummary
 * @description Returns a summary of the current configuration state
 */
export function getConfigSummary() {
    const allConfig = {
        ...process.env,
        ...Object.fromEntries(
            Object.entries(global.CONFIG || {}).filter(([key]) => 
                !key.startsWith('_') && key !== 'CONFIG'
            )
        )
    };

    const summary = {};
    for (const [key, value] of Object.entries(allConfig)) {
        if (key.startsWith('COMPANY_') || 
            key.startsWith('SHOPIFY_') || 
            key.startsWith('REDIS_') ||
            key.endsWith('_API_KEY') ||
            key.endsWith('_TOKEN')) {
            
            summary[key] = {
                value: key.includes('PRIVATE_KEY') || key.includes('SECRET') ? '••••••••' : value,
                configured: !!value && !String(value).includes('PLACEHOLDER'),
                validated: validateConfig(key, value)
            };
        }
    }

    return summary;
}
