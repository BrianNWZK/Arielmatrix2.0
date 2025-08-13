# =========================
# Builder stage
# =========================
FROM node:22.16.0 as builder

# Install system dependencies for browsers
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

# ---------- BACKEND ----------
COPY backend/package.json backend/package-lock.json* ./backend/
RUN npm install --prefix ./backend --legacy-peer-deps
COPY backend/ ./backend/

# Install and cache browsers in builder stage
RUN npx puppeteer browsers install chrome --cache-dir=/home/appuser/.cache/puppeteer && \
    PLAYWRIGHT_BROWSERS_PATH=/home/appuser/.cache/ms-playwright npx playwright install chromium --with-deps

# Compile contracts (now that Hardhat is installed locally)
RUN cd backend && npx hardhat compile

# ---------- FRONTEND ----------
COPY frontend/package.json frontend/package-lock.json* ./frontend/
RUN if [ -f frontend/package-lock.json ]; \
    then npm ci --prefix ./frontend; \
    else npm install --prefix ./frontend; \
    fi
COPY frontend/ ./frontend/
RUN npx vite build --prefix ./frontend

# =========================
# Final runtime stage
# =========================
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

# Copy built app from builder
COPY --from=builder --chown=appuser:appuser /app /app

# Copy browser binaries from builder
COPY --from=builder --chown=appuser:appuser /home/appuser/.cache/puppeteer /home/appuser/.cache/puppeteer
COPY --from=builder --chown=appuser:appuser /home/appuser/.cache/ms-playwright /home/appuser/.cache/ms-playwright

# Environment variables for executable paths
ENV PUPPETEER_EXECUTABLE_PATH=/home/appuser/.cache/puppeteer/chrome/**/chrome-linux64/chrome \
    PLAYWRIGHT_BROWSERS_PATH=/home/appuser/.cache/ms-playwright

# Ensure frontend assets are in backend/public
RUN cp -r /app/frontend/dist/* /app/backend/public/ && \
    echo "✅ Frontend assets copied to /backend/public"

USER appuser

EXPOSE 10000

CMD ["node", "backend/server.js"]
