// The packages of a repository: the frame's one list of them, each marked out of the frame or not.
// The update of the frame (scripts/grillhouse-maj.mjs), the generator of the packages' turbo.json
// (scripts/langages/typescript/turbo-des-paquets.mjs) and the targeted test runs (scripts/langages/typescript/tests.mjs) read it.
//
// The packages are the directories holding a `package.json` that the `workspaces` of the root
// `package.json` select (an array, or its `packages` key), mapped as npm maps them
// (@npmcli/map-workspaces), read with Node's glob: a pattern « ! » takes out what the other
// patterns select, unless a later pattern it matches puts it back; `node_modules` is never a
// package. A repository without `workspaces` has none. A package is out of the frame when
// `docs/agents/hors-cadre.txt` (read by `horsCadre`, below) lists it: a directory under
// `packages/` or `src/`.
//
// This module and the ones it imports use Node alone: the update runs them from a source checkout
// of the frame that installs no dependency.
//
// A project's guard imports `horsCadre` by the package's entry `@roomi-fields/grillhouse/paquets`,
// its types in ./paquets.d.ts (docs/ARCHITECTURE.md, the package's named entries).
import { existsSync, globSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** The code of `src/` (the root's, or a package's under `packages/`), as a pattern of a path from
 * the root: what a project publishes, out of its tests. */
export const CODE = '^src/|^packages/[^/]+/src/';
/** The script of a package that types it, which the verification plays in each package. */
export const TYPAGE = 'typecheck';

// The list of the packages out of the frame: one line per package, « <package> <reason> », its
// first word the name of a directory under `packages/` or `src/`; a blank line or a line starting
// with `#` names nothing.
const HORS_CADRE = 'docs/agents/hors-cadre.txt';

// The names listed in <racine>'s `docs/agents/hors-cadre.txt`: a Set, empty without the file.
export function horsCadre(racine) {
  const liste = path.join(racine, HORS_CADRE);
  if (!existsSync(liste)) {
    return new Set();
  }
  const noms = new Set();
  for (const ligne of readFileSync(liste, 'utf8').split('\n')) {
    const mot = ligne.trim().split(/\s+/)[0];
    if (mot && !mot.startsWith('#')) {
      noms.add(mot);
    }
  }
  return noms;
}

// The names of <racine>'s `docs/agents/hors-cadre.txt` that no directory under `packages/` or
// `src/` bears, in the order of the list: a line the session start names (a typo names nothing).
export function horsCadreInconnus(racine) {
  const presents = new Set(
    ['packages', 'src'].flatMap(parent => {
      const base = path.join(racine, parent);
      return existsSync(base)
        ? readdirSync(base, { withFileTypes: true })
            .filter(e => e.isDirectory())
            .map(e => e.name)
        : [];
    })
  );
  return [...horsCadre(racine)].filter(nom => !presents.has(nom));
}

const lireJson = f => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

/**
 * The patterns of the `workspaces` of the root `package.json` <p> (an array, or its `packages` key):
 * `{ declares, motifs, nies }`, the patterns as written, those that select, and those that take out
 * what the others select, none put back by a later pattern.
 * @param {Record<string, any> | null} p
 */
export function motifsDesEspaces(p) {
  const declares = (
    Array.isArray(p?.workspaces) ? p.workspaces : (p?.workspaces?.packages ?? [])
  ).map(String);
  const motifs = [];
  let nies = [];
  for (const brut of declares) {
    const excl = /^!+/.exec(brut)?.[0] ?? '';
    const motif = brut
      .slice(excl.length)
      .replace(/^\.?\/+/, '')
      .replace(/\/$/, '');
    if (excl.length % 2 === 1) {
      nies.push(motif);
    } else {
      // A pattern puts back what an earlier negation it matches took out.
      nies = nies.filter(n => !path.matchesGlob(motif, n));
      motifs.push(motif);
    }
  }
  return { declares, motifs, nies };
}

/**
 * Whether the `workspaces` of the root `package.json` <p> select the directory <dossier> (from the
 * root), as `paquets` maps them, whether or not it holds its package.json yet.
 * @param {Record<string, any> | null} p
 * @param {string} dossier
 */
export function selectionne(p, dossier) {
  const { motifs, nies } = motifsDesEspaces(p);
  return (
    !dossier.split('/').includes('node_modules') &&
    motifs.some(m => path.matchesGlob(dossier, m)) &&
    !nies.some(n => path.matchesGlob(dossier, n))
  );
}

// The packages of the repository at <racine>: [{ dossier, pkg, hors }], sorted by directory;
// `hors` whether `docs/agents/hors-cadre.txt` lists it (a directory under `packages/` or `src/`).
export function paquets(racine) {
  const p = lireJson(path.join(racine, 'package.json'));
  const { motifs, nies } = motifsDesEspaces(p);
  const dossiers = new Set();
  for (const motif of motifs) {
    for (const f of globSync(`${motif}/package.json`, { cwd: racine })) {
      const dossier = path.dirname(f);
      if (f.split(path.sep).includes('node_modules')) {
        continue;
      }
      if (nies.some(n => path.matchesGlob(dossier, n))) {
        continue;
      }
      dossiers.add(dossier);
    }
  }
  const listes = dossiers.size ? horsCadre(racine) : new Set();
  return [...dossiers].sort().map(dossier => ({
    dossier,
    pkg: lireJson(path.join(racine, dossier, 'package.json')) ?? {},
    hors: ['packages', 'src'].includes(path.dirname(dossier)) && listes.has(path.basename(dossier)),
  }));
}
