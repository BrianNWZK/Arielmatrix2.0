# Use Node.js 22.16.0
FROM node:22.16.0

# Set working directory
WORKDIR /app

# Copy backend package.json and install dependencies
COPY backend/package.json backend/package-lock.json* ./
RUN npm install --prefix ./backend

# Copy frontend package.json and install dependencies
COPY frontend/package.json frontend/package-lock.json* ./frontend/
RUN npm install --prefix ./frontend

# Copy all files
COPY . .

# Build frontend
RUN npm run build --prefix ./frontend

# Expose port
EXPOSE 3000

# Start backend
CMD ["npm", "start", "--prefix", "./backend"]
