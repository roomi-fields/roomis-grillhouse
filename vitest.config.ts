import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // Global test configuration
    globals: true,

    // Include patterns
    include: ['src/**/*.{test,spec}.{ts,js,mjs}', 'tests/**/*.{test,spec}.{ts,js,mjs}'],

    // Exclude patterns
    exclude: ['node_modules', 'dist'],

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
