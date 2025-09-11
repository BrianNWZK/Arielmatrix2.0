# --- STAGE 1: Dependency Installation ---
FROM node:22-slim AS dependency-installer

WORKDIR /usr/src/app

# Install build tools required for native modules like better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# Ensure npm version is stable
RUN npm install -g npm@10.9.3

# Copy dependency manifests first to leverage Docker layer caching
COPY package*.json ./

# Install dependencies deterministically (strictly from package-lock.json)
RUN npm ci --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund --legacy-peer-deps

# --- STAGE 2: Build & Final Image ---
FROM node:22-slim AS final-image

WORKDIR /usr/src/app

# Copy node_modules from builder
COPY --from=dependency-installer /usr/src/app/node_modules ./node_modules

# Copy application source code (including blockchain directory)
COPY backend/ ./backend/

# Copy necessary scripts and configuration
COPY arielsql_suite ./arielsql_suite
COPY scripts ./scripts

# Copy and enable maintenance scripts inside container
COPY cleanup-conflicts.sh ./cleanup-conflicts.sh
COPY fix-structure.sh ./fix-structure.sh
RUN chmod +x ./cleanup-conflicts.sh ./fix-structure.sh

# Expose app port
EXPOSE 1000

# Entrypoint: run self-heal and then start app
ENTRYPOINT ["bash", "-c", "./fix-structure.sh && ./cleanup-conflicts.sh && node backend/agents/autonomous-ai-engine.js"]
