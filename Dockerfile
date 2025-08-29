# Builder stage
FROM node:22.16.0 AS builder

# Install system dependencies for Puppeteer/Playwright
RUN apt-get update && apt-get install -y \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxi6 libxtst6 \
    libatk-bridge2.0-0 libgtk-3-0 libgbm-dev libasound2 fonts-noto \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy root package.json and other necessary files first
COPY package.json ./
COPY package-lock.json ./
COPY hardhat.config.js ./
COPY tailwind.config.js ./
COPY vite.config.js ./
COPY public/index.html ./public/

# Now copy the rest of the project files
COPY . .

# Install dependencies
RUN npm install

# Install browsers for Puppeteer and Playwright
RUN npx puppeteer browsers install chrome
RUN npx playwright install chromium --with-deps

# Build frontend if package.json exists in the frontend directory
RUN if [ -f "./frontend/package.json" ]; then \
      npm install --prefix ./frontend && npm run build --prefix ./frontend; \
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

# Set working directory
WORKDIR /app

# Prepare cache directories and app folder permissions
RUN mkdir -p /home/appuser/.cache/puppeteer /home/appuser/.cache/ms-playwright && \
    chown -R appuser:appuser /app /home/appuser/.cache

# Copy build artifacts from builder stage
COPY --from=builder --chown=appuser:appuser /app /app

# Copy frontend build output to public folder if exists
RUN if [ -d "./frontend/dist" ]; then \
      mkdir -p ./public && cp -r frontend/dist/* public/; \
    fi

# Switch to non-root user
USER appuser

# Expose application port
EXPOSE 3000

# Start backend server
CMD ["node", "server.js"]
