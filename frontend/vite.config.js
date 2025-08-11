// frontend/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.', // Explicit root
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'terser',
    sourcemap: false, // Disable in production
    terserOptions: {
      compress: {
        drop_console: true, // Strip console logs in production
        drop_debugger: true,
      },
    },
  },
  server: {
    host: 'localhost', // Bind to localhost during dev
    port: 3000,
    strictPort: true, // Fail if port is occupied
    proxy: {
      '/api': {
        target: 'http://localhost:10000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  // Prevent 404 on SPA routes
  preview: {
    host: 'localhost',
    port: 5000,
    proxy: {
      '/api': {
        target: 'http://localhost:10000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
