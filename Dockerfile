# --- STAGE 1: Dependency Installation ---
# This stage installs all Node.js dependencies from the unified package.json.
FROM node:22-slim AS dependency-installer
WORKDIR /usr/src/app

# Install build tools required for native modules like better-sqlite3.
# The `build-essential` package includes GCC, G++, and Make.
# Python is needed for node-gyp, which handles the native module compilation.
RUN apt-get update && apt-get install -y python3 build-essential

# Copy the unified package.json and install all dependencies
COPY package.json ./
RUN npm install

# --- STAGE 2: Build & Final Image ---
# This final, lean image copies the necessary artifacts from the previous stage.
FROM node:22-slim AS final-image
WORKDIR /usr/src/app

# Copy the Node.js dependencies from the installer stage.
COPY --from=dependency-installer /usr/src/app/node_modules ./node_modules

# Copy the application source code with proper directory structure
# Copy entire backend directory
COPY backend/ ./backend/

# Copy other necessary directories
COPY arielsql_suite/ ./arielsql_suite/
COPY scripts/ ./scripts/
COPY database/ ./database/ 2>/dev/null || echo "Database directory not found, continuing without it"

# Copy configuration files
COPY package.json ./
COPY .env ./.env 2>/dev/null || echo ".env file not found, using environment variables"

# Create necessary directories if they don't exist
RUN mkdir -p ./data ./logs

# Set proper permissions for the app directory
RUN chown -R node:node /usr/src/app && \
    chmod -R 755 /usr/src/app

# Switch to non-root user for security
USER node

# Expose the port the application runs on.
EXPOSE 1000

# Health check to ensure the container is running properly
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:1000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# The command to start the application with the new entry point.
CMD ["node", "backend/agents/autonomous-ai-engine.js"]
