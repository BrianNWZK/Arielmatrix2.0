# syntax=docker/dockerfile:1.4

# Builder stage
FROM node:22.16.0 AS builder

# Install system dependencies for headless browsers, blockchain tools, and SQLite
RUN apt-get update && apt-get install -y \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxi6 libxtst6 \
    libatk-bridge2.0-0 libgtk-3-0 libgbm-dev libasound2 fonts-noto \
    python3 python3-pip python3-venv \
    build-essential \
    sqlite3 libsqlite3-dev \
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
    frontend/src/styles \
    arielsql_suite \
    data

# Create a minimal package.json if it doesn't exist
RUN if [ ! -f "package.json" ]; then \
    echo '{"name": "arielsql-alltimate", "version": "1.0.0", "type": "module", "dependencies": {}}' > package.json; \
    echo "ℹ️ Created minimal package.json"; \
fi

# Copy package files first for better caching
COPY package*.json ./

# Create backend package.json if it doesn't exist
RUN if [ ! -f "backend/package.json" ]; then \
    echo '{"name": "arielsql-backend", "version": "1.0.0"}' > backend/package.json; \
    echo "ℹ️ Created backend/package.json"; \
fi

# Copy backend package files if they exist
COPY backend/package*.json ./backend/

# Install root dependencies
RUN echo "📦 Installing dependencies..." && \
    if [ -f "package.json" ]; then \
        if [ -f "package-lock.json" ]; then \
            echo "✅ Using package-lock.json for npm ci"; \
            npm ci --prefer-offline --no-audit --progress=false; \
        else \
            echo "ℹ️ No package-lock.json found, using npm install"; \
            npm install --prefer-offline --no-audit --progress=false; \
        fi \
    else \
        echo "❌ No package.json found! Creating minimal one and installing..."; \
        echo '{"name": "arielsql-alltimate", "version": "1.0.0", "dependencies": {"express": "^4.21.0", "axios": "^1.7.7", "dotenv": "^16.4.5"}}' > package.json; \
        npm install --prefer-offline --no-audit --progress=false; \
    fi

# Install Python dependencies for arielmatrix2.0 (if exists)
RUN if [ -f "arielmatrix2.0/requirements.txt" ]; then \
    echo "🐍 Installing Python dependencies..."; \
    pip3 install -r arielmatrix2.0/requirements.txt; \
else \
    echo "ℹ️ No Python requirements found"; \
fi

# Install blockchain dependencies (Hardhat)
RUN if [ -f "hardhat.config.js" ] || [ -f "arielmatrix2.0/hardhat.config.js" ]; then \
    echo "⛓️ Installing blockchain dependencies..."; \
    npm install -g hardhat; \
    npm install @nomiclabs/hardhat-waffle ethereum-waffle chai @nomiclabs/hardhat-ethers ethers; \
fi

# FIX: Copy files in stages to avoid directory conflicts
# First copy only specific file types that won't conflict with directories
COPY --chown=node:node *.js ./
COPY --chown=node:node *.json ./
COPY --chown=node:node .env* ./

# Then copy directories individually with proper error handling
RUN echo "📂 Copying source files..." && \
    for dir in config scripts contracts public frontend backend arielsql_suite arielmatrix2.0; do \
        if [ -d "$dir" ]; then \
            echo "📁 Copying $dir/"; \
            cp -r "$dir" /tmp/ && \
            rm -rf "./$dir" && \
            mv "/tmp/$dir" ./ && \
            chown -R node:node "./$dir"; \
        else \
            echo "ℹ️ Directory $dir/ not found in build context"; \
        fi \
    done

# Frontend build process (if exists)
RUN if [ -d "frontend" ] && [ -f "frontend/package.json" ]; then \
    echo "🏗️ Building frontend..."; \
    cd frontend && npm install --no-audit --no-fund --silent && npm run build; \
else \
    echo "ℹ️ Frontend not found or no package.json, skipping build"; \
fi

# Install browser automation tools with specific versions matching package.json
RUN npx puppeteer@24.16.0 install --with-deps 2>/dev/null || echo "⚠️ Puppeteer installation skipped"
RUN npx playwright@1.48.2 install chromium --with-deps 2>/dev/null || echo "⚠️ Playwright installation skipped"

# Build TensorFlow for Node.js (if needed)
RUN if npm list @tensorflow/tfjs-node 2>/dev/null | grep -q tfjs-node; then \
    echo "🧠 Building TensorFlow for Node.js..."; \
    npm rebuild @tensorflow/tfjs-node --build-from-source; \
fi

# Final production stage
FROM node:22.16.0-slim AS runtime

# Install minimal runtime dependencies including SQLite
RUN apt-get update && apt-get install -y \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxi6 libxtst6 \
    libatk-bridge2.0-0 libgtk-3-0 libgbm-dev libasound2 fonts-noto \
    python3 \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -r -m -u 1001 appuser

WORKDIR /app

# Copy built artifacts from builder - FIXED: Copy in stages to avoid conflicts
COPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules/
COPY --from=builder --chown=appuser:appuser /app/package*.json ./

# Copy other files and directories carefully
RUN echo "📦 Copying application files from builder..." && \
    mkdir -p /tmp/app && \
    cp -r /app/* /tmp/app/ 2>/dev/null || true && \
    cp -r /app/.* /tmp/app/ 2>/dev/null || true && \
    rm -rf /app/* && \
    mv /tmp/app/* /app/ && \
    rm -rf /tmp/app && \
    chown -R appuser:appuser /app

# Move frontend build artifacts to public if they exist
RUN if [ -d "./frontend/dist" ]; then \
    mkdir -p ./public && cp -r ./frontend/dist/* ./public/; \
    elif [ -d "./frontend/build" ]; then \
    mkdir -p ./public && cp -r ./frontend/build/* ./public/; \
fi

# Clean up unnecessary files but keep node_modules and essential files
RUN rm -rf \
    /app/.npm \
    /app/.cache \
    /usr/local/share/.cache \
    /tmp/* \
    /var/tmp/*

# Ensure proper permissions for SQLite databases
RUN mkdir -p /app/data && chown -R appuser:appuser /app/data

USER appuser

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health >/dev/null 2>&1 || wget -q --spider http://localhost:3000/health || exit 1

# Start command optimized for your project structure
CMD ["sh", "-c", \
    "echo '🚀 Starting ArielSQL Ultimate Suite...'; \
    echo '📦 Node.js version: $(node --version)'; \
    echo '🐢 SQLite version: $(sqlite3 --version 2>/dev/null || echo \"Not available\")'; \
    echo '📦 Node modules: $(ls node_modules 2>/dev/null | wc -l) packages'; \
    echo '📁 App structure:'; \
    ls -la; \
    \
    if [ -f 'arielsql_suite/main.js' ]; then \
        echo '🎯 Starting main application: arielsql_suite/main.js'; \
        exec node arielsql_suite/main.js; \
    elif [ -f 'server.js' ]; then \
        echo '🎯 Starting server.js'; \
        exec node server.js; \
    elif [ -f 'main.js' ]; then \
        echo '🎯 Starting main.js'; \
        exec node main.js; \
    elif [ -f 'serviceManager.js' ]; then \
        echo '🎯 Starting serviceManager.js'; \
        exec node serviceManager.js; \
    elif [ -f 'backend/server.js' ]; then \
        echo '🎯 Starting backend/server.js'; \
        exec node backend/server.js; \
    else \
        echo '❌ No entry point found. Available JavaScript files:'; \
        find . -name '*.js' -type f | head -20; \
        echo '💤 Starting sleep to keep container alive...'; \
        exec sleep infinity; \
    fi"]
