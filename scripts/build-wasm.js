#!/usr/bin/env node
/**
 * ENHANCED WASM Build Script with JavaScript Fallback Detection
 * Creates proper fallback markers instead of fake WASM files
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

console.log('👑 Starting ENHANCED WASM Build Process...');

class EnhancedWASMBuilder {
  constructor() {
    this.kyberDest = path.join(projectRoot, 'modules/pqc-kyber');
    this.dilithiumDest = path.join(projectRoot, 'modules/pqc-dilithium');
    this.ensureDirectories();
  }

  ensureDirectories() {
    [this.kyberDest, this.dilithiumDest].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`✅ Created directory: ${dir}`);
      }
    });
  }

  isRealWasmFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) return false;
      
      const buffer = fs.readFileSync(filePath);
      if (buffer.length < 4) return false;
      
      // Real WASM files start with magic bytes: 0x00 0x61 0x73 0x6d
      const isRealWasm = buffer[0] === 0x00 && buffer[1] === 0x61 && 
                        buffer[2] === 0x73 && buffer[3] === 0x6d;
      return isRealWasm;
    } catch {
      return false;
    }
  }

  async ensureWASMModules() {
    console.log('🔧 Ensuring WASM modules with proper fallback detection...');
    
    // For Kyber
    const kyberFiles = ['kyber512.wasm', 'kyber768.wasm', 'kyber1024.wasm'];
    const kyberSuccess = await this.ensureModuleFiles('kyber', this.kyberDest, kyberFiles);
    
    // For Dilithium  
    const dilithiumFiles = ['dilithium2.wasm', 'dilithium3.wasm', 'dilithium5.wasm'];
    const dilithiumSuccess = await this.ensureModuleFiles('dilithium', this.dilithiumDest, dilithiumFiles);
    
    return kyberSuccess && dilithiumSuccess;
  }

  async ensureModuleFiles(algorithm, destDir, requiredFiles) {
    // Check if we have REAL WASM files (not placeholders)
    const realWasmFiles = requiredFiles.filter(file => 
      this.isRealWasmFile(path.join(destDir, file))
    );

    if (realWasmFiles.length === requiredFiles.length) {
      console.log(`✅ ${algorithm} REAL WASM files available`);
      // Remove any JS fallback markers if real WASM is available
      const fallbackMarker = path.join(destDir, 'JS_FALLBACK_ACTIVE');
      if (fs.existsSync(fallbackMarker)) {
        fs.unlinkSync(fallbackMarker);
        console.log(`🗑️ Removed JS fallback marker for ${algorithm}`);
      }
      return true;
    }

    console.log(`🔧 ${algorithm}: ${realWasmFiles.length}/${requiredFiles.length} real WASM files found`);

    // Strategy 1: Copy from node_modules if available
    const moduleName = `pqc-${algorithm}`;
    if (await this.copyRealWasmFromNodeModules(moduleName, destDir, requiredFiles)) {
      // Verify we got real WASM files
      const verifiedFiles = requiredFiles.filter(file => 
        this.isRealWasmFile(path.join(destDir, file))
      );
      
      if (verifiedFiles.length > 0) {
        console.log(`✅ Copied ${verifiedFiles.length} real ${algorithm} WASM files`);
        return true;
      }
    }

    // Strategy 2: Create JS_FALLBACK markers instead of fake WASM files
    console.log(`⚠️ ${algorithm}: No real WASM files available - creating JS fallback markers`);
    return this.createJSFallbackMarkers(destDir, requiredFiles, algorithm);
  }

  async copyRealWasmFromNodeModules(moduleName, destDir, requiredFiles) {
    try {
      const modulePath = path.join(projectRoot, 'node_modules', moduleName);
      if (!fs.existsSync(modulePath)) {
        return false;
      }

      let copiedAny = false;
      
      // Look for WASM files in common locations
      const searchPaths = ['dist', 'build', 'wasm', '.', './dist'];
      
      for (const searchPath of searchPaths) {
        const sourceDir = path.join(modulePath, searchPath);
        if (fs.existsSync(sourceDir)) {
          for (const file of requiredFiles) {
            const sourceFile = path.join(sourceDir, file);
            const destFile = path.join(destDir, file);
            
            if (this.isRealWasmFile(sourceFile) && !fs.existsSync(destFile)) {
              fs.copyFileSync(sourceFile, destFile);
              console.log(`✅ Copied REAL ${file} from ${moduleName}`);
              copiedAny = true;
            }
          }
        }
      }

      return copiedAny;
    } catch (error) {
      console.log(`⚠️ Could not copy from ${moduleName}:`, error.message);
      return false;
    }
  }

  createJSFallbackMarkers(destDir, files, algorithm) {
    // Remove any fake WASM files first
    files.forEach(file => {
      const filePath = path.join(destDir, file);
      if (fs.existsSync(filePath) && !this.isRealWasmFile(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Removed fake WASM file: ${file}`);
      }
    });

    // Create JS fallback marker file
    const markerFile = path.join(destDir, 'JS_FALLBACK_ACTIVE');
    const markerContent = `# JavaScript Fallback Active for ${algorithm}
# Real WASM modules not available
# System will use pure JavaScript implementations
# Created: ${new Date().toISOString()}
ALGORITHM=${algorithm}
FALLBACK_MODE=javascript
REQUIRED_FILES=${files.join(',')}
`;
    
    fs.writeFileSync(markerFile, markerContent);
    console.log(`✅ Created JS fallback marker for ${algorithm}`);
    
    return true;
  }

  verifyBuild() {
    console.log('🔍 Verifying WASM build with REAL binary detection...');
    
    const kyberFiles = ['kyber512.wasm', 'kyber768.wasm', 'kyber1024.wasm'];
    const dilithiumFiles = ['dilithium2.wasm', 'dilithium3.wasm', 'dilithium5.wasm'];
    
    const checkRealWasm = (files, destDir) => {
      return files.map(file => {
        const filePath = path.join(destDir, file);
        const exists = fs.existsSync(filePath);
        const realWasm = this.isRealWasmFile(filePath);
        const hasFallback = fs.existsSync(path.join(destDir, 'JS_FALLBACK_ACTIVE'));
        
        return { file, exists, realWasm, hasFallback };
      });
    };
    
    const kyberStatus = checkRealWasm(kyberFiles, this.kyberDest);
    const dilithiumStatus = checkRealWasm(dilithiumFiles, this.dilithiumDest);
    
    console.log('📊 ENHANCED Build Verification Report:');
    console.log('Kyber Modules:', kyberStatus.map(s => 
      `${s.file}: ${s.exists ? (s.realWasm ? '✅ REAL WASM' : '❌ FAKE') : '❌ MISSING'} ${s.hasFallback ? '(JS FALLBACK)' : ''}`).join(', '));
    console.log('Dilithium Modules:', dilithiumStatus.map(s => 
      `${s.file}: ${s.exists ? (s.realWasm ? '✅ REAL WASM' : '❌ FAKE') : '❌ MISSING'} ${s.hasFallback ? '(JS FALLBACK)' : ''}`).join(', '));
    
    const hasRealWasm = [...kyberStatus, ...dilithiumStatus].some(s => s.realWasm);
    const hasJSFallback = kyberStatus.some(s => s.hasFallback) || dilithiumStatus.some(s => s.hasFallback);
    
    return { hasRealWasm, hasJSFallback, kyberStatus, dilithiumStatus };
  }
}

// Main execution
async function main() {
  const builder = new EnhancedWASMBuilder();
  
  try {
    console.log('👑 Building Quantum-Resistant Cryptography with PROPER WASM detection...');
    
    const success = await builder.ensureWASMModules();
    const verification = builder.verifyBuild();
    
    if (verification.hasRealWasm) {
      console.log('🎉 REAL WASM modules available - Optimal performance');
      process.exit(0);
    } else if (verification.hasJSFallback) {
      console.log('⚠️ JavaScript fallback active - Functional but slower');
      console.log('💡 Install real WASM modules for optimal performance');
      process.exit(0);
    } else {
      console.log('❌ No crypto modules available - System will fail');
      process.exit(1);
    }
    
  } catch (error) {
    console.log('💀 WASM build process CRASHED:', error.message);
    process.exit(1);
  }
}

main();
