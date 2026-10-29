// The tests a targeted run names (`npm test -- <paths>`, scripts/langages/typescript/tests.mjs), carried to Vitest by
// the variable `GRILLHOUSE_TESTS` rather than by its command line: the arguments after `--` of a
// Turborepo run enter the hash of every task of that run, the builds included, while a variable
// that the `env` of the task `test:vitest` names enters the hash of the tests alone
// (https://turborepo.dev/docs/reference/configuration#env). Turborepo then plays the tests with
// what they depend on, each build and each trace hashed by Turborepo itself.
//
// - The value is JSON: `arguments`, Vitest's arguments (the paths, absolute, and the options
//   written `--<name>=<value>`), which Vitest's own parser of its command line (`parseCLI`,
//   vitest/node) reads; `rejouer`, the moment of a run that plays the tests for real (`--force`),
//   which only moves the hash; `temoins`, the time witnesses of a pass of `npm run verifier`
//   (below). The plugin takes the variable out of the environment once read: no
//   process the tests start receives it.
// - A plugin of the base configuration (./base.mjs) reads it once the configuration is merged (its
//   `config` hook; Vitest reads the test options in `configResolved`, after every `config` hook):
//   the files played are the test files of the configuration's `include` (Vitest's default when
//   it sets none) that lie under a path named (none named, the configuration's own), as Vitest's filters of its command line take an
//   absolute path (a file, or a directory ending with « / »); its `exclude` still applies, Vitest's.
//   A path of another package names none of its files. Each option enters the test configuration
//   as Vitest merges its command line over it (`exclude` given on the command line is
//   `cliExclude`, as Vitest's `normalizeCliOptions` names it).
// - A night test or a time budget bench (HORS_DU_JOUR, the day's exclusions of ./base.mjs) plays
//   when its own file is named, as Bazel's target tagged `manual` builds when named and never by a
//   pattern: the day's exclusions of both lift for that run, the include of the configuration
//   notwithstanding (the night's own include is HORS_DU_JOUR), and the measure of time of the base
//   configuration applies, its duration reporter giving 75, « à repasser », to a bench that fails
//   under load. A directory named leaves them out, as the day does.
// - Without the variable, nothing changes. A run whose paths name no test file plays none, and
//   fails: the base configuration keeps Vitest's `passWithNoTests: false`.
// - The time witnesses play alone, as Bazel plays a test tagged `exclusive` after the others, with
//   nothing beside it: a time witness is a test file that imports the mark of a measure of time
//   (`import { mesurerAuRepos } from '@roomi-fields/grillhouse/vitest-config/mesure'`, a line of its own,
//   `estTemoin`). `npm run verifier` (scripts/langages/typescript/verifier.mjs) plays its pass with `temoins: 'hors'`
//   in the value, which leaves every witness of the configuration's `include` out, then a pass of
//   its own with `temoins: 'seuls'`, which plays the witnesses alone, one file at a time
//   (`fileParallelism: false`), and passes without one (`passWithNoTests`); a targeted run sets
//   neither, and a witness named plays there as any test. The witnesses are found under the
//   configuration's directory (`fichiersTemoins`), node_modules, dist, .git, .turbo and .claude
//   left out.
// - The changes since the last green (`GRILLHOUSE_CHANGEMENTS`, ./changements.mjs) restrict the
//   files played to those Vitest relates to them, the files named themselves kept, or leave every
//   test when a change lies out of Vitest's graph.
//
// This module's top level uses Node alone: scripts/langages/typescript/tests.mjs reads its VARIABLE.
import { globSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { CHANGEMENTS } from '../../../services-du-noyau.mjs';
import { lireChangements, restreindre } from './changements.mjs';

export const VARIABLE = 'GRILLHOUSE_TESTS';
// The day's exclusions, which the base configuration (./base.mjs) sets and the night plays
// (scripts/langages/typescript/vitest.nuit.config.mjs): the night tests, too long for the day, and the time budget
// benches, whose measures move with the load of the day.
export const NUIT = '**/*.nuit.{test,spec}.?(c|m)[jt]s?(x)';
export const BUDGET = '**/*.budget.{test,spec}.?(c|m)[jt]s?(x)';
export const HORS_DU_JOUR = [NUIT, BUDGET];
// Whether <r>, a path relative to the configuration's directory, is a night test or a bench.
const horsDuJour = r => HORS_DU_JOUR.some(p => path.matchesGlob(r, p));
// Vitest's default `include` (its configDefaults).
const INCLUDE = ['**/*.{test,spec}.?(c|m)[jt]s?(x)'];
// The mark of a time witness: the import of `mesurerAuRepos`, on a line of its own, from the
// package of the base configuration (by its name, or by the path of its file).
const MARQUE_TEMOIN =
  /^import\s*\{[^}]*\bmesurerAuRepos\b[^}]*\}\s*from\s*['"][^'"]*vitest-config\/mesure(?:\.mjs)?['"]/m;
