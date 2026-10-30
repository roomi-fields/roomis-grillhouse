// The packages of the plan of the envelope a command runs in. The envelope names them to every
// command of its session, in the variable `GRILLHOUSE_ENVELOPPE`: the list of the paths the plan
// names inside the copy (`packages/a`, or `src/parser` in a one-package project), joined by the
// separator of a list of paths (`path.delimiter`, as NODE_PATH and PATH join theirs). As the
// visibility of Bazel and the module boundaries of Nx refuse a dependency while the code stays
// readable, the session reads the whole copy and writes these packages only: a command of the
// frame that reads the list builds, judges and writes them alone.
//
// This module uses Node alone, as the modules of scripts/paquets.mjs.
import path from 'node:path';
import { paquets } from '../paquets.mjs';

export const VARIABLE = 'GRILLHOUSE_ENVELOPPE';
// The file the lock of a session leaves in its working directory when it stops the session on a
// write out of the plan (scripts/verrous/verrou.mjs); the launcher hands it to the circuit as
// `<copie>.hors-plan` (scripts/enveloppe/lancer.sh).
export const MARQUE_HORS_PLAN = 'hors-plan';

// The list <paquets> as the variable carries it.
export const ecrireLaListe = paquets => paquets.join(path.delimiter);

// The list the text <texte> of the variable carries.
export const lireLaListe = texte =>
  String(texte ?? '')
    .split(path.delimiter)
    .filter(Boolean);

// The packages of the plan of the envelope named in <env>, or null outside an envelope.
export const paquetsDeLEnveloppe = (env = process.env) =>
  env[VARIABLE] ? lireLaListe(env[VARIABLE]) : null;

/**
 * The components of the copy <copie>, as the module of its language <langage> gives them
 * (`composants`, scripts/jointure.d.ts), and the packages out of the frame
 * (`docs/agents/hors-cadre.txt`, `paquets` of scripts/paquets.mjs), which no module counts but a
 * plan may name, in the form the plan reads: each `dossier` relative to the copy (`.` for a
 * component at its root, as a crate whose workspace is its own), its `pkg.name` the package's
 * name, else the component's, `hors` whether it is out of the frame.
 * @param {{ composants(racine: string): { dossier: string, nom: string, paquet: string | null }[] }} langage
 * @param {string} copie
 * @returns {{ dossier: string, pkg: { name: string }, hors: boolean }[]}
 */
export function paquetsDuLangage(langage, copie) {
  const composants = langage.composants(copie).map(c => ({
    dossier: path.relative(copie, c.dossier) || '.',
    pkg: { name: c.paquet ?? c.nom },
    hors: false,
  }));
  const connus = new Set(composants.map(c => c.dossier));
  const hors = paquets(copie)
    .filter(p => p.hors && !connus.has(p.dossier))
    .map(p => ({
      dossier: p.dossier,
      pkg: { name: p.pkg?.name ?? path.basename(p.dossier) },
      hors: true,
    }));
  return [...composants, ...hors];
}

// The directory of the component of <paquetsDeLaCopie> (`paquetsDuLangage`, each `dossier`
// relative to the copy) that holds the path <chemin> of the copy, the deepest; `.`, the
// root, when none holds it.
export function paquetQuiTient(chemin, paquetsDeLaCopie) {
  const rel = path.normalize(chemin).replace(/\/+$/, '');
  const tenants = paquetsDeLaCopie
    .map(p => path.normalize(p.dossier))
    .filter(d => rel === d || rel.startsWith(`${d}/`));
  return tenants.sort((a, b) => b.length - a.length)[0] ?? '.';
}

// The directories, relative to the copy, that the plan <paquets> writes, sorted: for each path of
// the plan, the package that holds it (`paquetQuiTient`). A path that no package holds (a folder of
// the root, `scripts`; `src/parser` in a one-package project; `.`) writes the package that holds
// it, the root: the plan then writes the whole copy, `['.']`.
export function ecritsDuPlan(paquets, paquetsDeLaCopie) {
  const ecrits = [...new Set(paquets.map(p => paquetQuiTient(p, paquetsDeLaCopie)))].sort();
  return ecrits.includes('.') ? ['.'] : ecrits;
}
