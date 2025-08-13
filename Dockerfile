# =========================
# Builder stage
# =========================
FROM node:22.16.0 AS builder

# Install system dependencies once (covers Puppeteer/Playwright headless)
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

# Deterministic cache locations for browsers (copied into final image)
ENV PUPPETEER_CACHE_DIR=/browsers/puppeteer \
    PLAYWRIGHT_BROWSERS_PATH=/browsers/ms-playwright

WORKDIR /app

# ---- Backend deps (before copying full source for better layer caching)
COPY backend/package.json backend/package-lock.json* ./backend/
RUN --mount=type=cache,target=/app/backend/node_modules \
    npm ci --prefix ./backend || npm install --legacy-peer-deps --prefix ./backend

# Install browsers into deterministic cache dirs
RUN mkdir -p $PUPPETEER_CACHE_DIR $PLAYWRIGHT_BROWSERS_PATH \
 && npx puppeteer browsers install chrome --cache-dir=$PUPPETEER_CACHE_DIR \
 && PLAYWRIGHT_BROWSERS_PATH=$PLAYWRIGHT_BROWSERS_PATH npx playwright install chromium

# ---- Copy backend source & compile contracts (if present)
COPY backend/ ./backend/
WORKDIR /app/backend
# If contracts are missing or Hardhat not configured yet, don't fail the build
RUN npx hardhat compile || echo "ⓘ Hardhat will compile at runtime if needed"

# ---- Frontend build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./frontend/
RUN --mount=type=cache,target=/app/frontend/node_modules \
    npm ci --prefix ./frontend || npm install --prefix ./frontend
COPY frontend/ ./frontend/
WORKDIR /app/frontend
RUN npm run build

# =========================
# Final runtime stage
# =========================
FROM node:22.16.0

# Runtime system libs
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

# Non-root runtime
RUN useradd -m appuser
WORKDIR /app

# Copy app
COPY --from=builder /app /app

# Copy browser caches into appuser's home so we control the paths/permissions
COPY --from=builder /browsers/puppeteer /home/appuser/.cache/puppeteer
COPY --from=builder /browsers/ms-playwright /home/appuser/.cache/ms-playwright

# Ensure backend/public exists and ship built frontend
RUN mkdir -p /app/backend/public \
 && cp -r /app/frontend/dist/* /app/backend/public/ || true

# Ownership
RUN chown -R appuser:appuser /app /home/appuser

USER appuser

# Expose deterministic locations via env (agent resolves final executable below)
ENV NODE_ENV=production \
    PUPPETEER_CACHE_DIR="/home/appuser/.cache/puppeteer" \
    PLAYWRIGHT_BROWSERS_PATH="/home/appuser/.cache/ms-playwright" \
    PUPPETEER_EXECUTABLE_PATH=""

EXPOSE 10000

CMD ["node", "backend/server.js"]
