// backend/agents/healthAgent.js

import axios from 'axios';
import * as os from 'os';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs/promises';
import path from 'path';

const execPromise = util.promisify(exec);

// Novel Solution: Stateful variable to track persistent issues
let persistentIssues = {
    highCpu: 0
};
// Allow up to 3 consecutive high CPU readings before marking as degraded
const CPU_TOLERANCE_COUNT = 3;

// Novel Solution: A simple, reliable "Dumb" System check for dependency presence
async function checkDependency(depName) {
    try {
        // Use `npm ls` to check the dependency tree without a process restart
        const { stdout } = await execPromise(`npm ls ${depName} --json`);
        const result = JSON.parse(stdout);
        // The check should pass if the dependency is listed
        if (result.dependencies && result.dependencies[depName]) {
            return true;
        }
    } catch (e) {
        // `npm ls` throws an error if the package is not found
        return false;
    }
    return false;
}

/**
 * @function run
 * @description Performs a comprehensive health check, including self-healing for
 * missing dependencies and re-evaluating the system state after a fix.
 * It now applies dynamic tolerance for transient resource issues like high CPU load.
 * @param {object} config - The global configuration object.
 * @param {object} logger - The global logger instance.
 * @returns {Promise<object>} Health status including CPU, memory, network, Node.js, and log checks.
 */
