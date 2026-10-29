// From 0.25.0 the guard of the sizes of the tests (scripts/langages/typescript/tailles-des-tests.mjs) refuses a large
// test of the day, one that mounts a trial repository and starts the product or the frame there,
// as the test pyramid of Google keeps the large tests out of the day. A project that updates holds
// such tests already (2026-10-29: Grillhouse 70 of its 170 test files, BPScript 7 of its 1 079,
// all of 995-tools), and its main would turn
// red at its next pass. As ESLint's `--suppress-all` does once at the passage of a rule, the update
// inscribes them as the project's known debt (scripts/dette.mjs), frozen: the count never rises,
// a new large test of the day is refused, and its verification does not change that day.
//
// - The migration writes the section of the guard in `grillhouse-dette.json` when the guard finds a
//   large test of the day and the file holds no section of it yet; the rest of the debt stays.
// - It rewrites no test of the project: the project moves each one to the night (`*.nuit.test.*`)
//   or reduces it, and the debt comes down with it.
// - Replayable without effect: once the section is written, nothing (a debt lowered since never
//   rises again).
import { FICHIER, lire, trancher } from '../../../dette.mjs';
import { GARDE, verifier } from '../tailles-des-tests.mjs';

export const version = '0.25.0';
export const nom = 'tailles des tests';

/** Inscribes the large tests of the day of the project at <projet> in its debt; what it did. */
export function migrer(projet) {
  if (lire(projet)[GARDE]) return [];
  const constats = verifier(projet);
  if (constats.length === 0) return [];
  trancher(projet, GARDE, constats, 'inscrire', {});
  return [
    `${FICHIER} : ${constats.length} grand(s) test(s) de jour inscrit(s) dans la dette de ${GARDE}, gelée ; un grand test de jour neuf est refusé, et chacun passe à la nuit (*.nuit.test.*) ou se réduit`,
  ];
}
