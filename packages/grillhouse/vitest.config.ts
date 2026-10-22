import { defineConfig, mergeConfig } from 'vitest/config';
import base from '@roomi-fields/grillhouse/vitest-config';

// The frame's tests: the frame's base configuration (its exclusions of the night tests and the
// time budget benches, its common environment) extended with what is the package's own.
export default mergeConfig(
  base,
  defineConfig({
    test: {
      globals: true,
      include: ['tests/**/*.{test,spec}.{ts,js,mjs}'],
      testTimeout: 10000,
      pool: 'threads',
      poolOptions: {
        threads: {
          singleThread: false,
        },
      },
    },
  })
);
