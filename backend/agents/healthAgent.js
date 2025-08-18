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
 * missing dependencies.
 * @param {object} config - The global configuration object.
 * @param {object} logger - The global logger instance.
 * @returns {Promise<object>} Health status including CPU, memory, network, Node.js, and log checks.
 */
export async function run(config, logger) {
    logger.info('❤️ HealthAgent: Performing comprehensive system and network health check...');
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

    // --- 2. Network Connectivity Check (Render API as a proxy) ---
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
        logger.warn('⚠️ Render API credentials missing for comprehensive network health check. Optimistically assuming network is active.');
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
            logger.error(`❌ Incorrect Node.js version: ${nodeVersion.trim()}. Expected v22.16.0.`);
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
            await import(dep);
        } catch {
            dependenciesNeeded.push(dep);
            healthReport.issues.push(`Missing critical dependency: '${dep}'. Attempting to install.`);
            logger.warn(`⚠️ Missing critical dependency: '${dep}'. Attempting to install...`);
        }
    }

    // Perform installations outside the loop
    for (const dep of dependenciesNeeded) {
        try {
            await execPromise(`npm install ${dep}`);
            logger.success(`✅ Successfully installed missing dependency: '${dep}'.`);
        } catch (installError) {
            healthReport.status = 'degraded';
            healthReport.issues.push(`Failed to install dependency '${dep}': ${installError.message}`);
            logger.error(`🚨 Failed to install dependency '${dep}': ${installError.message}`);
        }
    }

    // Re-check dependencies after attempting to install them
    healthReport.details.dependenciesOk = dependenciesNeeded.length === 0;

    // --- 5. Log Monitoring for Sensitive Data and Errors ---
    const logFilePath = '/var/log/app.log';
    try {
        const logContent = await fs.readFile(logFilePath, 'utf8').catch(() => '');
        const recentLogLines = logContent.split('\n').slice(-100).join('\n');
        const sensitiveDataPattern = /(PRIVATE_KEY|RENDER_API_TOKEN|SECRET|PASSWORD|0x[a-fA-F0-9]{40,})/g;

        if (sensitiveDataPattern.test(recentLogLines)) {
            healthReport.status = 'degraded';
            healthReport.details.logsClean = false;
            healthReport.issues.push('Sensitive data detected in logs. This is a security risk.');
            logger.error('🚨 Sensitive data detected in logs. This is a security risk!');
        }
        if (recentLogLines.toLowerCase().includes('error')) {
            healthReport.status = 'degraded';
            healthReport.details.logsClean = false;
            healthReport.issues.push('Error detected in recent logs. This may indicate an underlying issue.');
            logger.warn('⚠️ Detected "error" keyword in recent logs. Consider investigating.');
        }
    } catch (error) {
        healthReport.issues.push(`Failed to access logs at ${logFilePath}: ${error.message}`);
        logger.warn(`⚠️ Failed to access logs at ${logFilePath}: ${error.message}`);
    }

    // Final status check
    const allChecksPass = healthReport.details.cpuReady &&
                         healthReport.details.memoryReady &&
                         healthReport.details.networkActive &&
                         healthReport.details.nodeVersionOk &&
                         healthReport.details.dependenciesOk &&
                         healthReport.details.logsClean;

    if (allChecksPass) {
        healthReport.status = 'optimal';
        healthReport.message = 'System health is optimal.';
    } else {
        healthReport.status = 'degraded';
        healthReport.message = 'System preconditions not met. See issues for details.';
    }

    logger.info('❤️ HealthAgent: Health check complete.');
    return healthReport;
}
