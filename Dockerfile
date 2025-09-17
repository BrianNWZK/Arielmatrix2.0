# --- STAGE 1: Dependency Installer ---
FROM node:22-slim AS builder

WORKDIR /usr/src/app

# System dependencies
RUN apt-get update && apt-get install -y \
  python3 \
  build-essential \
  cmake \
  git \
  curl \
  pkg-config \
  sqlite3 \
  libsqlite3-dev \
  ca-certificates \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

# Configure npm and clean cache
RUN npm config set registry https://registry.npmjs.org \
  && npm config set legacy-peer-deps true \
  && npm config set audit false \
  && npm config set fund false \
  && npm config set progress false \
  && npm cache clean --force

# Copy package files
COPY package.json package-lock.json* ./
COPY modules/pqc-dilithium ./modules/pqc-dilithium
COPY modules/pqc-kyber ./modules/pqc-kyber

# Remove stubbed dependencies from package.json
RUN sed -i '/"ai-security-module"/d' package.json \
 && sed -i '/"omnichain-interoperability"/d' package.json \
 && sed -i '/"infinite-scalability-engine"/d' package.json \
 && sed -i '/"carbon-negative-consensus"/d' package.json \
 && sed -i '/"ariel-sqlite-engine"/d' package.json

# Install dependencies with fallback
RUN if [ -f package-lock.json ]; then \
      npm ci --legacy-peer-deps --no-audit --no-fund --prefer-offline || \
      npm install --legacy-peer-deps --no-audit --no-fund --prefer-offline; \
    else \
      npm install --legacy-peer-deps --no-audit --no-fund --prefer-offline; \
    fi

# Remove problematic modules
RUN rm -rf node_modules/@tensorflow node_modules/sqlite3 node_modules/.cache 2>/dev/null || true

# Verify critical modules
RUN npm list web3 || (echo "❌ web3 missing" && exit 1)
RUN npm list axios || (echo "❌ axios missing" && exit 1)

# Copy full project
COPY . .

# Run build script
RUN chmod +x build_and_deploy.sh && ./build_and_deploy.sh

# --- STAGE 2: Final Image ---
FROM node:22-slim AS final

WORKDIR /usr/src/app

# Copy built app from builder
COPY --from=builder /usr/src/app .

EXPOSE 10000

ENTRYPOINT ["node", "main.js"]
