// The tests a targeted run names (`npm test -- <paths>`, scripts/langages/typescript/tests.mjs), carried to Vitest by
// the variable `GRILLHOUSE_TESTS` rather than by its command line: the arguments after `--` of a
// Turborepo run enter the hash of every task of that run, the builds included, while a variable
// that the `env` of the task `test:unit` names enters the hash of the tests alone
// (https://turborepo.dev/docs/reference/configuration#env). Turborepo then plays the tests with
// what they depend on, each build and each trace hashed by Turborepo itself.
//
// - The value is JSON: `arguments`, Vitest's arguments (the paths, absolute, and the options
//   written `--<name>=<value>`), which Vitest's own parser of its command line (`parseCLI`,
//   vitest/node) reads; `rejouer`, the moment of a run that plays the tests for real (`--force`,
//   a complete pass of `npm run verifier`), which only moves the hash. The plugin takes the
//   variable out of the environment once read: no process the tests start receives it.
// - A plugin of the base configuration (./base.mjs) reads it once the configuration is merged (its
//   `config` hook; Vitest reads the test options in `configResolved`, after every `config` hook):
//   the files played are the test files of the configuration's `include` (Vitest's default when
//   it sets none) that lie under a path named (none named, the configuration's own), as Vitest's filters of its command line take an
//   absolute path (a file, or a directory ending with « / »); its `exclude` still applies, Vitest's.
//   A path of another package names none of its files. Each option enters the test configuration
//   as Vitest merges its command line over it (`exclude` given on the command line is
//   `cliExclude`, as Vitest's `normalizeCliOptions` names it).
// - Every measure of time plays at night (grillhouse-bd7), as Bazel leaves a target tagged
//   `manual` out of every pattern and the benchmarks of Chromium and rustc-perf leave the CI of
//   each commit for a machine at rest: a time budget bench (BUDGET) and a time witness, a test
//   file that imports the mark of a measure of time (`import { mesurerAuRepos } from
//   '@roomi-fields/grillhouse/vitest-config/mesure'`, a line of its own, `estTemoin`), are out of
//   the day, as a night test (NUIT) is. The base configuration excludes the patterns HORS_DU_JOUR;
//   the plugin excludes the witnesses found under the configuration's directory
//   (`fichiersTemoins`, node_modules, dist, .git, .turbo and .claude left out), with or without
//   the variable.
// - A night test named is refused, named, and nothing plays: the night alone plays it
//   (./tests-de-nuit.mjs).
// - A bench or a witness plays when its own file is named, as Bazel's target tagged
//   `manual` builds when named: the day's exclusions lift for that file, the include of the
//   configuration notwithstanding, and the measure of time of the base configuration applies, its
//   duration reporter giving 75, « à repasser », to a measure that fails under load. A directory
//   named leaves them out, as the day does.
// - A run whose paths name no test file plays none, and fails: the base configuration keeps
//   Vitest's `passWithNoTests: false`.
// - The night's configuration (scripts/langages/typescript/vitest.nuit.config.mjs) plays what the
//   day leaves out, through the plugin `nuit`: the night tests, the benches and the witnesses; the
//   variable `GRILLHOUSE_TESTS_DE_NUIT` (NUIT_VARIABLE) chooses `nuit`, the night tests alone,
//   `hors-poste`, the night tests but those that bear the tag `@poste` at their head (the night of
//   a shared machine), or `mesures`, the benches and the witnesses alone, one file at a time
//   (`fileParallelism: false`), as scripts/langages/typescript/tests-de-nuit.mjs plays them; the
//   variable `GRILLHOUSE_TRANCHE_DE_NUIT` (NUIT_TRANCHE) gives the run its tranche, as a tranche of
//   the day (`trancher`, ../tranches.mjs).
// - A tranche of a pass (`tranche`, `i/n`, and `rapports` in the value, `npm run verifier --
//   --tranche i/n`) plays its part of the files alone, writes its blob report and the files of its
//   part (`trancher`, ../tranches.mjs).
// - The changes since the last green (`GRILLHOUSE_CHANGEMENTS`, ./changements.mjs) restrict the
//   files played to those Vitest relates to them, the files named themselves kept, or leave every
//   test when a change lies out of Vitest's graph.
//
import { globSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { CHANGEMENTS, TESTS_CIBLES } from '../../../services-du-noyau.mjs';
import { trancher } from '../tranches.mjs';
import { lireChangements, restreindre } from './changements.mjs';

// The name of the variable is the core's (`TESTS_CIBLES`); this module reads it under its own name.
export const VARIABLE = TESTS_CIBLES;
// The day's exclusions, which the base configuration (./base.mjs) sets and the night plays
// (scripts/langages/typescript/vitest.nuit.config.mjs): the night tests, too long for the day, and the time budget
// benches, whose measures move with the load of the day.
export const NUIT = '**/*.nuit.{test,spec}.?(c|m)[jt]s?(x)';
export const BUDGET = '**/*.budget.{test,spec}.?(c|m)[jt]s?(x)';
export const HORS_DU_JOUR = [NUIT, BUDGET];
/** The variable that chooses the tests of a run of the night's configuration: `nuit` or `mesures`. */
export const NUIT_VARIABLE = 'GRILLHOUSE_TESTS_DE_NUIT';
/**
 * The variable that carries the tranche of a run of the night's configuration, JSON: `tranche`,
 * `i/n`, and `rapports`, the directory of its reports (`trancher`, ../tranches.mjs).
 */
export const NUIT_TRANCHE = 'GRILLHOUSE_TRANCHE_DE_NUIT';
// Whether the file at <fichier> bears the name of <motif>, a globstar then a name: by the name of
// the file, since a globstar passes no directory whose name starts with a dot, and a ticket's copy
// lives under `.claude/worktrees/`.
const parSonNom = (fichier, motif) =>
  path.matchesGlob(path.basename(fichier), motif.replace(/^\*\*\//, ''));
/** Whether the file at <fichier> is a night test, by its name: the one rule of the frame. */
export const estUnTestDeNuit = fichier => parSonNom(fichier, NUIT);
/** Whether the file at <fichier> is a time budget bench, by its name. */
export const estUnBanc = fichier => parSonNom(fichier, BUDGET);
/** Whether the file at <fichier> is a night test or a time budget bench, by its name. */
export const deNuitOuBanc = fichier => HORS_DU_JOUR.some(p => parSonNom(fichier, p));
// The tag of a night test that depends on the poste (its envelope, its tools, its session): a line
// `// @poste` of the comment at the head of the file, before its first line of code, its reason
// after it (`// @poste: l'enveloppe bwrap`), as Bazel's tags (`manual`, `exclusive`) and pytest's
// markers live with the test.
const ETIQUETTE_DU_POSTE = /^\/\/\s*@poste\b/;
/**
 * Whether the text <texte> of a test file bears the tag `@poste` in the comment at its head: the
 * night of a shared machine (`hors-poste`) leaves it out, the night of the poste plays it.
 * @param {string} texte the text of the file
 */
export function porteLEtiquetteDuPoste(texte) {
  for (const ligne of texte.split('\n')) {
    const l = ligne.trim();
    if (ETIQUETTE_DU_POSTE.test(l)) {
      return true;
    }
    if (l !== '' && !l.startsWith('//') && !l.startsWith('#!')) {
      return false;
    }
  }
  return false;
}
// Vitest's default `include` (its configDefaults).
const INCLUDE = ['**/*.{test,spec}.?(c|m)[jt]s?(x)'];
// The mark of a time witness: the import of `mesurerAuRepos`, on a line of its own, from the
// package of the base configuration (by its name, or by the path of its file).
const MARQUE_TEMOIN =
  /^import\s*\{[^}]*\bmesurerAuRepos\b[^}]*\}\s*from\s*['"][^'"]*vitest-config\/mesure(?:\.mjs)?['"]/m;
// Whether the text <texte> of a test file is that of a time witness.
const estTemoin = texte => MARQUE_TEMOIN.test(texte);
const lireTexte = f => {
  try {
    return readFileSync(f, 'utf8');
  } catch {
    return '';
  }
};

/**
 * Whether the test file at <fichier> is out of the day: a night test, a time budget bench or a
 * time witness; the night and the bench by its name (`deNuitOuBanc`).
 * @param {string} fichier the path of the file
 */
export const estHorsDuJour = fichier => deNuitOuBanc(fichier) || estTemoin(lireTexte(fichier));
// The directories a search of the witnesses leaves out.
const HORS_TEMOINS = new Set(['node_modules', 'dist', '.git', '.turbo', '.claude']);

// The time witnesses under <dir>: the test files of <include> (Vitest's default without it), the
// day's exclusions left out, that `estTemoin`; each path relative to <dir>, sorted.
export function fichiersTemoins(dir, include = INCLUDE) {
  const lire = f => lireTexte(path.join(dir, f));
  return [
    ...new Set(
      globSync(include, { cwd: dir, exclude: d => HORS_TEMOINS.has(path.basename(d)) }).map(f =>
        f.split(path.sep).join('/')
      )
    ),
  ]
    .filter(f => !deNuitOuBanc(f) && estTemoin(lire(f)))
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

// The time witnesses under the directory of the test options <test> of <config>, each a pattern
// relative to it that names its file alone.
const temoinsDe = (config, test) =>
  fichiersTemoins(
    path.resolve(config.root ?? process.cwd(), test.dir ?? ''),
    test.include ?? INCLUDE
  ).map(r => r.replace(SPECIAUX, '\\$&'));

// The plugin of the day: the time witnesses out of the run, and the run restricted to the tests
// <env> names in VARIABLE.
export const ciblage = (env = process.env, dire = l => process.stdout.write(`${l}\n`)) => ({
  name: 'grillhouse:cibles',
  async config(config) {
    const texte = env[VARIABLE];
    const changements = env[CHANGEMENTS];
    delete env[VARIABLE];
    delete env[CHANGEMENTS];
    const test = (config.test ??= {});
    const temoins = temoinsDe(config, test);
    // The files a targeted run names themselves, absolute.
    let nommes = [];
    if (texte) {
      const valeur = JSON.parse(texte);
      nommes = await cibler(config, test, valeur, new Set(temoins));
      if (valeur.tranche) {
        await trancher(config, test, valeur);
      }
    }
    // The witnesses out of the day, but those named themselves (in the include then).
    const joues = new Set(Array.isArray(test.include) ? test.include : []);
    const hors = nommes.length ? temoins.filter(t => !joues.has(t)) : temoins;
    if (hors.length) {
      test.exclude = [...(test.exclude ?? ['**/node_modules/**']), ...hors];
    }
    const ch = changements ? lireChangements(changements) : null;
    // A targeted run whose paths name no test file plays none, and fails, as without the changes.
    if (ch && test.include?.[0] !== `${VARIABLE}-sans-fichier`) {
      restreindre(test, path.resolve(config.root ?? process.cwd()), ch, nommes, dire);
    }
  },
});

// Applies the value <valeur> of VARIABLE to the configuration <config>, its test options <test>,
// <temoins> the time witnesses (patterns relative to its directory): the files named themselves,
// absolute.
async function cibler(config, test, valeur, temoins) {
  const { parseCLI } = await import('vitest/node');
  const { filter, options } = parseCLI(['vitest', ...(valeur.arguments ?? [])]);
  let nommes = [];
  if (filter.length) {
    const dir = path.resolve(config.root ?? process.cwd(), test.dir ?? '');
    const include = test.include ?? INCLUDE;
    const chemins = filter.map(f => path.resolve(f.replace(/[\\/]+$/, '')));
    const relatif = f => path.relative(dir, f).split(path.sep).join('/');
    // The files named themselves, not through a directory.
    const seuls = new Set(chemins.filter(f => fichiers(f)[0] === f));
    // A night test plays at night alone (./tests-de-nuit.mjs): a targeted run refuses it, named.
    const deNuit = [...seuls].filter(estUnTestDeNuit);
    if (deNuit.length) {
      throw new Error(
        deNuit
          .map(
            f =>
              `⛔ ${relatif(f)} : un test de nuit se joue la nuit seulement (npx grillhouse nuit le joue)`
          )
          .join('\n')
      );
    }
    nommes = [...seuls];
    const joues = [...new Set(chemins.flatMap(fichiers))]
      .filter(f => {
        const r = relatif(f);
        if (r.startsWith('../')) {
          return false;
        }
        return deNuitOuBanc(r) || temoins.has(r.replace(SPECIAUX, '\\$&'))
          ? seuls.has(f)
          : include.some(p => path.matchesGlob(r, p));
      })
      .map(relatif)
      .sort();
    // A bench named itself plays: the day's exclusions lift, and the
    // files under a directory named stay out by the filter above (a witness, by the plugin).
    if (joues.some(deNuitOuBanc) && Array.isArray(test.exclude)) {
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

/**
 * The night tests under <dir> that bear the tag `@poste` (`porteLEtiquetteDuPoste`), node_modules,
 * dist, .git, .turbo and .claude left out; each path relative to <dir>, sorted.
 * @param {string} dir the directory searched
 */
export function testsDuPoste(dir) {
  return [
    ...new Set(
      globSync([NUIT], { cwd: dir, exclude: d => HORS_TEMOINS.has(path.basename(d)) }).map(f =>
        f.split(path.sep).join('/')
      )
    ),
  ]
    .filter(f => porteLEtiquetteDuPoste(lireTexte(path.join(dir, f))))
    .sort();
}

/**
 * The plugin of the night's configuration: the night tests, the benches and the time witnesses
 * under its directory, or, as <env> chooses in NUIT_VARIABLE, the night tests alone (`nuit`), the
 * night tests but those tagged `@poste` (`hors-poste`, the night of a shared machine: a CI), or the
 * measures alone, one file at a time (`mesures`), the benches and the witnesses; with
 * NUIT_TRANCHE, the tranche it carries of these files.
 * @param {NodeJS.ProcessEnv} [env] the environment that holds the choice
 */
export const nuit = (env = process.env) => ({
  name: 'grillhouse:nuit',
  async config(config) {
    const choix = env[NUIT_VARIABLE];
    const tranche = env[NUIT_TRANCHE];
    delete env[NUIT_VARIABLE];
    delete env[NUIT_TRANCHE];
    const test = (config.test ??= {});
    const temoins = temoinsDe(config, { ...test, include: INCLUDE });
    if (choix === 'nuit') {
      test.include = [NUIT];
    } else if (choix === 'hors-poste') {
      test.include = [NUIT];
      const duPoste = testsDuPoste(path.resolve(config.root ?? process.cwd(), test.dir ?? ''));
      if (duPoste.length) {
        test.exclude = [
          ...(test.exclude ?? ['**/node_modules/**']),
          ...duPoste.map(r => r.replace(SPECIAUX, '\\$&')),
        ];
      }
    } else if (choix === 'mesures') {
      test.include = [BUDGET, ...temoins];
      test.fileParallelism = false;
    } else {
      test.include = [...HORS_DU_JOUR, ...temoins];
    }
    if (tranche) {
      await trancher(config, test, JSON.parse(tranche));
    }
  },
});
