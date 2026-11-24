import { defineConfig, mergeConfig } from 'vitest/config';
import base from '@roomi-fields/grillhouse/vitest-config';

// The Vitest configuration of the trial package: the frame's base configuration, whose day leaves
// the night tests out, so that the day plays this package's own small test alone, and a targeted
// run that names a night file plays it (`npm test -- packages/grillhouse-essais/tests/<file>`).
// See packages/grillhouse/docs/architecture/tests.md §2, choice 5.
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
