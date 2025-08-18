// backend/agents/healthAgent.js

import axios from 'axios';
import * as os from 'os';
import { exec } from 'child_process';
import util from 'util';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

// New: ES module compatible way to get __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execPromise = util.promisify(exec);

// Novel Solution: Stateful variable to track persistent issues
let persistentIssues = {
    highCpu: 0
};
// Allow up to 3 consecutive high CPU readings before marking as degraded
const CPU_TOLERANCE_COUNT = 3;

// --- File Integrity Monitoring (FIM) Configuration ---
// CORRECTED: 'configAgent.js' is in the same directory, so it doesn't need '../'.
const MONITORED_FILES = [
    path.resolve(__dirname, 'apiScoutAgent.js'),
    path.resolve(__dirname, 'browserManager.js'),
    path.resolve(__dirname, 'healthAgent.js'),
    path.resolve(__dirname, 'configAgent.js'),
];

// Store baseline hashes for file integrity monitoring
const fileBaselines = new Map(); // Map<filePath, hash>

// --- Dynamic Defense Postures ---
// These define different states the defense system can adopt.
const DEFENSE_POSTURES = {
    LOW_RISK: {
        fimScanInterval: 60000, // Every 1 minute
        logScanStrictness: 'normal',
        apiScoutThrottle: 0, // No throttling
        alertLevel: 'info'
    },
    MEDIUM_RISK: {
        fimScanInterval: 30000, // Every 30 seconds
        logScanStrictness: 'strict',
        apiScoutThrottle: 5000, // 5-second delay between browser ops
        alertLevel: 'warn'
    },
    HIGH_RISK: {
        fimScanInterval: 10000, // Every 10 seconds
        logScanStrictness: 'critical',
        apiScoutThrottle: 15000, // 15-second delay, or pause ops
        alertLevel: 'error'
    }
};

let currentDefensePosture = DEFENSE_POSTURES.LOW_RISK; // Initial state

// Novel Solution: A simple, reliable "Dumb" System check for dependency presence
async function checkDependency(depName) {
    try {
        const { stdout } = await execPromise(`npm ls ${depName} --json`);
        const result = JSON.parse(stdout);
        if (result.dependencies && result.dependencies[depName]) {
            return true;
        }
    } catch (e) {
        return false;
    }
    return false;
}

/**
 * Calculates the SHA256 hash of a file's content.
 * @param {string} filePath - The path to the file.
 * @param {object} logger - The logger instance.
 * @returns {Promise<string|null>} The SHA256 hash or null if an error occurs.
 */
async function calculateFileHash(filePath, logger) {
    try {
        const fileBuffer = await fs.readFile(filePath);
        const hash = crypto.createHash('sha256');
        hash.update(fileBuffer);
        return hash.digest('hex');
    } catch (error) {
        logger.error(`🚨 Error calculating hash for ${filePath}: ${error.message}`);
        return null;
    }
}

/**
 * Initializes file integrity monitoring for configured files.
 * This sets the initial baseline hashes and starts watching for changes.
 * @param {object} logger - The logger instance.
 */
async function initializeFileIntegrityMonitoring(logger) {
    logger.info("🛡️ Initializing File Integrity Monitoring (FIM)...");
    for (const filePath of MONITORED_FILES) {
        const hash = await calculateFileHash(filePath, logger);
        if (hash) {
            fileBaselines.set(filePath, hash);
            logger.info(`✅ FIM Baseline set for ${path.basename(filePath)}: ${hash.substring(0, 10)}...`);

            fs.watch(filePath, async (eventType, filename) => {
                await new Promise(resolve => setTimeout(resolve, 500));
                if (eventType === 'change' || eventType === 'rename') {
                    logger.warn(`⚠️ Detected file system event (${eventType}) for: ${filename || path.basename(filePath)}`);
                    await checkFileIntegrity(filePath, logger);
                }
            });
        }
    }
    logger.success("🛡️ File Integrity Monitoring initialized and watching critical files.");
}

/**
 * Checks the integrity of a specific file against its stored baseline.
 * If a mismatch is found, it logs a critical alert.
 * @param {string} filePath - The path to the file.
 * @param {object} logger - The logger instance.
 */
