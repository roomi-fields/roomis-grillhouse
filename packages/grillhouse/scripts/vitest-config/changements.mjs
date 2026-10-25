// The changes since the last green that a pass measures itself against (scripts/dernier-vert.mjs
// writes them), as the plugin of ./cibles.mjs reads them in the package whose configuration it
// runs: the tests Vitest relates to them, or every test of the package when one of them lies
// where Vitest's graph of a test does not reach. `vitest --changed <ref>` is the model: Vitest
// relates a test to the files it reads from git (`<ref>...HEAD`, the files staged, modified and
// untracked), and plays the tests whose graph holds one of them (`related`); the frame gives it
// the files that differ from the tree of the last green instead, which Vitest's git cannot read
// (a green kept on a copy whose lot is not committed).
//
// - The variable `GRILLHOUSE_CHANGEMENTS` names a JSON file, `{ racine, fichiers, supprimes }`: the
//   top of the repository, the files changed or added since the last green and the files removed,
//   each path from the top. It passes through Turborepo without entering any hash (the root's
//   `globalPassThroughEnv`, which scripts/turbo-des-paquets.mjs writes and checks): a package whose
//   inputs did not move replays its last green from Turborepo's cache, whatever the last green.
//   The plugin takes it out of the environment once read: no process the tests start receives it.
// - The graph of a test is the test file and the modules it imports, statically or dynamically,
//   node_modules left out (`getTestDependencies` of Vitest). Vitest does not see what lies out of
//   it, and the package plays whole (`entier`) when a change lies there, the reason written:
//   1. a file removed in the package: no graph of today holds it (one removed in a package it
//      depends on, as 6 has it);
//   2. the frame's base configuration (this directory), which every configuration extends;
//   3. the configuration of the repository at its top: `package.json`, `package-lock.json`,
//      `turbo.json`, `turbo.jsonc`, `tsconfig*.json`;
//   4. the configuration of the package at its top: `package.json`, `vitest.config.*`,
//      `vite.config.*`, `vitest.workspace.*`, `tsconfig*.json`; its `setupFiles` and its
//      `globalSetup`, which Vitest runs beside the graph;
//   5. a path its tests declare they read (`grillhouse.lit` of its package.json, from the top):
//      a script they run, a file they read, as Bazel's `data`;
//   6. a file, changed or removed, that the build of a package it depends on reads (its
//      `dependencies`, `devDependencies`, `optionalDependencies` and `peerDependencies` that
//      resolve to a directory of the repository, out of node_modules, transitively): its tests read
//      that package built, not the source git follows. As Turborepo hashes the inputs of a
//      neighbour's `build` task and Bazel the `srcs` of its target, the build reads the inputs of
//      the `build` of the neighbour's turbo.json, the one scripts/turbo-des-paquets.mjs generates,
//      as Turborepo reads them: each pattern from the package, `$TURBO_ROOT$/…` from the top, `!…`
//      an exclusion, `<x>/**` covering `<x>` itself, `$TURBO_DEFAULT$` every file of the package,
//      `$TURBO_EXTENDS$` the inputs of the root's `build` (turbo.json or turbo.jsonc). When they
//      name none (no turbo.json, no inputs), its files of code and configuration (the extension of
//      a module), out of its `docs/`, its exclusions kept. A test file of the neighbour is never
//      one: its build does not compile it;
//   7. a file of the package that no graph can hold, its extension not that of a module (`.js`,
//      `.mjs`, `.cjs`, `.ts`, `.mts`, `.cts`, `.jsx`, `.tsx`, `.json`): data, a template, a
//      script of the shell, a document, which a test reads without importing it.
//   Vitest's own `forceRerunTriggers` (a configuration's, or its default) still apply, as with
//   `--changed`.
// - Otherwise the tests played are those Vitest relates to the files changed or added (`related`,
//   absolute), and the files a targeted run names themselves (./cibles.mjs) join them: a file named
//   plays, changed or not. A package where none relates plays none and passes
//   (`passWithNoTests`), as Vitest's `--changed` has it.
//
// This module's top level uses Node alone (./cibles.mjs, scripts/tests.mjs import it); a
// turbo.json is read with jsonc-parser, the frame's reader of JSON with comments, loaded then.
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CHANGEMENTS = 'GRILLHOUSE_CHANGEMENTS';
// This directory, the frame's base configuration.
const BASE = path.dirname(fileURLToPath(import.meta.url));
// The extension of a module, which a graph of Vitest can hold.
const MODULE = /\.(?:[cm]?[jt]sx?|json)$/;
// A test file, as Vitest's default `include` names one.
const TEST = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const DU_DEPOT = /^(?:package\.json|package-lock\.json|turbo\.jsonc?|tsconfig[^/]*\.json)$/;
const DU_PAQUET =
  /^(?:package\.json|(?:vitest|vite)\.config\.[^/]+|vitest\.workspace\.[^/]+|tsconfig[^/]*\.json)$/;
const CHAMPS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

const lireJson = f => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

// Whether the absolute path <f> lies under the directory <dir> (or is it).
const sous = (f, dir) => {
  const r = path.relative(dir, f);
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
};

// The changes the file at <chemin> holds, `{ racine, fichiers, supprimes }`; null when it does not
// read.
export function lireChangements(chemin) {
  const c = lireJson(chemin);
  const liste = l => Array.isArray(l) && l.every(x => typeof x === 'string');
  if (!c || typeof c.racine !== 'string' || !liste(c.fichiers) || !liste(c.supprimes)) return null;
  return c;
}

// The prefix of a pattern of Turborepo written from the top of the repository.
const DU_HAUT = '$TURBO_ROOT$/';

