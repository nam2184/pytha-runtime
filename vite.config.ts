import { defineConfig } from 'vite';

export default defineConfig({
  envDir: '.',
  server: {
    port: 3001,
  },
  build: {
    target: 'esnext',
  },
});