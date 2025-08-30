# syntax=docker/dockerfile:1.4
FROM node:22.16.0-slim

# Install runtime dependencies
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
COPY package*.json ./

# Install production dependencies
RUN npm install --production --omit=dev --prefer-offline --no-audit --progress=false

# Copy application code
COPY --chown=appuser:appuser . .

# Create data directory
RUN mkdir -p data && chown appuser:appuser data

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health >/dev/null 2>&1 || exit 1

CMD ["sh", "-c", \
    "if [ -f 'arielsql_suite/main.js' ]; then \
        exec node arielsql_suite/main.js; \
    elif [ -f 'server.js' ]; then \
        exec node server.js; \
    else \
        echo 'No entry point found'; \
        sleep infinity; \
    fi"]
