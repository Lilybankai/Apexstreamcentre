import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite serves the studio UI; Tauri loads it as the app window in production.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022' },
});
