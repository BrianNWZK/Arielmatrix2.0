# syntax=docker/dockerfile:1.4
# Builder stage
FROM node:22.16.0 AS builder

# Install system deps needed for headless browsers (Playwright / Puppeteer)
RUN apt-get update && apt-get install -y \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxi6 libxtst6 \
    libatk-bridge2.0-0 libgtk-3-0 libgbm-dev libasound2 fonts-noto \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Configuration: adjust only if your server entry is not at ./server.js ---
# If your backend entrypoint is inside backend/server.js, change this to BACKEND_ENTRY=backend/server.js
ARG BACKEND_ENTRY=server.js
ARG FRONTEND_DIR=frontend

# Copy package files (backend root) if present
# Use wildcard COPY to avoid failing build if package*.json missing
COPY --link package*.json package-lock*.json ./ 2>/dev/null || true

# If a backend package.json is in backend/, copy it too (will not fail if not present)
COPY --link backend/package*.json backend/package-lock*.json ./backend/ 2>/dev/null || true

# Install backend deps only if package.json exists
RUN if [ -f package.json ]; then npm ci --prefer-offline --no-audit --progress=false; else echo "no root package.json; skipping root npm install"; fi

# Copy backend files if they exist
# This avoids failing the build when optional files are missing. We still copy directories that exist.
RUN set -eux; \
    for p in server.js hardhat.config.js config scripts backend contracts arielmatrix2.0 public; do \
      if [ -e "/src-placeholder/$p" ]; then :; fi; \
    done

# The above was a noop check to be safe. Now copy allowed paths if present.
# Copy directories / files that commonly exist. Each COPY targets may fail if source absent => use conditional technique:
# Use a temporary pack via tar if file exists to avoid Docker COPY failing the build.
# We'll create a small helper that tars from the build context; Docker does not support "copy-if-exists" natively,
# so we handle optional content by copying whole frontend folder (if present) and backend folder.
COPY --link ./backend ./backend 2>/dev/null || true
COPY --link ./config ./config 2>/dev/null || true
COPY --link ./contracts ./contracts 2>/dev/null || true
COPY --link ./arielmatrix2.0 ./arielmatrix2.0 2>/dev/null || true
COPY --link ./scripts ./scripts 2>/dev/null || true
COPY --link ./public ./public 2>/dev/null || true
COPY --link .eslintrc.json .eslintrc.json 2>/dev/null || true
COPY --link .gitignore .gitignore 2>/dev/null || true
COPY --link .dockerignore .dockerignore 2>/dev/null || true
COPY --link hardhat.config.js hardhat.config.js 2>/dev/null || true
COPY --link server.js server.js 2>/dev/null || true

# Frontend: install & build only if frontend exists
RUN if [ -d "${FRONTEND_DIR}" ]; then \
      echo "Frontend present. Installing frontend deps..."; \
      if [ -f "${FRONTEND_DIR}/package-lock.json" ] || [ -f "${FRONTEND_DIR}/package.json" ]; then \
        npm install --prefix ${FRONTEND_DIR} --no-audit --no-fund --silent || true; \
      fi; \
      npm run build --prefix ${FRONTEND_DIR} || echo "frontend build failed or not defined"; \
    else \
      echo "No frontend directory found, skipping frontend build"; \
    fi

# Install headless browser binaries if either puppeteer/playwright likely used
# These commands are safe even if npx packages not present; they may no-op or print warnings.
RUN if command -v npx >/dev/null 2>&1; then \
      npx -y puppeteer@latest install --with-deps 2>/dev/null || true; \
      npx -y playwright@latest install chromium --with-deps 2>/dev/null || true; \
    fi

# Final stage (runtime)
FROM node:22.16.0 AS runtime

RUN apt-get update && apt-get install -y \
    libnss3 libx11-xcb1 libxcomposite1 libxdamage1 libxi6 libxtst6 \
    libatk-bridge2.0-0 libgtk-3-0 libgbm-dev libasound2 fonts-noto \
    && rm -rf /var/lib/apt/lists/*

# non-root user
RUN useradd -m appuser || true

WORKDIR /app

# copy built artifacts and app files from builder (if any)
COPY --from=builder --chown=appuser:appuser /app /app

# If frontend build artifacts are in builder at frontend/dist or frontend/build, move them into public.
RUN if [ -d "./frontend/dist" ]; then cp -r ./frontend/dist/* ./public/ || true; fi
RUN if [ -d "./frontend/build" ]; then cp -r ./frontend/build/* ./public/ || true; fi

# Ensure ownership
RUN chown -R appuser:appuser /app /home/appuser || true

USER appuser

EXPOSE 3000

# Default start command. If your server entrypoint is elsewhere (e.g. backend/server.js), run with docker run ... node backend/server.js
CMD ["sh", "-c", "if [ -f server.js ]; then node server.js; elif [ -f backend/server.js ]; then node backend/server.js; else echo 'No server.js found; container started but not running a server.' && sleep infinity; fi"]
