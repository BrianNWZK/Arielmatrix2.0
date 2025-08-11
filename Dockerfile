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

# Copy and install backend dependencies
COPY backend/package.json ./backend/package.json
WORKDIR ./backend
RUN npm install

# Install Puppeteer & Playwright browsers
RUN npx puppeteer browsers install chrome --allow-root
RUN npx playwright install chromium --with-deps

# Go back to /app
WORKDIR /app

# Copy frontend
COPY frontend/package.json ./frontend/package.json
WORKDIR ./frontend
RUN npm install
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

# Create directories
RUN mkdir -p \
    /app/backend \
    /app/backend/public \
    /home/appuser/.cache/puppeteer \
    /home/appuser/.cache/ms-playwright \
    && chown -R appuser:appuser /app /home/appuser/.cache

# Copy built files
COPY --from=builder --chown=appuser:appuser /app /app
COPY --from=builder --chown=appuser:appuser /root/.cache/puppeteer /home/appuser/.cache/puppeteer
COPY --from=builder --chown=appuser:appuser /root/.cache/ms-playwright /home/appuser/.cache/ms-playwright

# Link frontend build
RUN cp -r /app/frontend/dist/* /app/backend/public/ 2>/dev/null || echo "Warning: Frontend build assets not copied."

# Switch to non-root user
USER appuser

EXPOSE 10000
CMD ["node", "backend/server.js"]