export async function run(config, logger) {
    logger.info('❤️ HealthAgent: Performing comprehensive system and network health check...');

    // Self-correction loop for dependencies (maxAttempts for re-evaluation after fixes)
    let attempts = 0;
    const maxAttempts = 2; // Allows one re-check after potential dependency installs
    let finalReport = { status: 'degraded', issues: [] }; // Default to degraded, will become optimal if all checks pass

    while (attempts < maxAttempts) {
        let currentHealthReport = {
            cpuReady: false,
            memoryReady: false,
            networkActive: false,
            nodeVersionOk: false,
            dependenciesOk: false,
            logsClean: true,
            rawMemory: {},
            rawCpu: {}
        };
        let currentIssues = []; // Collect issues for this specific iteration

        // --- 1. System Resource Check (CPU & Memory) ---
        const cpuInfo = os.loadavg();
        const cpuLoad = cpuInfo[0];
        const cpuCount = os.cpus().length;
        currentHealthReport.rawCpu = { count: cpuCount, load: cpuInfo };

        if (cpuLoad < cpuCount * 0.8) {
            currentHealthReport.cpuReady = true;
            persistentIssues.highCpu = 0; // Reset counter if CPU is normal
        } else {
            persistentIssues.highCpu++;
            currentIssues.push(`High CPU load detected: ${cpuLoad.toFixed(2)} (1-min average). System might be stressed. Attempt ${persistentIssues.highCpu}/${CPU_TOLERANCE_COUNT}.`);
            logger.warn(`⚠️ High CPU load detected: ${cpuLoad.toFixed(2)} (1-min average). System might be stressed. Attempt ${persistentIssues.highCpu}/${CPU_TOLERANCE_COUNT}.`);

            if (persistentIssues.highCpu >= CPU_TOLERANCE_COUNT) {
                currentHealthReport.cpuReady = false;
                currentIssues.push(`Critical: High CPU load persisted for ${persistentIssues.highCpu} cycles. Aborting cycle.`);
                logger.error(`🚨 High CPU load persisted: ${cpuLoad.toFixed(2)}. Aborting cycle.`);
            } else {
                currentHealthReport.cpuReady = true;
            }
        }

        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const memoryUsagePercentage = (1 - (freeMemory / totalMemory)) * 100;
        const mem = process.memoryUsage();
        currentHealthReport.rawMemory = { ...mem };

        if (memoryUsagePercentage < 85) {
            currentHealthReport.memoryReady = true;
        } else {
            currentIssues.push(`High Memory usage detected: ${memoryUsagePercentage.toFixed(2)}%. System might be stressed.`);
            logger.warn(`⚠️ High Memory usage detected: ${memoryUsagePercentage.toFixed(2)}%. System might be stressed.`);
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
                currentHealthReport.networkActive = true;
                logger.info('✅ Network health check to Render API successful.');
            } catch (error) {
                currentIssues.push(`Network health check to Render API failed: ${error.message}`);
                logger.warn(`⚠️ Network health check to Render API failed: ${error.message}`);
            }
        } else {
            logger.warn('⚠️ Render API credentials missing. Optimistically assuming network is active.');
            currentHealthReport.networkActive = true;
        }

        // --- 3. Node.js Version Check ---
        try {
            const { stdout: nodeVersion } = await execPromise('node -v');
            if (nodeVersion.includes('v22.16.0')) {
                currentHealthReport.nodeVersionOk = true;
                logger.info(`✅ Node.js version ${nodeVersion.trim()} is optimal.`);
            } else {
                currentIssues.push(`Incorrect Node.js version detected: ${nodeVersion.trim()}. Expected v22.16.0.`);
                logger.error(`❌ Incorrect Node.js version: ${nodeVersion.trim()}.`);
            }
        } catch (error) {
            currentIssues.push(`Failed to check Node.js version: ${error.message}`);
            logger.error(`🚨 Failed to check Node.js version: ${error.message}`);
        }

        // --- 4. Critical Dependency Check and Self-Healing Installation ---
        const criticalDependencies = ['terser', 'puppeteer'];
        let dependenciesNeeded = [];

        for (const dep of criticalDependencies) {
            // Using the new, robust check
            const isInstalled = await checkDependency(dep);
            if (!isInstalled) {
                dependenciesNeeded.push(dep);
            }
        }

        if (dependenciesNeeded.length > 0) {
            currentIssues.push(`Missing critical dependencies: ${dependenciesNeeded.join(', ')}. Attempting to install.`);
            logger.warn(`⚠️ Missing critical dependencies: ${dependenciesNeeded.join(', ')}. Attempting to install...`);
            
            for (const dep of dependenciesNeeded) {
                try {
                    await execPromise(`npm install ${dep}`);
                    logger.success(`✅ Successfully installed missing dependency: '${dep}'.`);
                } catch (installError) {
                    currentIssues.push(`Failed to install dependency '${dep}': ${installError.message}`);
                    logger.error(`🚨 Failed to install dependency '${dep}': ${installError.message}`);
                }
            }
            // After attempting to fix, we continue to the next loop iteration (re-run the check)
            attempts++;
            continue;
        }
        currentHealthReport.dependenciesOk = true;

        // --- 5. Log Monitoring for Sensitive Data and Errors ---
        const logFilePath = '/var/log/app.log';
        try {
            const logContent = await fs.readFile(logFilePath, 'utf8').catch(() => '');
            const recentLogLines = logContent.split('\n').slice(-100).join('\n');
            const sensitiveDataPattern = /(PRIVATE_KEY|RENDER_API_TOKEN|SECRET|PASSWORD|0x[a-fA-F0-9]{40,})/g;

            if (sensitiveDataPattern.test(recentLogLines)) {
                currentHealthReport.logsClean = false;
                currentIssues.push('Sensitive data detected in logs. Security risk.');
                logger.error('🚨 Sensitive data detected in logs. Security risk!');
            }
            if (recentLogLines.toLowerCase().includes('error')) {
                currentHealthReport.logsClean = false;
                currentIssues.push('Error detected in recent logs.');
                logger.warn('⚠️ Detected "error" keyword in recent logs.');
            }
        } catch (error) {
            currentIssues.push(`Failed to access logs at ${logFilePath}: ${error.message}`);
            logger.warn(`⚠️ Failed to access logs at ${logFilePath}: ${error.message}`);
        }

        const allChecksPass = currentHealthReport.cpuReady && currentHealthReport.memoryReady &&
                             currentHealthReport.networkActive && currentHealthReport.nodeVersionOk &&
                             currentHealthReport.dependenciesOk && currentHealthReport.logsClean;

        if (allChecksPass && currentIssues.length === 0) {
            finalReport = {
                status: 'optimal',
                message: 'System health is optimal.',
                details: currentHealthReport,
                issues: currentIssues
            };
            break;
        } else {
            finalReport = {
                status: 'degraded',
                message: 'System preconditions not met. See issues for details.',
                details: currentHealthReport,
                issues: currentIssues
            };
        }
        
        attempts++;
    }

    logger.info('❤️ HealthAgent: Health check complete.');
    return finalReport;
}
