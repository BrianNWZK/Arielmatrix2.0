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

# Copy package.json first for dependency caching
COPY package.json ./

# Remove stubbed dependencies if they exist in package.json
RUN sed -i '/"ai-security-module"/d' package.json \
 && sed -i '/"omnichain-interoperability"/d' package.json \
 && sed -i '/"infinite-scalability-engine"/d' package.json \
 && sed -i '/"carbon-negative-consensus"/d' package.json \
 && sed -i '/"ariel-sqlite-engine"/d' package.json

# Install base dependencies (local module will be copied later)
RUN npm install --legacy-peer-deps --no-audit --no-fund

# Copy the rest of the project so build_and_deploy.sh can see all files
COPY . .

# Make build script executable and run it (installs missing deps, builds WASM)
RUN chmod +x build_and_deploy.sh && ./build_and_deploy.sh

# --- STAGE 2: Build & Final Image ---
FROM node:22-slim AS final-image

WORKDIR /usr/src/app

# Copy node_modules from builder
COPY --from=dependency-installer /usr/src/app/node_modules ./node_modules

# Copy project sources from builder (ensures built WASM is included)
COPY --from=dependency-installer /usr/src/app/backend ./backend
COPY --from=dependency-installer /usr/src/app/arielsql_suite ./arielsql_suite
COPY --from=dependency-installer /usr/src/app/modules ./modules
COPY --from=dependency-installer /usr/src/app/scripts ./scripts
COPY --from=dependency-installer /usr/src/app/cleanup-conflicts.sh ./cleanup-conflicts.sh

RUN chmod +x ./cleanup-conflicts.sh 

ENV SERVICE_MANAGER_BOOTSTRAP=true

# ServiceManager will bind on this port
EXPOSE 10000
EXPOSE 10001

# Entrypoint: cleanup, then start
ENTRYPOINT ["bash", "-c", "./cleanup-conflicts.sh && node arielsql_suite/main.js"]
