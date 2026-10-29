import { defineConfig, mergeConfig } from 'vitest/config';
import base from '@roomi-fields/grillhouse/vitest-config';

// The tests of the frame's chain: the frame's base configuration, whose day leaves the night
// tests out, so that the day plays this package's own small test alone, and a targeted run that
// names a night file plays it (`npm test -- packages/grillhouse-essais/tests/<file>`).
export default mergeConfig(
  base,
  defineConfig({
    test: {
      globals: true,
      include: ['tests/**/*.{test,spec}.{ts,js,mjs}'],
      testTimeout: 10000,
    },
  })
);
