// What the guards of clang share (./clang-format.mjs, ./clang-tidy.mjs): the C files of a package,
// and the refusal of a tool or a file that lacks, in one line.
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { trouverDansLePath } from '../../services-du-noyau.mjs';

/** The `.c` (and `.h` when <avecEntetes>) of <dossier>, as paths from <racine>, sorted. */
export function fichiersC(racine, dossier, avecEntetes) {
  const motif = avecEntetes ? /\.[ch]$/ : /\.c$/;
  const out = [];
  const lire = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!e.name.startsWith('.')) {
          lire(path.join(d, e.name));
        }
      } else if (motif.test(e.name)) {
        out.push(path.relative(racine, path.join(d, e.name)).split(path.sep).join('/'));
      }
    }
  };
  lire(dossier);
  return out.sort();
}

/**
 * The line that refuses a tool of <outils> the PATH of <env> lacks, or a configuration file of
 * <dossier> that lacks; null when all are there.
 */
export function manque(outils, dossier, fichier, env) {
  const absent = outils.find(o => trouverDansLePath(o, env) === null);
  if (absent) {
    const aide = absent.startsWith('clang-')
      ? ' : installe-le par `npx grillhouse binaires`'
      : ' : le poste exige CMake';
    return `⛔ ${absent} absent du PATH${aide}.`;
  }
  if (!existsSync(path.join(dossier, fichier))) {
    return `⛔ ${path.basename(dossier)}/${fichier} absent : le paquet écrit sa configuration (le squelette de \`grillhouse paquet\` la pose).`;
  }
  return null;
}
