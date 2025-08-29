# Builder stage
FROM node:22.16.0 as builder

# Install system dependencies for browser automation (Puppeteer/Playwright)
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

# Set working directory to the project root
WORKDIR /app

# Copy package files for both frontend and backend
COPY backend/package.json ./backend/
COPY package.json ./
COPY vite.config.js ./
COPY tailwind.config.js ./
COPY index.html ./

# Install dependencies
RUN npm install

# Install browsers for automation
RUN npx puppeteer browsers install chrome
RUN npx playwright install chromium --with-deps

# Copy all source files for frontend and backend
COPY backend ./backend
COPY contracts ./contracts
COPY public ./public
COPY src ./src
COPY components ./components
COPY styles ./styles
COPY scripts ./scripts

# Build frontend
RUN npm run build

# Final stage
FROM node:22.16.0

# Install runtime dependencies
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

# Set working directory
WORKDIR /app

# Create cache directories
RUN mkdir -p \
    backend/public \
    /home/appuser/.cache/puppeteer \
    /home/appuser/.cache/ms-playwright \
    && chown -R appuser:appuser /app /home/appuser/.cache

# Copy built artifacts from the builder stage
COPY --from=builder --chown=appuser:appuser /app /app

# Copy frontend assets to backend public directory (if they exist)
RUN if [ -d "./dist" ]; then \
    mkdir -p backend/public && \
    cp -r dist/* backend/public/; \
fi

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start", "--prefix", "./backend"]
