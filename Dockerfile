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

# Copy the application source code.
# This assumes your main entry file is in the 'backend/agents/' directory.
COPY backend/agents/autonomous-ai-engine.js ./backend/agents/
COPY arielsql_suite ./arielsql_suite
COPY scripts ./scripts
COPY package.json ./

# Expose the port the application runs on.
EXPOSE 1000

# The command to start the application with the new entry point.
CMD ["node", "backend/agents/autonomous-ai-engine.js"]