// Whether the text <texte> of a test file is that of a time witness.
const estTemoin = texte => MARQUE_TEMOIN.test(texte);
// The directories a search of the witnesses leaves out.
const HORS_TEMOINS = new Set(['node_modules', 'dist', '.git', '.turbo', '.claude']);

// The time witnesses under <dir>: the test files of <include> (Vitest's default without it), the
// day's exclusions left out, that `estTemoin`; each path relative to <dir>, sorted.
export function fichiersTemoins(dir, include = INCLUDE) {
  const lire = f => {
    try {
      return readFileSync(path.join(dir, f), 'utf8');
    } catch {
      return '';
    }
  };
  return [
    ...new Set(
      globSync(include, { cwd: dir, exclude: d => HORS_TEMOINS.has(path.basename(d)) }).map(f =>
        f.split(path.sep).join('/')
      )
    ),
  ]
    .filter(f => !horsDuJour(f) && estTemoin(lire(f)))
    .sort();
}
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
  if (!stat.isDirectory()) {
    return [chemin];
  }
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
export const ciblage = (env = process.env, dire = l => process.stdout.write(`${l}\n`)) => ({
  name: 'grillhouse:cibles',
  async config(config) {
    const texte = env[VARIABLE];
    const changements = env[CHANGEMENTS];
    delete env[VARIABLE];
    delete env[CHANGEMENTS];
    if (!texte && !changements) {
      return;
    }
    const test = (config.test ??= {});
    // The files a targeted run names themselves, absolute.
    let nommes = [];
    if (texte) {
      nommes = await cibler(config, test, JSON.parse(texte));
    }
    const ch = changements ? lireChangements(changements) : null;
    // A targeted run whose paths name no test file plays none, and fails, as without the changes.
    if (ch && test.include?.[0] !== `${VARIABLE}-sans-fichier`) {
      restreindre(test, path.resolve(config.root ?? process.cwd()), ch, nommes, dire);
    }
  },
});

// Applies the value <valeur> of VARIABLE to the configuration <config>, its test options <test>:
// the files named themselves, absolute.
async function cibler(config, test, valeur) {
  const { parseCLI } = await import('vitest/node');
  const { filter, options } = parseCLI(['vitest', ...(valeur.arguments ?? [])]);
  let nommes = [];
  // The time witnesses: left out of the pass, or played alone in their own.
  if (valeur.temoins === 'hors' || valeur.temoins === 'seuls') {
    const dir = path.resolve(config.root ?? process.cwd(), test.dir ?? '');
    const temoins = fichiersTemoins(dir, test.include ?? INCLUDE).map(r =>
      r.replace(SPECIAUX, '\\$&')
    );
    if (valeur.temoins === 'hors') {
      test.exclude = [...(test.exclude ?? ['**/node_modules/**']), ...temoins];
    } else {
      test.include = temoins.length ? temoins : [`${VARIABLE}-sans-temoin`];
      test.passWithNoTests = true;
      test.fileParallelism = false;
    }
  }
  if (filter.length) {
    const dir = path.resolve(config.root ?? process.cwd(), test.dir ?? '');
    const include = test.include ?? INCLUDE;
    const chemins = filter.map(f => path.resolve(f.replace(/[\\/]+$/, '')));
    // The files named themselves, not through a directory.
    const seuls = new Set(chemins.filter(f => fichiers(f)[0] === f));
    nommes = [...seuls];
    const relatif = f => path.relative(dir, f).split(path.sep).join('/');
    const joues = [...new Set(chemins.flatMap(fichiers))]
      .filter(f => {
        const r = relatif(f);
        if (r.startsWith('../')) {
          return false;
        }
        return horsDuJour(r) ? seuls.has(f) : include.some(p => path.matchesGlob(r, p));
      })
      .map(relatif)
      .sort();
    // A bench or a night test named itself plays: the day's exclusions of both lift, and the
    // files under a directory named stay out by the filter above.
    if (joues.some(horsDuJour) && Array.isArray(test.exclude)) {
      test.exclude = test.exclude.filter(p => !HORS_DU_JOUR.includes(p));
    }
    // No file named: a pattern that matches none, Vitest's « No test files found ».
    test.include = joues.length
      ? joues.map(r => r.replace(SPECIAUX, '\\$&'))
      : [`${VARIABLE}-sans-fichier`];
  }
  // parseCLI gives each option under its aliases too (`t`, `test-name-pattern`): its name alone
  // enters.
  const { '--': _, color: __, exclude, ...reste } = options;
  for (const [cle, valeur] of Object.entries(reste)) {
    if (cle.length > 1 && !cle.includes('-')) {
      test[cle] = fusion(test[cle], valeur);
    }
  }
  if (exclude !== undefined) {
    test.cliExclude = [exclude].flat();
  }
  return nommes;
}
