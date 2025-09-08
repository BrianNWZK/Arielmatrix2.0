# --------------------------------------------------------------------
# This Dockerfile is optimized for multi-stage builds and aligns with
# the production-ready deployment script. It ensures that only the
# necessary files for a production environment are included,
# resulting in a smaller, more secure final image.
# --------------------------------------------------------------------

### Stage 1: Backend Builder ###
# Use a Node.js base image for building backend dependencies.
FROM node:22-slim AS backend-builder

# Set the working directory to the backend folder within the container.
WORKDIR /usr/src/app/backend

# Copy the backend's package files to install dependencies.
COPY backend/package*.json ./

# Install backend dependencies.
RUN npm install

# Copy the rest of the backend source code into the container.
COPY backend .

### Stage 2: Frontend Builder ###
# Use a fresh Node.js base image for building frontend dependencies.
FROM node:22-slim AS frontend-builder

# Set the working directory to the frontend folder within the container.
WORKDIR /usr/src/app/frontend

# Copy the frontend's package files.
COPY frontend/package*.json ./

# Install frontend dependencies.
RUN npm install

# Copy the rest of the frontend source code.
COPY frontend .

# Run the frontend build command.
RUN npm run build

### Stage 3: Final Production Image ###
# Use a lean Node.js base image for the final production environment.
FROM node:22-slim AS final

# Set the working directory for the final application.
WORKDIR /usr/src/app

# Create a non-root user to run the application for security best practices.
RUN adduser --system --no-create-home --group nodeuser
USER nodeuser

# Copy the built files from both builder stages.
# Copy backend files from the backend-builder stage.
COPY --from=backend-builder /usr/src/app/backend ./backend
COPY --from=backend-builder /usr/src/app/package*.json ./

# Copy other necessary project files as assumed by the deployment script.
COPY --from=backend-builder /usr/src/app/arielsql_suite ./arielsql_suite
COPY --from=backend-builder /usr/src/app/scripts ./scripts
COPY --from=backend-builder /usr/src/app/node_modules ./node_modules
COPY --from=backend-builder /usr/src/app/config ./config
COPY --from=backend-builder /usr/src/app/blockchain ./blockchain
COPY --from=backend-builder /usr/src/app/database ./database
COPY --from=backend-builder /usr/src/app/public ./public

# Copy the built frontend bundle from the frontend-builder stage.
COPY --from=frontend-builder /usr/src/app/frontend/dist ./dist

# Expose the port the application runs on.
EXPOSE 1000

# The command to start the application.
CMD ["npm", "run", "start"]
