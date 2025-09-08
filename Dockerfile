# --- STAGE 1: Dependency Installation & Build ---
# Use a Node.js base image with a recent version for building.
FROM node:22-slim AS builder

# Set the working directory to the root of your project.
WORKDIR /usr/src/app

# Copy the entire application source code.
COPY . .

# CRITICAL FIX: Install Python and other build tools required by native Node.js modules.
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install backend dependencies from the root package.json.
RUN npm install

# IMPORTANT FIX: Change the working directory to the frontend folder.
WORKDIR /usr/src/app/frontend

# CRITICAL FIX: Install the frontend dependencies, which includes Vite.
# This is the step that was missing in the previous versions.
RUN npm install

# Run the build command to create the production bundle.
# This will now succeed because Vite is properly installed.
RUN npm run build

# --- STAGE 2: Final Production Image ---
# Use a lean base image for the final production environment.
FROM node:22-slim AS final

# Set the working directory for the final application.
WORKDIR /usr/src/app

# Copy only the necessary files from the builder stage.
COPY --from=builder /usr/src/app/frontend/dist ./dist
COPY --from=builder /usr/src/app/backend ./backend
COPY --from=builder /usr/src/app/arielsql_suite ./arielsql_suite
COPY --from=builder /usr/src/app/scripts ./scripts
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package*.json ./

# Expose the port the application runs on.
EXPOSE 1000

# The command to start the application.
CMD ["npm", "run", "start"]
