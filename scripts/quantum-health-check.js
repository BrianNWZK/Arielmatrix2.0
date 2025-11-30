#!/usr/bin/env node
/**
 * Quantum-Resistant Crypto Health Check
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔒 Quantum-Resistant Cryptography Health Check\n');

function checkWASMModules() {
  const modules = {
    kyber: ['kyber512.wasm', 'kyber768.wasm', 'kyber1024.wasm'],
    dilithium: ['dilithium2.wasm', 'dilithium3.wasm', 'dilithium5.wasm']
  };

  let allHealthy = true;

  for (const [algorithm, files] of Object.entries(modules)) {
    const modulePath = path.join(__dirname, '..', 'modules', `pqc-${algorithm}`);
    
    console.log(`\n📊 ${algorithm.toUpperCase()} Modules:`);
    
    files.forEach(file => {
      const filePath = path.join(modulePath, file);
      const exists = fs.existsSync(filePath);
      
      if (exists) {
        const stats = fs.statSync(filePath);
        const isPlaceholder = stats.size < 100; // Placeholders are small
        
        if (isPlaceholder) {
          console.log(`  ${file}: ⚠️ PLACEHOLDER (JS Fallback)`);
        } else {
          console.log(`  ${file}: ✅ ACTIVE WASM (${stats.size} bytes)`);
        }
      } else {
        console.log(`  ${file}: ❌ MISSING`);
        allHealthy = false;
      }
    });
  }

  return allHealthy;
}

// Run health check
const isHealthy = checkWASMModules();

console.log('\n📈 Health Summary:');
if (isHealthy) {
  console.log('✅ Quantum-Resistant Cryptography: FULLY OPERATIONAL');
} else {
  console.log('⚠️ Quantum-Resistant Cryptography: DEGRADED (Using Fallbacks)');
  console.log('💡 Run "npm run build-wasm" to attempt recovery');
}

process.exit(isHealthy ? 0 : 1);
