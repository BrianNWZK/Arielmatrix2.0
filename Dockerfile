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
COPY package.json ./
COPY package-lock.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# --- STAGE 2: Build & Final Image ---
FROM node:22-slim AS final-image

WORKDIR /usr/src/app

# Copy only the node_modules from the previous stage
COPY --from=dependency-installer /usr/src/app/node_modules ./node_modules

# Copy application source code
COPY backend/agents ./backend/agents
COPY arielsql_suite ./arielsql_suite
COPY scripts ./scripts
COPY backend/database ./backend/database

# Expose the application port
EXPOSE 1000

# Start the application
CMD ["node", "backend/agents/autonomous-ai-engine.js"]
