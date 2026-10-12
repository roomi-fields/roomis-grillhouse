// The night tests of a project: the files `*.nuit.test.*` and `*.nuit.spec.*`, too long for the
// day, which `npm test` and the integration leave out. The night (scripts/nuit.sh) plays them with
// this configuration, from the root of its copy (`vitest run --root <copy> --config <this file>`),
// after a green `npm test` and before the project's night script. It stands alone: it reads no
// day configuration of the project. It is also the one address of git's settings for the suite:
// `test.env` sets git once for the tests by the environment (GIT_CONFIG_COUNT/KEY/VALUE,
// git-config(1)), the automatic maintenance and garbage collection off (maintenance.auto=false,
// gc.auto=0), and the day configuration (vitest.config.ts) reads it from here.
export default {
  test: {
    env: {
      GIT_CONFIG_COUNT: '2',
      GIT_CONFIG_KEY_0: 'maintenance.auto',
      GIT_CONFIG_VALUE_0: 'false',
      GIT_CONFIG_KEY_1: 'gc.auto',
      GIT_CONFIG_VALUE_1: '0',
    },
    environment: 'node',
    include: ['**/*.nuit.{test,spec}.?(c|m)[jt]s?(x)'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    watch: false,
  },
};
