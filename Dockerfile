# syntax=docker/dockerfile:1.4

FROM node:22.16.0-slim

# Install system dependencies for AI, blockchain, and ad revenue
RUN apt-get update && apt-get install -y \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxi6 libxtst6 \
    libatk-bridge2.0-0 libgtk-3-0 libgbm-dev libasound2 fonts-noto \
    python3 sqlite3 curl git build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

WORKDIR /app

# Create package.json if missing with ArielMatrix dependencies
RUN if [ ! -f "package.json" ]; then \
    echo '{"name": "arielmatrix", "version": "1.0.0", "type": "module", "dependencies": {"express": "^4.21.0", "axios": "^1.7.7", "dotenv": "^16.4.5", "ethers": "^6.13.2", "ccxt": "^4.4.0", "sqlite3": "^5.1.7", "better-sqlite3": "^9.4.3", "puppeteer": "^24.16.0", "playwright": "^1.48.2", "cors": "^2.8.5", "@tensorflow/tfjs-node": "^4.22.0", "googleapis": "^140.0.1", "node-forge": "^1.3.1", "async-mutex": "^0.4.1", "@nomicfoundation/hardhat-toolbox": "^5.0.0", "@openzeppelin/contracts": "^5.0.2"}}' > package.json; \
    echo "🌌 Created ArielMatrix package.json"; \
fi

# Copy package.json files
COPY package*.json ./
COPY frontend/package*.json ./frontend/ 2>/dev/null || echo "⚠️ No frontend package.json"
COPY backend/package*.json ./backend/ 2>/dev/null || echo "⚠️ No backend package.json"

# Install dependencies at build-time (avoids fsevents EACCES)
RUN npm install --prefer-offline --no-audit --ignore-optional --progress=false && \
    if [ -f "frontend/package.json" ]; then cd frontend && npm install --prefer-offline --no-audit --progress=false && cd ..; fi && \
    if [ -f "backend/package.json" ]; then cd backend && npm install --prefer-offline --no-audit --progress=false && cd ..; fi && \
    npm cache clean --force

# Copy application
COPY . .

# Set permissions for node user
RUN chmod -R 755 /app && \
    find /app -name "*.sh" -exec chmod +x {} \; && \
    find /app -name "*.js" -exec chmod 755 {} \; && \
    mkdir -p /app/data && \
    chown -R node:node /app && \
    rm -rf /tmp/* /var/tmp/* /root/.npm

# Install Hardhat for blockchain
RUN npm install -g hardhat@2.22.2

# Build frontend (if exists)
RUN if [ -d "frontend" ] && [ -f "frontend/package.json" ]; then cd frontend && npm run build && cd ..; fi

# Install browser dependencies
RUN npx puppeteer@24.16.0 install --with-deps || true && \
    npx playwright@1.48.2 install chromium --with-deps || true

USER node

EXPOSE 3000

# Healthcheck for port 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
    CMD curl -f http://localhost:3000/health || exit 1

# Entrypoint
ENTRYPOINT ["node", "scripts/quantum-entrypoint.js"]

ENV NODE_ENV=production
ENV AUTONOMOUS_AI=true
ENV QUANTUM_MODE=enabled
