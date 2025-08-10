# Builder stage (run as root)
FROM node:22.16.0 as builder

# Install dependencies for puppeteer and playwright
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
COPY backend/package.json backend/package-lock.json* ./backend/
RUN npm install --prefix ./backend
RUN npx puppeteer browsers install chrome
RUN npx playwright install chromium

# Copy frontend package.json and install dependencies
COPY frontend/package.json frontend/package-lock.json* ./frontend/
RUN npm install --prefix ./frontend

# Copy all files
COPY . .

# Build frontend
RUN npm run build --prefix ./frontend

# Final stage (non-root)
FROM node:22.16.0

# Install dependencies for puppeteer and playwright
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

# Create a non-root user
RUN useradd -m appuser

# Set working directory and ensure permissions
WORKDIR /app
RUN mkdir -p /app/backend /app/frontend /app/frontend/dist /app/backend/public /home/appuser/.cache/puppeteer /home/appuser/.cache/ms-playwright && chown -R appuser:appuser /app /home/appuser/.cache

# Copy from builder with chown to appuser
COPY --from=builder --chown=appuser:appuser /app /app

# Switch to non-root user
USER appuser

# Serve frontend static files through backend
RUN cp -r frontend/dist ./backend/public

# Expose port
EXPOSE 10000

# Start backend
CMD ["npm", "start", "--prefix", "./backend"]
