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

# Use official registry to avoid integrity errors
RUN npm config set registry https://registry.npmjs.org \
  && npm config set legacy-peer-deps true \
  && npm config set audit false \
  && npm config set fund false \
  && npm config set progress false

# Copy package files
COPY package.json ./
COPY package-lock.json ./

# Clean cache and install
RUN npm cache clean --force \
  && npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# Verify critical modules
RUN npm list web3 || (echo "❌ web3 missing" && exit 1)
RUN npm list axios || (echo "❌ axios missing" && exit 1)
RUN npm list sqlite3 || (echo "❌ sqlite3 missing" && exit 1)

# Copy full project
COPY . .

# Run build script
RUN chmod +x build_and_deploy.sh && ./build_and_deploy.sh

# --- STAGE 2: Final Image ---
FROM node:22-slim AS final

WORKDIR /usr/src/app

# Copy node_modules and source
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/backend ./backend
COPY --from=builder /usr/src/app/frontend ./frontend
COPY --from=builder /usr/src/app/modules ./modules
COPY --from=builder /usr/src/app/scripts ./scripts
COPY --from=builder /usr/src/app/main.js ./main.js

# Optional health check
COPY --from=builder /usr/src/app/health.js ./health.js

EXPOSE 10000

ENTRYPOINT ["node", "main.js"]
