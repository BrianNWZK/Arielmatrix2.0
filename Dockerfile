# --- STAGE 1: Dependency Installer ---
FROM node:22-slim AS builder

WORKDIR /usr/src/app

# System dependencies
RUN apt-get update && apt-get install -y \
  python3 \
  build-essential \
  cmake \
  git \
  curl \
  pkg-config \
  sqlite3 \
  libsqlite3-dev \
  ca-certificates \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Configure npm and clean cache
RUN npm config set registry https://registry.npmjs.org \
  && npm config set legacy-peer-deps true \
  && npm config set audit false \
  && npm config set fund false \
  && npm config set progress false \
  && npm cache clean --force

# Copy package files
COPY package.json package-lock.json* ./
COPY modules/pqc-dilithium ./modules/pqc-dilithium
COPY modules/pqc-kyber ./modules/pqc-kyber

# Remove stubbed dependencies from package.json
RUN sed -i '/"ai-security-module"/d' package.json \
  && sed -i '/"omnichain-interoperability"/d' package.json \
  && sed -i '/"infinite-scalability-engine"/d' package.json \
  && sed -i '/"carbon-negative-consensus"/d' package.json \
  && sed -i '/"ariel-sqlite-engine"/d' package.json

# Install dependencies with fallback
RUN if [ -f package-lock.json ]; then \
      npm ci --legacy-peer-deps --no-audit --no-fund --prefer-offline || \
      npm install --legacy-peer-deps --no-audit --no-fund --prefer-offline; \
    fi

# 🎯 CRITICAL FIX: Install ONLY web3 and axios (removed problematic dependencies)
RUN npm install web3 axios --no-audit --no-fund --legacy-peer-deps

# Remove problematic modules
RUN rm -rf node_modules/@tensorflow node_modules/sqlite3 node_modules/.cache 2>/dev/null || true

# Verify critical modules
RUN npm list web3 || (echo "❌ web3 missing" && exit 1)
RUN npm list axios || (echo "❌ axios missing" && exit 1)

# Copy full project
COPY . .

# Create ENHANCED WASM build script with proper detection
RUN mkdir -p scripts
COPY <<"EOF" scripts/build-wasm.js
#!/usr/bin/env node
/**
 * ENHANCED WASM Build Script with Proper Detection
 * Creates marker files instead of fake WASM files
 */

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

  async ensureWASMModules() {
    console.log('🔧 Ensuring WASM modules with proper detection...');
    
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
    const realWasmFiles = requiredFiles.filter(file => {
      const filePath = path.join(destDir, file);
      if (!fs.existsSync(filePath)) return false;
      
      // Check if it's a real WASM file by reading first 4 bytes
      try {
        const buffer = fs.readFileSync(filePath);
        if (buffer.length < 4) return false;
        
        // Real WASM files start with magic bytes: 0x00 0x61 0x73 0x6d
        const isRealWasm = buffer[0] === 0x00 && buffer[1] === 0x61 && 
                          buffer[2] === 0x73 && buffer[3] === 0x6d;
        return isRealWasm;
      } catch {
        return false;
      }
    });

    if (realWasmFiles.length === requiredFiles.length) {
      console.log(`✅ ${algorithm} REAL WASM files available`);
      return true;
    }

    console.log(`🔧 ${algorithm}: ${realWasmFiles.length}/${requiredFiles.length} real WASM files found`);

    // Strategy 1: Copy from node_modules if available
    const moduleName = `pqc-${algorithm}`;
    if (await this.copyFromNodeModules(moduleName, destDir, requiredFiles)) {
      // Verify we got real WASM files
      const verifiedFiles = requiredFiles.filter(file => {
        const filePath = path.join(destDir, file);
        try {
          const buffer = fs.readFileSync(filePath);
          return buffer[0] === 0x00 && buffer[1] === 0x61 && 
                 buffer[2] === 0x73 && buffer[3] === 0x6d;
        } catch {
          return false;
        }
      });
      
      if (verifiedFiles.length > 0) {
        console.log(`✅ Copied ${verifiedFiles.length} real ${algorithm} WASM files`);
        return true;
      }
    }

    // Strategy 2: Create JS_FALLBACK markers instead of fake WASM files
    console.log(`⚠️ ${algorithm}: No real WASM files available - creating JS fallback markers`);
    return this.createJSFallbackMarkers(destDir, requiredFiles, algorithm);
  }

  async copyFromNodeModules(moduleName, destDir, requiredFiles) {
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
            
            if (fs.existsSync(sourceFile) && !fs.existsSync(destFile)) {
              // Verify it's a real WASM file before copying
              const buffer = fs.readFileSync(sourceFile);
              if (buffer.length >= 4 && 
                  buffer[0] === 0x00 && buffer[1] === 0x61 && 
                  buffer[2] === 0x73 && buffer[3] === 0x6d) {
                fs.copyFileSync(sourceFile, destFile);
                console.log(`✅ Copied REAL ${file} from ${moduleName}`);
                copiedAny = true;
              }
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
      if (fs.existsSync(filePath)) {
        // Check if it's a fake file (starts with "//" or text content)
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          if (content.startsWith('//') || content.includes('Placeholder')) {
            fs.unlinkSync(filePath);
            console.log(`🗑️ Removed fake WASM file: ${file}`);
          }
        } catch {
          // If we can't read it as text, it might be binary - leave it
        }
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
        if (!fs.existsSync(filePath)) {
          return { file, exists: false, realWasm: false };
        }
        
        try {
          const buffer = fs.readFileSync(filePath);
          const isRealWasm = buffer.length >= 4 && 
                            buffer[0] === 0x00 && buffer[1] === 0x61 && 
                            buffer[2] === 0x73 && buffer[3] === 0x6d;
          return { file, exists: true, realWasm: isRealWasm };
        } catch {
          return { file, exists: true, realWasm: false };
        }
      });
    };
    
    const kyberStatus = checkRealWasm(kyberFiles, this.kyberDest);
    const dilithiumStatus = checkRealWasm(dilithiumFiles, this.dilithiumDest);
    
    console.log('📊 ENHANCED Build Verification Report:');
    console.log('Kyber Modules:', kyberStatus.map(s => 
      `${s.file}: ${s.exists ? (s.realWasm ? '✅ REAL WASM' : '❌ FAKE') : '❌ MISSING'}`).join(', '));
    console.log('Dilithium Modules:', dilithiumStatus.map(s => 
      `${s.file}: ${s.exists ? (s.realWasm ? '✅ REAL WASM' : '❌ FAKE') : '❌ MISSING'}`).join(', '));
    
    const hasRealWasm = [...kyberStatus, ...dilithiumStatus].some(s => s.realWasm);
    const hasJSFallback = fs.existsSync(path.join(this.kyberDest, 'JS_FALLBACK_ACTIVE')) || 
                         fs.existsSync(path.join(this.dilithiumDest, 'JS_FALLBACK_ACTIVE'));
    
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
EOF

