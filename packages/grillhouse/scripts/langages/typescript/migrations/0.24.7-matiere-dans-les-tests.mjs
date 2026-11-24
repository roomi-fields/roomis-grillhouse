// The migration of the guard of the consumers (scripts/langages/typescript/consommateurs.mjs) for
// the uses of a package of the shared test material in the tests of its consumers: a test that
// imports a name of the material its interface does not declare is refused (`usage-non-declare`),
// as production code is. It names these uses, and the command that inscribes them as the
// project's known debt (dette.mjs). Migrations: packages/grillhouse/docs/architecture/installation.md
// §5.4; the guard: tests.md §3.4.
//
// - The migration changes no file (`migrer` returns no line): the project decides between the
//   debt and the edit of its interfaces.
// - What stays to the project (`restes`): one line per use no interface declares, beyond what
//   `grillhouse-dette.json` already inscribes (`juger` of dette.mjs), the guard's message; then the
//   line of the command, `npm run grillhouse:dette:inscrire`. Nothing once the debt holds them, or
//   once each name is declared.
import { juger, lire } from '../../../dette.mjs';
import { verifier } from '../consommateurs.mjs';

export const version = '0.24.7';
export const nom = 'matière de test lue dans les tests';

/** The uses no interface declares in the project at <projet>, and the command. */
export function restes(projet) {
  const constats = verifier(projet).refus.filter(r => r.regle === 'usage-non-declare');
  const { refus } = juger(lire(projet), 'consommateurs', constats);
  if (refus.length === 0) {
    return [];
  }
  return [
    ...refus.map(r => r.message),
    `la garde des consommateurs lit désormais les usages de la matière de test dans les tests de ses consommateurs, et refuse ces usages non déclarés (${refus.length} en tout) : \`npm run grillhouse:dette:inscrire\` les inscrit dans grillhouse-dette.json, la dette connue du projet, ou chaque nom entre dans sa ligne (- \`consommateur\` : nom, nom)`,
  ];
}

/** Changes nothing: the uses are reported by `restes`. */
export function migrer() {
  return [];
}