// The inputs of the `build` of the Turborepo configuration in <dir> (its <noms>, the first
// present): the patterns, an empty list when it names none or does not read.
function entreesDuBuild(dir, noms) {
  const f = noms.map(n => path.join(dir, n)).find(n => existsSync(n));
  if (!f) return [];
  try {
    const { parse } = createRequire(import.meta.url)('jsonc-parser');
    const inputs = parse(readFileSync(f, 'utf8'), [], { allowTrailingComma: true })?.tasks?.build
      ?.inputs;
    return Array.isArray(inputs) ? inputs.filter(m => typeof m === 'string') : [];
  } catch {
    return [];
  }
}

// Whether the build of the package at <d>, in the repository at <racine>, reads the file at the
// absolute path <a>, which lies in it (6 above).
function construit(racine, d, a) {
  const r = path.relative(d, a);
  if (TEST.test(r)) return false;
  const motifs = entreesDuBuild(d, ['turbo.json']).flatMap(m =>
    m === '$TURBO_EXTENDS$' ? entreesDuBuild(racine, ['turbo.json', 'turbo.jsonc']) : [m]
  );
  // <m> covers <rel>, `<x>/**` covering `<x>` as Turborepo has it.
  const couvre = (rel, m) =>
    path.matchesGlob(rel, m) || (m.endsWith('/**') && path.matchesGlob(rel, m.slice(0, -3)));
  const lu = m =>
    m === '$TURBO_DEFAULT$' ||
    (m.startsWith(DU_HAUT)
      ? couvre(path.relative(racine, a), m.slice(DU_HAUT.length))
      : couvre(r, m));
  if (motifs.some(m => m.startsWith('!') && lu(m.slice(1)))) return false;
  const positifs = motifs.filter(m => !m.startsWith('!'));
  if (positifs.length) return positifs.some(lu);
  return MODULE.test(r) && r.split(path.sep)[0] !== 'docs';
}

// The directories of the packages of the repository at <racine> that the package at <dossier>
// depends on, transitively, itself left out.
function dependances(racine, dossier) {
  const vus = new Set([dossier]);
  const out = [];
  const suivre = d => {
    const pkg = lireJson(path.join(d, 'package.json')) ?? {};
    const noms = new Set(CHAMPS.flatMap(c => Object.keys(pkg[c] ?? {})));
    for (const nom of noms) {
      for (let ici = d; sous(ici, racine); ici = path.dirname(ici)) {
        const lien = path.join(ici, 'node_modules', nom);
        if (!existsSync(lien)) {
          if (ici === racine) break;
          continue;
        }
        let reel;
        try {
          reel = realpathSync(lien);
        } catch {
          break;
        }
        const r = path.relative(racine, reel);
        if (sous(reel, racine) && !r.split(path.sep).includes('node_modules') && !vus.has(reel)) {
          vus.add(reel);
          out.push(reel);
          suivre(reel);
        }
        break;
      }
    }
  };
  suivre(dossier);
  return out;
}

// Why the package whose configuration's root is <dossier> plays whole under the changes <ch>, its
// test configuration <test>: `{ raison, fichier }`, the first change out of Vitest's graph (the
// path from the top of the repository); null when Vitest sees them all.
function paquetEntier(ch, dossier, test = {}) {
  const racine = ch.racine;
  const abs = f => path.join(racine, f);
  const deps = dependances(racine, dossier);
  const lit = (lireJson(path.join(dossier, 'package.json'))?.grillhouse?.lit ?? [])
    .filter(l => typeof l === 'string')
    .map(l => l.replace(/^\.\//, '').replace(/\/+$/, ''));
  const preparation = [test.setupFiles, test.globalSetup]
    .flat()
    .filter(f => typeof f === 'string')
    .map(f => path.resolve(dossier, f));
  for (const f of ch.supprimes) {
    const a = abs(f);
    if (sous(a, dossier) || deps.some(d => sous(a, d) && construit(racine, d, a))) {
      return { raison: 'un fichier supprimé, que le graphe des tests ne tient plus', fichier: f };
    }
  }
  for (const f of ch.fichiers) {
    const a = abs(f);
    const raison = sous(a, BASE)
      ? 'la configuration de base du cadre'
      : !f.includes('/') && DU_DEPOT.test(f)
        ? 'la configuration du dépôt'
        : path.dirname(a) === dossier && DU_PAQUET.test(path.basename(a))
          ? 'la configuration du paquet'
          : preparation.includes(a)
            ? 'un fichier de préparation des tests'
            : lit.some(l => f === l || f.startsWith(`${l}/`))
              ? 'un chemin que ses tests déclarent lire (grillhouse.lit)'
              : deps.some(d => sous(a, d) && construit(racine, d, a))
                ? 'le code d’un paquet dont il dépend, que ses tests lisent construit'
                : sous(a, dossier) && !MODULE.test(f)
                  ? 'un fichier qu’aucun module n’importe, qu’un test lit sans l’importer'
                  : null;
    if (raison) return { raison, fichier: f };
  }
  return null;
}

// Restricts the test configuration <test> of the package at <dossier> to the changes <ch>: the
// tests Vitest relates to them and the files <nommes> (absolute), or every test, when a change
// lies out of Vitest's graph; <dire> writes the line that says which.
export function restreindre(test, dossier, ch, nommes, dire) {
  const nom = path.relative(ch.racine, dossier) || '.';
  const entier = paquetEntier(ch, dossier, test);
  if (entier) {
    dire(`↳ ${nom} : tous ses tests, ${entier.raison} (${entier.fichier}).`);
    return;
  }
  test.related = [...new Set([...ch.fichiers.map(f => path.join(ch.racine, f)), ...nommes])];
  test.passWithNoTests = true;
  dire(
    `↳ ${nom} : les tests que Vitest relie aux ${ch.fichiers.length} fichier(s) changé(s) depuis le dernier vert.`
  );
}
