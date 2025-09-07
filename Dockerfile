# --- STAGE 1: Dependency Installation ---
# This stage installs all Node.js dependencies from the unified package.json.
FROM node:22-slim AS dependency-installer
WORKDIR /usr/src/app

# Install build tools required for native modules.
RUN apt-get update && apt-get install -y python3 build-essential

# Copy the unified package.json and package-lock.json to leverage Docker's cache.
COPY package*.json ./

# Install all dependencies for both front-end and back-end.
RUN npm install

# --- STAGE 2: Frontend Build ---
# This stage builds the frontend assets. It's separate to keep the final image clean.
FROM node:22-slim AS frontend-builder
WORKDIR /usr/src/app

# Copy the node_modules from the previous stage to avoid re-installing.
COPY --from=dependency-installer /usr/src/app/node_modules ./node_modules

# Copy the entire project source code to build the frontend.
COPY . .

# Build the frontend from the root directory.
RUN npm run build

# --- STAGE 3: Final Production Image ---
# This is the final, production-ready image.
# It only contains the necessary application code and built assets.
FROM node:22-slim AS final-image
WORKDIR /usr/src/app

# Copy the node_modules from the dependency-installer stage.
COPY --from=dependency-installer /usr/src/app/node_modules ./node_modules

# Copy the built frontend assets from the frontend-builder stage.
# Assuming Vite places the output in `frontend/dist`.
COPY --from=frontend-builder /usr/src/app/dist ./dist

# Copy all the project's source code, excluding the files listed in .dockerignore.
COPY . .

# Expose the port the application runs on.
EXPOSE 1000

# The command to start the application with the new entry point.
CMD ["node", "backend/agents/autonomous-ai-engine.js"]
