import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages publica en /<repo>/ (lo fija el workflow con VITE_BASE_PATH).
  // Vercel y local usan la raíz.
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: {
    port: 5173,
  },
});
