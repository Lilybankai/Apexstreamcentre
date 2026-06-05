import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Multi-page build: each overlay is its own HTML entry, loadable as a distinct
// OBS browser source URL (e.g. /alerts.html?token=..., /chatbox.html?token=...).
export default defineConfig({
  plugins: [react()],
  server: { port: 5180 },
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        alerts: resolve(__dirname, 'alerts.html'),
        chatbox: resolve(__dirname, 'chatbox.html'),
      },
    },
  },
});
