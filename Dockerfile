# Builder stage
FROM node:22.16.0 AS builder

# Install system dependencies for Puppeteer/Playwright
RUN apt-get update && apt-get install -y \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxi6 libxtst6 \
    libatk-bridge2.0-0 libgtk-3-0 libgbm-dev libasound2 fonts-noto \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root backend files first (package.json, package-lock.json, server.js, backend folder, etc.)
COPY package.json package-lock.json server.js hardhat.config.js config/ backend/ contracts/ scripts/ arielmatrix2.0/ ./

# Install backend dependencies (assumes root package.json is for backend)
RUN npm install

# Copy frontend folder separately and install its dependencies
COPY frontend/package.json frontend/package-lock.json frontend/tailwind.config.js frontend/vite.config.js frontend/ ./frontend/
RUN npm install --prefix ./frontend

# Copy rest of frontend source and public files
COPY frontend/src/ ./frontend/src/
COPY frontend/public/ ./frontend/public/
COPY frontend/index.html frontend/dashboard.js frontend/index.css frontend/main.jsx frontend/dashboard.js ./frontend/

# Install browsers for Puppeteer/Playwright
RUN npx puppeteer browsers install chrome
RUN npx playwright install chromium --with-deps

# Build frontend
RUN npm run build --prefix ./frontend

# Copy rest of root-level files not yet copied (public/, config files, etc.)
COPY public/ ./public/
COPY .eslintrc.json .dockerignore .gitignore ./

# Final stage
FROM node:22.16.0

# Install runtime dependencies for Puppeteer/Playwright
RUN apt-get update && apt-get install -y \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxi6 libxtst6 \
    libatk-bridge2.0-0 libgtk-3-0 libgbm-dev libasound2 fonts-noto \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m appuser

WORKDIR /app

# Prepare cache and public directories with correct ownership
RUN mkdir -p /home/appuser/.cache/puppeteer /home/appuser/.cache/ms-playwright ./public && \
    chown -R appuser:appuser /app /home/appuser/.cache

# Copy all app files and build artifacts from builder stage
COPY --from=builder --chown=appuser:appuser /app /app

# Copy frontend build output to backend public folder
RUN if [ -d "./frontend/dist" ]; then \
      cp -r frontend/dist/* public/; \
    else \
      echo "WARNING: frontend/dist directory not found"; \
    fi

# Switch to non-root user
USER appuser

# Expose port used by backend server (adjust if needed)
EXPOSE 3000

# Start backend server
CMD ["node", "server.js"]
