# --- STAGE 1: Build & Dependency Installation ---
# Use a slimmed-down base image for a smaller final image.
FROM node:22-slim AS builder

# Set the working directory inside the container.
WORKDIR /usr/src/app

# Install build tools required for native modules like better-sqlite3.
RUN apt-get update && apt-get install -y python3 build-essential

# Copy package.json and package-lock.json first to leverage Docker's build cache.
COPY package*.json ./

# Use `npm install` which is more flexible than `npm ci` and
# will install dependencies even if a package-lock.json is not present.
RUN npm install

# Copy the entire application source code to the builder stage.
COPY . .

# Run the build command for the application.
RUN npm run build

# --- STAGE 2: Final Production Image ---
# Use a minimal base image that is only needed to run the application.
FROM node:22-slim AS final

# Set the working directory.
WORKDIR /usr/src/app

# Copy only the necessary production files from the builder stage.
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/backend ./backend
COPY --from=builder /usr/src/app/arielsql_suite ./arielsql_suite
COPY --from=builder /usr/src/app/scripts ./scripts
COPY --from=builder /usr/src/app/package*.json ./

# Expose the port the application runs on.
EXPOSE 1000

# The command to start the application with a standard npm script.
CMD ["npm", "run", "start"]
