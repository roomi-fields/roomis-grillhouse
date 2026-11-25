// The stand-in programs of the tests: an executable put in place, then launched at once.
import { mkdirSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const LANCEUR = path.join(__dirname, 'faux-programme.sh');

/**
 * Puts the program <chemin> (an absolute path) with the text <texte>, which starts with its `#!`
 * line. The file the system executes is never opened for writing: <chemin> is a link to a program
 * of the repository, which hands the text, kept in `.textes/` beside it, to its interpreter. A
 * written executable gives ETXTBSY when launched while the child a parallel test starts from
 * another thread still holds its descriptor, between its `fork` and its `exec`. The text and the
 * link each take their name by renaming.
 */
export function poserLeFauxProgramme(chemin: string, texte: string): void {
  const textes = path.join(path.dirname(chemin), '.textes');
  mkdirSync(textes, { recursive: true });
  const provisoire = path.join(textes, `${path.basename(chemin)}.provisoire`);
  writeFileSync(provisoire, texte);
  renameSync(provisoire, path.join(textes, path.basename(chemin)));
  symlinkSync(LANCEUR, provisoire);
  renameSync(provisoire, chemin);
}