async function checkFileIntegrity(filePath, logger) {
    const currentHash = await calculateFileHash(filePath, logger);
    const baselineHash = fileBaselines.get(filePath);

    if (!baselineHash) {
        logger.warn(`⚠️ File ${path.basename(filePath)} is being monitored but no baseline found. Setting new baseline.`);
        fileBaselines.set(filePath, currentHash);
        return;
    }

    if (currentHash !== baselineHash) {
        logger.error(`🚨 INTEGRITY BREACH DETECTED for ${path.basename(filePath)}!`);
        logger.error(`   Old Hash: ${baselineHash}`);
        logger.error(`   New Hash: ${currentHash}`);
        logger.error(`   Action: A critical file has been altered. Immediate investigation required.`);
        // Autonomous Response: Alert, log, consider shutting down sensitive ops.
        // The defense system can now conceptually "rewrite" its approach
        // by switching to a HIGH_RISK posture.
        // Make sure to call the function correctly with the logger argument
        setDefensePosture(DEFENSE_POSTURES.HIGH_RISK, logger);
    } else {
        logger.info(`✅ Integrity check passed for ${path.basename(filePath)}.`);
    }
}

/**
 * @function _checkExternalThreats
 * @description Simulates fetching external threat intelligence.
 * In a real system, this would integrate with a threat intelligence platform.
 * @returns {Promise<string>} A simulated threat level ('low', 'medium', 'high').
 */
async function _checkExternalThreats(logger) {
    logger.info("📡 Checking external threat intelligence feeds...");
    await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network call
    // Simulate dynamic threat level based on external factors (e.g., time of day, historical patterns)
    const threatLevels = ['low', 'medium', 'high'];
    const simulatedThreat = threatLevels[Math.floor(Math.random() * threatLevels.length)];
    logger.info(`📡 Simulated external threat level: ${simulatedThreat}`);
    return simulatedThreat;
}

/**
 * @function _assessThreatLevel
 * @description Assesses the overall threat level based on internal health issues and external intelligence.
 * @param {object} healthReport - The current internal health report.
 * @param {string} externalThreatLevel - The simulated external threat level.
 * @returns {string} The aggregated threat level ('low', 'medium', 'high').
 */
function _assessThreatLevel(healthReport, externalThreatLevel, logger) {
    let aggregatedThreat = 'low';

    // Internal health issues contribute to threat level
    if (!healthReport.cpuReady || !healthReport.memoryReady || !healthReport.networkActive || !healthReport.nodeVersionOk || !healthReport.dependenciesOk || !healthReport.logsClean) {
        logger.warn("Internal health issues detected, increasing perceived threat.");
        aggregatedThreat = 'medium';
    }

    if (healthReport.issues.some(issue => issue.includes('Critical: High CPU load persisted') || issue.includes('INTEGRITY BREACH DETECTED'))) {
        logger.error("Critical internal issue detected, elevating threat to high.");
        aggregatedThreat = 'high';
    }

    // External threat intelligence can elevate the threat level
    if (externalThreatLevel === 'medium' && aggregatedThreat === 'low') {
        aggregatedThreat = 'medium';
    } else if (externalThreatLevel === 'high') {
        aggregatedThreat = 'high';
    }

    logger.info(`⚖️ Assessed overall threat level: ${aggregatedThreat}`);
    return aggregatedThreat;
}

/**
 * @function _adaptDefensePolicy
 * @description Adapts the system's defense mechanisms based on the assessed threat level.
 * This is the "self-rewriting" aspect, dynamically adjusting operational parameters.
 * @param {string} threatLevel - The current aggregated threat level.
 * @param {object} logger - The logger instance.
 */
function _adaptDefensePolicy(threatLevel, logger) {
    let newPosture;
    switch (threatLevel) {
        case 'low':
            newPosture = DEFENSE_POSTURES.LOW_RISK;
            break;
        case 'medium':
            newPosture = DEFENSE_POSTURES.MEDIUM_RISK;
            break;
        case 'high':
            newPosture = DEFENSE_POSTURES.HIGH_RISK;
            logger.error("🚨 Activating HIGH_RISK defense posture: Increased vigilance and potential operational limitations.");
            // Example: Here, you might send an immediate alert via another agent (e.g., communicationAgent)
            // communicationAgent.sendAlert('CRITICAL_THREAT_DETECTED', 'System operating in HIGH_RISK posture.');
            break;
        default:
            newPosture = DEFENSE_POSTURES.LOW_RISK;
    }

    if (currentDefensePosture !== newPosture) {
        logger.warn(`🛡️ Adapting defense posture from ${currentDefensePosture.alertLevel.toUpperCase()} to ${newPosture.alertLevel.toUpperCase()}.`);
        currentDefensePosture = newPosture;
        // Apply the new posture's settings
        // For FIM, you'd adjust the interval of the next scheduled scan if you had a scheduler.
        // For browser agent, you'd pass this to its configuration or a setter method.
        // Example: BrowserManager.setThrottleDelay(currentDefensePosture.apiScoutThrottle);
        // This is where 'self-rewriting' translates to runtime configuration adjustment.
    } else {
        logger.info(`🛡️ Defense posture remains ${currentDefensePosture.alertLevel.toUpperCase()}.`);
    }
}


