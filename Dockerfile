# Use a Node.js base image
FROM node:18-alpine AS builder

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json to the working directory.
# npm ci requires package-lock.json to ensure consistent installations.
COPY package.json package-lock.json ./

# Run a clean install of production dependencies.
RUN npm ci --only=production

# The final image, using a leaner base
FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app ./
EXPOSE 3000

CMD ["node", "index.js"]
