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

# Copy manifests
COPY package*.json ./

# Install deps safely:
# 1. Try npm ci
# 2. If integrity errors → remove lockfile + fallback to npm install
RUN (npm ci --no-audit --no-fund) || (rm -f package-lock.json && npm install --omit=dev --legacy-peer-deps --no-audit --no-fund)

# --- STAGE 2: Build & Final Image ---
FROM node:22-slim AS final-image

WORKDIR /usr/src/app

# Copy node_modules from builder
COPY --from=dependency-installer /usr/src/app/node_modules ./node_modules

# Copy app source
COPY backend/ ./backend/
COPY arielsql_suite ./arielsql_suite
COPY scripts ./scripts

# Copy maintenance scripts
COPY cleanup-conflicts.sh ./cleanup-conflicts.sh
COPY fix-structure.sh ./fix-structure.sh
RUN chmod +x ./cleanup-conflicts.sh ./fix-structure.sh

# Expose app port
EXPOSE 1000

# Entrypoint self-heals project before starting
ENTRYPOINT ["bash", "-c", "./fix-structure.sh && ./cleanup-conflicts.sh && node backend/agents/autonomous-ai-engine.js"]
