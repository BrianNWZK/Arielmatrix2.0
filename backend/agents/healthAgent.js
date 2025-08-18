// backend/agents/healthAgent.js

import axios from 'axios';
import * as os from 'os';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs/promises';

const execPromise = util.promisify(exec);

/**
 * @function run
 * @description Performs a comprehensive health check, including self-healing for
 * missing dependencies and re-evaluating the system state after a fix.
 * @param {object} config - The global configuration object.
 * @param {object} logger - The global logger instance.
 * @returns {Promise<object>} Health status including CPU, memory, network, Node.js, and log checks.
 */
export async function run(config, logger) {
    logger.info('❤️ HealthAgent: Performing comprehensive system and network health check...');

    // This is the novel self-correction loop
    let attempts = 0;
    const maxAttempts = 2;
    let finalReport = { status: 'degraded', issues: [] };

    while (attempts < maxAttempts) {
        let healthReport = {
            status: 'optimal',
            issues: [],
            details: {
                cpuReady: false,
                memoryReady: false,
                networkActive: false,
                nodeVersionOk: false,
                dependenciesOk: false,
                logsClean: true,
                rawMemory: {},
                rawCpu: {}
            }
        };

        // --- 1. System Resource Check (CPU & Memory) ---
        const cpuInfo = os.loadavg();
        const cpuLoad = cpuInfo[0];
        const cpuCount = os.cpus().length;
        healthReport.details.rawCpu = { count: cpuCount, load: cpuInfo };

        if (cpuLoad < cpuCount * 0.8) {
            healthReport.details.cpuReady = true;
        } else {
            healthReport.status = 'degraded';
            healthReport.issues.push(`High CPU load detected: ${cpuLoad.toFixed(2)} (1-min average). System might be stressed.`);
            logger.warn(`⚠️ High CPU load detected: ${cpuLoad.toFixed(2)} (1-min average). System might be stressed.`);
        }

        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const memoryUsagePercentage = (1 - (freeMemory / totalMemory)) * 100;
        const mem = process.memoryUsage();
        healthReport.details.rawMemory = { ...mem };

        if (memoryUsagePercentage < 85) {
            healthReport.details.memoryReady = true;
        } else {
            healthReport.status = 'degraded';
            healthReport.issues.push(`High Memory usage detected: ${memoryUsagePercentage.toFixed(2)}%.`);
            logger.warn(`⚠️ High Memory usage detected: ${memoryUsagePercentage.toFixed(2)}%.`);
        }

        // --- 2. Network Connectivity Check ---
        if (config.RENDER_API_TOKEN && config.RENDER_SERVICE_ID &&
            !String(config.RENDER_API_TOKEN).includes('PLACEHOLDER') &&
            !String(config.RENDER_SERVICE_ID).includes('PLACEHOLDER')) {
            try {
                await axios.get(`https://api.render.com/v1/services/${config.RENDER_SERVICE_ID}`, {
                    headers: { 'Authorization': `Bearer ${config.RENDER_API_TOKEN}` },
                    timeout: 5000
                });
                healthReport.details.networkActive = true;
                logger.info('✅ Network health check to Render API successful.');
            } catch (error) {
                healthReport.status = 'degraded';
                healthReport.issues.push(`Network health check to Render API failed: ${error.message}`);
                logger.warn(`⚠️ Network health check to Render API failed: ${error.message}`);
            }
        } else {
            logger.warn('⚠️ Render API credentials missing. Optimistically assuming network is active.');
            healthReport.details.networkActive = true;
        }

        // --- 3. Node.js Version Check ---
        try {
            const { stdout: nodeVersion } = await execPromise('node -v');
            if (nodeVersion.includes('v22.16.0')) {
                healthReport.details.nodeVersionOk = true;
                logger.info(`✅ Node.js version ${nodeVersion.trim()} is optimal.`);
            } else {
                healthReport.status = 'degraded';
                healthReport.issues.push(`Incorrect Node.js version detected: ${nodeVersion.trim()}. Expected v22.16.0.`);
                logger.error(`❌ Incorrect Node.js version: ${nodeVersion.trim()}.`);
            }
        } catch (error) {
            healthReport.status = 'degraded';
            healthReport.issues.push(`Failed to check Node.js version: ${error.message}`);
            logger.error(`🚨 Failed to check Node.js version: ${error.message}`);
        }

        // --- 4. Critical Dependency Check and Self-Healing Installation ---
        const criticalDependencies = ['terser', 'puppeteer'];
        let dependenciesNeeded = [];

        for (const dep of criticalDependencies) {
            try {
                // Check if the dependency is importable
                await import(dep);
            } catch {
                dependenciesNeeded.push(dep);
            }
        }

        // Only attempt to install if dependencies are needed
        if (dependenciesNeeded.length > 0) {
            logger.warn(`⚠️ Missing critical dependencies: ${dependenciesNeeded.join(', ')}. Attempting to install...`);
            healthReport.status = 'degraded'; // Set to degraded if a fix is needed
            for (const dep of dependenciesNeeded) {
                try {
                    await execPromise(`npm install ${dep}`);
                    logger.success(`✅ Successfully installed missing dependency: '${dep}'.`);
                } catch (installError) {
                    healthReport.issues.push(`Failed to install dependency '${dep}': ${installError.message}`);
                    logger.error(`🚨 Failed to install dependency '${dep}': ${installError.message}`);
                }
            }
            // After attempting to fix, we break the loop to re-run the entire health check.
            finalReport = healthReport;
            attempts++;
            continue; // Continue to the next loop iteration (re-run the check)
        }

        healthReport.details.dependenciesOk = true;

        // --- 5. Log Monitoring for Sensitive Data and Errors ---
        const logFilePath = '/var/log/app.log';
        try {
            const logContent = await fs.readFile(logFilePath, 'utf8').catch(() => '');
            const recentLogLines = logContent.split('\n').slice(-100).join('\n');
            const sensitiveDataPattern = /(PRIVATE_KEY|RENDER_API_TOKEN|SECRET|PASSWORD|0x[a-fA-F0-9]{40,})/g;

            if (sensitiveDataPattern.test(recentLogLines)) {
                healthReport.status = 'degraded';
                healthReport.details.logsClean = false;
                healthReport.issues.push('Sensitive data detected in logs. Security risk.');
                logger.error('🚨 Sensitive data detected in logs. Security risk!');
            }
            if (recentLogLines.toLowerCase().includes('error')) {
                healthReport.status = 'degraded';
                healthReport.details.logsClean = false;
                healthReport.issues.push('Error detected in recent logs.');
                logger.warn('⚠️ Detected "error" keyword in recent logs.');
            }
        } catch (error) {
            healthReport.issues.push(`Failed to access logs at ${logFilePath}: ${error.message}`);
            logger.warn(`⚠️ Failed to access logs at ${logFilePath}: ${error.message}`);
        }

        // Check if all conditions are met for 'optimal' status
        if (healthReport.details.cpuReady && healthReport.details.memoryReady &&
            healthReport.details.networkActive && healthReport.details.nodeVersionOk &&
            healthReport.details.dependenciesOk && healthReport.details.logsClean) {
            healthReport.status = 'optimal';
            healthReport.message = 'System health is optimal.';
        } else {
            healthReport.status = 'degraded';
            healthReport.message = 'System preconditions not met. See issues for details.';
        }

        // If we reach here and the status is optimal, we can break the loop.
        finalReport = healthReport;
        if (finalReport.status === 'optimal') {
            break;
        }

        attempts++;
    }

    logger.info('❤️ HealthAgent: Health check complete.');
    return finalReport;
}
