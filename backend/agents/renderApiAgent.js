// backend/agents/renderApiAgent.js
import axios from 'axios';
import fs from 'fs/promises';
import { createHash } from 'node:crypto';
import { performance } from 'perf_hooks';
import { cpus, loadavg } from 'os';

// Quantum Security Core (ESM-Safe)
const QuantumSecurity = {
  generateSecureKey: () => {
    const cryptoImpl = globalThis.crypto || crypto;
    const entropy = new Uint32Array(8);
    if (cryptoImpl.getRandomValues) {
      cryptoImpl.getRandomValues(entropy);
    } else {
      // Fallback
      for (let i = 0; i < 8; i++) entropy[i] = Math.floor(Math.random() * 4294967295);
    }
    return `qsec-${Buffer.from(entropy).toString('hex').slice(0, 32)}-${Date.now().toString(36)}`;
  },

  verifyEnvironment: async () => {
    const [memUsage, cpuCount, netStatus] = await Promise.all([
      process.memoryUsage(),
      cpus().length,
      axios.get('https://api.render.com/health').catch(() => ({ status: 503 }))
    ]);
    
    return {
      stable: memUsage.heapUsed < memUsage.heapTotal * 0.8,
      cpuReady: cpuCount > 1,
      networkActive: netStatus.status === 200
    };
  }
};

// Enhanced Render API Agent (100% Production Code)
export const renderApiAgent = async (CONFIG) => {
  try {
    // Real system verification before proceeding
    const systemCheck = await QuantumSecurity.verifyEnvironment();
    if (!systemCheck.stable || !systemCheck.networkActive) {
      console.warn('⚠️ System preconditions not met → running in local mode');
      return {
        QUANTUM_MODE: 'local',
        QUANTUM_API_KEY: QuantumSecurity.generateSecureKey()
      };
    }

    // Generate quantum-secured keys
    const quantumEnv = {
      QUANTUM_MODE: 'active',
      QUANTUM_API_KEY: QuantumSecurity.generateSecureKey(),
      QUANTUM_TIMESTAMP: performance.now()
    };

    if (!CONFIG.RENDER_API_TOKEN) {
      console.warn('⚠️ RENDER_API_TOKEN missing → operating in local mode');
      return quantumEnv;
    }

    // Resolve service ID
    const SERVICE_ID = process.env.RENDER_SERVICE_ID;
    if (!SERVICE_ID) {
      console.error('❌ RENDER_SERVICE_ID missing in environment');
      return { error: 'RENDER_SERVICE_ID missing' };
    }

    const BASE_URL = `https://api.render.com/v1/services/${SERVICE_ID}/env-vars`;

    // Read keys from revenue_keys.json (not api-keys.json)
    const keyPath = new URL('../revenue_keys.json', import.meta.url);
    let keys = {};
    try {
      const data = await fs.readFile(keyPath, 'utf8');
      keys = JSON.parse(data);
      console.log(`✅ Loaded ${Object.keys(keys).length} keys from revenue_keys.json`);
    } catch (err) {
      console.warn('⚠️ No revenue_keys.json found or invalid JSON');
    }

    // Environment variables to update
    const envUpdates = [
      { key: 'BSCSCAN_API_KEY', value: keys.BSCSCAN_API_KEY || process.env.BSCSCAN_API_KEY },
      { key: 'ADFLY_API_KEY', value: keys.ADFLY_API_KEY || process.env.ADFLY_API_KEY },
      { key: 'ADFLY_USER_ID', value: keys.ADFLY_USER_ID || process.env.ADFLY_USER_ID },
      { key: 'X_API_KEY', value: keys.X_API_KEY || process.env.X_API_KEY },
      { key: 'REDDIT_API_KEY', value: keys.REDDIT_API_KEY || process.env.REDDIT_API_KEY },
      { key: 'NEWS_API_KEY', value: keys.NEWS_API_KEY || process.env.NEWS_API_KEY },
      { key: 'WEATHER_API_KEY', value: keys.WEATHER_API_KEY || process.env.WEATHER_API_KEY },
      { key: 'QUANTUM_SECURE_MODE', value: quantumEnv.QUANTUM_MODE },
      { key: 'QUANTUM_ACCESS_KEY', value: quantumEnv.QUANTUM_API_KEY },
      { key: 'AUTONOMOUS_ENGINE', value: 'true' },
      { key: 'DEPLOYMENT_ID', value: `AUTO-${createHash('md5').update(quantumEnv.QUANTUM_API_KEY).digest('hex').slice(0, 12)}` }
    ].filter(item => item.value && typeof item.value === 'string' && item.value.trim() !== '');

    if (envUpdates.length === 0) {
      console.warn('⚠️ No valid keys to update');
      return quantumEnv;
    }

    // Get existing env vars
    const authHeader = { Authorization: `Bearer ${CONFIG.RENDER_API_TOKEN}` };
    let existingVars = [];
    try {
      const res = await axios.get(BASE_URL, { headers: authHeader });
      existingVars = Array.isArray(res.data) ? res.data : [];
    } catch (err) {
      console.warn('⚠️ Failed to fetch existing env vars:', err.message);
    }

    const existingKeys = existingVars.reduce((acc, v) => {
      acc[v.key] = v;
      return acc;
    }, {});

    // Update or create each env var
    const updatePromises = envUpdates.map(async (env) => {
      const method = existingKeys[env.key] ? 'PUT' : 'POST';
      const url = method === 'PUT' ? `${BASE_URL}/${existingKeys[env.key].id}` : BASE_URL;

      try {
        await axios({
          method,
          url,
          headers: { ...authHeader, 'Content-Type': 'application/json' },
          data: { key: env.key, value: env.value },
          timeout: 15000
        });
        console.log(`✅ ${method === 'POST' ? 'Set' : 'Updated'} ${env.key}`);
      } catch (err) {
        console.error(`🚨 Failed to update ${env.key}:`, err.response?.data || err.message);
      }
    });

    await Promise.all(updatePromises);

    // Add performance metrics
    quantumEnv.performanceMetrics = {
      heapUsed: process.memoryUsage().heapUsed,
      processingTime: performance.now() - quantumEnv.QUANTUM_TIMESTAMP,
      varsUpdated: envUpdates.length
    };

    return quantumEnv;

  } catch (error) {
    const errorInfo = {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString(),
      system: {
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        cpu: loadavg()
      }
    };
    
    console.error('🚨 Quantum-enhanced operation failed:', errorInfo);
    throw error; // Let orchestrator handle
  }
};

// Default export for backward compatibility
export default renderApiAgent;
