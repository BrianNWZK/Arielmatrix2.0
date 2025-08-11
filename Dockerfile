# Builder stage (run as root)
FROM node:22.16.0 as builder

# Install system dependencies for Puppeteer, Playwright, and fonts
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

# Set working directory
WORKDIR /app

# Copy backend package.json and install dependencies
COPY backend/package.json backend/package-lock.json ./backend/
RUN npm install --prefix ./backend
# Install Chrome and Chromium binaries
RUN npx puppeteer browsers install chrome
RUN npx playwright install chromium --with-deps

# Copy frontend package.json and install dependencies
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN npm install --prefix ./frontend

# Copy all files
COPY . .

# Build frontend
RUN npm run build --prefix ./frontend

# Final stage (non-root)
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

# Create directories and set ownership
RUN mkdir -p \
    /app/backend \
    /app/frontend \
    /app/frontend/dist \
    /app/backend/public \
    /home/appuser/.cache/puppeteer \
    /home/appuser/.cache/ms-playwright \
    && chown -R appuser:appuser /app /home/appuser/.cache

# Copy from builder with correct ownership
COPY --from=builder --chown=appuser:appuser /app /app
COPY --from=builder --chown=appuser:appuser /root/.cache/puppeteer /home/appuser/.cache/puppeteer
COPY --from=builder --chown=appuser:appuser /root/.cache/ms-playwright /home/appuser/.cache/ms-playwright

# Switch to non-root user
USER appuser

# Copy frontend build to backend public
RUN cp -r /app/frontend/dist/* /app/backend/public/ && \
    mkdir -p /app/backend/public && \
    touch /app/backend/public/index.html || echo "Frontend build missing"

# Expose port
EXPOSE 10000

# Start backend
CMD ["npm", "start", "--prefix", "./backend"]
