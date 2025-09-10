# --- STAGE 1: Dependency Installation ---
FROM node:22-slim AS dependency-installer
WORKDIR /usr/src/app

# Install build tools needed for native modules (e.g., node-gyp).
RUN apt-get update && apt-get install -y python3 build-essential

# Copy the unified package.json and install all dependencies
COPY package.json ./
RUN npm install

# --- STAGE 2: Build & Final Image ---
FROM node:22-slim AS final-image
WORKDIR /usr/src/app

# Copy the Node.js dependencies from the installer stage.
COPY --from=dependency-installer /usr/src/app/node_modules ./node_modules

# Copy the application source code for the build step
COPY . .

# Build the frontend assets. This command will create the 'dist' folder.
RUN npm run build

# Expose the port the application runs on.
EXPOSE 1000

# The command to start the application with the new entry point.
CMD ["node", "backend/agents/autonomous-ai-engine.js"]
