// backend/agents/configAgent.js

import axios from 'axios';

/**
 * @function run
 * @description Monitors system logs for missing configurations and attempts to
 * remediate them by syncing to Render environment variables.
 * @param {object} config - The global configuration object.
 * @param {object} logger - The global logger instance.
 * @param {object} keysToSave - An object containing key-value pairs of new/remediated keys.
 * @returns {Promise<{status: string, message: string}>}
 */
export async function run(config, logger, keysToSave = {}) {
    logger.info('⚙️ ConfigAgent: Checking for missing configurations...');
    if (Object.keys(keysToSave).length === 0) {
        logger.info('No new keys to save. Agent idling.');
        return { status: 'skipped', message: 'No new keys to save.' };
    }

    // Pre-flight check for required Render credentials
    if (!config.RENDER_API_TOKEN || String(config.RENDER_API_TOKEN).includes('PLACEHOLDER')) {
        logger.warn('⚠️ Skipping Render ENV update: RENDER_API_TOKEN is missing or a placeholder. Key persistence is disabled.');
        return { status: 'failed', message: 'Render API token missing.' };
    }
    if (!config.RENDER_SERVICE_ID || String(config.RENDER_SERVICE_ID).includes('PLACEHOLDER')) {
        logger.warn('⚠️ Skipping Render ENV update: RENDER_SERVICE_ID is missing or a placeholder. Key persistence is disabled.');
        return { status: 'failed', message: 'Render Service ID missing.' };
    }

    logger.info(`Attempting to sync ${Object.keys(keysToSave).length} keys to Render environment variables...`);
    try {
        // Step 1: Fetch all existing environment variables from Render
        const currentEnvResponse = await axios.get(
            `https://api.render.com/v1/services/${config.RENDER_SERVICE_ID}/envVars`, {
                headers: {
                    Authorization: `Bearer ${config.RENDER_API_TOKEN}`
                },
                timeout: 15000
            }
        );
        const existingEnvVars = currentEnvResponse.data;

        const updates = [];
        const additions = [];

        // Step 2: Categorize keys as updates or additions
        Object.entries(keysToSave).forEach(([key, value]) => {
            // Only proceed if the value is not a placeholder
            if (!String(value).includes('PLACEHOLDER')) {
                const existingVar = existingEnvVars.find(envVar => envVar.key === key);
                if (existingVar) {
                    updates.push({
                        id: existingVar.id,
                        key: key,
                        value: value
                    });
                } else {
                    additions.push({
                        key: key,
                        value: value
                    });
                }
            }
        });

        // Step 3: Execute PATCH requests for updates
        // NOTE: Executing in a loop is necessary for transactional integrity with the Render API.
        // It's less performant than Promise.all but prevents race conditions or failed batches.
        for (const update of updates) {
            await axios.patch(
                `https://api.render.com/v1/services/${config.RENDER_SERVICE_ID}/envVars/${update.id}`, {
                    value: update.value
                }, {
                    headers: {
                        Authorization: `Bearer ${config.RENDER_API_TOKEN}`
                    },
                    timeout: 10000
                }
            );
            // SECURITY NOTE: Do not log the actual value, only the key
            logger.info(`🔄 Updated Render ENV var: ${update.key}`);
        }

        // Step 4: Execute POST requests for new additions
        for (const addition of additions) {
            await axios.post(
                `https://api.render.com/v1/services/${config.RENDER_SERVICE_ID}/envVars`, {
                    key: addition.key,
                    value: addition.value,
                }, {
                    headers: {
                        Authorization: `Bearer ${config.RENDER_API_TOKEN}`
                    },
                    timeout: 10000
                }
            );
            // SECURITY NOTE: Do not log the actual value, only the key
            logger.info(`➕ Added Render ENV var: ${addition.key}`);
        }

        logger.success(`🔄 Successfully synced ${updates.length + additions.length} new/updated keys to Render ENV.`);
        return { status: 'success', message: 'Keys synced to Render.' };

    } catch (envUpdateError) {
        if (envUpdateError.response) {
            const status = envUpdateError.response.status;
            let errorMessage = `API Error: Status ${status}`;
            if (status === 401) {
                errorMessage += '. Check if RENDER_API_TOKEN is valid.';
            } else if (status === 403) {
                errorMessage += '. Check if the API token has correct permissions or the service ID is correct.';
            } else {
                errorMessage += `. Data: ${JSON.stringify(envUpdateError.response.data)}`;
            }
            logger.error(`🚨 Failed to set Render ENV var: ${errorMessage}`);
            logger.warn('⚠️ This is CRITICAL for persistent learning and autonomous evolution. Please fix manually.');
        } else {
            logger.error(`🚨 Failed to set Render ENV var: ${envUpdateError.message}`);
        }
        return { status: 'failed', error: envUpdateError.message };
    }
}
