#!/usr/bin/env node
// The size of each test, on the model of the test pyramid of Google (Software Engineering at
// Google, ch. 11 and 14: small ~80 %, medium ~15 %, large ~5 %) and of Bazel's `size` (small,
// medium, large): a large test of the day is refused, as it belongs to the night.
//
//   npx grillhouse tailles-des-tests   run from the repository root (a guard of grillhouse:gardes)
//
// - The test files are those git lists in the repository, tracked or not, the ignored ones left
//   out (`git ls-files -co --exclude-standard`), that Vitest's default `include` names; out of
//   git, the files under the root, node_modules, dist, .git, .turbo and .claude left out.
// - A test is classed by a static reading of its text and of the test material it imports,
//   followed from file to file: a file under a directory `test`, `tests` or `__tests__` imported by
//   a relative path, or a package of the shared test material (whose package.json exports
//   `./test-fixtures`, ./composants.mjs `matieres`) imported by its name
//   (`@roomi-fields/grillhouse-matiere/test-fixtures`) or by a relative path, each of its files
//   followed; a module of the product it imports is counted, not read: what it starts is its
//   own. Bazel declares `size` by hand; the frame reads it from the text, so that every existing
//   test is classed the day the rule arrives.
//   - large (`grand`): it mounts a trial repository (git's `init`, `clone` or `worktree add`) and
//     starts there something else than git (node, npm, a shell, a binary of the product);
//     or it mounts a temporary directory (`mkdtemp`, `tmpdir`) and, in a process call carrying
//     `cwd:` (or `-C`, `--prefix`), starts one of the heavy tools of OUTILS_LOURDS (turbo,
//     vitest, knip, depcruise, api-extractor), named by a literal argument or a literal path to
//     its binary, with no `git init` (grillhouse-44b.10.4, Bazel's test-encyclopedia: a test
//     that runs the product in a trial project is large);
//     or it starts a Temporal development server (the literal arguments `'server', 'start-dev'`
//     in a process call of its text or of its test material): a test that mounts a real server
//     is large (grillhouse-4nr.16). A tool named by a variable, or run by
//     an npm script (`npm run verifier`), escapes the reading and the test stays medium; so
//     does a call without `cwd` (on the repository);
//   - medium (`moyen`): it starts a process (it imports `child_process`, `execa` or `zx`), or it
//     imports several modules of the repository;
//   - small (`petit`): it imports one module of the repository at most, and starts no process.
// - A large test of the day is a finding, `{ fichier, regle: 'grand-de-jour', message }`; a night
//   test or a time budget bench (`deNuitOuBanc`, ./vitest-config/cibles.mjs) is never one. A finding
//   inscribed in the project's debt (`grillhouse-dette.json`, ./dette.mjs) passes: the large tests
//   of the day that exist when the rule arrives are inscribed there by the update
//   (./migrations/0.25.0-tailles-des-tests.mjs), the count never rises, and a new one is refused.
// - A test of the day validates the code by importing it: one that starts the frame's command
//   (`lanceLeCadre`) is a finding, `{ fichier, regle: 'binaire-de-jour', message }`, out of the zone
//   of the end-to-end tests: a directory `e2e/` at any depth (as Playwright's and Angular's `e2e/`,
//   Cypress's `cypress/e2e/`), or a package of PAQUETS_DE_BOUT_EN_BOUT (`grillhouse-essais`, as a
//   project `<app>-e2e` of Nx). The reading sees a process call (APPEL; git's left out) whose first
//   argument is `'grillhouse'` (or `'npx'` then `'grillhouse'`), or that writes a string naming the
//   command (`node_modules/.bin/grillhouse`, `bin/grillhouse.mjs`, a line `npx grillhouse <x>`) or
//   a file of `bin/` or `scripts/` of the frame's package (`cadreDe`, resolved from the file's
//   directory, its package, the root): a script of the frame is the code of its subcommand. A name
//   counts when its initializer is a path naming it so (`const BIN = path.resolve(…)`), or another
//   such name, in the test or its material. A path built at run time (`path.join(SCRIPTS, nom)`),
//   a launcher passed through a helper without the name in the call, and the code of a `node -e`
//   (a template with a substitution) escape the reading. The cases that exist when the rule
//   arrives are inscribed by the update (./migrations/0.33.0-binaire-de-jour.mjs).
// - The guard writes on its error stream the count of each size, the night's included.
import { spawnSync } from 'node:child_process';
import { existsSync, globSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { trancher } from '../../dette.mjs';
import { paquets } from '../../paquets.mjs';
import { matieres } from './composants.mjs';
import { deNuitOuBanc } from './vitest-config/cibles.mjs';
import {
  chaines,
  code,
  IMPORT,
  lireLeDisque,
  MATIERE,
  resoudreRelatif as resoudre,
  TEST,
} from './vitest-config/lances.mjs';

export const GARDE = 'tailles-des-tests';
export const GRAND_DE_JOUR = 'grand-de-jour';
export const BINAIRE_DE_JOUR = 'binaire-de-jour';

// The import of a way to start a process.
const PROCESSUS = /['"](?:node:)?child_process['"]|['"]execa['"]|['"]zx['"]/;
// A trial repository mounted: git's `init`, `clone` or `worktree add`, as an argument or a command.
const DEPOT_D_ESSAI =
  /['"`](?:init|clone)['"`]|\bgit\s+(?:-C\s+\S+\s+)?(?:init|clone)\b|['"`]worktree['"`]\s*,\s*['"`]add['"`]|\bworktree\s+add\b/;
// A call that starts a process, its first argument captured; `.exec(` (a regular expression) is
// none.
const APPEL =
  /(?:(?<![\w$])(?:spawnSync|spawn|execFileSync|execFile|execSync|fork|execaSync|execa)|(?<![.\w$])exec)\s*\(\s*([^,)\n]*)/g;
// A first argument that names git.
const GIT = /^['"`]git(?:['"`]|\s)/;
/** The heavy tools of the product: a test that starts one in a trial project is large. */
export const OUTILS_LOURDS = ['turbo', 'vitest', 'knip', 'depcruise', 'api-extractor'];
// A Temporal development server started: the literal arguments `'server', 'start-dev'`.
const SERVEUR_TEMPORAL = /['"`]server['"`]\s*,\s*['"`]start-dev['"`]/;
// A temporary directory mounted.
const DOSSIER_TEMPORAIRE = /\bmkdtemp(?:Sync)?\b|\btmpdir\b/;
// An option of a call that carries the directory the process runs in.
const OPTION_DE_DOSSIER = /\bcwd\b|['"`](?:-C|--prefix)['"`]/;
// A heavy tool named by a literal in a call: a name, or the end of a path to its binary.
const OUTIL_LITTERAL = new RegExp(`(?:^|[\\s'"\`/])(?:${OUTILS_LOURDS.join('|')})(?=$|[\\s'"\`])`);
// The text of the call whose `(` is at <debut> in <texte>, to its closing parenthesis.
function appelComplet(texte, debut) {
  let profondeur = 0;
  const fin = Math.min(texte.length, debut + 2000);
  for (let i = debut; i < fin; i++) {
    if (texte[i] === '(') {
      profondeur++;
    } else if (texte[i] === ')' && --profondeur === 0) {
      return texte.slice(debut, i + 1);
    }
  }
  return texte.slice(debut, fin);
}
// Whether <texte> mounts a temporary directory and, in a process call carrying `cwd`, `-C` or
// `--prefix`, starts a heavy tool named by a literal.
function outilLourdEnProjetDEssai(texte) {
  if (!DOSSIER_TEMPORAIRE.test(texte)) {
    return false;
  }
  return [...texte.matchAll(APPEL)].some(m => {
    const appel = appelComplet(texte, m.index + m[0].indexOf('('));
    return OPTION_DE_DOSSIER.test(appel) && OUTIL_LITTERAL.test(appel);
  });
}
// A re-export of a whole module.
const TOUT_REEXPORTE = /\bexport\s*\*\s*from\b/;
// The names an import clause <clause> takes in braces (`import { a, b as c }` gives a and b);
// null for a clause without braces (a namespace, a default), which takes the whole module.
function nomsImportes(clause) {
  const b = /\{([^}]*)\}/.exec(clause);
  if (!b) {
    return null;
  }
  return b[1]
    .split(',')
    .map(p =>
      p
        .replace(/^\s*type\s+/, '')
        .split(/\s+as\s+/)[0]
        .trim()
    )
    .filter(Boolean);
}
// Whether the text <texte> declares and exports the name <nom>.
const declare = (texte, nom) =>
  new RegExp(
    `\\bexport\\s+(?:declare\\s+)?(?:async\\s+)?(?:function\\*?|const|let|var|class|type|interface|enum)\\s+${nom}\\b|\\bexport\\s*\\{[^}]*\\b${nom}\\b[^}]*\\}`
  ).test(texte);

// The entry `./test-fixtures` of the package.json <paquet>, a path from its directory: its value,
// or its condition `import`, `default` or `require`; null without one.
function entreeDeLaMatiere(paquet) {
  const v = paquet?.exports?.['./test-fixtures'];
  const e = typeof v === 'string' ? v : (v?.import ?? v?.default ?? v?.require);
  return typeof e === 'string' ? e : null;
}

// The packages of the shared test material of the repository at <racine>: `[{ nom, dir, entree }]`,
// `nom` the name by which a test imports it, `dir` its directory and `entree` the file of its
// entry `./test-fixtures`, absolute.
export function lesMatieres(racine) {
  return matieres(racine).flatMap(({ dir, paquet }) => {
    let pkg;
    try {
      pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
    } catch {
      return [];
    }
    const e = entreeDeLaMatiere(pkg);
    return paquet && e ? [{ nom: paquet, dir, entree: path.resolve(dir, e) }] : [];
  });
}

/** The package of the frame, whose command a test of the day does not start. */
export const PAQUET_DU_CADRE = '@roomi-fields/grillhouse';
/** The packages of end-to-end tests by design: they start the frame's scripts and import none. */
export const PAQUETS_DE_BOUT_EN_BOUT = ['@roomi-fields/grillhouse-essais'];
// The directory of the end-to-end tests, at any depth (`tests/e2e/`), as Playwright's and
// Angular's `e2e/` and Cypress's `cypress/e2e/`.
const ZONE_E2E = /(?:^|\/)e2e\//;
// A string that names the frame's command: its link, its file, or a command line.
const COMMANDE_DU_CADRE =
  /(?:^|[\s/'"])(?:\.bin\/grillhouse|bin\/grillhouse\.mjs)(?=$|[\s'"])|^(?:npx\s+(?:-\S+\s+)*)?grillhouse\s+[a-z]/;
// A literal first argument of a call: `'grillhouse'`, or `'npx'` whose arguments name it.
const PREMIER_GRILLHOUSE = /^['"`]grillhouse['"`]$/;
const PREMIER_NPX = /^['"`]npx['"`]$/;
// A path a string may write, resolved from the directory of its file.
const CHEMIN = /^[\w@.][\w@./-]*$/;
// An initializer that writes a path or a command: a string, an array, a join or a resolution of
// paths, a URL, another name (alone, or a choice between names); a value computed from it (a
// process's result, a file's text, a function, a trial project) is none.
const VALEUR_DE_CHEMIN =
  /^\s*(?:['"`[]|(?:path\.)?(?:join|resolve)\(|fileURLToPath\(|new\s+URL\(|[\w$.]+\s*(?:$|\?|\|\|))/;
// A template that substitutes a value: the code of `node -e`, a shell line built at run time.
const GABARIT = /`(?:[^`\\]|\\.)*\$\{(?:[^`\\]|\\.)*`/g;
// A declaration of a name and the start of its initializer.
const DECLARATION = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=(?!=)/g;

/**
 * The directory of the frame's package for the repository at <racine>: the package of its
 * workspace of that name (in Grillhouse, `packages/grillhouse`), else the one Node resolves from
 * it, by its real path; null when the repository does not install it.
 */
export function cadreDe(racine) {
  const ici = paquets(racine).find(p => p.pkg?.name === PAQUET_DU_CADRE);
  if (ici) {
    return path.join(racine, ici.dossier);
  }
  try {
    const pkg = createRequire(path.join(racine, 'package.json')).resolve(
      `${PAQUET_DU_CADRE}/package.json`
    );
    return path.dirname(realpathSync(pkg));
  } catch {
    return null;
  }
}

// The initializer of the declaration whose `=` ends at <debut> of <texte>: to its `;` or its end of
// line at depth 0.
function initialiseur(texte, debut) {
  let profondeur = 0;
  const fin = Math.min(texte.length, debut + 2000);
  for (let i = debut; i < fin; i++) {
    const c = texte[i];
    if (c === '(' || c === '[' || c === '{') {
      profondeur++;
    } else if (c === ')' || c === ']' || c === '}') {
      if (--profondeur < 0) {
        return texte.slice(debut, i);
      }
    } else if ((c === ';' || c === '\n') && profondeur === 0) {
      return texte.slice(debut, i);
    }
  }
  return texte.slice(debut, fin);
}

// The directory of the package that holds <f> under <racine>: the nearest holding a package.json
// <lire> reads, else <racine>.
function paquetDe(f, lire, racine) {
  for (
    let d = path.dirname(f);
    d.startsWith(racine) && d !== path.dirname(d);
    d = path.dirname(d)
  ) {
    if (lire(path.join(d, 'package.json')) !== null) {
      return d;
    }
    if (d === racine) {
      break;
    }
  }
  return racine;
}

// Whether the string <s> names the frame's command, or a file under `bin/` or `scripts/` of the
// frame's package at <cadre>, resolved from one of <bases>.
function nommeLeCadre(s, bases, cadre) {
  if (COMMANDE_DU_CADRE.test(s)) {
    return true;
  }
  if (!cadre || !CHEMIN.test(s)) {
    return false;
  }
  return bases.some(b => {
    const c = path.resolve(b, s);
    const cle = `${cadre}\0${c}`;
    if (!duCadre.has(cle)) {
      duCadre.set(cle, fichierDuCadre(c, cadre));
    }
    return duCadre.get(cle);
  });
}
// Whether the path <c> is a file under `bin/` or `scripts/` of the frame's package at <cadre>,
// each path read once per process.
const duCadre = new Map();
function fichierDuCadre(c, cadre) {
  try {
    if (!existsSync(c) || !statSync(c).isFile()) {
      return false;
    }
    const r = path.relative(cadre, realpathSync(c)).split(path.sep);
    return r[0] === 'bin' || r[0] === 'scripts';
  } catch {
    return false;
  }
}

/**
 * Whether the texts <sources> (`[{ f, texte }]`: a test file and its test material) start the
 * frame's command: a process call whose first argument is `'grillhouse'` (or `'npx'` then
 * `'grillhouse'`), or that writes a string naming it (its link, `bin/grillhouse.mjs`, a line
 * `npx grillhouse <x>`, a file of `bin/` or `scripts/` of the frame's package at <cadre>), or a name
 * whose initializer does, in one of the texts. <lire> reads a file, <racine> is the repository.
 */
export function lanceLeCadre(sources, lire, racine, cadre = null) {
  const lus = sources.map(({ f, texte }) => ({
    f,
    code: code(texte),
    bases: [path.dirname(f), paquetDe(f, lire, racine), racine],
  }));
  // The names whose initializer is a path or a command naming the frame, or a name already
  // marked, to a fixed point.
  const marques = new Set();
  const declarations = lus.flatMap(({ code: c, bases }) =>
    [...c.matchAll(DECLARATION)]
      .map(m => ({ nom: m[1], init: initialiseur(c, m.index + m[0].length), bases }))
      .filter(d => VALEUR_DE_CHEMIN.test(d.init))
  );
  const reference = (texte, nom) =>
    new RegExp(`(?<![\\w$.])${nom.replaceAll('$', '\\$')}(?![\\w$])`).test(texte);
  const nomme = (texte, bases) =>
    chaines(texte).some(s => nommeLeCadre(s, bases, cadre)) ||
    [...marques].some(n => reference(texte, n));
  for (let change = true; change;) {
    change = false;
    for (const d of declarations) {
      if (!marques.has(d.nom) && nomme(d.init, d.bases)) {
        marques.add(d.nom);
        change = true;
      }
    }
  }
  return lus.some(({ code: c, bases }) =>
    [...c.matchAll(APPEL)].some(m => {
      const premier = m[1].trim();
      if (GIT.test(premier)) {
        return false;
      }
      const appel = appelComplet(c, m.index + m[0].indexOf('(')).replace(GABARIT, '``');
      return (
        PREMIER_GRILLHOUSE.test(premier) ||
        (PREMIER_NPX.test(premier) && chaines(appel).includes('grillhouse')) ||
        nomme(appel, bases)
      );
    })
  );
}

// Whether the test <fichier> (from the top of <racine>) lies in the zone of the end-to-end tests:
// under a directory `e2e/`, or in a package of PAQUETS_DE_BOUT_EN_BOUT.
function dansLaZone(fichier, racine) {
  if (ZONE_E2E.test(fichier)) {
    return true;
  }
  const d = paquetDe(path.join(racine, fichier), lireLeDisque, racine);
  try {
    return PAQUETS_DE_BOUT_EN_BOUT.includes(
      JSON.parse(readFileSync(path.join(d, 'package.json'), 'utf8')).name
    );
  } catch {
    return false;
  }
}

/**
 * The size of the test file <fichier> (absolute), read by <lire> (a path → its text, null when it
 * does not read), in the repository at <racine>, whose packages of the shared test material are
 * <lesMatieres> (`[{ nom, dir, entree }]`, absolute paths), the frame's package at <cadre> (null
 * when not installed): `{ taille, modules, lance }`, `taille` one of `petit`, `moyen`, `grand`,
 * `modules` the modules of the repository it imports (the test material followed, not counted),
 * `lance` whether it starts the frame's command (`lanceLeCadre`).
 */
export function classer(
  fichier,
  lire,
  racine = path.parse(fichier).root,
  lesMatieres = [],
  cadre = null
) {
  const dansUneMatiere = f =>
    lesMatieres.some(m => {
      const r = path.relative(m.dir, f);
      return r !== '' && !r.startsWith('..') && !path.isAbsolute(r);
    });
  const textes = [];
  const sources = [];
  const modules = new Set();
  const vus = new Set();
  // <f> followed; with <noms>, the names a test imports of it, its re-exports of a whole module
  // (`export * from`) are followed only to a module that declares one of them.
  const lus = new Set();
  let serveur = false;
  const suivre = (f, noms = null, pris = noms) => {
    const cle = noms || pris ? `${f}#${(noms ?? []).join(',')}#${(pris ?? []).join(',')}` : f;
    if (vus.has(f) || vus.has(cle)) {
      return;
    }
    vus.add(cle);
    const texte = lire(f) ?? '';
    if (!lus.has(f)) {
      textes.push(texte);
      sources.push({ f, texte });
    }
    lus.add(f);
    // The server counts when the part of the file the test takes starts it: the whole file for
    // the test itself or an import without braces, the exports it names otherwise.
    const partie = pris
      ? texte
          .split(/(?=^export\s)/m)
          .filter(c => pris.some(n => declare(c, n)))
          .join('\n')
      : texte;
    if (SERVEUR_TEMPORAL.test(partie)) {
      serveur = true;
    }
    for (const m of texte.matchAll(IMPORT)) {
      const spec = m[1] ?? m[2] ?? m[3] ?? m[4];
      const parSonNom = lesMatieres.find(x => spec === `${x.nom}/test-fixtures`);
      if (parSonNom) {
        suivre(parSonNom.entree, nomsImportes(m[0]));
        continue;
      }
      if (!spec?.startsWith('.')) {
        continue;
      }
      const cible = resoudre(f, spec, lire);
      if (!cible) {
        continue;
      }
      if (noms && TOUT_REEXPORTE.test(m[0]) && !noms.some(n => declare(lire(cible) ?? '', n))) {
        continue;
      }
      const rel = path.relative(racine, cible).split(path.sep).join('/');
      if ((MATIERE.test(rel) || dansUneMatiere(cible)) && !TEST.test(rel)) {
        suivre(cible, null, nomsImportes(m[0]));
      } else {
        modules.add(cible);
      }
    }
  };
  suivre(fichier);
  const tout = textes.join('\n');
  const processus = PROCESSUS.test(tout);
  const autreQueGit = [...tout.matchAll(APPEL)].some(m => !GIT.test(m[1].trim()));
  const taille =
    processus &&
    ((autreQueGit && DEPOT_D_ESSAI.test(tout)) || outilLourdEnProjetDEssai(tout) || serveur)
      ? 'grand'
      : processus || modules.size > 1
        ? 'moyen'
        : 'petit';
  return {
    taille,
    modules: [...modules],
    lance: processus && lanceLeCadre(sources, lire, racine, cadre),
  };
}

// The directories a listing out of git leaves out.
const HORS = /(?:^|\/)(?:node_modules|dist|\.git|\.turbo|\.claude)$/;

/**
 * The test files of the repository at <racine>, as git lists them (out of git, the files under it,
 * node_modules, dist, .git, .turbo and .claude left out), each path from its root, sorted.
 */
export function testsDuDepot(racine) {
  const r = spawnSync('git', ['-C', racine, 'ls-files', '-co', '--exclude-standard', '-z'], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  const fichiers =
    r.status === 0
      ? r.stdout.split('\0')
      : globSync('**/*', { cwd: racine, exclude: d => HORS.test(d) });
  return [...new Set(fichiers.filter(f => TEST.test(f)))].sort();
}

/**
 * Each test file of the repository at <racine> and its size: `[{ fichier, taille, nuit, lance }]`,
 * `lance` whether it starts the frame's command.
 */
export function tailles(racine) {
  const m = lesMatieres(racine);
  const cadre = cadreDe(racine);
  return testsDuDepot(racine).map(fichier => {
    const { taille, lance } = classer(path.join(racine, fichier), lireLeDisque, racine, m, cadre);
    return { fichier, taille, nuit: deNuitOuBanc(fichier), lance };
  });
}

/**
 * The findings of the repository at <racine>, in the debt's form (./dette.mjs): one
 * `{ fichier, regle, message }` per large test of the day (`grand-de-jour`), and per test of the
 * day out of the zone of the end-to-end tests that starts the frame's command (`binaire-de-jour`).
 */
export function verifier(racine) {
  const toutes = tailles(racine);
  return [
    ...toutes
      .filter(t => t.taille === 'grand' && !t.nuit)
      .map(({ fichier }) => ({
        fichier,
        regle: GRAND_DE_JOUR,
        message: `${fichier} : un grand test (il monte un dépôt ou un projet d'essai et y lance le produit ou le cadre) est un test de nuit, jamais joué au fil du travail ; il se renomme en *.nuit.test.*, ou il se réduit à la plus petite taille qui prouve son critère.`,
      })),
    ...toutes
      .filter(t => t.lance && !t.nuit && !dansLaZone(t.fichier, racine))
      .map(({ fichier }) => ({
        fichier,
        regle: BINAIRE_DE_JOUR,
        message: `${fichier} : un test de jour valide le code en l'important ; il lance ici la commande grillhouse (son binaire, ou un script de bin/ ou scripts/ du cadre). Il importe la fonction qu'il prouve, ou, s'il est un vrai test de bout-en-bout, il va sous un dossier e2e/.`,
      })),
  ];
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const racine = process.cwd();
  const toutes = tailles(racine);
  const compte = t => toutes.filter(x => x.taille === t).length;
  const nuit = toutes.filter(x => x.nuit).length;
  const { refus, lignes } = trancher(racine, GARDE, verifier(racine));
  for (const r of refus) {
    process.stderr.write(`⛔ ${r.message}\n`);
  }
  for (const l of lignes) {
    process.stderr.write(`${l}\n`);
  }
  process.stderr.write(
    `ℹ️  ${GARDE} : ${toutes.length} fichier(s) de tests, ${compte('petit')} petit(s), ${compte('moyen')} moyen(s), ${compte('grand')} grand(s) ; ${nuit} de nuit ou de banc ; ${toutes.filter(x => x.lance).length} lance(nt) la commande grillhouse.\n`
  );
  process.exitCode = refus.length ? 1 : 0;
}
