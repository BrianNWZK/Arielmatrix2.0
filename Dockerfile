# --- STAGE 1: Dependency Installation ---
FROM node:22-slim AS dependency-installer
WORKDIR /usr/src/app

# Install build tools required for native modules like better-sqlite3
RUN apt-get update && apt-get install -y python3 build-essential

# Copy dependency manifests
COPY package.json ./
COPY package-lock.json ./
RUN npm install

# --- STAGE 2: Build & Final Image ---
FROM node:22-slim AS final-image
WORKDIR /usr/src/app

# Copy node_modules from builder stage
COPY --from=dependency-installer /usr/src/app/node_modules ./node_modules

# Copy application source code
COPY backend/agents ./backend/agents
COPY backend/database ./backend/database
COPY arielsql_suite ./arielsql_suite
COPY scripts ./scripts

# Copy cleanup-conflicts.sh into the container
COPY cleanup-conflicts.sh ./cleanup-conflicts.sh
RUN chmod +x ./cleanup-conflicts.sh

# Expose the port
EXPOSE 1000

# ENTRYPOINT runs cleanup first, then starts the app
ENTRYPOINT ["bash", "-c", "./cleanup-conflicts.sh && node backend/agents/autonomous-ai-engine.js"]
