// The files each test reads beyond the modules it imports: the scripts it launches and the data it
// reads by their path, as Bazel's `data` of a test target, which Vitest's graph (the modules a test
// imports) does not hold. The frame reads them in the test's text, and in the texts they lead to,
// as Bazel's runfiles of a target are those of its `data` and of their own dependencies.
//
// - What a test names (`nommesPar`): each path that a string of its code writes whole
//   (`'../../scripts/verrous/verrou.mjs'`), or that the strings of one call of `join` or
//   `resolve` write together (`path.join(DEPOT, 'packages/a', 'scripts/x.mjs')`), resolved from
//   the directory of the file that writes it, then from the test's package, then from the top of
//   the repository, the first that exists: the constant `SCRIPT` of a test that launches a script,
//   or the data it reads. The code is the text without its comments and without its imports, whose
//   strings are in Vitest's graph. The test material it imports is read as the test itself: a file
//   under a directory `test`, `tests` or `__tests__`, or of a package of the shared material (whose
//   package.json exports `./test-fixtures`). A directory names each file under it, except a
//   directory that holds the file that writes it, or that is a package (it holds a package.json):
//   it is a base, not a read. A path out of the repository, or under node_modules once its links
//   are followed, is none. A pattern of files whose start is fixed
//   (`'packages/grillhouse/scripts/**/*.mjs'`) names each file it covers. A command of a package of
//   the workspace (its package.json's `bin`) is named by its link (`node_modules/.bin/grillhouse`,
//   whole or written by the strings of one call) and, in a test's string, by a command line
//   (`npx grillhouse maj`): its file, which names the script of each subcommand in its table.
// - What a test reads (`lusPar`): the test and the files it names, then, from file to file, the
//   modules each one imports (a relative specifier, or a package of the workspace, resolved as Node
//   resolves it, out of node_modules once its links are followed) and the paths each module's code
//   writes from its own directory (`path.join(ICI, 'verrous/verrou.mjs')`), a command's link
//   included (the hook of the plugin that runs `node_modules/.bin/grillhouse <sous-commande>`), and
//   the paths a script of the shell writes from its own directory (`"$ici/superviseur.mjs"`): a
//   script that launches another names it. A subcommand leads to every script of the command's
//   table: naming the one it runs would need the table of the core, which no published entry
//   gives to a module of language.
// - The tests that launch a file (`testsQuiLancent`): the test files of a package whose reads hold
//   one of the files changed. ./changements.mjs adds them to the tests Vitest relates to the
//   changes, so that a test plays when the script it launches changes, as it plays when a module it
//   imports changes.
// - What a test names without the frame reading it (`nonDeclares`): a string of the test's code or
//   of its material that ends the path of a module of its package (`'verrou.mjs'`,
//   `'verrous/verrou.mjs'`), out of a directory of tests, the module out of what the test reads and
//   out of the package's `grillhouse.lit`: a script it launches by a path built at run time
//   (`path.join(SCRIPTS, nom)`), whose change would not play it; or a pattern that names a
//   directory of the package without a fixed start (`'**/scripts/*.mjs'`), for each module it
//   covers out of what the test reads. A pattern that names no directory (`'**/*.mjs'`, `'*'`) is
//   the configuration of a trial project. The guard of the paths of the tests
//   (../chemins-des-tests.mjs) refuses it; the test writes the path whole, or its package declares
//   it in its `grillhouse.lit`.
//
// The reading of a test's text is one, shared: the guard of the sizes (../tailles-des-tests.mjs)
// takes from this module what a test file is, its material, its imports and their resolution.
//
// This module's top level uses Node alone (./changements.mjs imports it).
import { existsSync, globSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { matieres } from '../composants.mjs';
import { paquets } from '../../../paquets.mjs';

/** A test file, as Vitest's default `include` names one. */
export const TEST = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
// The extension of a module, whose code the reads follow.
const MODULE = /\.(?:[cm]?[jt]sx?)$/;
/** A file of test material: under a directory of tests. */
export const MATIERE = /(?:^|\/)(?:tests?|__tests__)\//;
/** The specifiers a text imports: static, dynamic, re-exported, required, or bare. */
export const IMPORT =
  /(?:^|[\s;])(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\brequire\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm;
// One call of `join` or `resolve` (of `path` or imported alone), its arguments on one or several
// lines, a call among them (`process.cwd()`) kept.
const APPEL = /(?<![\w$])(?:path\.)?(?:join|resolve)\(((?:[^()]|\([^()]*\))*)\)/g;
// The extensions a relative specifier may leave out, or write `.js` for a `.ts`.
const SUFFIXES = ['', '.ts', '.mts', '.tsx', '.js', '.mjs', '.cjs', '/index.ts', '/index.js'];
// A script of the shell.
const SHELL = /\.(?:sh|bash)$/;
// A pattern of files: a glob's wildcard, or a set of alternatives.
const MOTIF = /[*?{]/;
// The directories a walk leaves out.
const SAUTES = new Set(['node_modules', '.git', '.turbo', 'dist', '.claude']);

const sous = (f, dir) => {
  const r = path.relative(dir, f);
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
};
const horsModules = f => !f.split(path.sep).includes('node_modules');
const du = (racine, f) => path.relative(racine, f).split(path.sep).join('/');

// <f> with its links followed, null when it does not exist.
const reel = f => {
  try {
    return realpathSync(f);
  } catch {
    return null;
  }
};

/** The reader of the files of the disk: a regular file's text, null otherwise. */
export function lireLeDisque(f) {
  try {
    return statSync(f).isFile() ? readFileSync(f, 'utf8') : null;
  } catch {
    return null;
  }
}
const lire = f => lireLeDisque(f) ?? '';

/**
 * The file a relative <spec> of <de> resolves to, among those <lireUn> reads (a path → its text,
 * null when it does not read); null otherwise.
 */
export function resoudreRelatif(de, spec, lireUn) {
  const base = path.resolve(path.dirname(de), spec);
  const sansJs = base.replace(/\.([cm]?)js$/, '.$1ts');
  for (const c of [...SUFFIXES.map(s => base + s), sansJs]) {
    if (lireUn(c) !== null) return c;
  }
  return null;
}

const estDossier = f => {
  try {
    return statSync(f).isDirectory();
  } catch {
    return false;
  }
};

// The files under the directory <dir>, absolute, SAUTES left out.
function fichiersSous(dir) {
  let entrees;
  try {
    entrees = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entrees.flatMap(e => {
    if (SAUTES.has(e.name)) return [];
    const f = path.join(dir, e.name);
    return e.isDirectory() ? fichiersSous(f) : e.isFile() ? [f] : [];
  });
}

// The specifiers <texte> imports.
const specifiers = texte =>
  [...texte.matchAll(IMPORT)].map(m => m[1] ?? m[2] ?? m[3] ?? m[4]).filter(Boolean);

// <texte> without its comments, read character by character so that a string holding `//` or
// `/*` (a URL, a glob) stays whole: a quoted string ends at its quote or at the end of its line,
// a template at its backtick.
function sansCommentaires(texte) {
  let out = '';
  let i = 0;
  while (i < texte.length) {
    const c = texte[i];
    const suivant = texte[i + 1];
    if (c === '/' && suivant === '/') {
      while (i < texte.length && texte[i] !== '\n') i++;
    } else if (c === '/' && suivant === '*') {
      const fin = texte.indexOf('*/', i + 2);
      i = fin < 0 ? texte.length : fin + 2;
      out += ' ';
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < texte.length && texte[j] !== c && (c === '`' || texte[j] !== '\n')) {
        j += texte[j] === '\\' ? 2 : 1;
      }
      out += texte.slice(i, j + 1);
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

// The code of <texte>: without its comments, whose words name no path read, nor its imports, whose
// strings are in Vitest's graph.
const code = texte => sansCommentaires(texte).replace(IMPORT, '');

// The strings of the code <texte> (without its comments), read character by character: a quoted
// string, or a template without a substitution, each once.
function chainesDe(texte) {
  const out = [];
  let i = 0;
  while (i < texte.length) {
    const c = texte[i];
    if (c !== "'" && c !== '"' && c !== '`') {
      i++;
      continue;
    }
    let j = i + 1;
    while (j < texte.length && texte[j] !== c && (c === '`' || texte[j] !== '\n')) {
      j += texte[j] === '\\' ? 2 : 1;
    }
    const contenu = texte.slice(i + 1, j);
    if (!(c === '`' && contenu.includes('${'))) out.push(contenu);
    i = j + 1;
  }
  return out;
}

// The strings of the code <texte>, then the strings of each call of `join` or `resolve` written
// together, each once.
function chaines(texte) {
  const jointes = [...texte.matchAll(APPEL)]
    .map(a => chainesDe(a[1]).filter(Boolean))
    .filter(l => l.length > 1)
    .map(l => l.join('/'));
  return [...new Set([...chainesDe(texte), ...jointes].filter(Boolean))];
}

// The value of <calcul>, kept in <memo> under <cle>: each reading of a directory, a resolution or a
// file's strings is made once per pass.
function memoise(memo, cle, calcul) {
  if (!memo.has(cle)) memo.set(cle, calcul());
  return memo.get(cle);
}

// The file a <spec> imported by <de> resolves to, in the repository at <racine>, out of
// node_modules once its links are followed; null otherwise.
function resoudreImport(de, spec, racine, memo) {
  return memoise(memo, `import:${path.dirname(de)}\0${spec}`, () => resoudre(de, spec, racine));
}

function resoudre(de, spec, racine) {
  if (spec.startsWith('.')) {
    const f = resoudreRelatif(de, spec, lireLeDisque);
    return f && reel(f);
  }
  if (spec.startsWith('node:') || path.isAbsolute(spec)) return null;
  try {
    const f = reel(createRequire(de).resolve(spec));
    return f && sous(f, racine) && horsModules(f) ? f : null;
  } catch {
    return null;
  }
}

// Whether the file <f> of the repository at <racine> is test material: under a directory of
// tests, or in a package of the shared material (`matieres` of ../composants.mjs).
function estMatiere(f, racine, memo) {
  if (MATIERE.test(du(racine, f))) return true;
  return memoise(memo, 'matieres', () => matieres(racine)).some(m => sous(f, m.dir));
}

// The commands of the packages of the workspace at <racine>, by their name: the file of each
// `bin` of their package.json (`grillhouse` → bin/grillhouse.mjs).
function commandes(racine, memo) {
  return memoise(memo, 'commandes', () => {
    const out = new Map();
    for (const { dossier, pkg } of paquets(racine)) {
      const bin =
        typeof pkg?.bin === 'string' && pkg?.name
          ? { [pkg.name.split('/').at(-1)]: pkg.bin }
          : (pkg?.bin ?? {});
      for (const [nom, f] of Object.entries(bin)) {
        if (typeof f === 'string') out.set(nom, path.join(racine, dossier, f));
      }
    }
    return out;
  });
}

// The command of the workspace that the string <chaine> launches: a path ending
// `node_modules/.bin/<nom>`, or, with <ligne> (a test's string), a command line
// `<nom> <sous-commande>` (`npx grillhouse maj`); its file, or null.
function commandeLancee(chaine, racine, memo, ligne) {
  const liste = commandes(racine, memo);
  const parLien = /(?:^|\/)\.bin\/([\w@.-]+)$/.exec(chaine);
  if (parLien) return liste.get(parLien[1]) ?? null;
  if (!ligne) return null;
  for (const [nom, f] of liste) {
    if (new RegExp(`(?:^|[\\s/"'])${nom.replace(/[.-]/g, '\\$&')}["']?\\s+[a-z]`).test(chaine)) {
      return f;
    }
  }
  return null;
}

// The files of the repository at <racine> the pattern <motif> covers from the first of <bases>
// that holds its fixed start (the segments before its first wildcard), node_modules left out; none
// for a pattern that starts with a wildcard.
function couverts(motif, bases, racine) {
  const fixe = motif.split('/').filter((s, i, l) => !l.slice(0, i + 1).some(x => MOTIF.test(x)));
  if (fixe.length === 0) return [];
  for (const b of bases) {
    if (!existsSync(path.resolve(b, ...fixe))) continue;
    return globSync(motif, { cwd: b, exclude: d => SAUTES.has(path.basename(d)) })
      .map(f => path.resolve(b, f))
      .filter(f => sous(f, racine) && horsModules(f) && !estDossier(f));
  }
  return [];
}

// The files of the repository at <racine> that the path <chaine> names from one of <bases> (the
// first that exists): itself, or each file under it; none for a directory that holds the file
// <de> that writes it, or that is a package.
function nommes(chaine, bases, racine, de, memo, ligne = false) {
  if (!/[\w.]/.test(chaine) || /^[a-z]+:/i.test(chaine)) return [];
  return memoise(memo, `nommes:${ligne}\0${bases.join('\0')}\0${path.dirname(de)}\0${chaine}`, () =>
    resoudreNommes(chaine, bases, racine, de, memo, ligne)
  );
}

function resoudreNommes(chaine, bases, racine, de, memo, ligne) {
  const commande = commandeLancee(chaine, racine, memo, ligne);
  if (commande) return [commande];
  if (/[\s<>|^$]/.test(chaine)) return [];
  if (MOTIF.test(chaine)) return couverts(chaine, bases, racine);
  for (const b of bases) {
    const c = path.resolve(b, chaine);
    if (!existsSync(c)) continue;
    const r = reel(c);
    if (!r || !sous(r, racine) || !horsModules(r)) return [];
    if (!estDossier(r)) return [r];
    if (sous(de, r) || existsSync(path.join(r, 'package.json'))) return [];
    return memoise(memo, `dossier:${r}`, () => fichiersSous(r));
  }
  return [];
}

// The test file <fichier> and the test material it imports, from file to file, itself first.
function materiel(fichier, racine, memo) {
  const vus = [];
  const suivre = f => {
    if (vus.includes(f)) return;
    vus.push(f);
    for (const spec of specifiersDe(f, memo)) {
      const cible = resoudreImport(f, spec, racine, memo);
      if (cible && !TEST.test(cible) && estMatiere(cible, racine, memo)) suivre(cible);
    }
  };
  suivre(fichier);
  return vus;
}

// The specifiers the file <f> imports, and the strings of its code.
const specifiersDe = (f, memo) => memoise(memo, `specifiers:${f}`, () => specifiers(lire(f)));
const chainesDuFichier = (f, memo) => memoise(memo, `chaines:${f}`, () => chaines(code(lire(f))));

// The files the test file <fichier> (absolute) of the package at <dossier>, in the repository at
// <racine>, names by their path, its test material's included: absolute paths.
function nommesPar(fichier, dossier, racine, memo) {
  const out = new Set();
  for (const f of materiel(fichier, racine, memo)) {
    const bases = [path.dirname(f), dossier, racine];
    for (const c of chainesDuFichier(f, memo)) {
      for (const n of nommes(c, bases, racine, f, memo, true)) out.add(n);
    }
  }
  return out;
}

// The closure of the files <depart> in the repository at <racine>: themselves, the modules each
// imports and the paths each module's code writes from its own directory, from file to file; a
// Set of absolute paths. <memo> keeps what each module leads to across calls.
function fermeture(depart, racine, memo) {
  const vus = new Set();
  const pile = [...depart];
  while (pile.length) {
    const f = pile.pop();
    if (vus.has(f)) continue;
    vus.add(f);
    if (SHELL.test(f)) {
      // A script of the shell names the scripts it runs from its own directory, through a
      // variable (`"$ici/superviseur.mjs"`).
      pile.push(
        ...memoise(memo, `suite:${f}`, () =>
          chainesDe(lire(f))
            .map(c => c.replace(/^\$\{?\w+\}?\//, ''))
            .flatMap(c => nommes(c, [path.dirname(f)], racine, f, memo))
        )
      );
      continue;
    }
    if (!MODULE.test(f)) continue;
    const suite = memoise(memo, `suite:${f}`, () => [
      ...specifiersDe(f, memo)
        .map(s => resoudreImport(f, s, racine, memo))
        .filter(Boolean),
      ...chainesDuFichier(f, memo).flatMap(c => nommes(c, [path.dirname(f)], racine, f, memo)),
    ]);
    pile.push(...suite);
  }
  return vus;
}

/**
 * What the test file <fichier> (absolute) of the package at <dossier>, in the repository at
 * <racine>, reads: itself and the files it names, with what they import and name, from file to
 * file; a Set of absolute paths. <memo> keeps what each module leads to across calls.
 */
export function lusPar(fichier, dossier, racine, memo = new Map()) {
  return fermeture([fichier, ...nommesPar(fichier, dossier, racine, memo)], racine, memo);
}

/** The test files under the package directory <dossier>, absolute, sorted. */
export function testsDuPaquet(dossier) {
  return fichiersSous(dossier)
    .filter(f => TEST.test(f))
    .sort();
}

/**
 * The test files of the package at <dossier>, in the repository at <racine>, whose reads
 * (`lusPar`) hold one of the files <changes> (absolute): sorted.
 */
export function testsQuiLancent(dossier, racine, changes) {
  const cibles = new Set(changes.map(f => reel(f) ?? f));
  if (cibles.size === 0) return [];
  const memo = new Map();
  return testsDuPaquet(dossier).filter(t => {
    for (const f of lusPar(t, dossier, racine, memo)) if (cibles.has(f)) return true;
    return false;
  });
}

// Whether the path <rel> (from the top) lies under one of the paths <lit> (from the top).
const dansLit = (rel, lit) => lit.some(l => rel === l || rel.startsWith(`${l}/`));

/**
 * What the test files of the package at <dossier>, in the repository at <racine>, name without
 * the frame reading it, <lit> the package's `grillhouse.lit` (paths from the top):
 * `[{ test, fichier, chaine }]`, `test` and `fichier` from the top, `fichier` a module of the
 * package out of a directory of tests whose path the string <chaine> of the test's code (or of its
 * material) ends, out of what the test reads (`lusPar`) and out of lit; in the order of the tests.
 */
export function nonDeclares(dossier, racine, lit = [], memo = new Map()) {
  // Each module of the package that may be named, by each end of its path (`verrou.mjs`,
  // `verrous/verrou.mjs`, …).
  const parFin = new Map();
  const modules = [];
  for (const f of fichiersSous(dossier)) {
    const r = du(racine, f);
    if (!MODULE.test(f) || TEST.test(f) || MATIERE.test(r) || dansLit(r, lit)) continue;
    modules.push(f);
    const parts = r.split('/');
    for (let i = 0; i < parts.length; i++) {
      const fin = parts.slice(i).join('/');
      parFin.set(fin, [...(parFin.get(fin) ?? []), f]);
    }
  }
  const out = [];
  for (const t of testsDuPaquet(dossier)) {
    const lus = lusPar(t, dossier, racine, memo);
    const signales = new Set();
    for (const f of materiel(t, racine, memo)) {
      for (const c of chainesDuFichier(f, memo)) {
        const fin = c.replace(/^(?:\.{1,2}\/)+/, '').replace(/\/+$/, '');
        // A pattern that names a directory by a segment without a wildcard (`**/scripts/*.mjs`):
        // one that starts with a wildcard and names none (`**/*.mjs`, `*`) is the configuration
        // of a trial project, not a read.
        const motif =
          MOTIF.test(fin) &&
          !/\s/.test(fin) &&
          fin
            .split('/')
            .slice(0, -1)
            .some(x => x && !MOTIF.test(x) && x !== '..' && x !== '.');
        const cibles = motif
          ? modules.filter(
              m => path.matchesGlob(du(racine, m), fin) || path.matchesGlob(du(dossier, m), fin)
            )
          : (parFin.get(fin) ?? []);
        for (const cible of cibles) {
          const r = du(racine, cible);
          if (!lus.has(cible) && !signales.has(r)) {
            signales.add(r);
            out.push({ test: du(racine, t), fichier: r, chaine: c });
          }
        }
      }
    }
  }
  return out;
}
