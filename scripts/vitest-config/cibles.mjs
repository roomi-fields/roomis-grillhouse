// The tests a targeted run names (`npm test -- <paths>`, scripts/tests.mjs), carried to Vitest by
// the variable `GRILLHOUSE_TESTS` rather than by its command line: the arguments after `--` of a
// Turborepo run enter the hash of every task of that run, the builds included, while a variable
// that the `env` of the task `test:vitest` names enters the hash of the tests alone
// (https://turborepo.dev/docs/reference/configuration#env). Turborepo then plays the tests with
// what they depend on, each build and each trace hashed by Turborepo itself.
//
// - The value is JSON: `arguments`, Vitest's arguments (the paths, absolute, and the options
//   written `--<name>=<value>`), which Vitest's own parser of its command line (`parseCLI`,
//   vitest/node) reads; `rejouer`, the moment of a run that plays the tests for real (`--force`),
//   which only moves the hash. The plugin takes the variable out of the environment once read: no
//   process the tests start receives it.
// - A plugin of the base configuration (./base.mjs) reads it once the configuration is merged (its
//   `config` hook; Vitest reads the test options in `configResolved`, after every `config` hook):
//   the files played are the test files of the configuration's `include` (Vitest's default when
//   it sets none) that lie under a path named (none named, the configuration's own), as Vitest's filters of its command line take an
//   absolute path (a file, or a directory ending with « / »); its `exclude` still applies, Vitest's.
//   A path of another package names none of its files. Each option enters the test configuration
//   as Vitest merges its command line over it (`exclude` given on the command line is
//   `cliExclude`, as Vitest's `normalizeCliOptions` names it).
// - Without the variable, nothing changes. A run whose paths name no test file plays none, and
//   fails: the base configuration keeps Vitest's `passWithNoTests: false`.
//
// This module's top level uses Node alone: scripts/tests.mjs reads its VARIABLE.
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export const VARIABLE = 'GRILLHOUSE_TESTS';
// Vitest's default `include` (its configDefaults).
const INCLUDE = ['**/*.{test,spec}.?(c|m)[jt]s?(x)'];
// The directories a walk under a named directory leaves out, whose files no test configuration
// plays (the base excludes them).
const SAUTES = new Set(['node_modules', '.git']);
// The characters a path escapes to be read by the glob of Vitest as itself.
const SPECIAUX = /[\\*?[\]{}()!+@|^$]/g;

// The files at <chemin> (absolute): itself when it is a file, the files under it when it is a
// directory; none when it does not exist.
function fichiers(chemin) {
  let stat;
  try {
    stat = statSync(chemin);
  } catch {
    return [];
  }
  if (!stat.isDirectory()) {return [chemin];}
  return readdirSync(chemin, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() && SAUTES.has(e.name) ? [] : fichiers(path.join(chemin, e.name))
  );
}

// <valeur> merged over <cible> as Vitest merges its command line over the configuration: an object
// merged key by key, any other value replaced.
const fusion = (cible, valeur) =>
  valeur && typeof valeur === 'object' && !Array.isArray(valeur)
    ? Object.entries(valeur).reduce(
        (o, [k, v]) => ({ ...o, [k]: fusion(o[k], v) }),
        cible && typeof cible === 'object' && !Array.isArray(cible) ? cible : {}
      )
    : valeur;

// The plugin that restricts a run to the tests <env> names in VARIABLE.
export const ciblage = (env = process.env) => ({
  name: 'grillhouse:cibles',
  async config(config) {
    const texte = env[VARIABLE];
    if (!texte) {return;}
    delete env[VARIABLE];
    const { parseCLI } = await import('vitest/node');
    const { filter, options } = parseCLI(['vitest', ...JSON.parse(texte).arguments]);
    const test = (config.test ??= {});
    if (filter.length) {
      const dir = path.resolve(config.root ?? process.cwd(), test.dir ?? '');
      const include = test.include ?? INCLUDE;
      const joues = [
        ...new Set(filter.flatMap(f => fichiers(path.resolve(f.replace(/[\\/]+$/, ''))))),
      ]
        .map(f => path.relative(dir, f).split(path.sep).join('/'))
        .filter(r => !r.startsWith('../') && include.some(p => path.matchesGlob(r, p)))
        .sort();
      // No file named: a pattern that matches none, Vitest's « No test files found ».
      test.include = joues.length
        ? joues.map(r => r.replace(SPECIAUX, '\\$&'))
        : [`${VARIABLE}-sans-fichier`];
    }
    // parseCLI gives each option under its aliases too (`t`, `test-name-pattern`): its name alone
    // enters.
    const { '--': _, color: __, exclude, ...reste } = options;
    for (const [cle, valeur] of Object.entries(reste)) {
      if (cle.length > 1 && !cle.includes('-')) {test[cle] = fusion(test[cle], valeur);}
    }
    if (exclude !== undefined) {test.cliExclude = [exclude].flat();}
  },
});
