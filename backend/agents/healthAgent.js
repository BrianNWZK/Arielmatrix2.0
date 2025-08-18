// backend/agents/healthAgent.js
import axios from 'axios';
import * as os from 'os';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs/promises'; // For log file operations

const execPromise = util.promisify(exec);

/**
 * @function run
 * @description Performs a comprehensive health check on critical external services,
 * local system resources (CPU, memory), Node.js environment, and application logs.
 * It also attempts to install missing critical dependencies.
 * @param {object} config - The global configuration object.
 * @param {object} logger - The global logger instance.
 * @returns {Promise<object>} Health status including CPU, memory, network, Node.js, and log checks.
 */
export async function run(config, logger) {
    logger.info('❤️ HealthAgent: Performing comprehensive system and network health check...');
    let stable = true;
    const healthReport = {
        cpuReady: false,
        memoryReady: false,
        networkActive: false,
        nodeVersionOk: false,
        dependenciesOk: false,
        logsClean: true, // Optimistic default
        rawMemory: {},
        rawCpu: {},
        issues: []
    };

    // --- 1. System Resource Check (CPU & Memory) ---
    const cpuInfo = os.loadavg();
    const cpuLoad = cpuInfo[0];
    const cpuCount = os.cpus().length;
    healthReport.rawCpu = { count: cpuCount, load: cpuInfo };

    if (cpuLoad < cpuCount * 0.8) {
        healthReport.cpuReady = true;
    } else {
        stable = false;
        healthReport.issues.push(`High CPU load detected: ${cpuLoad.toFixed(2)} (1-min average). System might be stressed.`);
        logger.warn(`⚠️ High CPU load detected: ${cpuLoad.toFixed(2)} (1-min average). System might be stressed.`);
    }

    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const memoryUsagePercentage = (1 - (freeMemory / totalMemory)) * 100;
    const mem = process.memoryUsage();
    healthReport.rawMemory = {
        rss: mem.rss,
        heapTotal: mem.heapTotal,
        heapUsed: mem.heapUsed,
        external: mem.external,
        arrayBuffers: mem.arrayBuffers
    };

    if (memoryUsagePercentage < 85) {
        healthReport.memoryReady = true;
    } else {
        stable = false;
        healthReport.issues.push(`High Memory usage detected: ${memoryUsagePercentage.toFixed(2)}%. System might be stressed.`);
        logger.warn(`⚠️ High Memory usage detected: ${memoryUsagePercentage.toFixed(2)}%. System might be stressed.`);
    }

    // --- 2. Network Connectivity Check (Render API as a proxy) ---
    if (config.RENDER_API_TOKEN && config.RENDER_SERVICE_ID &&
        !String(config.RENDER_API_TOKEN).includes('PLACEHOLDER') &&
        !String(config.RENDER_SERVICE_ID).includes('PLACEHOLDER')) {
        try {
            await axios.get(`https://api.render.com/v1/services/${config.RENDER_SERVICE_ID}`, {
                headers: {
                    'Authorization': `Bearer ${config.RENDER_API_TOKEN}`
                },
                timeout: 5000
            });
            healthReport.networkActive = true;
            logger.info('✅ Network health check to Render API successful.');
        } catch (error) {
            stable = false;
            healthReport.issues.push(`Network health check to Render API failed: ${error.message}`);
            logger.warn(`⚠️ Network health check to Render API failed: ${error.message}`);
        }
    } else {
        logger.warn('⚠️ Render API credentials missing for comprehensive network health check. Optimistically assuming network is active.');
        healthReport.networkActive = true; // Optimistically assume true if no specific check is possible
    }

    // --- 3. Node.js Version Check ---
    try {
        const { stdout: nodeVersion } = await execPromise('node -v');
        // Check for specific version as per request, e.g., 'v20.x.x'
        if (nodeVersion.includes('v22.16.0')) { // Assuming target Node.js version is v22.16.0
            healthReport.nodeVersionOk = true;
            logger.info(`✅ Node.js version ${nodeVersion.trim()} is optimal.`);
        } else {
            stable = false;
            healthReport.issues.push(`Incorrect Node.js version detected: ${nodeVersion.trim()}. Expected v22.16.0.`);
            logger.error(`❌ Incorrect Node.js version: ${nodeVersion.trim()}. Expected v22.16.0.`);
        }
    } catch (error) {
        stable = false;
        healthReport.issues.push(`Failed to check Node.js version: ${error.message}`);
        logger.error(`🚨 Failed to check Node.js version: ${error.message}`);
    }

    // --- 4. Critical Dependency Check and Self-Healing Installation ---
    const criticalDependencies = ['terser', 'puppeteer']; // Assuming these are critical
    let allDependenciesOk = true;
    for (const dep of criticalDependencies) {
        try {
            // Attempt to import to check if it's available
            await import(dep);
            logger.debug(`Dependency '${dep}' is installed.`);
        } catch {
            stable = false;
            allDependenciesOk = false;
            healthReport.issues.push(`Missing critical dependency: '${dep}'. Attempting to install.`);
            logger.warn(`⚠️ Missing critical dependency: '${dep}'. Attempting to install...`);
            try {
                // WARN: Running npm install at runtime can lead to issues in production
                // environments (e.g., read-only file systems in Docker containers)
                // and adds significant overhead. This is for self-healing in development.
                await execPromise(`npm install ${dep} --save-dev`); // --save-dev if it's a dev dependency
                logger.success(`✅ Successfully installed missing dependency: '${dep}'.`);
            } catch (installError) {
                stable = false;
                healthReport.issues.push(`Failed to install dependency '${dep}': ${installError.message}`);
                logger.error(`🚨 Failed to install dependency '${dep}': ${installError.message}`);
            }
        }
    }
    healthReport.dependenciesOk = allDependenciesOk;


    // --- 5. Log Monitoring for Sensitive Data and Errors ---
    // NOTE: This assumes logs are written to /var/log/app.log.
    // In Docker/cloud, logs often go to stdout/stderr and are handled by the platform.
    // Direct file access like this might not work or is not the best practice.
    const logFilePath = '/var/log/app.log'; // Adjust path if needed

    try {
        const logContent = await fs.readFile(logFilePath, 'utf8').catch(() => ''); // Read, or empty string if file doesn't exist
        const recentLogLines = logContent.split('\n').slice(-100).join('\n'); // Check last 100 lines

        // Sensitive data pattern (more specific than just 'key')
        const sensitiveDataPattern = /(PRIVATE_KEY|RENDER_API_TOKEN|SECRET|PASSWORD|0x[a-fA-F0-9]{40,})/g;
        if (sensitiveDataPattern.test(recentLogLines)) {
            stable = false;
            healthReport.logsClean = false;
            healthReport.issues.push('Sensitive data (e.g., API keys, secrets, private keys, crypto addresses) detected in logs.');
            logger.error('🚨 Sensitive data detected in logs. This is a security risk and requires manual intervention!');
            // DO NOT self-clean by overwriting the log file. This can lead to data loss.
            // A proper solution involves secure logging practices and external log management.
        }

        if (recentLogLines.toLowerCase().includes('error')) {
            stable = false;
            healthReport.logsClean = false; // Log has errors, so not "clean"
            healthReport.issues.push('Error detected in recent logs. This may indicate an underlying issue.');
            logger.warn('⚠️ Detected "error" keyword in recent logs. Consider restarting relevant agents or investigate.');
            // This agent should report the error, but the orchestration in server.js
            // can decide whether to restart or throw to abort the cycle.
            // For now, we'll mark as unstable, and server.js will decide to throw.
        }

    } catch (error) {
        healthReport.issues.push(`Failed to access or monitor logs at ${logFilePath}: ${error.message}`);
        logger.warn(`⚠️ Failed to access or monitor logs at ${logFilePath}: ${error.message}`);
        // Do not set stable to false just for log access failure, unless critical.
    }

    logger.info('❤️ HealthAgent: Health check complete.');
    return {
        status: stable ? 'optimal' : 'degraded',
        message: stable ? 'System health is optimal.' : 'System preconditions not met. See issues for details.',
        details: healthReport
    };
}