/**
 * @function setDefensePosture
 * @description A setter function to allow other parts of the system to programmatically set the defense posture.
 * This is useful for providing threat intelligence from other agents.
 * @param {object} newPosture - The new defense posture object to set.
 * @param {object} logger - The logger instance.
 */
export function setDefensePosture(newPosture, logger) {
    _adaptDefensePolicy(newPosture.alertLevel.toLowerCase(), logger);
}


/**
 * @function run
 * @description Performs a comprehensive health check, including self-healing for
 * missing dependencies, re-evaluating the system state after a fix, and now
 * integrating File Integrity Monitoring. It applies dynamic tolerance for transient
 * resource issues like high CPU load, and implements self-awareness to adapt defense policies.
 * @param {object} config - The global configuration object.
 * @param {object} logger - The global logger instance.
 * @returns {Promise<object>} Health status including CPU, memory, network, Node.js, and log checks.
 */
export async function run(config, logger) {
    logger.info('❤️ HealthAgent: Performing comprehensive system and network health check...');

    // Initialize File Integrity Monitoring at the start of the health check cycle
    await initializeFileIntegrityMonitoring(logger);

    let attempts = 0;
    const maxAttempts = 2;
    let finalReport = { status: 'degraded', issues: [] };

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
        let currentIssues = [];

        // --- 1. System Resource Check (CPU & Memory) ---
        const cpuInfo = os.loadavg();
        const cpuLoad = cpuInfo[0];
        const cpuCount = os.cpus().length;
        currentHealthReport.rawCpu = { count: cpuCount, load: cpuInfo };

        if (cpuLoad < cpuCount * 0.8) {
            currentHealthReport.cpuReady = true;
            persistentIssues.highCpu = 0;
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
            if (currentDefensePosture.logScanStrictness === 'strict' && recentLogLines.toLowerCase().includes('warn')) {
                 currentHealthReport.logsClean = false; // More strict: warnings also count
                 currentIssues.push('Warning detected in recent logs (strict scan).');
                 logger.warn('⚠️ Detected "warn" keyword in recent logs (strict scan).');
            }
            if (currentDefensePosture.logScanStrictness === 'critical' && (recentLogLines.toLowerCase().includes('warn') || recentLogLines.toLowerCase().includes('info'))) {
                 currentHealthReport.logsClean = false; // Most strict: infos also count
                 currentIssues.push('Info or warning detected in recent logs (critical scan).');
                 logger.warn('⚠️ Detected "info" or "warn" keyword in recent logs (critical scan).');
            }
            if (recentLogLines.toLowerCase().includes('error')) {
                currentHealthReport.logsClean = false;
                currentIssues.push('Error detected in recent logs.');
                logger.warn('⚠️ Detected "error" keyword in recent logs.');
            }
        } catch (error) {
            currentIssues.push(`Failed to access logs at ${logFilePath}: ${error.message}`);
            logger.warn(`⚠️ Failed to access logs at ${logFilePath}: ${error.message}. Ensure log file exists and is accessible.`);
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

    // --- Self-Awareness and Adaptive Defense ---
    const externalThreatLevel = await _checkExternalThreats(logger);
    const aggregatedThreatLevel = _assessThreatLevel(finalReport.details, externalThreatLevel, logger);
    _adaptDefensePolicy(aggregatedThreatLevel, logger);

    logger.info('❤️ HealthAgent: Health check complete.');
    return finalReport;
}

// Allow external agents to provide threat intelligence or observations
/**
 * @function provideThreatIntelligence
 * @description Allows other agents (e.g., apiScout) to provide threat intelligence.
 * @param {string} type - Type of intelligence (e.g., 'browser_block', 'api_rejection').
 * @param {string} message - A descriptive message.
 * @param {object} logger - The logger instance.
 */
export function provideThreatIntelligence(type, message, logger) {
    logger.warn(`Threat Intelligence Received (${type}): ${message}`);
    // This is where healthAgent would analyze incoming threat data.
    // For now, it could temporarily elevate the threat posture if a severe alert comes in.
    if (type === 'browser_block' || type === 'api_rejection') {
        logger.warn("Received browser/API rejection intel. Temporarily elevating perceived threat.");
        setDefensePosture(DEFENSE_POSTURES.MEDIUM_RISK, logger); // Or 'high' if very severe
    }
}

export default {
    run,
    setDefensePosture,
    provideThreatIntelligence,
    DEFENSE_POSTURES
};
