# --- STAGE 1: Dependency Installation & Build ---
# Use a Node.js base image with a recent version for building.
FROM node:22-slim AS builder

# Set the working directory inside the container to the root of your project.
WORKDIR /usr/src/app

# Copy the entire application source code.
COPY . .

# CRITICAL FIX: Install Python and other build essentials required by native Node.js modules like `better-sqlite3`.
# This allows `node-gyp` to compile the packages successfully.
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install all dependencies required for the project from the root package.json.
# This will handle backend dependencies.
RUN npm install

# IMPORTANT FIX: Navigate to the `frontend` directory to build the frontend.
# This ensures that the `vite` command can be found.
WORKDIR /usr/src/app/frontend

# Run the build command to create the production bundle.
RUN npm run build

# --- STAGE 2: Final Production Image ---
# Use a lean base image for the final production environment.
FROM node:22-slim AS final

# Set the working directory for the final application.
WORKDIR /usr/src/app

# Copy only the necessary files from the builder stage to keep the final
# image small and secure.
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
