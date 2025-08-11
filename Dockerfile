# Builder stage
FROM node:22.16.0 as builder

# Install system dependencies (with cron for node-cron)
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
    curl \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install backend dependencies
COPY backend/package.json ./backend/package.json
WORKDIR ./backend
RUN npm install

# Install Puppeteer browser with custom cache dir
RUN npx puppeteer browsers install chrome --cache-dir=/root/.cache/puppeteer

# Install Playwright browser with dependencies
RUN npx playwright install chromium --with-deps

# Go back to /app
WORKDIR /app

# Copy frontend
COPY frontend/package.json ./frontend/package.json
WORKDIR ./frontend
RUN npm install

# Copy ALL frontend source files
COPY frontend/src ./src
COPY frontend/index.html ./
COPY frontend/vite.config.js ./
COPY frontend/tailwind.config.js ./

# Build frontend
RUN npm run build

# Final stage
FROM node:22.16.0

# Install runtime deps + cron (required for node-cron scheduling)
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
    cron \
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
RUN if [ -d "/app/frontend/dist" ]; then \
      cp -r /app/frontend/dist/* /app/backend/public/ && \
      echo "✅ Frontend assets copied to /backend/public"; \
    else \
      echo "❌ Error: /app/frontend/dist not found!"; \
      exit 1; \
    fi

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 10000

# Start backend
CMD ["node", "backend/server.js"]
