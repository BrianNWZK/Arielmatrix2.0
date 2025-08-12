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
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy backend files
COPY backend/package.json backend/package-lock.json* ./backend/
WORKDIR ./backend

# Install dependencies
RUN npm install --legacy-peer-deps

# Install Puppeteer browser
RUN npx puppeteer browsers install chrome --cache-dir=/root/.cache/puppeteer

# Install Playwright browser with full dependencies
RUN npx playwright install chromium --with-deps

# Ensure cache directories exist
RUN mkdir -p /root/.cache/puppeteer /root/.cache/ms-playwright

# Go back to root app directory
WORKDIR /app

# Copy ALL backend source files
COPY backend/ ./backend/

# Copy frontend files
COPY frontend/package.json frontend/package-lock.json* ./frontend/
WORKDIR ./frontend
RUN npm install

# Copy ALL frontend source files
COPY frontend/ ./
RUN npm run build

# Final stage
FROM node:22.16.0

# Install runtime deps
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

# Copy built app
COPY --from=builder --chown=appuser:appuser /app /app

# Copy browser binaries
COPY --from=builder --chown=appuser:appuser /root/.cache/puppeteer /home/appuser/.cache/puppeteer
COPY --from=builder --chown=appuser:appuser /root/.cache/ms-playwright /home/appuser/.cache/ms-playwright

# Ensure frontend assets are copied
RUN cp -r /app/frontend/dist/* /app/backend/public/ && \
    echo "✅ Frontend assets copied to /backend/public"

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 10000

# Start backend
CMD ["node", "backend/server.js"]
