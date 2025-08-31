# syntax=docker/dockerfile:1.4

# Builder stage: A robust build environment for all build tasks.
FROM node:22.16.0 AS arielmatrix_builder

# === SYSTEM DEPENDENCY GUARANTEE ===
RUN apt-get update && apt-get install -y \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxi6 libxtst6 \
    libatk-bridge2.0-0 libgtk-3-0 libgbm-dev libasound2 fonts-noto \
    python3 python3-pip python3-venv build-essential sqlite3 libsqlite3-dev \
    git curl \
    && rm -rf /var/lib/apt/lists/* && apt-get clean

WORKDIR /app

# === PACKAGE.JSON GUARANTEE & DEPENDENCY RESOLUTION ===
# Copy all project files into the container. This is the crucial fix.
COPY . .

# Build backend dependencies
WORKDIR /app/backend
RUN npm install --prefer-offline --no-audit --ignore-optional

# Build frontend dependencies and assets
WORKDIR /app/frontend
RUN npm install --prefer-offline --no-audit && npm run build

# Switch back to the main working directory
WORKDIR /app

# Rebuild native modules for the backend
RUN if npm list @tensorflow/tfjs-node >/dev/null 2>&1; then npm rebuild @tensorflow/tfjs-node --build-from-source; fi
RUN if npm list better-sqlite3 >/dev/null 2>&1; then npm rebuild better-sqlite3 --build-from-source; fi

# Install Python dependencies
RUN if [ -f "requirements.txt" ]; then pip3 install -r requirements.txt; fi

# Configure Hardhat
RUN if [ -f "hardhat.config.js" ]; then npm install -g hardhat && npm install @nomicfoundation/hardhat-toolbox @openzeppelin/contracts; fi

# Ensure scripts are executable
RUN chmod -R +x scripts/*.sh || true

# === Runtime stage: A lightweight container for the final application. ===
FROM node:22.16.0-slim AS arielmatrix_runtime

# === SYSTEM DEPENDENCY GUARANTEE ===
RUN apt-get update && apt-get install -y \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxi6 libxtst6 \
    libatk-bridge2.0-0 libgtk-3-0 libgbm-dev libasound2 fonts-noto \
    python3 sqlite3 curl \
    && rm -rf /var/lib/apt/lists/* && apt-get clean

WORKDIR /app

# Copy the built application from the builder stage
COPY --from=arielmatrix_builder /app /app

# Ensure correct permissions
RUN chown -R node:node /app
USER node

# === AUTONOMOUS AI ENVIRONMENT SETUP ===
ENV NODE_ENV=production
ENV AUTONOMOUS_AI=true
ENV QUANTUM_MODE=enabled

# === EXPOSE PORT & HEALTHCHECK ===
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=10s --start-period=5s --retries=5 \
    CMD curl -f http://localhost:3000/health || exit 1

# === QUANTUM ENTRYPOINT ===
ENTRYPOINT ["node", "/app/scripts/quantum-entrypoint.js"]
