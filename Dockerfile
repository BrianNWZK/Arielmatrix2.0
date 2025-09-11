# --- STAGE 1: Dependency Installation ---
FROM node:22-slim AS dependency-installer
WORKDIR /usr/src/app

# Install build tools needed for native modules
RUN apt-get update && apt-get install -y python3 build-essential \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy dependency manifests
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# --- STAGE 2: Build & Final Image ---
FROM node:22-slim AS final-image
WORKDIR /usr/src/app

# Copy dependencies
COPY --from=dependency-installer /usr/src/app/node_modules ./node_modules

# Copy source code
COPY . .

# Build frontend assets
RUN npm run build

# Expose app port
EXPOSE 1000

# Start the app
CMD ["node", "backend/agents/autonomous-ai-engine.js"]
