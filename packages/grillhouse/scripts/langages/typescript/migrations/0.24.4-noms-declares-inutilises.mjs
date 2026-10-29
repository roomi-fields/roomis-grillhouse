// From 0.24.4 the guard of the consumers refuses a declared name that no code of its consumer uses
// (`declare-non-utilise`, scripts/langages/typescript/consommateurs.mjs), which it only reported before, as ESLint's
// `no-unused-vars` refuses a name nothing uses. A project that updates holds such names already
// (BPScript: 26 names on 11 lines of 4 interfaces), and its main would turn red at its next pass
// without a word. As a codemod reports what it leaves, the update names them, and the command that
// inscribes them as the project's known debt, once, at the passage of the rule (dette.mjs, as
// ESLint's `--suppress-all`); in a ticket afterwards, the guard says to take the name out of its
// line.
//
// - The migration changes no file (`migrer` returns no line): the project decides between the
//   debt and the edit of its interfaces.
// - What stays to the project (`restes`): one line per line of a `## Consommateurs` section that
//   declares names its consumer does not use, beyond what `grillhouse-dette.json` already inscribes
//   (`juger` of dette.mjs), its interface, its consumer and those names; then the line of the
//   command, `npm run grillhouse:dette:inscrire`. Nothing once the debt holds them, or once the
//   names are gone.
import { juger, lire } from '../../../dette.mjs';
import { DECLARE_NON_UTILISE, verifier } from '../consommateurs.mjs';

export const version = '0.24.4';
export const nom = 'noms déclarés inutilisés';

/** The lines of the declared names the new rule refuses in the project at <projet>, and the command. */
export function restes(projet) {
  const constats = verifier(projet).refus.filter(r => r.regle === DECLARE_NON_UTILISE);
  const { refus } = juger(lire(projet), 'consommateurs', constats);
  if (refus.length === 0) {
    return [];
  }
  const parLigne = new Map();
  for (const r of refus) {
    const cle = `${r.fichier}\0${r.consommateur}`;
    parLigne.set(cle, [...(parLigne.get(cle) ?? []), r.nom]);
  }
  const lignes = [...parLigne].map(([cle, noms]) => {
    const [fichier, consommateur] = cle.split('\0');
    return `${fichier} § Consommateurs, \`${consommateur}\` : ${noms.join(', ')}, qu'aucun code de ${consommateur} n'utilise`;
  });
  return [
    ...lignes,
    `la garde des consommateurs refuse désormais ces ${refus.length} noms : \`npm run grillhouse:dette:inscrire\` les inscrit dans grillhouse-dette.json, la dette connue du projet, ou chaque nom sort de sa ligne`,
  ];
}

/** Changes nothing: the names are reported by `restes`. */
export function migrer() {
  return [];
}
