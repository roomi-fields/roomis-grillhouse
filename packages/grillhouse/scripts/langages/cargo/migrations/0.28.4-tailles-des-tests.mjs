// The migration of the guard of the sizes of the tests in Rust (../tailles-des-tests.mjs): the
// large tests of the day a project of cargo holds when the guard arrives are inscribed as the
// project's known debt (scripts/dette.mjs), frozen, as ESLint's `--suppress-all` does at the
// passage of a rule and as the module typescript's migration does
// (../../typescript/migrations/0.25.0-tailles-des-tests.mjs): the count never rises, a new large
// test of the day is refused.
//
// - The migration writes the section of the guard in `grillhouse-dette.json` when the guard finds a
//   large test of the day and the file holds no section of it yet; the rest of the debt stays.
// - It rewrites no test of the project: the project moves each one to the night
//   (a module of `tests/it_nuit/`) or reduces it, and the debt comes down with it.
// - Replayable without effect: once the section is written, nothing (a debt lowered since never
//   rises again).
//
// Mechanism: packages/grillhouse/docs/architecture/tests.md §3.3 (the modules of language), §3.4 (the guards).
import { FICHIER, lire, trancher } from '../../../dette.mjs';
import { GARDE, verifier } from '../tailles-des-tests.mjs';

export const version = '0.28.4';
export const nom = 'tailles des tests';

/** Inscribes the large tests of the day of the project at <projet> in its debt; what it did. */
export function migrer(projet) {
  if (lire(projet)[GARDE]) {
    return [];
  }
  const constats = verifier(projet);
  if (constats.length === 0) {
    return [];
  }
  trancher(projet, GARDE, constats, 'inscrire', {});
  return [
    `${FICHIER} : ${constats.length} grand(s) test(s) de jour inscrit(s) dans la dette de ${GARDE}, gelée ; un grand test de jour neuf est refusé, et chacun passe à la nuit (un module de tests/it_nuit/) ou se réduit`,
  ];
}
