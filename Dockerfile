# =========================================================================
# QUANTUM AI PRODUCTION DOCKERFILE - Unified package.json with lockfile
# =========================================================================

FROM node:22-slim AS dependency-installer
WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y python3 build-essential curl && rm -rf /var/lib/apt/lists/*

# Copy package.json + package-lock.json for reproducible installs
COPY package*.json ./

# Install all deps including devDependencies
RUN npm ci

# Build optimizer
FROM node:22-slim AS build-optimizer
WORKDIR /usr/src/app

COPY package*.json ./
COPY package-lock.json ./
RUN npm ci
COPY . .
RUN if [ -f "package.json" ] && grep -q "\"build\":" package.json; then npm run build; fi

# Final production image
FROM node:22-slim AS final
WORKDIR /usr/src/app

ENV NODE_ENV=production

RUN adduser --system --no-create-home --group nodeuser

COPY package*.json ./
COPY package-lock.json ./

# Install only production dependencies
RUN npm ci --omit=dev

COPY --from=build-optimizer /usr/src/app/backend ./backend
COPY --from=build-optimizer /usr/src/app/arielsql_suite ./arielsql_suite
COPY --from=build-optimizer /usr/src/app/config ./config
COPY --from=build-optimizer /usr/src/app/public ./public
COPY --from=build-optimizer /usr/src/app/frontend/dist ./frontend/dist
COPY --from=build-optimizer /usr/src/app/scripts ./scripts

RUN chown -R nodeuser:nodeuser /usr/src/app
USER nodeuser

EXPOSE 1000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=5 \
  CMD curl -f http://localhost:1000/agents/status || exit 1

CMD ["npm", "start"]
