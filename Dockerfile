# syntax=docker/dockerfile:1.4

# Builder stage: A robust build environment for all build tasks.
FROM node:22-alpine AS arielmatrix_builder

# === SYSTEM DEPENDENCY GUARANTEE ===
# Install essential dependencies for building native modules. Alpine uses apk.
RUN apk add --no-cache python3 make g++ git curl

WORKDIR /app

# === PACKAGE.JSON GUARANTEE & DEPENDENCY RESOLUTION ===
# Copy only the package manifest to leverage Docker layer caching.
COPY package*.json ./

# Install ALL dependencies from the unified package.json
RUN npm install

# Copy the rest of the application source code.
COPY . .

# === UNIFIED BUILD COMMAND ===
# Run the single 'build' script from package.json to build the entire application.
RUN npm run build

# === Runtime stage: A lightweight container for the final application. ===
FROM node:22-alpine AS arielmatrix_runtime

# Install only essential runtime dependencies.
RUN apk add --no-cache curl

WORKDIR /app

# Copy the built application and dependencies from the builder stage.
COPY --from=arielmatrix_builder /app/node_modules ./node_modules
COPY --from=arielmatrix_builder /app/dist ./dist
COPY --from=arielmatrix_builder /app/arielsql_suite ./arielsql_suite
COPY --from=arielmatrix_builder /app/backend ./backend
COPY --from=arielmatrix_builder /app/public ./public
# Copy any other necessary runtime directories/files here.

# === AUTONOMOUS AI ENVIRONMENT SETUP ===
ENV NODE_ENV=production
ENV AUTONOMOUS_AI=true
ENV QUANTUM_MODE=enabled

# === EXPOSE PORT & HEALTHCHECK ===
EXPOSE 10000
HEALTHCHECK --interval=15s --timeout=10s --start-period=5s --retries=5 \
  CMD curl -f http://localhost:10000/health || exit 1

# === QUANTUM ENTRYPOINT ===
# The ENTRYPOINT points to the main server file.
ENTRYPOINT ["node", "/app/arielsql_suite/server.js"]
