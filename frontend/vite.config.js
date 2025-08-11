import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  publicDir: 'public', // Directory for static assets
  build: {
    minify: 'terser', // Use Terser for minification
    outDir: 'dist',   // Output directory for production build
  },
  server: {
    port: 3000, // Set the port for the Vite server
    proxy: {
      // Proxy API requests to the backend server
      '/api': {
        target: 'http://localhost:10000', // Backend server port
        changeOrigin: true, // Enable for virtual hosted sites
        secure: false,      // Disable SSL verification if needed
      },
    },
  },
});
