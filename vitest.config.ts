import { defineConfig } from 'vitest/config';

// Domain tests are pure logic — no DOM, no GPU (see ADR-004).
export default defineConfig({
  test: {
    include: ['game/src/**/*.test.ts'],
    environment: 'node',
  },
});
