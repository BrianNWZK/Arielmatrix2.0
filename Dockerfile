# Builder stage
# Use a specific, stable Node.js version
FROM node:22.16.0 as builder

# Install system dependencies required for browser automation (Puppeteer/Playwright)
# These are often necessary for headless browser operations for agents.
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
    fonts-noto \
    # Clean up APT cache to reduce image size
    && rm -rf /var/lib/apt/lists/*

# Set the working directory inside the container to the root of your project
WORKDIR /app

# --- Install Dependencies ---

# Copy the root package.json and package-lock.json first to leverage Docker's build cache
# This is for the ArielSQL Suite backend dependencies defined in the root package.json.
COPY package.json package-lock.json* ./
RUN npm install

# Copy frontend's package.json and install its dependencies separately
# This is for the ArielMatrix2.0 frontend application.
COPY frontend/package.json frontend/package-lock.json* ./frontend/
RUN npm install --prefix ./frontend

# --- Install Browsers for Automation ---
# Install Puppeteer's Chrome browser. This will be installed into /app/node_modules/.cache
RUN npx puppeteer browsers install chrome

# Install Playwright's Chromium browser with its dependencies
# The `npm audit fix || true` helps prevent build failures on unfixable audit issues.
# Playwright browsers are installed globally or in the current node_modules context.
RUN npx playwright install chromium --with-deps

# --- Copy Application Code ---
# Copy all remaining application source files from the host to the container.
# The .dockerignore file ensures sensitive and unnecessary files are skipped.
COPY . .

# --- Build Frontend Application ---
# Build the frontend application. The output (e.g., to `frontend/dist`) will be used later.
RUN npm run build --prefix ./frontend

# --- Final Stage for Production Deployment ---
# Use the same base Node.js image for consistency
FROM node:22.16.0

# Re-install essential runtime dependencies for browsers.
# Although some might be in the base image, explicitly installing ensures they are present.
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
    fonts-noto \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user for security best practices
RUN useradd -m appuser

# Set the working directory
WORKDIR /app

# Create required directories and ensure correct ownership for browser caches.
# The caches will be copied for the non-root user.
RUN mkdir -p \
    /app/arielsql_suite \
    /app/backend/public \
    /home/appuser/.cache/puppeteer \
    /home/appuser/.cache/ms-playwright \
    && chown -R appuser:appuser /app /home/appuser/.cache

# Copy the built application code and installed dependencies from the builder stage.
# This includes the `node_modules` from both root and frontend, and the built frontend assets.
COPY --from=builder --chown=appuser:appuser /app /app

# Copy the browser cache directories from the builder's root user to the appuser's cache.
COPY --from=builder --chown=appuser:appuser /root/.cache/puppeteer /home/appuser/.cache/puppeteer
COPY --from=builder --chown=appuser:appuser /root/.cache/ms-playwright /home/appuser/.cache/ms-playwright

# Copy the built frontend assets (`frontend/dist`) to the backend's public serving directory.
# This assumes the Express server launched by ArielSQL Suite will serve static files from `/app/backend/public`.
# Adjust this path if your Express static serving path is different.
RUN cp -r /app/frontend/dist/* /app/backend/public/ && \
    echo "✅ Frontend assets copied to /app/backend/public"

# Switch to the non-root user
USER appuser

# Expose the port where the ArielSQL Suite's Express API will listen.
# This must match the PORT environment variable (default 3000 in config).
EXPOSE 3000

# Command to start the ArielSQL Alltimate Suite backend.
# This executes the 'start' script defined in your root package.json.
CMD ["npm", "start"]
