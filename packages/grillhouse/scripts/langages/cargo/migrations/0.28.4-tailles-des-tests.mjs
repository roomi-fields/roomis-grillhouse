// From 0.28.4 the guard of the sizes of the tests in Rust (scripts/langages/cargo/tailles-des-tests.mjs)
// refuses a large test of the day, one that mounts a trial repository and starts the product
// there, as the module typescript's guard does since 0.25.0. A project of cargo that updates may
// hold such tests already (SyntHub, OSC Bridge), and its main would turn red at its next pass. As
// the module typescript's migration (../../typescript/migrations/0.25.0-tailles-des-tests.mjs) and
// ESLint's `--suppress-all` do once at the passage of a rule, the update inscribes them as the
// project's known debt (scripts/dette.mjs), frozen: the count never rises, a new large test of the
// day is refused, and its verification does not change that day.
//
// - The migration writes the section of the guard in `grillhouse-dette.json` when the guard finds a
//   large test of the day and the file holds no section of it yet; the rest of the debt stays.
// - It rewrites no test of the project: the project moves each one to the night
//   (a module of `tests/it_nuit/`) or reduces it, and the debt comes down with it.
// - Replayable without effect: once the section is written, nothing (a debt lowered since never
//   rises again).
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
