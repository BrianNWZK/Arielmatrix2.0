# --- STAGE 1: Dependency Installation ---
FROM node:22-slim AS dependency-installer

WORKDIR /usr/src/app

# Install build tools for liboqs WASM
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    cmake \
    git \
    sqlite3 \
    libsqlite3-dev \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g npm@10.9.3

# Use official npm registry for better reliability
RUN npm config set registry https://registry.npmjs.org
RUN npm config set fund false
RUN npm config set audit false
RUN npm config set progress false
RUN npm config set legacy-peer-deps true

# Copy package.json and local modules first for dependency caching
COPY package.json ./
COPY modules/pqc-dilithium ./modules/pqc-dilithium
COPY modules/pqc-kyber ./modules/pqc-kyber

# Remove stubbed dependencies if they exist in package.json
RUN sed -i '/"ai-security-module"/d' package.json \
 && sed -i '/"omnichain-interoperability"/d' package.json \
 && sed -i '/"infinite-scalability-engine"/d' package.json \
 && sed -i '/"carbon-negative-consensus"/d' package.json \
 && sed -i '/"ariel-sqlite-engine"/d' package.json

# Clean npm cache and install dependencies
RUN npm cache clean --force
RUN npm install --legacy-peer-deps --no-audit --no-fund --prefer-offline

# Clean up problematic node_modules directory if it exists
RUN rm -rf node_modules/@tensorflow 2>/dev/null || true

# Verify web3 is installed
RUN npm list web3 || (echo "❌ web3 is missing after npm install" && exit 1)

# Copy the rest of the project
COPY . .

# Run build script
RUN chmod +x build_and_deploy.sh && ./build_and_deploy.sh
