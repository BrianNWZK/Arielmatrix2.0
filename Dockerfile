# Builder stage
FROM node:22.16.0 AS builder

# Install system dependencies for Puppeteer/Playwright
RUN apt-get update && apt-get install -y \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxi6 libxtst6 \
    libatk-bridge2.0-0 libgtk-3-0 libgbm-dev libasound2 fonts-noto \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy entire project context respecting .dockerignore
COPY . .

# Install root dependencies (frontend)
RUN npm install

# Install backend dependencies if backend has its own package.json (adjust if needed)
# Here backend is a directory with JS files but no separate package.json, so skip this

# Install Puppeteer and Playwright browsers
RUN npx puppeteer browsers install chrome
RUN npx playwright install chromium --with-deps

# Build frontend project (assuming frontend is at root or in ./frontend)
# Detect if frontend directory exists and build accordingly
RUN if [ -d "./frontend" ] && [ -f "./frontend/package.json" ]; then \
      npm install --prefix ./frontend && npm run build --prefix ./frontend; \
    else \
      npm run build; \
    fi

# Final stage
FROM node:22.16.0

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxi6 libxtst6 \
    libatk-bridge2.0-0 libgtk-3-0 libgbm-dev libasound2 fonts-noto \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m appuser

WORKDIR /app

# Prepare cache directories and app folder permissions
RUN mkdir -p /home/appuser/.cache/puppeteer /home/appuser/.cache/ms-playwright && \
    chown -R appuser:appuser /app /home/appuser/.cache

# Copy build artifacts from builder stage
COPY --from=builder --chown=appuser:appuser /app /app

# Copy frontend build output to backend public folder if exists
RUN if [ -d "./frontend/dist" ]; then \
      mkdir -p ./public && cp -r frontend/dist/* public/; \
    elif [ -d "./dist" ]; then \
      mkdir -p ./public && cp -r dist/* public/; \
    fi

# Switch to non-root user
USER appuser

# Expose application port (adjust if your backend listens on a different port)
EXPOSE 3000

# Start backend server
CMD ["node", "server.js"]
