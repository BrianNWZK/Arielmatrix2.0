# syntax=docker/dockerfile:1.4

# Builder stage
FROM node:22.16.0 AS qraf_builder

RUN apt-get update && apt-get install -y \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxi6 libxtst6 \
    libatk-bridge2.0-0 libgtk-3-0 libgbm-dev libasound2 fonts-noto \
    python3 python3-pip python3-venv build-essential sqlite3 libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/* && apt-get clean

WORKDIR /app

RUN mkdir -p \
    config scripts contracts public public/scripts \
    frontend frontend/public frontend/public/assets \
    frontend/src frontend/src/components frontend/src/styles \
    backend backend/agents backend/blockchain backend/contracts backend/database \
    arielsql_suite data arielmatrix2.0

# Add all dependencies to package.json
RUN if ls package*.json >/dev/null 2>&1; then cp package*.json ./; \
    else echo '{"name": "arielsql-qraf", "version": "1.0.0", "type": "module", "dependencies": {"express": "^4.21.0", "axios": "^1.7.7", "ethers": "^5.7.2", "web3": "^4.5.0", "ccxt": "^4.4.0", "sqlite3": "^5.1.7", "better-sqlite3": "^9.4.3", "puppeteer": "^24.16.0", "playwright": "^1.48.2", "cors": "^2.8.5", "dotenv": "^16.4.5", "@tensorflow/tfjs-node": "^4.22.0", "googleapis": "^140.0.1", "node-forge": "^1.3.1", "async-mutex": "^0.4.1"}}' > package.json; fi

# Install dependencies once in the builder stage
RUN npm install --prefer-offline --no-audit --ignore-optional

RUN if [ -f "requirements.txt" ]; then pip3 install -r requirements.txt; fi
RUN if ls hardhat.config.js >/dev/null 2>&1; then npm install -g hardhat && npm install @nomicfoundation/hardhat-toolbox @openzeppelin/contracts; fi

COPY . .

# Explicitly copy the entrypoint script
COPY scripts/quantum-entrypoint.js ./scripts/quantum-entrypoint.js
COPY scripts/live-revenue-server.js ./scripts/live-revenue-server.js

RUN if [ -d "frontend" ] && [ -f "frontend/package.json" ]; then cd frontend && npm install --no-audit && npm run build && cd ..; fi
RUN npx puppeteer@24.16.0 install --with-deps || true
RUN npx playwright@1.48.2 install chromium --with-deps || true
RUN if npm list @tensorflow/tfjs-node >/dev/null 2>&1; then npm rebuild @tensorflow/tfjs-node --build-from-source; fi
RUN if npm list better-sqlite3 >/dev/null 2>&1; then npm rebuild better-sqlite3 --build-from-source; fi

RUN chmod -R +x scripts/*.sh || true

# Runtime stage
FROM node:22.16.0-slim AS qraf_runtime

RUN apt-get update && apt-get install -y \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxi6 libxtst6 \
    libatk-bridge2.0-0 libgtk-3-0 libgbm-dev libasound2 fonts-noto \
    python3 sqlite3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=qraf_builder /app /app

RUN chown -R node:node /app

RUN if [ -d "frontend/dist" ] || [ -d "frontend/build" ]; then mkdir -p public && cp -r frontend/dist/* public/ || cp -r frontend/build/* public/; fi
RUN rm -rf /app/.npm /app/.cache /tmp/* /var/tmp/* /app/frontend/node_modules && mkdir -p /app/data && chown -R node:node /app/data

USER node

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=10s --start-period=5s --retries=5 \
    CMD curl -f http://localhost:3000/health || exit 1

# Explicitly call the Node.js entry point script with a known path
ENTRYPOINT ["node", "/app/scripts/quantum-entrypoint.js"]
