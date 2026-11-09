// The delay of each size of test, on the model of Bazel's test-encyclopedia (a delay per size; a
// test past it is killed) and of Vitest's `slowTestThreshold`.
//
// - The delay of a day test file is deduced from its size by the classification of the guard of
//   the sizes (`classer`, ../tailles-des-tests.mjs), the one address of the rule; the three delays
//   are written once, in ./bornes.mjs.
// - A file out of the day (a night test, a bench, a time witness) that a targeted run plays has the
//   large delay, whatever its text reads.
// - A setup file of the base configuration applies the delay of its file to each test file
//   (./delais.setup.mjs).
import { existsSync } from 'node:fs';
import path from 'node:path';
import { lesMatieres, classer } from '../tailles-des-tests.mjs';
import { DELAI_NUIT_MS, DELAIS_MS, libelleDuDelai } from './bornes.mjs';
import { estHorsDuJour } from './cibles.mjs';
import { lireLeDisque } from './lances.mjs';

export { DELAI_NUIT_MS, DELAIS_MS, libelleDuDelai };

const memoMatieres = new Map();
const matieresDe = racine => {
  if (!memoMatieres.has(racine)) {
    memoMatieres.set(racine, lesMatieres(racine));
  }
  return memoMatieres.get(racine);
};

/**
 * The delay of the test file <fichier> (absolute), read by <lire> in the repository at <racine>:
 * `{ taille, delai }`, `delai` in ms.
 */
export function delaisDuFichier(fichier, { lire, racine }) {
  const taille = estHorsDuJour(fichier)
    ? 'grand'
    : classer(fichier, lire, racine, matieresDe(racine)).taille;
  return { taille, delai: DELAIS_MS[taille] };
}

/** The settings Vitest applies to the test file <fichier>: its delay for a test and a hook. */
export function reglagesDuFichier(fichier, options) {
  const { delai } = delaisDuFichier(fichier, options);
  return { testTimeout: delai, hookTimeout: delai };
}

/** The root of the repository that holds <fichier>: the first directory above with a `.git`. */
export function racineDuDepot(fichier) {
  for (let d = path.dirname(fichier); ; d = path.dirname(d)) {
    if (existsSync(path.join(d, '.git'))) {
      return d;
    }
    if (path.dirname(d) === d) {
      return process.cwd();
    }
  }
}

/** The delay of <fichier> as the disk of its repository gives it. */
export function delaisSurLeDisque(fichier) {
  return delaisDuFichier(fichier, { lire: lireLeDisque, racine: racineDuDepot(fichier) });
}
