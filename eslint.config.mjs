import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

// Lint covers the 3D codebase only (game/src). Legacy 2D JS is excluded —
// it is frozen reference code archived at tag v2d-final (see ADR-004).
export default tseslint.config(
  {
    ignores: [
      'game/js/**',
      'game/dist/**',
      'game/sw.js',
      'node_modules/**',
      'api/**',
      'scripts/**',
      'middleware.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['game/src/**/*.ts'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
