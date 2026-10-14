import { defineConfig } from 'vitest/config';
import nuit from './scripts/vitest.nuit.config.mjs';

// A night test (`*.nuit.test.*`, `*.nuit.spec.*`) is too long for the day, and the measures of a
// time budget bench (`*.budget.test.*`, `*.budget.spec.*`) move with the load of the day: `npm test`
// and the integration leave both out, and the night plays them (scripts/nuit.sh,
// scripts/vitest.nuit.config.mjs).
const NUIT = '**/*.nuit.{test,spec}.{ts,js,mjs}';
const BUDGET = '**/*.budget.{test,spec}.{ts,js,mjs}';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // Environment of the tests: the night configuration's, the one address of git's settings
    // (automatic maintenance and garbage collection off)
    env: nuit.test.env,

    // Global test configuration
    globals: true,

    // Include patterns
    include: ['src/**/*.{test,spec}.{ts,js,mjs}', 'tests/**/*.{test,spec}.{ts,js,mjs}'],

    // Exclude patterns
    exclude: ['node_modules', 'dist', NUIT, BUDGET],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,js,mjs}'],
      exclude: ['src/**/*.{test,spec}.{ts,js,mjs}', 'src/**/types.ts', 'src/**/index.{ts,js}'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },

    // Test timeout
    testTimeout: 10000,

    // Reporter options
    reporters: ['default'],

    // Watch mode options
    watch: false,

    // Pool options for parallel execution
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
      },
    },
  },
});
