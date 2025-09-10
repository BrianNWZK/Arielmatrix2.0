# --- STAGE 1: Dependency Installation ---
FROM node:22-slim AS dependency-installer

WORKDIR /usr/src/app

# Install build tools required for native modules like better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# Copy dependency manifests first to leverage Docker layer caching
COPY package*.json ./

# Install dependencies deterministically (strictly from package-lock.json)
RUN npm ci --legacy-peer-deps --no-audit --no-fund

# --- STAGE 2: Build & Final Image ---
FROM node:22-slim AS final-image

WORKDIR /usr/src/app

# Copy only the node_modules from the previous stage
COPY --from=dependency-installer /usr/src/app/node_modules ./node_modules

# Copy application source code
COPY backend/agents ./backend/agents
COPY backend/database ./backend/database
COPY arielsql_suite ./arielsql_suite
COPY scripts ./scripts

# Copy and enable maintenance scripts inside container
COPY cleanup-conflicts.sh ./cleanup-conflicts.sh
COPY fix-structure.sh ./fix-structure.sh
RUN chmod +x ./cleanup-conflicts.sh ./fix-structure.sh

# Expose the application port
EXPOSE 1000

# ENTRYPOINT: fix project structure + cleanup conflicts, then start app
ENTRYPOINT ["bash", "-c", "./fix-structure.sh && ./cleanup-conflicts.sh && node backend/agents/autonomous-ai-engine.js"]
