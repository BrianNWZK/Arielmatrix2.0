# =========================================================================
# QUANTUM AI PRODUCTION DOCKERFILE - Unified package.json with lockfile
# =========================================================================

FROM node:22-slim AS dependency-installer
WORKDIR /usr/src/app

# Install system dependencies for native modules
RUN apt-get update && apt-get install -y python3 build-essential curl && rm -rf /var/lib/apt/lists/*

# Copy package.json + package-lock.json for reproducible installs
COPY package*.json ./
COPY package-lock.json ./

# Install all dependencies, including devDependencies for build
RUN npm ci

# Build optimizer
FROM node:22-slim AS build-optimizer
WORKDIR /usr/src/app

COPY package*.json ./
COPY package-lock.json ./
RUN npm ci

# Now explicitly copy the rest of your source files
# Ensure the context is correct when building the Docker image
COPY ./ .  # Copy the rest of the project files from the local directory

# Run build if specified in package.json
RUN if [ -f "package.json" ] && grep -q "\"build\":" package.json; then npm run build; fi

# Final production image
FROM node:22-slim AS final
WORKDIR /usr/src/app

ENV NODE_ENV=production

RUN adduser --system --no-create-home --group nodeuser

COPY package*.json ./
COPY package-lock.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy the built code from the build-optimizer stage
COPY --from=build-optimizer /usr/src/app/backend ./backend
COPY --from=build-optimizer /usr/src/app/arielsql_suite ./arielsql_suite
COPY --from=build-optimizer /usr/src/app/config ./config
COPY --from=build-optimizer /usr/src/app/public ./public
COPY --from=build-optimizer /usr/src/app/frontend/dist ./frontend/dist
COPY --from=build-optimizer /usr/src/app/scripts ./scripts

# Set the user as non-root for security
RUN chown -R nodeuser:nodeuser /usr/src/app
USER nodeuser

# Expose the port that your app listens on
EXPOSE 1000

# Healthcheck to ensure the container is working
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=5 \
  CMD curl -f http://localhost:1000/agents/status || exit 1

# Start command
CMD ["npm", "start"]
