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
//   the night plays them (scripts/nuit.sh, scripts/vitest.nuit.config.mjs); a targeted run that
//   names the file of one itself plays it, under the measure of time below (./cibles.mjs, where
//   the patterns live). `mergeConfig` adds the exclusions of a configuration that extends this one
//   to these.
// - A run that plays no test fails, as Vitest's default has it (`passWithNoTests` unset): a
//   targeted run (`npm test -- <paths>`, scripts/tests.mjs) plays each path in its package only,
//   and a path that names no test is a mistake, never a green.
// - The tests a targeted run names arrive in the variable `GRILLHOUSE_TESTS`, which a plugin
//   reads once the configuration is merged and turns into the files played (./cibles.mjs); without
//   it, nothing changes. `mergeConfig` adds the plugins of a configuration that extends this one to
//   it.
// - The common environment: Node, no watch, and git's settings for the tests by the environment
//   (GIT_CONFIG_COUNT/KEY/VALUE, git-config(1)), the automatic maintenance and garbage collection
//   off (maintenance.auto=false, gc.auto=0). This file is the one address of these settings; the
//   night configuration takes them from here.
// - A time witness is measured with the CPU at rest: a setup file notes the CPU pressure at the
//   start and at the end of each test (./mesure.setup.mjs), and the duration reporter, beside
//   Vitest's default one, gives the exit code 75, « à repasser », when every failure depends on a
//   duration and one took place under load (./duree.reporter.mjs; the signal and its threshold,
//   ./pression.mjs). A test that measures time marks itself (`mesurerAuRepos`,
//   `@grillhouse/vitest-config/mesure`). `mergeConfig` adds the reporters and the setup files of
//   a configuration that extends this one to these; a reporter named on the command line
//   (`--reporter`) replaces them, and Vitest's code then stands.
// - The machine of a test file is its own: a setup file gives it a lock of the heavy measure of
//   its own, so that a `npm run verifier` a test plays in a repository of trial neither waits for
//   the lock of the machine nor holds it (./machine.setup.mjs, scripts/verrou-de-machine.mjs).
// - The time witnesses play alone in `npm run verifier`: the plugin below leaves them out of its
//   pass, then plays them in a pass of their own (./cibles.mjs, scripts/verifier.mjs).
// - While a run names its results directory (`GRILLHOUSE_RESULTATS`, ./resultats.mjs), the JSON
//   reporter writes Vitest's report there too, which the circuit reads (scripts/resultats.mjs).
import { fileURLToPath } from 'node:url';
import { ciblage, HORS_DU_JOUR } from './cibles.mjs';
import { rapportJson } from './resultats.mjs';

const ici = f => fileURLToPath(new URL(f, import.meta.url));

export default {
  plugins: [ciblage()],
  test: {
    environment: 'node',
    env: {
      GIT_CONFIG_COUNT: '2',
      GIT_CONFIG_KEY_0: 'maintenance.auto',
      GIT_CONFIG_VALUE_0: 'false',
      GIT_CONFIG_KEY_1: 'gc.auto',
      GIT_CONFIG_VALUE_1: '0',
    },
    exclude: ['**/node_modules/**', '**/dist/**', ...HORS_DU_JOUR],
    reporters: ['default', ici('./duree.reporter.mjs'), ...rapportJson()],
    setupFiles: [ici('./mesure.setup.mjs'), ici('./machine.setup.mjs')],
    watch: false,
  },
};
