// The migration of the guard of the executables of tests in Rust (../executables-de-tests.mjs):
// the crates with more than one executable of integration tests of a moment (the day, the night,
// the benches) a project of cargo holds when the guard arrives are inscribed as the project's
// known debt (scripts/dette.mjs), frozen, as the migration of the sizes
// (./0.28.4-tailles-des-tests.mjs) does: the count never rises, a new executable is refused.
//
// - The migration writes the section of the guard in `grillhouse-dette.json` when the guard finds
//   an executable too many and the file holds no section of it yet; the rest of the debt stays.
// - It moves no test of the project: the project gathers its files as modules of `tests/it/`
//   (`tests/it_nuit/`, `tests/it_budget/`), and the debt comes down with it.
// - Replayable without effect: once the section is written, nothing (a debt lowered since never
//   rises again).
//
// Mechanism: packages/grillhouse/docs/architecture/tests.md §3.3 (the modules of language), §3.4 (the guards).
import { FICHIER, lire, trancher } from '../../../dette.mjs';
import { GARDE, verifier } from '../executables-de-tests.mjs';

export const version = '0.34.0';
export const nom = 'executables de tests';

/** Inscribes the executables of tests too many of the project at <projet> in its debt; what it did. */
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
    `${FICHIER} : ${constats.length} exécutable(s) de tests de trop inscrit(s) dans la dette de ${GARDE}, gelée ; un exécutable neuf est refusé, et chaque fichier de tests devient un module de tests/it/ (tests/it_nuit/, tests/it_budget/)`,
  ];
}
