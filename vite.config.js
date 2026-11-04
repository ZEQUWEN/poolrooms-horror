import { defineConfig } from 'vite';

// Bind to all interfaces and accept the sandbox preview host so the
// Arena live preview iframe can reach the dev server.
export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true
  }
});
