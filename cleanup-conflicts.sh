#!/bin/bash
# ============================================================
# cleanup-conflicts.sh
# Production-ready script that handles file-directory conflicts,
# dependency issues, and import fixes
# ============================================================

set -euo pipefail

log() { echo -e "\033[1;34mℹ️  $1\033[0m"; }
ok() { echo -e "\033[1;32m✅ $1\033[0m"; }
warn() { echo -e "\033[1;33m⚠️  $1\033[0m"; }
err() { echo -e "\033[1;31m❌ $1\033[0m"; }

# Create scripts directory if it doesn't exist
mkdir -p scripts

# ============================================================
# 1. DEPENDENCY CHECK SCRIPT
# ============================================================
cat > scripts/check-deps.js << 'EOF'
import { readFileSync } from 'fs';

const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));
const deprecated = [
  'yaeti', 'npmlog@5', 'npmlog@6', 'inflight', 'glob@7', 'gauge@3', 'gauge@4',
  'are-we-there-yet', '@npmcli/move-file@1', '@npmcli/move-file@2', 'rimraf@2', 'rimraf@3'
];

const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
let hasDeprecated = false;

console.log('🔍 Checking for deprecated dependencies...\n');

Object.entries(deps).forEach(([pkg, version]) => {
  deprecated.forEach(deprecatedPkg => {
    if (pkg === deprecatedPkg.split('@')[0] || deprecatedPkg.startsWith(pkg)) {
      console.warn(`⚠️  Deprecated package: ${pkg}@${version}`);
      hasDeprecated = true;
    }
  });
});

// Check for critical version mismatches
const criticalChecks = [
  { pkg: '@solana/web3.js', min: '1.87.0' },
  { pkg: '@solana/spl-token', min: '0.3.9' },
  { pkg: 'ethers', min: '6.10.0' },
  { pkg: 'rimraf', min: '5.0.0' },
  { pkg: 'glob', min: '10.0.0' }
];

criticalChecks.forEach(({ pkg, min }) => {
  if (deps[pkg]) {
    const current = deps[pkg].replace(/[^0-9.]/g, '');
    if (current < min) {
      console.warn(`⚠️  ${pkg} version ${current} is below minimum ${min}`);
      hasDeprecated = true;
    }
  }
});

if (!hasDeprecated) {
  console.log('✅ No deprecated or outdated packages found');
  process.exit(0);
} else {
  console.log('\n🚨 Please update deprecated packages above');
  process.exit(1);
}
EOF

# ============================================================
# 2. DEPENDENCY FIX SCRIPT
# ============================================================
cat > scripts/fix-dependencies.js << 'EOF'
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

const updates = {
  'yaeti': 'npm uninstall yaeti', // remove deprecated
  'npmlog': 'npm install pino --save', // replace with modern logger
  'inflight': 'npm uninstall inflight && npm install lru-cache --save',
  'glob@7': 'npm install glob@^10.0.0 --save',
  'gauge': 'npm uninstall gauge', // remove
  'are-we-there-yet': 'npm uninstall are-we-there-yet', // remove
  'rimraf@2': 'npm install rimraf@^5.0.0 --save',
  'rimraf@3': 'npm install rimraf@^5.0.0 --save',
  '@npmcli/move-file@1': 'npm install @npmcli/move-file@^3.0.0 --save',
  '@npmcli/move-file@2': 'npm install @npmcli/move-file@^3.0.0 --save'
};

console.log('🔄 Fixing deprecated dependencies...');

// Update package.json first to prevent conflicts
try {
  const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));
  
  // Remove deprecated packages from dependencies
  const deprecatedPkgs = ['yaeti', 'npmlog', 'inflight', 'gauge', 'are-we-there-yet'];
  deprecatedPkgs.forEach(pkg => {
    if (packageJson.dependencies && packageJson.dependencies[pkg]) {
      delete packageJson.dependencies[pkg];
    }
    if (packageJson.devDependencies && packageJson.devDependencies[pkg]) {
      delete packageJson.devDependencies[pkg];
    }
  });

  // Ensure updated versions
  packageJson.dependencies = {
    ...packageJson.dependencies,
    'glob': '^10.0.0',
    'rimraf': '^5.0.0',
    '@npmcli/move-file': '^3.0.0',
    'lru-cache': '^10.0.0',
    'pino': '^8.15.0'
  };

  writeFileSync('./package.json', JSON.stringify(packageJson, null, 2));
  console.log('✅ Updated package.json');
} catch (error) {
  console.warn('⚠️ Could not update package.json:', error.message);
}

