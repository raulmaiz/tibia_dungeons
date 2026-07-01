import { defineConfig } from 'vite';

// Vite root is game/ — index.html, src/ and public/ live there.
// Build output goes to game/dist (gitignored), same as the legacy setup,
// but `npm run build` is no longer destructive (see ADR-004).
export default defineConfig({
  root: 'game',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: {
    port: 5173,
  },
});
