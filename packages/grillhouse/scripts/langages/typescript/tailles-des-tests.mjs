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
//   `./test-fixtures`, ./consommateurs.mjs `matieres`) imported by its name
//   (`@roomi-fields/grillhouse-matiere/test-fixtures`) or by a relative path, each of its files
//   followed; a module of the product it imports is counted, not read: what it starts is its
//   own. Bazel declares `size` by hand; the frame reads it from the text, so that every existing
//   test is classed the day the rule arrives.
//   - large (`grand`): it mounts a trial repository (git's `init`, `clone` or `worktree add`) and
//     starts there something else than git (node, npm, a shell, a binary of the product);
//   - medium (`moyen`): it starts a process (it imports `child_process`, `execa` or `zx`), or it
//     imports several modules of the repository;
//   - small (`petit`): it imports one module of the repository at most, and starts no process.
// - A large test of the day is a finding, `{ fichier, regle: 'grand-de-jour', message }`; a night
//   test or a time budget bench (HORS_DU_JOUR, ./vitest-config/cibles.mjs) is never one. A finding
//   inscribed in the project's debt (`grillhouse-dette.json`, ./dette.mjs) passes: the large tests
//   of the day that exist when the rule arrives are inscribed there by the update
//   (./migrations/0.25.0-tailles-des-tests.mjs), the count never rises, and a new one is refused.
// - The guard writes on its error stream the count of each size, the night's included.
import { spawnSync } from 'node:child_process';
import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { trancher } from '../../dette.mjs';
import { matieres } from './consommateurs.mjs';
import { HORS_DU_JOUR } from './vitest-config/cibles.mjs';
import {
  IMPORT,
  lireLeDisque,
  MATIERE,
  resoudreRelatif as resoudre,
  TEST,
} from './vitest-config/lances.mjs';

export const GARDE = 'tailles-des-tests';
export const GRAND_DE_JOUR = 'grand-de-jour';

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
// A re-export of a whole module.
const TOUT_REEXPORTE = /\bexport\s*\*\s*from\b/;
// The names an import clause <clause> takes in braces (`import { a, b as c }` gives a and b);
// null for a clause without braces (a namespace, a default), which takes the whole module.
function nomsImportes(clause) {
  const b = /\{([^}]*)\}/.exec(clause);
  if (!b) return null;
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
function lesMatieres(racine) {
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

/**
 * The size of the test file <fichier> (absolute), read by <lire> (a path → its text, null when it
 * does not read), in the repository at <racine>, whose packages of the shared test material are
 * <lesMatieres> (`[{ nom, dir, entree }]`, absolute paths): `{ taille, modules }`, `taille` one of
 * `petit`, `moyen`, `grand`, `modules` the modules of the repository it imports (the test material
 * followed, not counted).
 */
export function classer(fichier, lire, racine = path.parse(fichier).root, lesMatieres = []) {
  const dansUneMatiere = f =>
    lesMatieres.some(m => {
      const r = path.relative(m.dir, f);
      return r !== '' && !r.startsWith('..') && !path.isAbsolute(r);
    });
  const textes = [];
  const modules = new Set();
  const vus = new Set();
  // <f> followed; with <noms>, the names a test imports of it, its re-exports of a whole module
  // (`export * from`) are followed only to a module that declares one of them.
  const suivre = (f, noms = null) => {
    const cle = noms ? `${f}#${noms.join(',')}` : f;
    if (vus.has(f) || vus.has(cle)) return;
    vus.add(cle);
    const texte = lire(f) ?? '';
    textes.push(texte);
    for (const m of texte.matchAll(IMPORT)) {
      const spec = m[1] ?? m[2] ?? m[3] ?? m[4];
      const parSonNom = lesMatieres.find(x => spec === `${x.nom}/test-fixtures`);
      if (parSonNom) {
        suivre(parSonNom.entree, nomsImportes(m[0]));
        continue;
      }
      if (!spec?.startsWith('.')) continue;
      const cible = resoudre(f, spec, lire);
      if (!cible) continue;
      if (noms && TOUT_REEXPORTE.test(m[0]) && !noms.some(n => declare(lire(cible) ?? '', n))) {
        continue;
      }
      const rel = path.relative(racine, cible).split(path.sep).join('/');
      if ((MATIERE.test(rel) || dansUneMatiere(cible)) && !TEST.test(rel)) suivre(cible);
      else modules.add(cible);
    }
  };
  suivre(fichier);
  const tout = textes.join('\n');
  const processus = PROCESSUS.test(tout);
  const autreQueGit = [...tout.matchAll(APPEL)].some(m => !GIT.test(m[1].trim()));
  const taille =
    processus && autreQueGit && DEPOT_D_ESSAI.test(tout)
      ? 'grand'
      : processus || modules.size > 1
        ? 'moyen'
        : 'petit';
  return { taille, modules: [...modules] };
}

// Whether <r>, a path from the root, is a night test or a time budget bench.
const horsDuJour = r => HORS_DU_JOUR.some(p => path.matchesGlob(r, p));

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

/** Each test file of the repository at <racine> and its size: `[{ fichier, taille, nuit }]`. */
export function tailles(racine) {
  const m = lesMatieres(racine);
  return testsDuDepot(racine).map(fichier => ({
    fichier,
    taille: classer(path.join(racine, fichier), lireLeDisque, racine, m).taille,
    nuit: horsDuJour(fichier),
  }));
}

/**
 * The findings of the repository at <racine>: one `{ fichier, regle, message }` per large test of
 * the day, in the debt's form (./dette.mjs).
 */
export function verifier(racine) {
  return tailles(racine)
    .filter(t => t.taille === 'grand' && !t.nuit)
    .map(({ fichier }) => ({
      fichier,
      regle: GRAND_DE_JOUR,
      message: `${fichier} : un grand test (il monte un dépôt d'essai et y lance le produit ou le cadre) est un test de nuit, jamais joué au fil du travail ; il se renomme en *.nuit.test.*, ou il se réduit à la plus petite taille qui prouve son critère.`,
    }));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const racine = process.cwd();
  const toutes = tailles(racine);
  const compte = t => toutes.filter(x => x.taille === t).length;
  const nuit = toutes.filter(x => x.nuit).length;
  const { refus, lignes } = trancher(racine, GARDE, verifier(racine));
  for (const r of refus) process.stderr.write(`⛔ ${r.message}\n`);
  for (const l of lignes) process.stderr.write(`${l}\n`);
  process.stderr.write(
    `ℹ️  ${GARDE} : ${toutes.length} fichier(s) de tests, ${compte('petit')} petit(s), ${compte('moyen')} moyen(s), ${compte('grand')} grand(s) ; ${nuit} de nuit ou de banc.\n`
  );
  process.exitCode = refus.length ? 1 : 0;
}
