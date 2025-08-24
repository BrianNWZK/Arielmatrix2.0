# Builder stage
FROM node:22.16.0 as builder

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxi6 \
    libxtst6 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm-dev \
    libasound2 \
    fonts-noto \
    ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# First, check and fix package.json if needed
COPY backend/package.json ./backend/
RUN cd backend && node -e "\
    const fs = require('fs');\
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));\
    console.log('Package name:', pkg.name);\
    console.log('Dependencies count:', Object.keys(pkg.dependencies || {}).length);\
    console.log('Dev dependencies count:', Object.keys(pkg.devDependencies || {}).length);\
    " 

# Copy package files
COPY backend/package.json backend/package-lock.json* ./backend/
WORKDIR ./backend

# Update npm and clear cache first
RUN npm install -g npm@11.5.2 && \
    npm cache clean --force && \
    npm config set registry https://registry.npmjs.org/ && \
    npm config set strict-ssl false

# Try installing with different approaches
RUN { \
    echo "Attempting npm install..."; \
    npm install --legacy-peer-deps --no-optional --verbose 2>&1 | head -50; \
    } || { \
    echo "First attempt failed, trying with different flags..."; \
    npm install --legacy-peer-deps --no-package-lock --verbose 2>&1 | head -50; \
    } || { \
    echo "Both attempts failed, trying basic install..."; \
    npm install axios --verbose; \
    exit 1; \
    }

# Alternative: Install dependencies one by one to identify the problematic package
# RUN npm install express --save && \
#     npm install axios --save && \
#     npm install cors --save && \
#     npm install dotenv --save

# Install Puppeteer browser
RUN npx puppeteer browsers install chrome --cache-dir=/root/.cache/puppeteer

# Install Playwright browser with full dependencies
RUN npx playwright install chromium --with-deps

# Go back to root app directory
WORKDIR /app

# Copy ALL backend source files
COPY backend/ ./backend/

# Copy frontend files
COPY frontend/package.json frontend/package-lock.json* ./frontend/
WORKDIR ./frontend

# Install frontend dependencies
RUN npm install -g npm@11.5.2 && \
    npm cache clean --force && \
    npm install --no-fund --no-audit

# Copy ALL frontend source files
COPY frontend/ ./
RUN npm run build

# Final stage
FROM node:22.16.0-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxi6 \
    libxtst6 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm-dev \
    libasound2 \
    fonts-noto \
    ca-certificates \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m appuser
WORKDIR /app

# Create required directories
RUN mkdir -p \
    /app/backend \
    /app/backend/public \
    /home/appuser/.cache/puppeteer \
    /home/appuser/.cache/ms-playwright \
    && chown -R appuser:appuser /app /home/appuser/.cache

# Copy built backend from builder stage
COPY --from=builder --chown=appuser:appuser /app/backend /app/backend

# Copy frontend build
COPY --from=builder --chown=appuser:appuser /app/frontend/dist /app/backend/public

# Copy browser binaries
COPY --from=builder --chown=appuser:appuser /root/.cache/puppeteer /home/appuser/.cache/puppeteer
COPY --from=builder --chown=appuser:appuser /root/.cache/ms-playwright /home/appuser/.cache/ms-playwright

# Switch to non-root user
USER appuser

# Set environment variables
ENV NODE_ENV=production
ENV PUPPETEER_CACHE_DIR=/home/appuser/.cache/puppeteer
ENV PLAYWRIGHT_BROWSERS_PATH=/home/appuser/.cache/ms-playwright

# Verify installations
RUN node -v && npm -v && \
    ls -la /app/backend/node_modules && \
    echo "✅ Build completed successfully"

# Expose port
EXPOSE 10000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:10000/health || exit 1

# Start backend
CMD ["node", "backend/server.js"]
