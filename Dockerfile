# --- STAGE 1: Dependency Installation ---
FROM node:22-slim AS dependency-installer

WORKDIR /usr/src/app

RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g npm@10.9.3
RUN npm config set registry https://registry.npmmirror.com

COPY package.json ./

RUN sed -i '/"ai-security-module"/d' package.json \
 && sed -i '/"quantum-resistant-crypto"/d' package.json \
 && sed -i '/"omnichain-interoperability"/d' package.json \
 && sed -i '/"infinite-scalability-engine"/d' package.json \
 && sed -i '/"carbon-negative-consensus"/d' package.json \
 && sed -i '/"ariel-sqlite-engine"/d' package.json

RUN npm install --legacy-peer-deps --no-audit --no-fund

# --- STAGE 2: Build & Final Image ---
FROM node:22-slim AS final-image

WORKDIR /usr/src/app

COPY --from=dependency-installer /usr/src/app/node_modules ./node_modules

COPY backend ./backend
COPY arielsql_suite ./arielsql_suite
COPY scripts ./scripts

COPY cleanup-conflicts.sh ./cleanup-conflicts.sh
RUN chmod +x ./cleanup-conflicts.sh 

# In dependency-installer stage
COPY fix-structure.sh ./fix-structure.sh
RUN chmod +x fix-structure.sh && ./fix-structure.sh

ENV SERVICE_MANAGER_BOOTSTRAP=true

# Must match ServiceManager.js
EXPOSE 10000

ENTRYPOINT ["bash", "-c", "./cleanup-conflicts.sh && node arielsql_suite/ServiceManager.js"]
