// From 0.34.1 the cache of the lint and of the format check lives under `.cache-outils/`, a clean
// output of the module typescript, no longer under `node_modules/.cache/`: a session's envelope
// mounts `/` read-only and the `node_modules` of a copy is a link out of it, so ESLint and
// Prettier failed to write their cache there (EROFS). The migration moves it in a project.
//
// - In the `lint` and `format:check` scripts of `package.json`, the former path
//   (`node_modules/.cache/`) is replaced by the new one (`.cache-outils/`), wherever it falls;
//   every other byte of the file stays, and every other script is left.
// - One line per script rewritten; a project without `package.json`, or whose scripts lack the
//   former path, is left, nothing said.
// - Replayable without effect: once moved, nothing.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const version = '0.34.1';
export const nom = 'cache des outils';

const ANCIEN = 'node_modules/.cache/';
const NOUVEAU = '.cache-outils/';
const SCRIPTS = ['lint', 'format:check'];

/** Moves the cache path of the `lint` and `format:check` scripts of <projet>; returns its lines. */
export function migrer(projet) {
  const fichier = path.join(projet, 'package.json');
  if (!existsSync(fichier)) {
    return [];
  }
  let texte = readFileSync(fichier, 'utf8');
  const debut = texte.indexOf('"scripts"');
  if (debut === -1) {
    return [];
  }
  const lignes = [];
  for (const script of SCRIPTS) {
    const motif = new RegExp(`("${script}"\\s*:\\s*")((?:[^"\\\\]|\\\\.)*)(")`);
    const trouve = motif.exec(texte.slice(debut));
    if (!trouve || !trouve[2].includes(ANCIEN)) {
      continue;
    }
    const place = debut + trouve.index + trouve[1].length;
    texte =
      texte.slice(0, place) +
      trouve[2].replaceAll(ANCIEN, NOUVEAU) +
      texte.slice(place + trouve[2].length);
    lignes.push(
      `package.json : le cache du script ${script} passe de ${ANCIEN} à ${NOUVEAU}, une sortie propre de la séance`
    );
  }
  if (lignes.length > 0) {
    writeFileSync(fichier, texte);
  }
  return lignes;
}
