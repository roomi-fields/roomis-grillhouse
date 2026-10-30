// The frame's base configuration of the day's tests, exported by the frame's package as
// `@roomi-fields/grillhouse/vitest-config`: every Vitest configuration of a project extends it
// (`mergeConfig(base, defineConfig({ … }))`) and adds its own `include`, coverage and options
// without repeating what this file sets.
//
// - Every configuration imports it by its name (`import base from
//   '@roomi-fields/grillhouse/vitest-config'`), the root's of a project as each package's, as the
//   examples of Turborepo reach their configuration packages (@repo/eslint-config): a package is
//   reached by its name, never by a path into it. In a repository of packages, each tested
//   package declares the frame's package in its devDependencies, which the update of the frame
//   writes (scripts/grillhouse-maj.mjs). Grillhouse's package imports it by its own name.
//
// - The exclusions of the day: a night test (`*.nuit.test.*`, `*.nuit.spec.*`) is too long for the
//   day, and the measures of a time budget bench (`*.budget.test.*`, `*.budget.spec.*`) move with
//   the load of the day: `npm test`, `npm run verifier` and the integration leave both out, and
//   the night plays them (scripts/nuit.sh, scripts/langages/typescript/vitest.nuit.config.mjs); a targeted run that
//   names the file of one itself plays it, under the measure of time below (./cibles.mjs, where
//   the patterns live). `mergeConfig` adds the exclusions of a configuration that extends this one
//   to these.
// - A run that plays no test fails, as Vitest's default has it (`passWithNoTests` unset): a
//   targeted run (`npm test -- <paths>`, scripts/langages/typescript/tests.mjs) plays each path in its package only,
//   and a path that names no test is a mistake, never a green.
// - The tests a targeted run names arrive in the variable `GRILLHOUSE_TESTS`, which a plugin
//   reads once the configuration is merged and turns into the files played (./cibles.mjs); without
//   it, nothing changes. The same plugin restricts a pass measured against the last green to the
//   tests Vitest relates to the files changed since it (`GRILLHOUSE_CHANGEMENTS`,
//   ./changements.mjs). `mergeConfig` adds the plugins of a configuration that extends this one to
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
//   `@roomi-fields/grillhouse/vitest-config/mesure`). `mergeConfig` adds the reporters and the setup files of
//   a configuration that extends this one to these; a reporter named on the command line
//   (`--reporter`) replaces them, and Vitest's code then stands.
// - The machine of a test file is its own: a setup file gives it a lock of the heavy measure of
//   its own, so that a `npm run verifier` a test plays in a repository of trial neither waits for
//   the lock of the machine nor holds it (./machine.setup.mjs, scripts/verrou-de-machine.mjs).
// - The time witnesses play alone in `npm run verifier`: the plugin below leaves them out of its
//   pass, then plays them in a pass of their own (./cibles.mjs, scripts/langages/typescript/verifier.mjs).
// - While a run names its results directory (`GRILLHOUSE_RESULTATS`, ./resultats.mjs), the JSON
//   reporter writes Vitest's report there too, which the circuit reads (scripts/resultats.mjs); a
//   setup file gives each test file's processes a results directory of their own, so that a run a
//   test plays in a repository of trial never writes in it (./resultats.setup.mjs).
// - A run of Vitest has a base of its own, as Bazel gives each test its TEST_TMPDIR: a plugin opens
//   it while the configuration resolves, sweeping the orphan bases a killed run left, and names
//   it in TMPDIR, TMP and TEMP, so that Vitest's own temporary directory, each test process and
//   everything they start write there; the base is removed when the run exits, green, red or
//   interrupted (SIGINT, SIGTERM, SIGHUP). It is the guard of the temporary directory of the
//   module typescript: what the tests left there at the end of the run, once Vitest removed its
//   own directory, fails the run, each name written, the caches of the tools a test launches
//   tolerated by name (`CACHES_DES_OUTILS`, below) (`baseDeVitest`, below; the base,
//   scripts/mesure/base-de-passe.mjs). A test makes its temporary directory with
//   `mkdtempSync(path.join(tmpdir(), '<prefix>-'))` and removes it in `afterAll` (`rmSync`,
//   `recursive` and `force`), a red test included.
// - While a run names the progress directory of its pass (`GRILLHOUSE_AVANCEMENT`,
//   scripts/mesure/avancement.mjs), the reporter of progress writes there the files done and planned of its
//   task at each test file done, which the board reads (scripts/avancement.mjs,
//   scripts/tableau.mjs).
import { fileURLToPath } from 'node:url';
import { ligneDesRestes, ouvrirBase, retirerALInterruption } from '../../../services-du-noyau.mjs';
import { ciblage, HORS_DU_JOUR } from './cibles.mjs';
import { rapportAvancement } from './avancement.reporter.mjs';
import { rapportJson } from './resultats.mjs';

