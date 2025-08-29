# syntax=docker/dockerfile:1.4
# Builder stage
FROM node:22.16.0 AS builder

# Install system dependencies for headless browsers
RUN apt-get update && apt-get install -y \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxi6 libxtst6 \
    libatk-bridge2.0-0 libgtk-3-0 libgbm-dev libasound2 fonts-noto \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files if present
COPY package*.json ./ 2>/dev/null || true
COPY backend/package*.json ./backend/ 2>/dev/null || true

# Install backend dependencies if package.json exists
RUN if [ -f package.json ]; then npm ci --prefer-offline --no-audit --progress=false; fi

# Copy backend files conditionally
COPY ./server.js ./ 2>/dev/null || true
COPY ./hardhat.config.js ./ 2>/dev/null || true
COPY ./config ./config 2>/dev/null || true
COPY ./scripts ./scripts 2>/dev/null || true
COPY ./contracts ./contracts 2>/dev/null || true
COPY ./public ./public 2>/dev/null || true
COPY ./arielmatrix2.0 ./arielmatrix2.0 2>/dev/null || true
COPY .eslintrc.json .eslintrc.json 2>/dev/null || true

# Frontend build process
RUN if [ -d "frontend" ]; then \
      npm install --prefix frontend --no-audit --no-fund --silent; \
      npm run build --prefix frontend || echo "Frontend build failed"; \
    fi

# Install Puppeteer and Playwright browsers
RUN npx -y puppeteer@latest install --with-deps 2>/dev/null || true
RUN npx -y playwright@latest install chromium --with-deps 2>/dev/null || true

# Final stage
FROM node:22.16.0 AS runtime

RUN apt-get update && apt-get install -y \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxi6 libxtst6 \
    libatk-bridge2.0-0 libgtk-3-0 libgbm-dev libasound2 fonts-noto \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m appuser || true

WORKDIR /app

# Copy built artifacts from builder
COPY --from=builder /app /app

# Move frontend build artifacts to public if they exist
RUN if [ -d "./frontend/dist" ]; then cp -r ./frontend/dist/* ./public/; fi
RUN if [ -d "./frontend/build" ]; then cp -r ./frontend/build/* ./public/; fi

# Ensure ownership
RUN chown -R appuser:appuser /app

USER appuser

EXPOSE 3000

# Start command for the server
CMD ["sh", "-c", "if [ -f server.js ]; then node server.js; elif [ -f backend/server.js ]; then node backend/server.js; else echo 'No server.js found'; sleep infinity; fi"]
