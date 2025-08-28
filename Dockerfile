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

# Copy backend package files and install dependencies
COPY backend/package.json ./backend/
RUN npm install --prefix ./backend

# Copy frontend package files and install dependencies
COPY frontend/package.json ./frontend/
RUN npm install --prefix ./frontend

# Install browsers for automation
RUN npx puppeteer browsers install chrome
RUN npx playwright install chromium --with-deps

# Copy all frontend source files
COPY frontend ./frontend

# Copy backend source files, including the main script and arielsql_suite
COPY backend/arielsql_suite /app/backend/arielsql_suite

# Build frontend (if package.json exists)
RUN if [ -f "./frontend/package.json" ]; then \
    cd frontend && npm run build; \
fi

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
COPY --from=builder --chown=appuser:appuser /root/.cache/puppeteer /home/appuser/.cache/puppeteer
COPY --from=builder --chown=appuser:appuser /root/.cache/ms-playwright /home/appuser/.cache/ms-playwright

# Copy frontend assets to backend public directory (if they exist)
RUN if [ -d "./frontend/dist" ]; then \
    mkdir -p backend/public && \
    cp -r frontend/dist/* backend/public/; \
elif [ -d "./frontend/build" ]; then \
    mkdir -p backend/public && \
    cp -r frontend/build/* backend/public/; \
fi

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start", "--prefix", "./backend"]
