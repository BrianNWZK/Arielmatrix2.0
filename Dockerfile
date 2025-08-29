# Builder stage
FROM node:22.16.0 AS builder

# Install system dependencies for Puppeteer/Playwright
RUN apt-get update && apt-get install -y \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxi6 libxtst6 \
    libatk-bridge2.0-0 libgtk-3-0 libgbm-dev libasound2 fonts-noto \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy root package.json and other necessary files first
COPY package*.json ./

# Install backend dependencies (assumes root package.json is for backend)
RUN npm install

# Copy rest of backend files
COPY server.js hardhat.config.js config/ backend/ contracts/ scripts/ arielmatrix2.0/ ./

# Copy frontend folder and install its dependencies
COPY frontend/ ./frontend/
RUN npm install --prefix ./frontend

# Copy frontend source and public files
COPY frontend/src/ ./frontend/src/
COPY frontend/public/ ./frontend/public/
COPY frontend/index.html frontend/dashboard.js frontend/index.css frontend/main.jsx ./frontend/

# Build frontend
RUN npm run build --prefix ./frontend

# Install browsers for Puppeteer/Playwright
RUN npx puppeteer browsers install chrome
RUN npx playwright install chromium --with-deps

# Copy public/ folder
COPY public/ ./public/

# Copy remaining config and meta files
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

# Expose port used by backend server
EXPOSE 3000

# Start backend server
CMD ["node", "server.js"]
