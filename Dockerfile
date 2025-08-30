# syntax=docker/dockerfile:1.4

# Builder stage
FROM node:22.16.0 AS qraf_builder

RUN apt-get update && apt-get install -y \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxi6 libxtst6 \
    libatk-bridge2.0-0 libgtk-3-0 libgbm-dev libasound2 fonts-noto \
    python3 python3-pip python3-venv build-essential sqlite3 libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/* && apt-get clean

WORKDIR /app

RUN mkdir -p \
    config scripts contracts public public/scripts \
    frontend frontend/public frontend/public/assets \
    frontend/src frontend/src/components frontend/src/styles \
    backend backend/agents backend/blockchain backend/contracts backend/database \
    arielsql_suite data arielmatrix2.0

# Add all dependencies to package.json from the project root
# This conditional logic ensures the build doesn't fail if package.json is in a subdirectory
COPY package.json ./ || true

# Install dependencies once in the builder stage
RUN npm install --prefer-offline --no-audit --ignore-optional

# Copy all project files, including the scripts directory
COPY . .

# Build frontend if it exists
RUN if [ -d "frontend" ] && [ -f "frontend/package.json" ]; then cd frontend && npm install --no-audit && npm run build && cd ..; fi

# Install OS dependencies for specific npm packages
RUN npx puppeteer@24.16.0 install --with-deps || true
RUN npx playwright@1.48.2 install chromium --with-deps || true

# Rebuild native modules
RUN if npm list @tensorflow/tfjs-node >/dev/null 2>&1; then npm rebuild @tensorflow/tfjs-node --build-from-source; fi
RUN if npm list better-sqlite3 >/dev/null 2>&1; then npm rebuild better-sqlite3 --build-from-source; fi

# Ensure scripts are executable
RUN chmod -R +x scripts/*.sh || true

# Runtime stage
FROM node:22.16.0-slim AS qraf_runtime

RUN apt-get update && apt-get install -y \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxi6 libxtst6 \
    libatk-bridge2.0-0 libgtk-3-0 libgbm-dev libasound2 fonts-noto \
    python3 sqlite3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the application from the builder stage
COPY --from=qraf_builder /app /app

# Ensure correct permissions for the node user
RUN chown -R node:node /app

# Final directory cleanup and setup
RUN if [ -d "frontend/dist" ] || [ -d "frontend/build" ]; then mkdir -p public && cp -r frontend/dist/* public/ || cp -r frontend/build/* public/; fi
RUN rm -rf /app/.npm /app/.cache /tmp/* /var/tmp/* /app/frontend/node_modules && mkdir -p /app/data && chown -R node:node /app/data

USER node

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=10s --start-period=5s --retries=5 \
    CMD curl -f http://localhost:3000/health || exit 1

# Explicitly call the Node.js entry point script with a known path
ENTRYPOINT ["node", "/app/scripts/quantum-entrypoint.js"]
