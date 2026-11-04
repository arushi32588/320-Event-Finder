import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // The backend runs separately (cd backend && npm run dev). If it's on another
    // port, set API_PROXY_TARGET, e.g. API_PROXY_TARGET=http://localhost:3001.
    proxy: { '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:3000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    // The backend and database have their own test setups.
    include: ['src/**/*.test.{js,jsx}'],
  },
});
