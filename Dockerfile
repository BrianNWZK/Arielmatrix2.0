# --- STAGE 1: Build & Dependency Installation ---
# Use a slimmed-down base image for a smaller final image.
FROM node:22-slim AS builder

# Set the working directory inside the container.
WORKDIR /usr/src/app

# Install build tools required for native modules like better-sqlite3.
# This is a good practice to ensure native dependencies can be compiled.
RUN apt-get update && apt-get install -y python3 build-essential

# Copy package.json and package-lock.json first to leverage Docker's build cache.
# This step only runs `npm ci` when the package files change.
COPY package*.json ./
RUN npm ci --only=production

# Copy the entire application source code to the builder stage.
COPY . .

# Run the build command for the application. This is crucial for
# a 100% deployment, as it prepares all assets for production.
# The user's prompt hints at this missing step (e.g., for a Vite frontend).
RUN npm run build

# --- STAGE 2: Final Production Image ---
# Use a minimal base image that is only needed to run the application.
FROM node:22-slim AS final

# Set the working directory.
WORKDIR /usr/src/app

# Copy only the necessary production files from the builder stage.
# This keeps the final image as small as possible and removes build tools.
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/backend ./backend
COPY --from=builder /usr/src/app/arielsql_suite ./arielsql_suite
COPY --from=builder /usr/src/app/scripts ./scripts
COPY --from=builder /usr/src/app/package*.json ./

# Expose the port the application runs on.
EXPOSE 1000

# The command to start the application with a standard npm script.
# This is more conventional and flexible than hardcoding the file path.
CMD ["npm", "run", "start"]
