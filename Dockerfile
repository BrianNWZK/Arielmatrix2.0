# --- STAGE 1: Dependency Installation ---
FROM node:22-slim AS dependency-installer
WORKDIR /usr/src/app

# Install build tools required for native modules like better-sqlite3
RUN apt-get update && apt-get install -y python3 build-essential

# Copy package.json and package-lock.json (if present) to install dependencies first
COPY package.json ./  
COPY package-lock.json ./   # Ensure both files are copied
RUN npm install

# --- STAGE 2: Build & Final Image ---
FROM node:22-slim AS final-image
WORKDIR /usr/src/app

# Copy the necessary node_modules from the installer stage
COPY --from=dependency-installer /usr/src/app/node_modules ./node_modules

# Copy application source code
COPY backend/agents ./backend/agents
COPY arielsql_suite ./arielsql_suite
COPY scripts ./scripts
COPY backend/database ./backend/database

# Expose the port the application runs on
EXPOSE 1000

# Command to start the application
CMD ["node", "backend/agents/autonomous-ai-engine.js"]
