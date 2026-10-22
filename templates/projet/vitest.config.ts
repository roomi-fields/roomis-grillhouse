import { defineConfig, mergeConfig } from 'vitest/config';
import base from '@roomi-fields/grillhouse/vitest-config';

// The day's tests of the project: the frame's base configuration (its exclusions of the night
// tests and the time budget benches, its common environment), by its name, the frame's package's,
// extended with what is the root's own.
export default mergeConfig(
  base,
  defineConfig({
    test: {
      // Global test configuration
      globals: true,

      // Include patterns
      include: ['src/**/*.{test,spec}.{ts,js,mjs}', 'tests/**/*.{test,spec}.{ts,js,mjs}'],

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

      // Pool options for parallel execution
      pool: 'threads',
      poolOptions: {
        threads: {
          singleThread: false,
        },
      },
    },
  })
);
