import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    exclude: ['node_modules/**', 'dist/**', 'dist-electron/**', 'android/**', 'PrivateMemos_src/**']
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
