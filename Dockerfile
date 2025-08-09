# Use Node.js 22.16.0 as the base image
FROM node:22.16.0

# Set working directory
WORKDIR /app

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

# Copy backend package.json and install dependencies
COPY backend/package.json backend/package-lock.json* ./backend/
RUN npm install --prefix ./backend

# Copy frontend package.json and install dependencies
COPY frontend/package.json frontend/package-lock.json* ./frontend/
RUN npm install --prefix ./frontend

# Copy the rest of the application
COPY . .

# Build the frontend
RUN npm run build --prefix ./frontend

# Copy frontend build to backend public directory
RUN cp -r frontend/dist ./backend/public

# Expose the port
EXPOSE 10000

# Start the backend
CMD ["npm", "start", "--prefix", "./backend"]
