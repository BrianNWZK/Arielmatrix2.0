# --- STAGE 1: Dependency Installation & Build ---
# Use a Node.js base image with a recent version.
FROM node:22-slim AS builder

# Set the working directory inside the container.
WORKDIR /usr/src/app

# Install build tools required for native modules.
RUN apt-get update && apt-get install -y python3 build-essential

# Copy the package files first to leverage Docker's build cache.
COPY package*.json ./

# Install all dependencies (both production and development).
RUN npm install

# Copy the entire application source code.
COPY . .

# Run the build command to create the production bundle.
# This step is critical for your Vite-based application.
RUN npm run build

# --- STAGE 2: Final Production Image ---
# Use a minimal base image that is only needed to run the application.
FROM node:22-slim AS final

# Set the working directory.
WORKDIR /usr/src/app

# Copy only the necessary files from the builder stage.
# This keeps our final image small and secure.
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
