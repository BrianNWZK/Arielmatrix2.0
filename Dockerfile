# syntax=docker/dockerfile:1.4

# Builder stage
FROM node:22.16.0 AS builder

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxi6 libxtst6 \
    libatk-bridge2.0-0 libgtk-3-0 libgbm-dev libasound2 fonts-noto \
    python3 python3-pip python3-venv \
    build-essential \
    sqlite3 libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Create essential directories
RUN mkdir -p \
    config \
    scripts \
    contracts \
    public \
    arielmatrix2.0 \
    frontend \
    backend \
    arielsql_suite \
    data

# Install dependencies
RUN echo "📦 Installing dependencies..." && \
    if [ -f "package.json" ]; then \
        npm install --prefer-offline --no-audit --progress=false; \
    else \
        echo "❌ No package.json found!"; \
        exit 1; \
    fi

# Copy all source files
COPY --chown=node:node . .

# Final production stage
FROM node:22.16.0-slim AS runtime

# Install minimal runtime dependencies
RUN apt-get update && apt-get install -y \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxi6 libxtst6 \
    libatk-bridge2.0-0 libgtk-3-0 libgbm-dev libasound2 fonts-noto \
    python3 \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -r -m -u 1001 appuser

WORKDIR /app

# Copy package files
COPY --from=builder --chown=appuser:appuser /app/package*.json ./

# Copy only production node_modules (if they exist)
RUN if [ -d "/app/node_modules" ]; then \
    echo "✅ Copying node_modules from builder"; \
    cp -r /app/node_modules .; \
else \
    echo "⚠️ node_modules not found in builder, installing production dependencies"; \
    npm install --production --omit=dev --prefer-offline --no-audit --progress=false; \
fi

# Copy application source code
COPY --from=builder --chown=appuser:appuser /app ./

# Clean up development files
RUN rm -rf \
    .npm \
    .cache \
    /tmp/* \
    /var/tmp/*

# Ensure proper permissions
RUN mkdir -p /app/data && chown -R appuser:appuser /app

USER appuser

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health >/dev/null 2>&1 || exit 1

# Start command
CMD ["sh", "-c", \
    "echo '🚀 Starting ArielSQL Ultimate Suite...'; \
    echo '📦 Node.js version: $(node --version)'; \
    if [ -f 'arielsql_suite/main.js' ]; then \
        echo '🎯 Starting main application'; \
        exec node arielsql_suite/main.js; \
    elif [ -f 'server.js' ]; then \
        echo '🎯 Starting server.js'; \
        exec node server.js; \
    else \
        echo '❌ No entry point found'; \
        echo '💤 Starting sleep to keep container alive...'; \
        exec sleep infinity; \
    fi"]
