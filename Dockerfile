# --- STAGE 1: Dependency Installation & Build ---
# Use a Node.js base image with a recent version for building.
FROM node:22-slim AS builder

# Set the working directory inside the container.
WORKDIR /usr/src/app

# Install build tools required for native modules like better-sqlite3.
RUN apt-get update && apt-get install -y python3 build-essential

# Copy the package.json and package-lock.json files first.
# This optimizes Docker's cache, so npm install only runs if dependencies change.
COPY package*.json ./

# Install all dependencies (production and development) as they are needed for the build step.
RUN npm install

# Copy all application source code.
COPY . .

# Run the build command to create the production bundle.
# This is the crucial step that was missing and caused the 'vite: not found' error.
RUN npm run build

# --- STAGE 2: Final Production Image ---
# Use a lean base image for the final production environment.
FROM node:22-slim AS final

# Set the working directory.
WORKDIR /usr/src/app

# Copy only the necessary files from the builder stage.
# This keeps the final image small and secure.
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/backend ./backend
COPY --from=builder /usr/src/app/arielsql_suite ./arielsql_suite
COPY --from=builder /usr/src/app/scripts ./scripts
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package*.json ./

# Expose the port the application runs on.
EXPOSE 1000

# The command to start the application.
CMD ["npm", "run", "start"]
