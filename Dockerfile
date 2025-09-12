# --- STAGE 1: Dependency Installation ---
FROM node:22-slim AS dependency-installer

WORKDIR /usr/src/app

# Install build tools required for native modules like better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# Pin npm to stable version (avoid npm 11.x regressions)
RUN npm install -g npm@10.9.3

# Use a reliable registry mirror to avoid tarball corruption
RUN npm config set registry https://registry.npmmirror.com

# Copy dependency manifests
COPY package.json ./

# Remove internal modules (they will be handled by ServiceManager at runtime)
RUN sed -i '/"ai-security-module"/d' package.json \
 && sed -i '/"quantum-resistant-crypto"/d' package.json \
 && sed -i '/"omnichain-interoperability"/d' package.json \
 && sed -i '/"infinite-scalability-engine"/d' package.json \
 && sed -i '/"carbon-negative-consensus"/d' package.json \
 && sed -i '/"ariel-sqlite-engine"/d' package.json

# Install only public dependencies
RUN npm install --legacy-peer-deps --no-audit --no-fund

# --- STAGE 2: Build & Final Image ---
FROM node:22-slim AS final-image

WORKDIR /usr/src/app

# Copy node_modules from builder
COPY --from=dependency-installer /usr/src/app/node_modules ./node_modules

# Copy application source
COPY backend/ ./backend/
COPY arielsql_suite ./arielsql_suite
COPY scripts ./scripts

# Copy maintenance scripts
COPY cleanup-conflicts.sh ./cleanup-conflicts.sh
COPY fix-structure.sh ./fix-structure.sh
RUN chmod +x ./cleanup-conflicts.sh ./fix-structure.sh

# Environment
ENV SERVICE_MANAGER_BOOTSTRAP=true
ENV PORT=10000

# Expose the correct port
EXPOSE 10000

# Entrypoint: clean, fix structure, launch ServiceManager via main.js
ENTRYPOINT ["bash", "-c", "./fix-structure.sh && ./cleanup-conflicts.sh && node arielsql_suite/main.js"]
