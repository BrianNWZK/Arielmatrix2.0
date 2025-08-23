// backend/agents/configAgent.js

import axios from 'axios';

/**
 * @function run
 * @description Simplified configuration agent for BrianNwaezikeChain integration.
 * Only handles essential configuration updates needed for the blockchain system.
 * @param {object} config - The global configuration object.
 * @param {object} logger - The global logger instance.
 * @returns {Promise<{status: string, message: string}>}
 */
export async function run(config, logger) {
    logger.info('⚙️ ConfigAgent: Starting configuration check for BrianNwaezikeChain...');

    // Check for essential BrianNwaezikeChain configuration
    const essentialConfig = {
        'COMPANY_WALLET_ADDRESS': process.env.COMPANY_WALLET_ADDRESS,
        'COMPANY_WALLET_PRIVATE_KEY': process.env.COMPANY_WALLET_PRIVATE_KEY,
        'USE_FALLBACK_PAYOUT': process.env.USE_FALLBACK_PAYOUT || 'false'
    };

    // Check if essential configuration is missing
    const missingConfig = Object.entries(essentialConfig)
        .filter(([key, value]) => !value || value.includes('PLACEHOLDER'))
        .map(([key]) => key);

    if (missingConfig.length > 0) {
        logger.warn(`⚠️ Missing essential BrianNwaezikeChain configuration: ${missingConfig.join(', ')}`);
        return { 
            status: 'failed', 
            message: `Missing essential configuration: ${missingConfig.join(', ')}` 
        };
    }

    logger.success('✅ All essential BrianNwaezikeChain configuration is present');

    // Optional: Sync to Render if credentials are available (but not required)
    if (config.RENDER_API_TOKEN && config.RENDER_SERVICE_ID && 
        !String(config.RENDER_API_TOKEN).includes('PLACEHOLDER') &&
        !String(config.RENDER_SERVICE_ID).includes('PLACEHOLDER')) {
        
        try {
            await syncToRender(config, logger, essentialConfig);
        } catch (error) {
            // Non-critical error - just log it
            logger.warn(`Render sync failed: ${error.message}`);
        }
    }

    return { 
        status: 'success', 
        message: 'BrianNwaezikeChain configuration verified successfully' 
    };
}

/**
 * @function syncToRender
 * @description Optional function to sync configuration to Render (if credentials available)
 */
async function syncToRender(config, logger, essentialConfig) {
    logger.info('ConfigAgent: Attempting to sync configuration to Render...');
    
    try {
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
        for (const [key, value] of Object.entries(essentialConfig)) {
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
            }
            
            logger.warn(`Render sync warning: ${errorMessage}`);
        } else {
            logger.warn(`Render sync warning: ${error.message}`);
        }
        throw error; // Re-throw for caller to handle
    }
}

/**
 * @function getStatus
 * @description Returns the current status of the configuration agent
 */
export function getStatus() {
    const essentialConfig = {
        'COMPANY_WALLET_ADDRESS': !!process.env.COMPANY_WALLET_ADDRESS,
        'COMPANY_WALLET_PRIVATE_KEY': !!process.env.COMPANY_WALLET_PRIVATE_KEY,
        'USE_FALLBACK_PAYOUT': true // Always considered configured (has default)
    };

    const missingConfig = Object.entries(essentialConfig)
        .filter(([key, configured]) => !configured)
        .map(([key]) => key);

    return {
        status: missingConfig.length === 0 ? 'optimal' : 'degraded',
        missingConfig: missingConfig,
        lastChecked: new Date().toISOString()
    };
}
