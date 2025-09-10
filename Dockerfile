# --- STAGE 1: Build All Assets ---
# This stage handles all dependency installation and the frontend build.
FROM node:22-slim AS build-stage
WORKDIR /usr/src/app

# Install build tools required for native modules (e.g., node-gyp).
RUN apt-get update && apt-get install -y python3 build-essential

# Copy the entire application source code.
COPY . .

# Install all dependencies and then immediately run the frontend build.
# Running these commands together ensures the 'vite' executable is in the PATH
# for the build command.
RUN npm install && npm run build

# --- STAGE 2: Final Production Image ---
# This is the final, minimal production image.
FROM node:22-slim AS final-image
WORKDIR /usr/src/app

# Copy the necessary node_modules from the build stage.
# We only copy this one folder to keep the final image small.
COPY --from=build-stage /usr/src/app/node_modules ./node_modules

# Copy the built frontend assets (the 'dist' folder) from the build stage.
COPY --from=build-stage /usr/src/app/dist ./dist

# Copy the rest of the backend application source code.
COPY backend/agents ./backend/agents
COPY backend/database ./backend/database
COPY arielsql_suite ./arielsql_suite
COPY scripts ./scripts
COPY package.json ./

# Expose the port your application listens on.
EXPOSE 1000

# The command to start your application.
CMD ["node", "backend/agents/autonomous-ai-engine.js"]
