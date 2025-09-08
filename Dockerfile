# --- Stage 1: Backend Builder ---
# Use a Node.js base image for building backend dependencies
FROM node:22-slim AS backend-builder

# Set the working directory for the backend
WORKDIR /usr/src/app

# Copy the backend's package files
COPY package*.json ./

# Install backend dependencies
RUN npm install

# Copy the rest of the backend source code
COPY . .

# --- Stage 2: Frontend Builder ---
# Use a fresh Node.js base image for building frontend dependencies
FROM node:22-slim AS frontend-builder

# Set the working directory for the frontend
WORKDIR /usr/src/app/frontend

# Copy the frontend's package files
# The user's files are structured with a root `package.json` and a separate `frontend/package.json`
# I'm assuming that the user's project structure has a 'frontend' sub-directory.
# I am making the file structure assumption based on the logs `WORKDIR /usr/src/app/frontend`
# that there is a frontend folder and thus copying the package.json from there to the correct working directory.
COPY frontend/package*.json ./

# Install frontend dependencies (this will install Vite)
RUN npm install

# Copy the rest of the frontend source code
COPY frontend .

# Run the frontend build command
RUN npm run build

# --- Stage 3: Final Production Image ---
# Use a lean base image for the final production environment.
FROM node:22-slim AS final

# Set the working directory for the final application.
WORKDIR /usr/src/app

# Copy the built files from both builder stages
# Copy backend files from backend-builder
COPY --from=backend-builder /usr/src/app/backend ./backend
COPY --from=backend-builder /usr/src/app/arielsql_suite ./arielsql_suite
COPY --from=backend-builder /usr/src/app/scripts ./scripts
COPY --from=backend-builder /usr/src/app/node_modules ./node_modules
COPY --from=backend-builder /usr/src/app/package*.json ./

# Copy the built frontend bundle from frontend-builder
COPY --from=frontend-builder /usr/src/app/frontend/dist ./dist

# Expose the port the application runs on.
EXPOSE 1000

# The command to start the application.
CMD ["npm", "run", "start"]
