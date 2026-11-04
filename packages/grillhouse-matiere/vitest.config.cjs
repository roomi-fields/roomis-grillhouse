// The tests of the shared test material: the frame's base configuration (an ES module, loaded by
// a dynamic import from this CommonJS file), extended with this package's own small test of its
// entry.
module.exports = (async () => {
  const { defineConfig, mergeConfig } = await import('vitest/config');
  const { default: base } = await import('@roomi-fields/grillhouse/vitest-config');
  return mergeConfig(
    base,
    defineConfig({
      test: {
        globals: true,
        include: ['tests/**/*.{test,spec}.ts'],
        testTimeout: 10000,
      },
    })
  );
})();
