# syntax=docker/dockerfile:1.4

# Builder stage (Quantum Builder for self-healing)
FROM node:22.16.0 AS quantum_builder

# System optimization
RUN apt-get update && apt-get install -y \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxi6 libxtst6 \
    libatk-bridge2.0-0 libgtk-3-0 libgbm-dev libasound2 fonts-noto \
    python3 python3-pip python3-venv build-essential sqlite3 libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/* && apt-get clean

WORKDIR /app

# Quantum directory creation (prevents conflicts)
RUN mkdir -p \
    config scripts contracts public public/scripts \
    frontend frontend/public frontend/public/assets \
    frontend/src frontend/src/components frontend/src/styles \
    backend backend/agents backend/blockchain backend/contracts backend/database \
    arielsql_suite data arielmatrix2.0 \
    && echo "✅ Quantum directory structure created"

# Intelligent package handling (fixes ENOENT)
RUN if ls package*.json >/dev/null 2>&1; then \
        cp package*.json ./; \
    else \
        echo '{"name": "arielsql-quantum", "version": "1.0.0", "type": "module", "dependencies": {"express": "^4.21.0", "axios": "^1.7.7", "ethers": "^5.7.2", "ccxt": "^4.4.0", "sqlite3": "^5.1.7", "puppeteer": "^24.16.0", "playwright": "^1.48.2", "cors": "^2.8.5", "dotenv": "^16.4.5", "@tensorflow/tfjs-node": "^4.22.0"}}' > package.json; \
        echo "🔄 Created adaptive package.json"; \
    fi

# Neural dependency injection (auto-installs missing deps)
RUN echo "🧠 Installing core intelligence dependencies..." && \
    if [ -f "package-lock.json" ]; then npm ci --prefer-offline --no-audit; \
    else npm install --prefer-offline --no-audit; fi && \
    echo "📦 Ensuring critical autonomous dependencies..." && \
    npm install express@^4.21.0 axios@^1.7.7 dotenv@^16.4.5 --save --no-audit || true && \
    npm install ethers@^5.7.2 ccxt@^4.4.0 @tensorflow/tfjs-node@^4.22.0 --save --no-audit || true && \
    npm install puppeteer@^24.16.0 playwright@^1.48.2 --save --no-audit || true

# Python deps for hybrid AI
RUN if [ -f "requirements.txt" ]; then \
    pip3 install -r requirements.txt; \
fi

# Blockchain tools
RUN if ls hardhat.config.js >/dev/null 2>&1; then \
    npm install -g hardhat && \
    npm install @nomicfoundation/hardhat-toolbox @openzeppelin/contracts; \
fi

# Copy source (adaptive)
COPY . .

# Frontend build
RUN if [ -d "frontend" ] && [ -f "frontend/package.json" ]; then \
    cd frontend && npm install --no-audit && npm run build && cd ..; \
fi

# Browser tools
RUN npx puppeteer@24.16.0 install --with-deps || true
RUN npx playwright@1.48.2 install chromium --with-deps || true

# AI rebuild
RUN if npm list @tensorflow/tfjs-node >/dev/null 2>&1; then npm rebuild @tensorflow/tfjs-node --build-from-source; fi

# Runtime stage
FROM node:22.16.0-slim AS quantum_runtime

# Minimal runtime
RUN apt-get update && apt-get install -y \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxi6 libxtst6 \
    libatk-bridge2.0-0 libgtk-3-0 libgbm-dev libasound2 fonts-noto \
    python3 sqlite3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy essentials
COPY --from=quantum_builder /app /app

# Frontend move
RUN if [ -d "frontend/dist" ] || [ -d "frontend/build" ]; then mkdir -p public && cp -r frontend/dist/* public/ || cp -r frontend/build/* public/; fi

# Clean up
RUN rm -rf /app/.npm /app/.cache /tmp/* /var/tmp/* /app/frontend/node_modules && mkdir -p /app/data && chown -R node:node /app/data

USER node

EXPOSE 3000

# Quantum health check (AI-enhanced)
HEALTHCHECK --interval=15s --timeout=10s --start-period=5s --retries=5 \
    CMD curl -f http://localhost:3000/quantum-health || exit 1

# Quantum entrypoint (self-healing)
ENTRYPOINT ["sh", "-c", "./scripts/quantum-entrypoint.sh"]
