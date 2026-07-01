import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Served by the Node server at /admin (see server/src/app.js) — asset URLs must be relative
  // to that path, not the domain root, since /admin isn't the root of the deployed app.
  base: '/admin/',
  server: {
    port: 5174,
    proxy: {
      '/admin/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
  },
});
