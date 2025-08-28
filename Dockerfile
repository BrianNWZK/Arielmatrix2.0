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

# Set the working directory inside the container.
# This WORKDIR will now specifically be `/app/arielmatrix2.0`,
# aligning the container's internal structure with your project's structure
# and making subsequent COPY commands simpler within this WORKDIR.
WORKDIR /app/arielmatrix2.0

# --- Install Dependencies ---

# Copy the root package.json and package-lock.json from the build context.
# We explicitly specify 'arielmatrix2.0/' in the source path, assuming the build context
# is the parent directory of 'arielmatrix2.0'.
COPY arielmatrix2.0/package.json arielmatrix2.0/package-lock.json ./
RUN npm install

# Copy frontend's package.json and install its dependencies separately.
COPY arielmatrix2.0/frontend/package.json arielmatrix2.0/frontend/package-lock.json ./frontend/
RUN npm install --prefix ./frontend

# --- Install Browsers for Automation ---
# Install Puppeteer's Chrome browser. This will be installed into /app/arielmatrix2.0/node_modules/.cache
RUN npx puppeteer browsers install chrome

# Install Playwright's Chromium browser with its dependencies
# The `npm audit fix || true` helps prevent build failures on unfixable audit issues.
RUN npx playwright install chromium --with-deps

# --- Copy Application Code ---
# Copy all remaining source files from the 'arielmatrix2.0' subdirectory
# of the build context to the current WORKDIR (`/app/arielmatrix2.0`).
COPY arielmatrix2.0/ .

# --- Build Frontend Application ---
# Build the frontend application. The output (e.g., to `frontend/dist`) will be used later.
RUN npm run build --prefix ./frontend

# --- Final Stage for Production Deployment ---
FROM node:22.16.0

# Re-install essential runtime dependencies for browsers.
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

# Set the working directory to the project root inside the container
WORKDIR /app/arielmatrix2.0

# Create required directories and ensure correct ownership for browser caches.
RUN mkdir -p \
    /app/arielmatrix2.0/backend/public \
    /home/appuser/.cache/puppeteer \
    /home/appuser/.cache/ms-playwright \
    && chown -R appuser:appuser /app /home/appuser/.cache

# Copy the built application code and installed dependencies from the builder stage.
# This includes the `node_modules` from both root and frontend, and the built frontend assets.
COPY --from=builder --chown=appuser:appuser /app/arielmatrix2.0 /app/arielmatrix2.0

# Copy the browser cache directories from the builder's root user to the appuser's cache.
# Note: Puppeteer and Playwright caches might reside in different locations depending on installation.
# This attempts to get them from the /root/.cache location as it's common for root installations.
COPY --from=builder --chown=appuser:appuser /root/.cache/puppeteer /home/appuser/.cache/puppeteer
COPY --from=builder --chown=appuser:appuser /root/.cache/ms-playwright /home/appuser/.cache/ms-playwright

# Copy the built frontend assets (`frontend/dist`) to the backend's public serving directory.
# This assumes the Express server launched by ArielSQL Suite will serve static files from `/app/arielmatrix2.0/backend/public`.
RUN cp -r /app/arielmatrix2.0/frontend/dist/* /app/arielmatrix2.0/backend/public/ && \
    echo "✅ Frontend assets copied to /app/arielmatrix2.0/backend/public"

# Switch to the non-root user
USER appuser

# Expose the port where the ArielSQL Suite's Express API will listen.
# This must match the PORT environment variable (default 3000 in config).
EXPOSE 3000

# Command to start the ArielSQL Alltimate Suite backend.
# This executes the 'start' script defined in your root package.json.
CMD ["npm", "start"]
