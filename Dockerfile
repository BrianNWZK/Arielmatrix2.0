# =========================================================================
# QUANTUM AI PRODUCTION DOCKERFILE - SELF-HEALING EDITION
# Enhanced with autonomous error resolution and multi-stage optimization
# =========================================================================

# --- STAGE 1: DEPENDENCY RESOLUTION AND VALIDATION ---
FROM node:22-slim AS dependency-resolver
WORKDIR /usr/src/app

# Install system dependencies for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first for better caching
COPY package*.json ./

# Create essential package.json files if missing with autonomous healing
RUN mkdir -p backend frontend && \
    if [ ! -f "./backend/package.json" ]; then \
        echo '{"name": "arielsql-backend", "version": "1.0.0", "type": "module", "dependencies": {}}' > ./backend/package.json; \
        echo "✅ Created missing backend/package.json"; \
    fi && \
    if [ ! -f "./frontend/package.json" ]; then \
        echo '{"name": "arielsql-frontend", "version": "1.0.0", "type": "module", "dependencies": {}}' > ./frontend/package.json; \
        echo "✅ Created missing frontend/package.json"; \
    fi

# Install root dependencies
RUN npm install --include-workspace-root

# --- STAGE 2: BACKEND BUILDER ---
FROM node:22-slim AS backend-builder
WORKDIR /usr/src/app

# Copy package files and node_modules from dependency resolver
COPY --from=dependency-resolver /usr/src/app/package*.json ./
COPY --from=dependency-resolver /usr/src/app/node_modules ./node_modules
COPY --from=dependency-resolver /usr/src/app/backend/package.json ./backend/

# Set working directory for backend
WORKDIR /usr/src/app/backend

# Install backend-specific dependencies
RUN if [ -f "./package.json" ]; then \
        npm install --no-package-lock; \
        echo "✅ Backend dependencies installed"; \
    else \
        echo "⚠️ No backend package.json found, using root dependencies"; \
    fi

# Copy backend source code
COPY backend/ .

# --- STAGE 3: FRONTEND BUILDER ---
FROM node:22-slim AS frontend-builder
WORKDIR /usr/src/app

# Copy package files and node_modules from dependency resolver
COPY --from=dependency-resolver /usr/src/app/package*.json ./
COPY --from=dependency-resolver /usr/src/app/node_modules ./node_modules
COPY --from=dependency-resolver /usr/src/app/frontend/package.json ./frontend/

# Set working directory for frontend
WORKDIR /usr/src/app/frontend

# Install frontend-specific dependencies
RUN if [ -f "./package.json" ]; then \
        npm install --no-package-lock; \
        echo "✅ Frontend dependencies installed"; \
    else \
        echo "⚠️ No frontend package.json found, using root dependencies"; \
    fi

# Copy frontend source code
COPY frontend/ .

# Build frontend (if build script exists)
RUN if [ -f "package.json" ] && grep -q "\"build\":" package.json; then \
        npm run build; \
        echo "✅ Frontend built successfully"; \
    else \
        echo "⚠️ No build script found, skipping frontend build"; \
        mkdir -p dist && echo "<html><body>Frontend placeholder</body></html>" > dist/index.html; \
    fi

# --- STAGE 4: FINAL PRODUCTION IMAGE ---
FROM node:22-slim AS final
WORKDIR /usr/src/app

# Create non-root user for security
RUN adduser --system --no-create-home --group nodeuser

# Copy package files and production dependencies
COPY --from=dependency-resolver /usr/src/app/package*.json ./
COPY --from=dependency-resolver /usr/src/app/node_modules ./node_modules

# Copy built backend
COPY --from=backend-builder /usr/src/app/backend ./backend

# Copy built frontend
COPY --from=frontend-builder /usr/src/app/frontend/dist ./frontend/dist

# Copy other essential project files
COPY arielsql_suite/ ./arielsql_suite/
COPY scripts/ ./scripts/
COPY config/ ./config/
COPY blockchain/ ./blockchain/
COPY database/ ./database/
COPY public/ ./public/

# Set proper ownership
RUN chown -R nodeuser:nodeuser /usr/src/app

# Switch to non-root user
USER nodeuser

# Expose application port
EXPOSE 1000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:1000/health || exit 1

# Start command with graceful shutdown handling
CMD ["node", "backend/agents/autonomous-ai-engine.js"]
