// From 0.24.6 the guard of the consumers refuses a bullet of a `## Consommateurs` section that is
// no list of names (`ligne-mal-formee`, scripts/langages/typescript/consommateurs.mjs): one form only,
// ``- `consommateur` : nom, nom``, each name a JavaScript identifier or `*`. Before, the text after
// « : » was cut at its commas, and a bullet of prose gave « names » that are none, or was passed
// over without « : » (BPScript 990-corpus/docs/INTERFACE.md:274-289, at 0.24.5). A project that updates may hold such lines, and its
// main would turn red at its next pass without a word. As the update of 0.24.4 names its unused
// names, the update names these lines, and the command that inscribes them as the project's known
// debt, once, at the passage of the rule (dette.mjs, as ESLint's `--suppress-all`); in a ticket
// afterwards, the guard says to write the line as a list of names.
//
// - The migration changes no file (`migrer` returns no line): the project decides between the
//   debt and the edit of its interfaces.
// - What stays to the project (`restes`): one line per bullet of prose of a `## Consommateurs`
//   section, beyond what `grillhouse-dette.json` already inscribes (`juger` of dette.mjs), its
//   interface and the bullet; then the line of the command,
//   `npm run grillhouse:dette:inscrire`. Nothing once the debt holds them, or once each line is a
//   list of names.
import { juger, lire } from '../../../dette.mjs';
import { LIGNE_MAL_FORMEE, verifier } from '../consommateurs.mjs';

export const version = '0.24.6';
export const nom = 'lignes de consommateurs mal formées';

/** The lines of prose the new rule refuses in the project at <projet>, and the command. */
export function restes(projet) {
  const constats = verifier(projet).refus.filter(r => r.regle === LIGNE_MAL_FORMEE);
  const { refus } = juger(lire(projet), 'consommateurs', constats);
  if (refus.length === 0) {
    return [];
  }
  return [
    ...refus.map(r => `${r.fichier} § Consommateurs : « ${r.texte} » n'est pas une liste de noms`),
    `la garde des consommateurs refuse désormais ces lignes (${refus.length} en tout) : \`npm run grillhouse:dette:inscrire\` les inscrit dans grillhouse-dette.json, la dette connue du projet, ou chaque ligne s’écrit en liste de noms (- \`consommateur\` : nom, nom)`,
  ];
}

/** Changes nothing: the lines are reported by `restes`. */
export function migrer() {
  return [];
}
