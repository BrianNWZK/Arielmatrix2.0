# --- STAGE 1: Dependency Installation ---
FROM node:22-slim AS dependency-installer

WORKDIR /usr/src/app

# Install build tools for liboqs WASM
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    cmake \
    git \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g npm@10.9.3
RUN npm config set registry https://registry.npmmirror.com

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

# Install all dependencies (including local modules)
RUN npm install --legacy-peer-deps --no-audit --no-fund

# Verify web3 is installed
RUN npm list web3 || (echo "❌ web3 is missing after npm install" && exit 1)

# Copy the rest of the project
COPY . .

# Run build script
RUN chmod +x build_and_deploy.sh && ./build_and_deploy.sh
