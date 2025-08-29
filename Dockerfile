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

# Copy package files with proper error handling
COPY package*.json ./
RUN if [ -f "package.json" ]; then echo "✅ Found package.json"; else echo "⚠️ package.json not found" && touch package.json; fi

# Handle backend package files - FIXED SYNTAX
RUN mkdir -p backend
RUN if ls backend/package*.json 1> /dev/null 2>&1; then \
    echo "✅ Found backend package files"; \
    cp backend/package*.json ./backend/; \
else \
    echo "⚠️ backend/package*.json not found - creating empty"; \
    touch backend/package.json; \
fi

# Install root dependencies if package.json exists
RUN if [ -f "package.json" ] && [ -s "package.json" ]; then \
    npm ci --prefer-offline --no-audit --progress=false; \
else \
    echo "ℹ️ No valid package.json found, skipping npm install"; \
fi

# Copy all files with proper permissions
COPY --chown=node:node . .

# Ensure all required directories exist
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

# Frontend build process
RUN if [ -d "frontend" ] && [ -f "frontend/package.json" ]; then \
    echo "🏗️ Building frontend..."; \
    cd frontend && npm install --no-audit --no-fund --silent && npm run build; \
else \
    echo "ℹ️ Frontend not found, skipping build"; \
fi

# Install Python dependencies for arielmatrix2.0 if requirements exist
RUN if [ -f "arielmatrix2.0/requirements.txt" ]; then \
    echo "🐍 Installing Python dependencies..."; \
    pip3 install -r arielmatrix2.0/requirements.txt; \
else \
    echo "ℹ️ No Python requirements found"; \
fi

# Install blockchain dependencies if hardhat config exists
RUN if [ -f "hardhat.config.js" ] || [ -f "arielmatrix2.0/hardhat.config.js" ]; then \
    echo "⛓️ Installing blockchain dependencies..."; \
    npm install -g hardhat; \
    npm install @nomiclabs/hardhat-waffle ethereum-waffle chai @nomiclabs/hardhat-ethers ethers; \
fi

# Install Puppeteer and Playwright for browser automation
RUN { npx -y puppeteer@latest install --with-deps 2>/dev/null || \
    echo "⚠️ Puppeteer installation skipped"; }

RUN { npx -y playwright@latest install chromium --with-deps 2>/dev/null || \
    echo "⚠️ Playwright installation skipped"; }

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

# Copy built artifacts from builder with proper permissions
COPY --from=builder --chown=appuser:appuser /app /app

# Move frontend build artifacts to public if they exist
RUN if [ -d "./frontend/dist" ]; then \
    mkdir -p ./public && cp -r ./frontend/dist/* ./public/; \
    elif [ -d "./frontend/build" ]; then \
    mkdir -p ./public && cp -r ./frontend/build/* ./public/; \
fi

# Clean up unnecessary files to reduce image size
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
    CMD curl -f http://localhost:3000/health || wget -q --spider http://localhost:3000/health || exit 1

# Start command optimized for your project structure
CMD ["sh", "-c", \
    "if [ -f 'server.js' ]; then \
        echo '🚀 Starting server.js'; \
        exec node server.js; \
    elif [ -f 'backend/server.js' ]; then \
        echo '🚀 Starting backend/server.js'; \
        exec node backend/server.js; \
    elif [ -f 'main.js' ]; then \
        echo '🚀 Starting main.js'; \
        exec node main.js; \
    elif [ -f 'serviceManager.js' ]; then \
        echo '🚀 Starting serviceManager.js'; \
        exec node serviceManager.js; \
    else \
        echo '❌ No server file found. Available entry points:'; \
        find . -name '*.js' -type f | grep -E '(server|main|service|index|app)' | head -10; \
        echo '💤 Starting sleep to keep container alive...'; \
        exec sleep infinity; \
    fi"]
