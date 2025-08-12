# -------- Builder stage --------
FROM node:22.16.0 AS builder

# Install system deps required by Chrome/playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    wget \
    gnupg \
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

# Set backend working dir (match your repo: backend/server.js)
WORKDIR /backend

# Copy backend package files and install deps
COPY backend/package.json backend/package-lock.json* ./

# Validate JSON early (fails fast with clearer message)
# If package.json is invalid this will error here.
RUN node -e "try{JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json OK')}catch(e){console.error('Invalid package.json:', e.message); process.exit(1)}"

# Install backend dependencies (legacy peer deps for older projects)
RUN npm install --legacy-peer-deps

# Install Playwright browsers (with OS deps)
# This installs Chromium for Playwright (and any required deps)
RUN npx playwright install --with-deps chromium

# If your project uses puppeteer (not puppeteer-core), optionally install Puppeteer browsers.
# This block checks for the string "puppeteer" in package.json and installs browsers only if present.
RUN if grep -q '"puppeteer"' package.json 2>/dev/null; then \
      npx puppeteer install --cache-dir=/root/.cache/puppeteer || true; \
    else \
      echo "puppeteer not present, skipping puppeteer browser install"; \
    fi

# Copy rest of backend source
COPY backend/ ./

# -------- Frontend build stage (inside same builder) --------
# Build frontend into /frontend/dist, then we'll copy built assets into backend/public
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --legacy-peer-deps
COPY frontend/ ./
RUN npm run build

# After build, ensure frontend build artifacts exist in /frontend/dist
WORKDIR /

# -------- Final runtime stage --------
FROM node:22.16.0 AS runtime

# Install runtime system deps required by headless Chrome/playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
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

# Create a non-root user
RUN useradd -m appuser

# Set working dir matching your source: /backend
WORKDIR /backend

# Copy built backend + node_modules and frontend build from builder
COPY --from=builder --chown=appuser:appuser /backend /backend
COPY --from=builder --chown=appuser:appuser /frontend/dist /frontend/dist

# Copy caches for browsers (if they were created during build)
# Note: these are optional and only exist if the corresponding installers ran
COPY --from=builder --chown=appuser:appuser /root/.cache/puppeteer /home/appuser/.cache/puppeteer
COPY --from=builder --chown=appuser:appuser /root/.cache/ms-playwright /home/appuser/.cache/ms-playwright || true

# Ensure backend/public exists and move frontend build there
RUN mkdir -p /backend/public && \
    if [ -d /frontend/dist ]; then cp -r /frontend/dist/* /backend/public/ && echo "✅ Frontend assets copied to /backend/public"; else echo "No frontend build found"; fi

# Fix ownership
RUN chown -R appuser:appuser /backend /home/appuser/.cache || true

# Switch to non-root user
USER appuser

# Expose your backend port (adjust if needed)
EXPOSE 10000

# Default command: run server.js from /backend
# Use node server.js to match server.js in backend directory.
CMD ["node", "server.js"]
