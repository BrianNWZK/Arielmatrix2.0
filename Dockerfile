# Builder stage
FROM node:22.16.0 AS builder

# Install system dependencies for Puppeteer/Playwright
RUN apt-get update && apt-get install -y \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxi6 libxtst6 \
    libatk-bridge2.0-0 libgtk-3-0 libgbm-dev libasound2 fonts-noto \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy essential configuration files first
COPY package.json package-lock.json hardhat.config.js ./
COPY .eslintrc.json .gitignore .dockerignore ./
COPY server.js ./ 
COPY config/ ./config/
COPY scripts/ ./scripts/
COPY backend/ ./backend/
COPY contracts/ ./contracts/
COPY arielmatrix2.0/ ./arielmatrix2.0/

# Install backend dependencies
RUN npm install

# Copy frontend files and install dependencies
COPY frontend/package.json frontend/package-lock.json frontend/tailwind.config.js frontend/vite.config.js ./frontend/
RUN npm install --prefix ./frontend

# Copy frontend source and public files
COPY frontend/ ./frontend/

# Install browsers for Puppeteer/Playwright
RUN npx puppeteer browsers install chrome
RUN npx playwright install chromium --with-deps

# Build frontend
RUN npm run build --prefix ./frontend

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

# Prepare cache and public directories with correct ownership
RUN mkdir -p /home/appuser/.cache/puppeteer /home/appuser/.cache/ms-playwright ./public && \
    chown -R appuser:appuser /app /home/appuser/.cache

# Copy all app files and build artifacts from builder stage
COPY --from=builder --chown=appuser:appuser /app /app

# Move frontend build output to public folder
RUN if [ -d "./frontend/dist" ]; then \
      cp -r frontend/dist/* public/; \
    fi

# Switch to non-root user
USER appuser

# Expose the application port
EXPOSE 3000

# Start backend server
CMD ["node", "server.js"]
