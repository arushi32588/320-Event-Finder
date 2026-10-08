import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Forward /api requests to the Next.js backend (backend/) during development.
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
