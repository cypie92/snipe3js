import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // All deps are native ESM; skipping pre-bundling avoids cache races when several
  // preview servers (team agents, capture tools) run at the same time.
  optimizeDeps: { noDiscovery: true, include: [] },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: 0,
  },
});
