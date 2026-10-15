// The packages of a repository: the frame's one list of them, each marked out of the frame or not.
// The update of the frame (scripts/grillhouse-maj.mjs), the generator of the packages' turbo.json
// (scripts/turbo-des-paquets.mjs) and the targeted test runs (scripts/tests.mjs) read it.
//
// The packages are the directories holding a `package.json` that the `workspaces` of the root
// `package.json` select (an array, or its `packages` key), mapped as npm maps them
// (@npmcli/map-workspaces), read with Node's glob: a pattern « ! » takes out what the other
// patterns select, unless a later pattern it matches puts it back; `node_modules` is never a
// package. A repository without `workspaces` has none. A package is out of the frame when
// `docs/agents/hors-cadre.txt` (read by `horsCadre` of scripts/consommateurs.mjs) lists it: a
// directory under `packages/` or `src/`.
//
// This module and the ones it imports use Node alone: the update runs them from a source checkout
// of the frame that installs no dependency.
import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { horsCadre } from './consommateurs.mjs';

const lireJson = f => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};

// The packages of the repository at <racine>: [{ dossier, pkg, hors }], sorted by directory;
// `hors` whether `docs/agents/hors-cadre.txt` lists it (a directory under `packages/` or `src/`).
export function paquets(racine) {
  const p = lireJson(path.join(racine, 'package.json'));
  const declares = Array.isArray(p?.workspaces) ? p.workspaces : (p?.workspaces?.packages ?? []);
  const motifs = [];
  let nies = [];
  for (const brut of declares.map(String)) {
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
  const dossiers = new Set();
  for (const motif of motifs) {
    for (const f of globSync(`${motif}/package.json`, { cwd: racine })) {
      const dossier = path.dirname(f);
      if (f.split(path.sep).includes('node_modules')) continue;
      if (nies.some(n => path.matchesGlob(dossier, n))) continue;
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
