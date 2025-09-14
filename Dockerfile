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

COPY package.json ./

# Remove stubbed dependencies if they exist in package.json
RUN sed -i '/"ai-security-module"/d' package.json \
 && sed -i '/"omnichain-interoperability"/d' package.json \
 && sed -i '/"infinite-scalability-engine"/d' package.json \
 && sed -i '/"carbon-negative-consensus"/d' package.json \
 && sed -i '/"ariel-sqlite-engine"/d' package.json

# Install all dependencies including pqc-dilithium local module
RUN npm install --legacy-peer-deps --no-audit --no-fund

# Build Dilithium WASM files inside the container
COPY modules/pqc-dilithium ./modules/pqc-dilithium
COPY build-wasm.js ./build-wasm.js
RUN node build-wasm.js

# --- STAGE 2: Build & Final Image ---
FROM node:22-slim AS final-image

WORKDIR /usr/src/app

# Copy node_modules from builder
COPY --from=dependency-installer /usr/src/app/node_modules ./node_modules

# Copy project sources
COPY backend ./backend
COPY arielsql_suite ./arielsql_suite

# Copy all 12 production-ready modules (including built pqc-dilithium WASM)
COPY --from=dependency-installer /usr/src/app/modules ./modules

# Copy scripts
COPY scripts ./scripts

# Copy helper scripts
COPY cleanup-conflicts.sh ./cleanup-conflicts.sh
RUN chmod +x ./cleanup-conflicts.sh 

COPY fix-structure.sh ./fix-structure.sh
RUN chmod +x fix-structure.sh && ./fix-structure.sh

ENV SERVICE_MANAGER_BOOTSTRAP=true

# ServiceManager will bind on this port
EXPOSE 10000
EXPOSE 10001

# Entrypoint: cleanup, then start
ENTRYPOINT ["bash", "-c", "./cleanup-conflicts.sh && node arielsql_suite/main.js"]
