# syntax=docker/dockerfile:1.4

# Builder stage
FROM node:22.16.0 AS builder

# Install system dependencies for headless browsers, blockchain tools, SQLite, and Python
RUN apt-get update && apt-get install -y \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxi6 libxtst6 \
    libatk-bridge2.0-0 libgtk-3-0 libgbm-dev libasound2 fonts-noto \
    python3 python3-pip python3-venv \
    build-essential \
    sqlite3 libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create essential directories
RUN mkdir -p \
    config \
    scripts \
    contracts \
    public/scripts \
    frontend/public/assets \
    frontend/src/components \
    frontend/src/styles \
    backend/agents \
    backend/blockchain \
    backend/contracts \
    backend/database

# Copy package files first for caching
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY backend/package*.json ./backend/ || true  # Fallback if backend/package.json missing

# Install root dependencies with fallback
RUN echo "📦 Installing dependencies..." && \
    if [ -f "package-lock.json" ]; then npm ci --prefer-offline --no-audit; \
    else npm install --prefer-offline --no-audit; fi

# Novel dynamic dependency injection: Check and add missing core pkgs (e.g., express, ethers)
RUN echo "🔍 Checking and installing missing dependencies..." && \
    echo "try { require.resolve('express'); } catch (e) { process.exit(1); }" > check_express.js && \
    if ! node check_express.js; then npm install express@^4.21.0 --save; fi && \
    rm check_express.js && \
    # Add others based on project needs (from agents: axios for APIs, ethers for blockchain, ccxt for crypto/forex)
    npm install axios@^1.7.7 ethers@^5.7.2 ccxt@^4.4.0 sqlite3@^5.1.7 puppeteer@^24.16.0 playwright@^1.48.2 --save || true

# Install Python dependencies if requirements.txt exists
RUN if [ -f "requirements.txt" ]; then \
    echo "🐍 Installing Python dependencies..."; \
    pip3 install -r requirements.txt; \
fi

# Install blockchain tools if Hardhat configs present
RUN if ls hardhat.config.js >/dev/null 2>&1; then \
    echo "⛓️ Installing blockchain dependencies..."; \
    npm install -g hardhat; \
    npm install @nomicfoundation/hardhat-toolbox @openzeppelin/contracts; \
fi

# Copy all source files
COPY . .

# Build frontend if present
RUN if [ -d "frontend" ] && [ -f "frontend/package.json" ]; then \
    cd frontend && npm install --no-audit && npm run build; \
    cd ..; \
fi

# Install browser tools
RUN npx puppeteer@24.16.0 install --with-deps || true
RUN npx playwright@1.48.2 install chromium --with-deps || true

# Rebuild for AI if needed (e.g., tfjs for autonomous-core.js)
RUN if npm list @tensorflow/tfjs-node >/dev/null 2>&1; then npm rebuild @tensorflow/tfjs-node --build-from-source; fi

# Final production stage
FROM node:22.16.0-slim AS runtime

# Install minimal runtime deps
RUN apt-get update && apt-get install -y \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxi6 libxtst6 \
    libatk-bridge2.0-0 libgtk-3-0 libgbm-dev libasound2 fonts-noto \
    python3 sqlite3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy from builder
COPY --from=builder /app /app

# Move frontend build to public
RUN if [ -d "frontend/dist" ] || [ -d "frontend/build" ]; then mkdir -p public && cp -r frontend/dist/* public/ || cp -r frontend/build/* public/; fi

# Clean up
RUN rm -rf /app/.npm /app/.cache /tmp/* /var/tmp/*

# Ensure DB permissions
RUN mkdir -p data && chown -R node:node data

USER node

EXPOSE 3000

# Enhanced health check with AI/blockchain readiness
HEALTHCHECK --interval=30s --timeout=30s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Novel entrypoint: Use a script for runtime validation
ENTRYPOINT ["sh", "-c", "./scripts/prepare-build.sh && ./scripts/verify-docker-build.sh && ./scripts/fix-structure.sh && ./scripts/cleanup-conflicts.sh && exec node main.js || exec node serviceManager.js || exec node server.js"]
