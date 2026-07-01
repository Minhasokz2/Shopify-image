import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Embedded-app dev convenience: the Shopify CLI / Render both put the API behind the
      // same origin in production (see server/src/app.js serving web/dist as static files),
      // so local dev proxies /api, /auth, /webhooks to the Node server instead.
      '/api': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
      '/webhooks': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
  },
});
