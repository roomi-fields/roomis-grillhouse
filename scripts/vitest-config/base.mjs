// The frame's base configuration of the day's tests, the package @grillhouse/vitest-config: every
// Vitest configuration of a project extends it (`mergeConfig(base, defineConfig({ … }))`) and adds
// its own `include`, coverage and options without repeating what this file sets.
//
// - A package of a repository of packages imports it by its name (`import base from
//   '@grillhouse/vitest-config'`) and declares it in its devDependencies, as the examples of
//   Turborepo reach their configuration packages (@repo/eslint-config): a package is reached by its
//   name, never by a relative path out of it. The update of the frame (scripts/grillhouse-maj.mjs)
//   makes this directory a workspace of the project and writes the declaration.
// - The root of a repository without packages (Grillhouse itself, vitest.config.ts) imports it by
//   its path, `./scripts/vitest-config/base.mjs`: the file is inside the one package that imports
//   it, which no name needs to reach.
//
// - The exclusions of the day: a night test (`*.nuit.test.*`, `*.nuit.spec.*`) is too long for the
//   day, and the measures of a time budget bench (`*.budget.test.*`, `*.budget.spec.*`) move with
//   the load of the day: `npm test`, `npm run verifier` and the integration leave both out, and
//   the night plays them (scripts/nuit.sh, scripts/vitest.nuit.config.mjs). `mergeConfig` adds the
//   exclusions of a configuration that extends this one to these.
// - The common environment: Node, no watch, and git's settings for the tests by the environment
//   (GIT_CONFIG_COUNT/KEY/VALUE, git-config(1)), the automatic maintenance and garbage collection
//   off (maintenance.auto=false, gc.auto=0). This file is the one address of these settings; the
//   night configuration takes them from here.
const NUIT = '**/*.nuit.{test,spec}.?(c|m)[jt]s?(x)';
const BUDGET = '**/*.budget.{test,spec}.?(c|m)[jt]s?(x)';

export default {
  test: {
    environment: 'node',
    env: {
      GIT_CONFIG_COUNT: '2',
      GIT_CONFIG_KEY_0: 'maintenance.auto',
      GIT_CONFIG_VALUE_0: 'false',
      GIT_CONFIG_KEY_1: 'gc.auto',
      GIT_CONFIG_VALUE_1: '0',
    },
    exclude: ['**/node_modules/**', '**/dist/**', NUIT, BUDGET],
    watch: false,
    // A targeted run (`npm test -- <files>`) reaches every package: one without such a file passes.
    passWithNoTests: true,
  },
};
