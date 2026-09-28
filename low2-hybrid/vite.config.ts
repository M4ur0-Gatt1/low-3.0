import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command }) => ({
  root,
  // base relativa en build para que Electron cargue con file://
  base: command === 'build' ? './' : '/',
  plugins: [react()],
  server: { port: 5173, strictPort: true, host: true },
  build: { outDir: 'dist/renderer', emptyOutDir: true },
}));
