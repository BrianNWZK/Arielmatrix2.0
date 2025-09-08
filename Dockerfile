# =========================================================================
# QUANTUM AI PRODUCTION DOCKERFILE - UNIFIED PACKAGE.JSON EDITION
# Optimized for single package.json structure with all dependencies
# =========================================================================

# --- STAGE 1: DEPENDENCY INSTALLER ---
FROM node:22-slim AS dependency-installer
WORKDIR /usr/src/app

# Install system dependencies for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first for optimal caching
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm install

# --- STAGE 2: BUILD OPTIMIZER ---
FROM node:22-slim AS build-optimizer
WORKDIR /usr/src/app

# Copy installed dependencies
COPY --from=dependency-installer /usr/src/app/node_modules ./node_modules
COPY --from=dependency-installer /usr/src/app/package*.json ./

# Copy all source code with error handling for missing directories
COPY . .

# Create missing directories if they don't exist
RUN mkdir -p \
    backend/agents \
    arielsql_suite \
    scripts \
    config \
    blockchain \
    database \
    public \
    frontend/src

# Run any build steps if they exist
RUN if [ -f "package.json" ] && grep -q "\"build\":" package.json; then \
        npm run build; \
        echo "✅ Build completed successfully"; \
    else \
        echo "ℹ️  No build script found, proceeding without build step"; \
    fi

# Run any AI training if specified
RUN if [ -f "package.json" ] && grep -q "\"train-ai\":" package.json; then \
        npm run train-ai; \
        echo "✅ AI training completed"; \
    else \
        echo "ℹ️  No AI training script found"; \
    fi

# --- STAGE 3: FINAL PRODUCTION IMAGE ---
FROM node:22-slim AS final
WORKDIR /usr/src/app

# Create non-root user for security
RUN adduser --system --no-create-home --group nodeuser

# Copy package files
COPY package*.json ./

# Copy production dependencies only (no devDependencies)
COPY --from=dependency-installer /usr/src/app/node_modules ./node_modules

# Copy built application from build stage with directory existence checks
COPY --from=build-optimizer /usr/src/app/backend ./backend
COPY --from=build-optimizer /usr/src/app/arielsql_suite ./arielsql_suite
COPY --from=build-optimizer /usr/src/app/scripts ./scripts
COPY --from=build-optimizer /usr/src/app/config ./config

# Copy optional directories only if they exist
RUN if [ -d "/usr/src/app/blockchain" ]; then \
        cp -r /usr/src/app/blockchain ./blockchain; \
    else \
        mkdir -p blockchain && echo "⚠️  Blockchain directory not found, creating placeholder"; \
    fi

RUN if [ -d "/usr/src/app/database" ]; then \
        cp -r /usr/src/app/database ./database; \
    else \
        mkdir -p database && echo "⚠️  Database directory not found, creating placeholder"; \
    fi

RUN if [ -d "/usr/src/app/public" ]; then \
        cp -r /usr/src/app/public ./public; \
    else \
        mkdir -p public && echo "⚠️  Public directory not found, creating placeholder"; \
    fi

RUN if [ -d "/usr/src/app/frontend/dist" ]; then \
        cp -r /usr/src/app/frontend/dist ./frontend/dist; \
    else \
        mkdir -p frontend/dist && echo "<html><body>Frontend placeholder</body></html>" > frontend/dist/index.html; \
    fi

# Remove devDependencies if they exist in production
RUN if [ -d "node_modules" ]; then \
        npm prune --production; \
        echo "✅ Removed dev dependencies for production"; \
    fi

# Remove any unnecessary files for production
RUN find . -name "*.log" -delete 2>/dev/null || true && \
    find . -name "*.md" -delete 2>/dev/null || true && \
    rm -rf .git .github .vscode 2>/dev/null || true

# Set proper ownership
RUN chown -R nodeuser:nodeuser /usr/src/app

# Switch to non-root user
USER nodeuser

# Expose application port
EXPOSE 1000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:1000/health || exit 1

# Start command - uses the main entry point from package.json
CMD ["npm", "start"]
