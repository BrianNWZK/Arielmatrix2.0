```dockerfile
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
WORKDIR /app/arielmatrix2.0

# Copy root package.json and package-lock.json
COPY arielmatrix2.0/package.json arielmatrix2.0/package-lock.json ./
RUN npm install

# Copy and install frontend dependencies
COPY arielmatrix2.0/frontend/package.json arielmatrix2.0/frontend/package-lock.json ./frontend/
RUN npm install --prefix ./frontend

# Install browsers for automation
RUN npx puppeteer browsers install chrome
RUN npx playwright install chromium --with-deps

# Copy all source files
COPY arielmatrix2.0/ .

# Build frontend
RUN npm run build --prefix ./frontend

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
WORKDIR /app/arielmatrix2.0

# Create cache directories
RUN mkdir -p \
    /app/arielmatrix2.0/backend/public \
    /home/appuser/.cache/puppeteer \
    /home/appuser/.cache/ms-playwright \
    && chown -R appuser:appuser /app /home/appuser/.cache

# Copy built artifacts
COPY --from=builder --chown=appuser:appuser /app/arielmatrix2.0 /app/arielmatrix2.0
COPY --from=builder --chown=appuser:appuser /root/.cache/puppeteer /home/appuser/.cache/puppeteer
COPY --from=builder --chown=appuser:appuser /root/.cache/ms-playwright /home/appuser/.cache/ms-playwright

# Copy frontend assets to backend public directory
RUN cp -r /app/arielmatrix2.0/frontend/dist/* /app/arielmatrix2.0/backend/public/ 2>/dev/null || echo "No frontend assets to copy"

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
```
