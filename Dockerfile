# --- STAGE 1: Dependency Installer ---
# FIX: Switching to the stable Node.js LTS major version (20-slim) to resolve
#      the previous I/O timeout and the 'not found' errors.
FROM node:20-slim AS builder

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

# Remove stubbed dependencies from package.json (All original logic preserved)
RUN sed -i '/"ai-security-module"/d' package.json \
  && sed -i '/"omnichain-interoperability"/d' package.json \
  && sed -i '/"infinite-scalability-engine"/d' package.json \
  && sed -i '/"carbon-negative-consensus"/d' package.json \
  && sed -i '/"ariel-sqlite-engine"/d' package.json

# Install dependencies with fallback (Original logic preserved)
RUN if [ -f package-lock.json ]; then \
      npm ci --legacy-peer-deps --no-audit --no-fund --prefer-offline || \
      npm install --legacy-peer-deps --no-audit --no-fund --prefer-offline; \
    fi

# 🎯 CRITICAL FIX: Guaranteed installation for web3 and axios.
# This ensures critical modules are present, solving the "web3 missing" error.
RUN npm install web3 axios --no-audit --no-fund --legacy-peer-deps

# Remove problematic modules (Original logic preserved)
RUN rm -rf node_modules/@tensorflow node_modules/sqlite3 node_modules/.cache 2>/dev/null || true

# Verify critical modules (Now guaranteed to pass)
RUN npm list web3 || (echo "❌ web3 missing" && exit 1)
RUN npm list axios || (echo "❌ axios missing" && exit 1)

# Copy full project (Original logic preserved)
COPY . .

# Run build script (Original logic preserved)
RUN chmod +x build_and_deploy.sh && ./build_and_deploy.sh

# --- STAGE 2: Final Image ---
# FIX: Must match the builder image tag (node:20-slim)
FROM node:20-slim AS final

WORKDIR /usr/src/app

# Copy built app from builder
COPY --from=builder /usr/src/app .

EXPOSE 10000

ENTRYPOINT ["node", "arielsql_suite/main.js"]
