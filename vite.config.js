import { defineConfig } from 'vite';

// Hacker's Notes 3D builds to a static folder that is copied into the
// hacker.hamcodes.com site at /sim/. No backend, no server functions.
export default defineConfig({
  base: process.env.SIM_BASE || '/sim/',
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: 'index.html',
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          return undefined;
        }
      }
    }
  },
  // three.js is served as it is, not pre-bundled, so its KTX2 loader finds the
  // Basis transcoder next to itself and the page keeps one copy of three.
  optimizeDeps: { exclude: ['three'] },
  server: { port: 5174, host: '127.0.0.1' }
});
