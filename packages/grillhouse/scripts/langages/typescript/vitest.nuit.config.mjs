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
// GRILLHOUSE_TESTS_DE_NUIT). It reads no day configuration of the root, and that of each package
// only for its own files (below); it takes from the base configuration the common
// environment (git's settings) and the measure of time: the setup file that notes the CPU pressure
// of each test and the duration reporter, which gives 75, « à repasser », to a measure that fails
// under load (scripts/langages/typescript/vitest-config/duree.reporter.mjs).
//
// A run plays one unit of the project: the root, under this configuration alone, or a package that
// has a Vitest configuration (`vitest.config.*`, else `vite.config.*`, in its directory, found by
// ./tests-de-nuit.mjs), under this configuration merged over the package's, as Vitest's projects
// merge a package's configuration with the root's: what the package sets and the night does not
// set (environment, alias, plugins) stays, its setup files precede those of the base, and what the
// night sets wins (include, exclusions, reporters, delays, one file at a time, the tranche). The
// variable GRILLHOUSE_NUIT_PAQUET (NUIT_PAQUET), JSON, names the configuration of the package of
// the run (`config`) and the directories of the units below the unit of the run (`exclus`), which
// it leaves out; this configuration takes it out of the environment once read, as the plugin of
// the night does its choice and its tranche: the unit is the run's own, and a Vitest that a night
// test starts itself, in another package, plays under no configuration but its own. Node (>= 26)
// reads the package's configuration itself, TypeScript included; a configuration written as a
// function is called as Vite calls it, for a test run.
import { pathToFileURL } from 'node:url';
import { mergeConfig } from 'vitest/config';
import base from './vitest-config/base.mjs';
import { HORS_DU_JOUR, nuit, NUIT_PAQUET } from './vitest-config/cibles.mjs';
import { DELAI_NUIT_MS } from './vitest-config/bornes.mjs';

const { config: fichier, exclus = [] } = process.env[NUIT_PAQUET]
  ? JSON.parse(process.env[NUIT_PAQUET])
  : {};
delete process.env[NUIT_PAQUET];

// What the night sets wins over the configuration of a package, whose plugins have run first: the
// exclusions of its unit, the reporters, and the setup files, the package's before the base's.
const nuitGagne = {
  name: 'grillhouse:nuit-gagne',
  config(config) {
    const test = (config.test ??= {});
    test.exclude = ['**/node_modules/**', '**/dist/**', '**/.git/**', ...exclus];
    test.reporters = base.test.reporters;
    test.setupFiles = [...new Set([...(test.setupFiles ?? []), ...base.test.setupFiles])];
  },
};

const cadre = {
  plugins: [nuitGagne, nuit()],
  cacheDir: base.cacheDir,
  test: {
    env: base.test.env,
    environment: base.test.environment,
    reporters: base.test.reporters,
    setupFiles: base.test.setupFiles,
    include: HORS_DU_JOUR,
    exclude: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
    // A unit may hold none of the files the run chooses.
    passWithNoTests: true,
    // The large delay of Bazel for a night test: 900 s (./vitest-config/delais.mjs).
    testTimeout: DELAI_NUIT_MS,
    hookTimeout: DELAI_NUIT_MS,
    watch: false,
  },
};

async function dePaquet(f) {
  const lu = (await import(pathToFileURL(f).href)).default;
  const paquet = typeof lu === 'function' ? await lu({ command: 'serve', mode: 'test' }) : lu;
  // The environment and the setup files of the package are its own to set.
  const { environment: _e, setupFiles: _s, ...test } = cadre.test;
  return mergeConfig(paquet ?? {}, { ...cadre, test });
}

/** @type {typeof cadre} */
const configuration = fichier ? await dePaquet(fichier) : cadre;

export default configuration;