// Execute updates
Object.entries(updates).forEach(([pkg, command]) => {
  try {
    console.log(`Updating ${pkg}...`);
    execSync(command, { stdio: 'inherit' });
  } catch (error) {
    console.warn(`Could not update ${pkg}:`, error.message);
  }
});

console.log('✅ Dependency fixes completed');
EOF

# ============================================================
# 3. IMPORT FIX SCRIPT
# ============================================================
cat > scripts/fix-imports.js << 'EOF'
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🔧 Fixing import issues...');

const importFixes = [
  {
    file: 'backend/agents/dataAgent.js',
    find: 'import { Connection, PublicKey, LAMPORTS_PER_SOL, Keypair, Transaction, SystemProgram, sendAndConfirmTransaction } from \'@solana/spl-token\';',
    replace: `import { Connection, PublicKey, LAMPORTS_PER_SOL, Keypair, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction } from '@solana/spl-token';`
  },
  {
    file: 'backend/agents/wallet.js',
    find: 'import { getAssociatedTokenAddress, createTransferInstruction } from \'@solana/spl-token\';',
    replace: 'import { getAssociatedTokenAddress, createTransferInstruction, createAssociatedTokenAccountInstruction } from \'@solana/spl-token\';'
  },
  {
    file: 'backend/blockchain/BrianNwaezikePayoutSystem.js',
    find: 'import { wallet } from \'./wallet.js\';',
    replace: `import {
  initializeConnections,
  getWalletBalances,
  getWalletAddresses,
  sendSOL,
  sendETH,
  sendUSDT,
  processRevenuePayment,
  checkBlockchainHealth,
  validateAddress,
  formatBalance,
  testAllConnections,
} from '../agents/wallet.js';`
  },
  {
    file: 'backend/agents/apiScoutAgent.js',
    find: 'import QuantumBrowserManager from \'./browserManager.js\';',
    replace: 'import { QuantumBrowserManager } from \'./browserManager.js\';'
  }
];

let fixesApplied = 0;

importFixes.forEach(({ file, find, replace }) => {
  if (existsSync(file)) {
    try {
      let content = readFileSync(file, 'utf8');
      if (content.includes(find)) {
        content = content.replace(find, replace);
        writeFileSync(file, content, 'utf8');
        console.log(`✅ Fixed imports in ${file}`);
        fixesApplied++;
      }
    } catch (error) {
      console.warn(`⚠️ Could not fix ${file}:`, error.message);
    }
  }
});

console.log(`✅ Applied ${fixesApplied} import fixes`);
EOF

# ============================================================
# 4. MAIN CLEANUP LOGIC
# ============================================================
log "🧹 Starting comprehensive cleanup..."

# Fix file-directory conflicts
conflicts=("arielmatrix2.0" "config" "scripts" "contracts" "public" "frontend" "backend")

for item in "${conflicts[@]}"; do
    if [ -f "$item" ]; then
        warn "File detected where directory should be: $item"
        rm -f "$item" || { err "Failed to remove file: $item"; exit 1; }
        mkdir -p "$item" || { err "Failed to create directory: $item"; exit 1; }
        ok "Replaced file with directory: $item"
    elif [ -d "$item" ]; then
        ok "$item is already a directory"
    else
        log "$item does not exist — creating directory"
        mkdir -p "$item" || { err "Failed to create directory: $item"; exit 1; }
        ok "Created directory: $item"
    fi
done

# Run dependency checks and fixes
log "🔍 Running dependency checks..."
node scripts/check-deps.js || {
    warn "Dependency issues found - attempting fixes..."
    node scripts/fix-dependencies.js
}

# Fix import issues
log "🔧 Fixing import issues..."
node scripts/fix-imports.js

# Quick npm audit and fix
log "📦 Running npm audit..."
npm audit fix --force 2>/dev/null || true

# Clean npm cache
log "🧹 Cleaning npm cache..."
npm cache clean --force

# Final dependency check
log "🔍 Final dependency check..."
if node scripts/check-deps.js; then
    ok "All dependencies are up to date"
else
    warn "Some dependencies may need manual attention"
fi

ok "Comprehensive cleanup complete!"