const ici = f => fileURLToPath(new URL(f, import.meta.url));

// The variable that marks the base of a run of Vitest: `<process>:<base>`, the process that opened
// it. A configuration loaded again in that process (Vite bundles each load) keeps that base.
const MARQUE = 'GRILLHOUSE_BASE_DE_VITEST';

/**
 * The caches the tools a test launches keep in the temporary directory, which the guard of the
 * base tolerates, by name, at its root (the base removes them with the rest):
 * - `node-compile-cache`: Node's compile cache, which npm enables (`module.enableCompileCache()`)
 *   under `os.tmpdir()`. Its variable, NODE_COMPILE_CACHE, enables the cache in every Node the
 *   tests start, written out of the pass for good;
 * - `claude-<uid>`: the temporary directory of Claude Code (`CLAUDE_CODE_TMPDIR`, else
 *   `os.tmpdir()`), where a claude a test launches keeps its scratchpads. Its variable named out
 *   of the pass would bring them back into the machine's /tmp (grillhouse-3uv.93: 18 835
 *   directories of `/tmp/claude-1000` left by the envelopes of trial copies).
 */
const CACHES_DES_OUTILS = new Set(['node-compile-cache', `claude-${process.getuid?.() ?? ''}`]);

/**
 * The plugin of the base configuration that gives a run of Vitest its base: while Vite resolves
 * the configuration, before Vitest makes its own temporary directory (`join(tmpdir(), nanoid())`,
 * its transformed modules), the main process opens a base of genre `vitest` and names it in its
 * `TMPDIR`, `TMP` and `TEMP`, which every test process inherits. When the process exits, what is
 * left in the base fails the run, named on the error stream (Vitest removed its own directory at
 * its close); then the base goes. An interruption removes it too. A process that already opened
 * its base keeps it.
 * @returns {{ name: string, config: () => void }} a plugin of Vite
 */
function baseDeVitest() {
  return {
    name: 'grillhouse:base-de-passe',
    config() {
      if (process.env[MARQUE]?.startsWith(`${process.pid}:`)) return;
      const b = ouvrirBase('vitest');
      process.env[MARQUE] = `${process.pid}:${b.base}`;
      Object.assign(process.env, b.env);
      retirerALInterruption(b.fermer);
      process.on('exit', () => {
        const ligne = ligneDesRestes(b.restes().filter(n => !CACHES_DES_OUTILS.has(n)));
        if (ligne) {
          process.stderr.write(`${ligne}\n`);
          process.exitCode = 1;
        }
        b.fermer();
      });
    },
  };
}

export default {
  plugins: [baseDeVitest(), ciblage()],
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
    reporters: ['default', ici('./duree.reporter.mjs'), ...rapportJson(), ...rapportAvancement()],
    setupFiles: [
      ici('./mesure.setup.mjs'),
      ici('./machine.setup.mjs'),
      ici('./resultats.setup.mjs'),
    ],
    watch: false,
  },
};
