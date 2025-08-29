# syntax=docker/dockerfile:1.4

# Builder stage
FROM node:22.16.0 AS builder

# Install system dependencies for headless browsers and blockchain tools
RUN apt-get update && apt-get install -y \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxi6 libxtst6 \
    libatk-bridge2.0-0 libgtk-3-0 libgbm-dev libasound2 fonts-noto \
    python3 python3-pip python3-venv \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create essential directories first to avoid conflicts
RUN mkdir -p \
    config \
    scripts \
    contracts \
    public \
    arielmatrix2.0 \
    frontend \
    backend/agents \
    backend/blockchain \
    backend/database \
    backend/contracts \
    public/scripts \
    frontend/public \
    frontend/src \
    frontend/src/components \
    frontend/src/styles

# Create minimal package.json files upfront
RUN echo '{"name": "arielsql-suite", "version": "1.0.0", "dependencies": {}}' > package.json
RUN echo '{"name": "arielsql-backend", "version": "1.0.0", "dependencies": {}}' > backend/package.json

# Copy package files for better caching - FIXED: No shell operators in COPY
COPY package*.json ./

# Copy backend package files if they exist (using conditional copy pattern)
COPY backend/package*.json ./backend/

# Install root dependencies
RUN echo "📦 Installing dependencies..." && \
    if [ -f "package.json" ] && [ -s "package.json" ]; then \
        npm ci --prefer-offline --no-audit --progress=false; \
    else \
        echo "ℹ️ No valid package.json found, installing default dependencies" && \
        npm install express cors dotenv axios puppeteer playwright; \
    fi

# Copy all source files
COPY --chown=node:node . .

# Frontend build process
RUN if [ -d "frontend" ] && [ -f "frontend/package.json" ]; then \
    echo "🏗️ Building frontend..."; \
    cd frontend && npm install --no-audit --no-fund --silent && npm run build; \
else \
    echo "ℹ️ Frontend not found or no package.json, skipping build"; \
fi

# Install Python dependencies for arielmatrix2.0
RUN if [ -f "arielmatrix2.0/requirements.txt" ]; then \
    echo "🐍 Installing Python dependencies..."; \
    pip3 install -r arielmatrix2.0/requirements.txt; \
else \
    echo "ℹ️ No Python requirements found"; \
fi

# Install blockchain dependencies
RUN if [ -f "hardhat.config.js" ] || [ -f "arielmatrix2.0/hardhat.config.js" ]; then \
    echo "⛓️ Installing blockchain dependencies..."; \
    npm install -g hardhat; \
    npm install @nomiclabs/hardhat-waffle ethereum-waffle chai @nomiclabs/hardhat-ethers ethers; \
fi

# Install browser automation tools
RUN npx -y puppeteer@latest install --with-deps 2>/dev/null || echo "⚠️ Puppeteer installation skipped"
RUN npx -y playwright@latest install chromium --with-deps 2>/dev/null || echo "⚠️ Playwright installation skipped"

# Final production stage
FROM node:22.16.0-slim AS runtime

# Install minimal runtime dependencies
RUN apt-get update && apt-get install -y \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxi6 libxtst6 \
    libatk-bridge2.0-0 libgtk-3-0 libgbm-dev libasound2 fonts-noto \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -r -m -u 1001 appuser

WORKDIR /app

# Copy built artifacts from builder
COPY --from=builder --chown=appuser:appuser /app /app

# Move frontend build artifacts to public if they exist
RUN if [ -d "./frontend/dist" ]; then \
    mkdir -p ./public && cp -r ./frontend/dist/* ./public/; \
    elif [ -d "./frontend/build" ]; then \
    mkdir -p ./public && cp -r ./frontend/build/* ./public/; \
fi

# Clean up unnecessary files
RUN rm -rf \
    /app/.npm \
    /app/.cache \
    /app/frontend/node_modules \
    /app/backend/node_modules \
    /usr/local/share/.cache \
    /tmp/* \
    /var/tmp/*

USER appuser

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health >/dev/null 2>&1 || wget -q --spider http://localhost:3000/health || exit 1

# Start command with multiple entry points
CMD ["sh", "-c", \
    "echo '🔍 Looking for entry points...'; \
    if [ -f 'server.js' ]; then \
        echo '🚀 Starting server.js'; \
        exec node server.js; \
    elif [ -f 'main.js' ]; then \
        echo '🚀 Starting main.js'; \
        exec node main.js; \
    elif [ -f 'serviceManager.js' ]; then \
        echo '🚀 Starting serviceManager.js'; \
        exec node serviceManager.js; \
    elif [ -f 'backend/server.js' ]; then \
        echo '🚀 Starting backend/server.js'; \
        exec node backend/server.js; \
    elif [ -f 'backend/main.js' ]; then \
        echo '🚀 Starting backend/main.js'; \
        exec node backend/main.js; \
    else \
        echo '❌ No main server file found. Available JavaScript files:'; \
        find . -name '*.js' -type f | head -20; \
        echo '💤 Starting sleep to keep container alive...'; \
        exec sleep infinity; \
    fi"]
