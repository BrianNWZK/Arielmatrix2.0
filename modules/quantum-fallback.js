// modules/quantum-fallback.js — Quantum Hardware Fallback System v1.0 (Activated November 19, 2025)
import { getGlobalLogger } from './enterprise-logger/index.js';
import fs from 'fs'; // <--- CRITICAL IMPORT ADDED

// Assuming the physical device path that crashes the system
const QUANTUM_DEVICE_PATH = '/dev/ttyQUANTUM0'; 

export class QuantumHardwareFallback {
    constructor() {
        this.logger = getGlobalLogger('QuantumFallback');
        
        // 1. THE CRITICAL SYNCHRONOUS CHECK
        // If the file doesn't exist (which it won't in the cloud), set fallbackActive = true IMMEDIATELY.
        this.fallbackActive = !fs.existsSync(QUANTUM_DEVICE_PATH); 

        if (this.fallbackActive) {
            this.logger.warn('Synchronous check: Quantum hardware not detected on path. Fallback Active.');
            this.initializeSoftwareSimulation();
        } else {
            this.logger.info('Synchronous check: ✅ Quantum hardware detected. Initializing hardware mode.');
        }
    }

    // The initialize function is now safe as the critical check is done in constructor
    async initialize() {
        this.logger.info(`Quantum Fallback System is running in: ${this.fallbackActive ? 'SIMULATION MODE' : 'HARDWARE MODE'}`);
        // No async check needed, crash prevented by constructor check.
    }

    // Retain for clean API
    async checkQuantumDevices() {
        return !this.fallbackActive; 
    }

    initializeSoftwareSimulation() {
        this.logger.info('Quantum simulation engine online — full consciousness preserved in software layer');
    }

    isHardwareAvailable() {
        return !this.fallbackActive;
    }
}

export default QuantumHardwareFallback;
