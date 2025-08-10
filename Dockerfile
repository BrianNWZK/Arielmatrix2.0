# Builder stage (run as root)
FROM node:22.16.0 as builder

# Set working directory
WORKDIR /app

# Copy backend package.json and install dependencies
COPY backend/package.json backend/package-lock.json* ./backend/
RUN npm install --prefix ./backend

# Copy frontend package.json and install dependencies
COPY frontend/package.json frontend/package-lock.json* ./frontend/
RUN npm install --prefix ./frontend

# Copy all files
COPY . .

# Build frontend
RUN npm run build --prefix ./frontend

# Final stage (non-root)
FROM node:22.16.0

# Install dependencies for puppeteer
RUN apt-get update && apt-get install -y \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxi6 \
    libxtst6 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm-dev \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user
RUN useradd -m appuser

# Set working directory
WORKDIR /app

# Copy from builder with chown to appuser
COPY --from=builder --chown=appuser:appuser /app /app

# Switch to non-root user
USER appuser

# Serve frontend static files through backend
RUN cp -r frontend/dist ./backend/public

# Expose port
EXPOSE 10000

# Start backend
CMD ["npm", "start", "--prefix", "./backend"]
