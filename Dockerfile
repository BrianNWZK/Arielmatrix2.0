# Builder stage (run as root)
FROM node:22.16.0 as builder

# Install system dependencies for Puppeteer, Playwright, and fonts
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

# Set working directory
WORKDIR /app

# Copy and install backend dependencies
COPY backend/package.json ./backend/package.json
COPY backend/package-lock.json ./backend/package-lock.json
RUN npm install --prefix ./backend

# Install Chrome & Chromium binaries (critical for headless automation)
RUN npx puppeteer browsers install chrome
RUN cd ./backend && npx playwright install chromium --with-deps

# Copy and install frontend dependencies
COPY frontend/package.json ./frontend/package.json
RUN npm install --prefix ./frontend

# Copy all source files
COPY . .

# Build frontend
RUN npm run build --prefix ./frontend

# Final stage (non-root)
FROM node:22.16.0

# Install minimal runtime dependencies
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

# Set working directory
WORKDIR /app

# Create required directories with ownership
RUN mkdir -p \
    /app/backend \
    /app/backend/public \
    /home/appuser/.cache/puppeteer \
    /home/appuser/.cache/ms-playwright \
    && chown -R appuser:appuser /app /home/appuser/.cache

# Copy built app and browser binaries
COPY --from=builder --chown=appuser:appuser /app /app
COPY --from=builder --chown=appuser:appuser /root/.cache/puppeteer /home/appuser/.cache/puppeteer
COPY --from=builder --chown=appuser:appuser /root/.cache/ms-playwright /home/appuser/.cache/ms-playwright

# Ensure frontend assets are available
RUN cp -r /app/frontend/dist/* /app/backend/public/ 2>/dev/null || echo "Warning: Frontend build assets not found. Check vite.config.js and build output."

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 10000

# Start backend server
CMD ["node", "backend/server.js"]