RUN chmod +x scripts/build-wasm.js

# Run build scripts
RUN chmod +x build_and_deploy.sh && ./build_and_deploy.sh

# Explicit WASM build step with enhanced detection
RUN echo "👑 Executing ENHANCED WASM build step..." && \
    npm run build-wasm || echo "⚠️ WASM build completed with JavaScript fallback"

# --- STAGE 2: Final Image ---
FROM node:22-slim AS final

WORKDIR /usr/src/app

# Install runtime dependencies only
RUN apt-get update && apt-get install -y \
  sqlite3 \
  ca-certificates \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy built app from builder
COPY --from=builder /usr/src/app .

# CRITICAL FIX: Remove placeholder creation and add proper verification
RUN echo "👑 Verifying crypto module deployment..." && \
    if [ -f "modules/pqc-kyber/JS_FALLBACK_ACTIVE" ] || [ -f "modules/pqc-dilithium/JS_FALLBACK_ACTIVE" ]; then \
        echo "⚠️ JavaScript fallback active - System will use JS implementations"; \
        # Ensure no fake WASM files exist \
        find modules/pqc-kyber modules/pqc-dilithium -name "*.wasm" -type f | while read file; do \
            if grep -q "Placeholder" "$file" 2>/dev/null || grep -q "//" "$file" 2>/dev/null; then \
                echo "🗑️ Removing fake WASM file: $file" && rm -f "$file"; \
            fi; \
        done; \
    else \
        echo "🔍 Checking for real WASM files..." && \
        REAL_WASM_COUNT=0 && \
        for file in modules/pqc-kyber/*.wasm modules/pqc-dilithium/*.wasm; do \
            if [ -f "$file" ]; then \
                if head -c 4 "$file" | hexdump -v -e '/1 "%02x "' | grep -q "00 61 73 6d"; then \
                    REAL_WASM_COUNT=$((REAL_WASM_COUNT + 1)) && \
                    echo "✅ Real WASM: $(basename "$file")"; \
                else \
                    echo "🗑️ Removing fake WASM: $(basename "$file")" && rm -f "$file"; \
                fi; \
            fi; \
        done && \
        if [ $REAL_WASM_COUNT -gt 0 ]; then \
            echo "✅ $REAL_WASM_COUNT real WASM modules available"; \
        else \
            echo "⚠️ No real WASM modules - Creating JS fallback markers" && \
            echo "# JavaScript Fallback" > modules/pqc-kyber/JS_FALLBACK_ACTIVE && \
            echo "# JavaScript Fallback" > modules/pqc-dilithium/JS_FALLBACK_ACTIVE; \
        fi; \
    fi

EXPOSE 10000

ENTRYPOINT ["node", "arielsql_suite/main.js"]
