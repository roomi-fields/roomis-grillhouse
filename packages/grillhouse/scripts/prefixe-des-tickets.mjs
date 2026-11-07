// The prefix of the tickets of a project, in the key `issue-prefix` of its committed
// `.beads/config.yaml`, the one place a CI reads it (it has no `bd`): the guard of the titles of the
// tests reads it there (scripts/langages/typescript/titres-de-tests.mjs). `bd init` writes the key
// commented out and keeps the prefix in its database, so the frame writes the key itself, by one
// function: the preparation of a new project (./preparation.mjs) and the update of a project
// (the migration 0.30.0 « préfixe des tickets »).
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const CONFIG_BEADS = '.beads/config.yaml';

// The key `issue-prefix`, not commented out, and one written empty.
const CLE = /^issue-prefix:\s*(?:"([^"]*)"|'([^']*)'|([^\s#]+))\s*(?:#.*)?$/m;
const CLE_VIDE = /^issue-prefix:\s*(?:""|'')?\s*(?:#.*)?$/m;
// The value of the key in <texte>, '' without one.
const valeurDe = texte => {
  const m = CLE.exec(texte);
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : '';
};

/**
 * The prefix of the tickets of the repository at <racine>, read from the key `issue-prefix` of its
 * committed file of Beads, never from `bd` (absent in a CI). Throws an error that names the file or
 * the key when it is missing, so that nothing is counted by halves.
 * @param {string} racine
 * @returns {string}
 */
export function prefixe(racine) {
  let texte;
  try {
    texte = readFileSync(path.join(racine, CONFIG_BEADS), 'utf8');
  } catch {
    throw new Error(
      `${CONFIG_BEADS} manque : le préfixe des tickets s'y lit (clé \`issue-prefix\`), jamais par bd.`
    );
  }
  const valeur = valeurDe(texte);
  if (!valeur) {
    throw new Error(
      `${CONFIG_BEADS} n'a pas la clé \`issue-prefix\` (une ligne commentée n'est pas la clé) : le préfixe des tickets s'y lit.`
    );
  }
  return valeur;
}

/**
 * Writes the key `issue-prefix: "<valeur>"` in the `.beads/config.yaml` of the repository at
 * <racine>, which exists: a key written empty is replaced, an absent one added at the end; a key
 * that already holds a value is left. Returns the line written, or null when nothing was written.
 * @param {string} racine
 * @param {string} valeur
 * @returns {string | null}
 */
export function ecrireLePrefixe(racine, valeur) {
  const f = path.join(racine, CONFIG_BEADS);
  const texte = readFileSync(f, 'utf8');
  if (valeurDe(texte)) {
    return null;
  }
  const ligne = `issue-prefix: "${valeur}"`;
  writeFileSync(
    f,
    CLE_VIDE.test(texte)
      ? texte.replace(CLE_VIDE, ligne)
      : `${texte}${texte.endsWith('\n') || texte === '' ? '' : '\n'}${ligne}\n`
  );
  return ligne;
}
