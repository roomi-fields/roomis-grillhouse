// The components of a repository of the module typescript and its packages of the shared test
// material: one reading, without a line `#!`, that ./consommateurs.mjs (the guard, which the entry
// `@roomi-fields/grillhouse/consommateurs` publishes) and the Vitest configuration of the frame
// (./vitest-config/lances.mjs, which Vite bundles and whose parser refuses a `#!` out of the first
// file) both import.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { horsCadre } from '../../paquets.mjs';

// Every directory under `packages/` and `src/` of the repository at <racine>: [{ nom, dir }].
function tousDossiers(racine) {
  const found = [];
  for (const parent of ['packages', 'src']) {
    const base = path.join(racine, parent);
    if (!existsSync(base)) continue;
    for (const e of readdirSync(base, { withFileTypes: true })) {
      if (e.isDirectory()) found.push({ nom: e.name, dir: path.join(base, e.name) });
    }
  }
  return found;
}

// The component directories of the repository at <racine>: [{ nom, dir }], each directory under
// `packages/` and `src/` that `docs/agents/hors-cadre.txt` does not list.
export function dossiers(racine) {
  const hors = horsCadre(racine);
  return tousDossiers(racine).filter(d => !hors.has(d.nom));
}

// The components of the repository at <racine>: [{ nom, dir, paquet }], `paquet` its package name.
// Throws when a package.json is unreadable.
export function composants(racine) {
  return dossiers(racine).map(({ nom, dir }) => {
    const pj = path.join(dir, 'package.json');
    const paquet = existsSync(pj) ? (JSON.parse(readFileSync(pj, 'utf8')).name ?? null) : null;
    return { nom, dir, paquet };
  });
}

// The subpath export by which a component publishes the shared test material.
const EXPORT_MATIERE = './test-fixtures';

// The components of <racine> whose `package.json` exports `./test-fixtures`, in any form of its
// value, a package out of the frame never one: the packages of the shared test material,
// [{ nom, dir, paquet }] as `composants` gives.
// A component whose `package.json` is unreadable is not a package of the material.
export function matieres(racine) {
  const found = [];
  for (const { nom, dir } of dossiers(racine)) {
    const pj = path.join(dir, 'package.json');
    if (!existsSync(pj)) continue;
    let paquet;
    try {
      paquet = JSON.parse(readFileSync(pj, 'utf8'));
    } catch {
      continue;
    }
    const { exports } = paquet ?? {};
    if (exports !== null && typeof exports === 'object' && EXPORT_MATIERE in exports) {
      found.push({ nom, dir, paquet: paquet.name ?? null });
    }
  }
  return found;
}
