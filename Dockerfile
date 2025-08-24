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

# Copy backend package.json and install dependencies
COPY backend/package.json backend/package-lock.json* ./backend/
RUN npm install --prefix ./backend

# Install Puppeteer browser
RUN npx puppeteer browsers install chrome

# Install Playwright browser
# Changed to navigate into the backend directory before installing browsers
# Added '|| true' to npm audit fix to prevent build failure on unfixable issues
RUN npm install playwright@1.48.2 --prefix ./backend && \
    cd ./backend && \
    npm audit fix || true && \
    npx playwright install chromium --with-deps

# Copy ALL backend source files
COPY backend/ ./backend/

# Copy frontend package.json and install dependencies
COPY frontend/package.json frontend/package-lock.json* ./frontend/
RUN npm install --prefix ./frontend

# Copy ALL frontend source files
COPY frontend/ ./frontend/

# Build frontend
RUN npm run build --prefix ./frontend

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

# Copy built app and browser binaries
COPY --from=builder --chown=appuser:appuser /app /app
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
