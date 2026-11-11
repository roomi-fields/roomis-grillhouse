// What the day leaves out of a project: the night tests (`*.nuit.test.*`, `*.nuit.spec.*`), too
// long for the day, and the measures of time, the time budget benches (`*.budget.test.*`,
// `*.budget.spec.*`) and the time witnesses (a test file that imports `mesurerAuRepos`), whose
// measures move with the load of the day (grillhouse-bd7); `npm test`, `npm run verifier` and the
// integration leave them out (the frame's base configuration of the day, the package
// @roomi-fields/grillhouse/vitest-config, which every day configuration extends). The night
// (scripts/nuit.sh, by ./tests-de-nuit.mjs) plays them with this configuration, from the root of
// its copy (`vitest run --root <copy> --config <this file>`), after a green full pass (`npm run
// verifier -- --force`) and before the project's night script: its include names the night tests
// and the benches, and its plugin adds the witnesses under the root, or chooses the night tests
// alone, the night tests but those tagged `@poste` (the night of a shared machine, a CI), or the
// measures alone, one file at a time (`nuit` of ./vitest-config/cibles.mjs, the variable
// GRILLHOUSE_TESTS_DE_NUIT). It reads no day configuration of the project, whether the
// project has one at its root or one per package; it takes from the base configuration the common
// environment (git's settings) and the measure of time: the setup file that notes the CPU pressure
// of each test and the duration reporter, which gives 75, « à repasser », to a measure that fails
// under load (scripts/langages/typescript/vitest-config/duree.reporter.mjs).
import base from './vitest-config/base.mjs';
import { HORS_DU_JOUR, nuit } from './vitest-config/cibles.mjs';
import { DELAI_NUIT_MS } from './vitest-config/bornes.mjs';

export default {
  plugins: [nuit()],
  test: {
    env: base.test.env,
    environment: base.test.environment,
    reporters: base.test.reporters,
    setupFiles: base.test.setupFiles,
    include: HORS_DU_JOUR,
    exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    // The large delay of Bazel for a night test: 900 s (./vitest-config/delais.mjs).
    testTimeout: DELAI_NUIT_MS,
    hookTimeout: DELAI_NUIT_MS,
    watch: false,
  },
};
