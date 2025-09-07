# --- STAGE 1: Dependency Installation ---
# This stage installs all Node.js dependencies to create a reusable layer.
FROM node:22-slim AS dependency-installer
WORKDIR /usr/src/app

# Install build tools required for native modules like better-sqlite3.
RUN apt-get update && apt-get install -y python3 build-essential

# Copy the unified package.json and install all dependencies.
COPY package.json ./
RUN npm install

# --- STAGE 2: Frontend Build ---
# This stage is dedicated solely to building the frontend assets.
FROM node:22-slim AS frontend-builder
WORKDIR /usr/src/app

# Copy the entire application source code.
COPY . .

# Copy the node_modules from the first stage. This gives us all the
# dependencies needed to build the frontend without reinstalling.
COPY --from=dependency-installer /usr/src/app/node_modules ./node_modules

# Run the build command to generate the static frontend assets.
# This stage ensures 'vite' is found and the build completes successfully.
RUN npm run build

# --- STAGE 3: Final Production Image ---
# This is the final, minimal production image.
FROM node:22-slim AS final-image
WORKDIR /usr/src/app

# Copy the necessary node_modules from the first stage.
COPY --from=dependency-installer /usr/src/app/node_modules ./node_modules

# Copy the built frontend assets (the 'dist' folder) from the build stage.
COPY --from=frontend-builder /usr/src/app/dist ./dist

# Copy the rest of the backend application source code.
COPY backend/agents ./backend/agents
COPY backend/database ./backend/database
COPY arielsql_suite ./arielsql_suite
COPY scripts ./scripts

# Expose the port your application listens on.
EXPOSE 1000

# The command to start your application.
CMD ["node", "backend/agents/autonomous-ai-engine.js"]
