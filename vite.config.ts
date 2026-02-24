import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    target: 'es2020',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        remote: resolve(__dirname, 'remote.html'),
      },
    },
  },
  server: {
    port: 3200,
    open: true,
    allowedHosts: ['macmini.local', 'spokes.fit'],
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3201',
        ws: true,
      },
    },
  },
});
