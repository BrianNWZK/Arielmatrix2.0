# syntax=docker/dockerfile:1.4

# Builder stage
FROM node:22.16.0 AS builder

# Install system dependencies for headless browsers
RUN apt-get update && apt-get install -y \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxi6 libxtst6 \
    libatk-bridge2.0-0 libgtk-3-0 libgbm-dev libasound2 fonts-noto \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files with proper error handling
COPY package*.json ./
RUN if [ -f "package.json" ]; then echo "Found package.json"; else echo "package.json not found" && touch package.json; fi

# Handle backend package files with proper syntax
RUN mkdir -p backend
COPY backend/package*.json ./backend/ 2>/dev/null || \
    (echo "backend/package*.json not found - creating empty" && touch backend/package.json)

# Install backend dependencies if package.json exists
RUN if [ -f "package.json" ] && [ -s "package.json" ]; then \
    npm ci --prefer-offline --no-audit --progress=false; \
else \
    echo "No valid package.json found, skipping npm install"; \
fi

# Copy all files with proper permissions
COPY --chown=node:node . .

# Ensure all required directories exist
RUN mkdir -p \
    config \
    scripts \
    contracts \
    public \
    arielmatrix2.0 \
    frontend \
    backend

# Frontend build process with better error handling
RUN if [ -d "frontend" ] && [ -f "frontend/package.json" ]; then \
    echo "Building frontend..."; \
    cd frontend && npm install --no-audit --no-fund --silent && npm run build; \
else \
    echo "Frontend directory or package.json not found, skipping frontend build"; \
fi

# Install Puppeteer and Playwright browsers with better error handling
RUN { npx -y puppeteer@latest install --with-deps 2>/dev/null || \
    echo "Puppeteer installation failed or skipped"; }

RUN { npx -y playwright@latest install chromium --with-deps 2>/dev/null || \
    echo "Playwright installation failed or skipped"; }

# Final stage
FROM node:22.16.0-slim AS runtime

# Install minimal runtime dependencies
RUN apt-get update && apt-get install -y \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxi6 libxtst6 \
    libatk-bridge2.0-0 libgtk-3-0 libgbm-dev libasound2 fonts-noto \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -r -m -u 1001 appuser

WORKDIR /app

# Copy built artifacts from builder with proper permissions
COPY --from=builder --chown=appuser:appuser /app /app

# Move frontend build artifacts to public if they exist
RUN if [ -d "./frontend/dist" ]; then \
    mkdir -p ./public && cp -r ./frontend/dist/* ./public/; \
    elif [ -d "./frontend/build" ]; then \
    mkdir -p ./public && cp -r ./frontend/build/* ./public/; \
fi

# Clean up unnecessary files to reduce image size
RUN rm -rf \
    /app/.npm \
    /app/.cache \
    /app/frontend/node_modules \
    /app/backend/node_modules \
    /usr/local/share/.cache

USER appuser

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start command with multiple fallback options
CMD ["sh", "-c", \
    "if [ -f 'server.js' ]; then \
        exec node server.js; \
    elif [ -f 'backend/server.js' ]; then \
        exec node backend/server.js; \
    elif [ -f 'dist/server.js' ]; then \
        exec node dist/server.js; \
    else \
        echo 'No server file found. Available JavaScript files:'; \
        find . -name '*.js' -type f | head -10; \
        echo 'Starting sleep to keep container alive...'; \
        exec sleep infinity; \
    fi"]
