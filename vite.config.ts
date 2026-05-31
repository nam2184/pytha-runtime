import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3001,
    proxy: {
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
  build: {
    target: 'esnext',
  },
});