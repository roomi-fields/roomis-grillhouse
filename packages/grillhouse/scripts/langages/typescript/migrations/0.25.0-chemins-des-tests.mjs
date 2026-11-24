// The migration of the guard of the paths of the tests
// (scripts/langages/typescript/chemins-des-tests.mjs): it inscribes the tests that name a module of
// their package by a path the frame cannot read as the project's known debt (scripts/dette.mjs),
// frozen: the count never rises and a new one is refused. Migrations:
// packages/grillhouse/docs/architecture/installation.md §5.4; the guard: tests.md §3.4.
//
// - The migration writes the section of the guard in `grillhouse-dette.json` when the guard finds
//   one and the file holds no section of it yet; the rest of the debt stays.
// - It rewrites no test of the project.
// - Replayable without effect: once the section is written, nothing.
import { FICHIER, lire, trancher } from '../../../dette.mjs';
import { GARDE, verifier } from '../chemins-des-tests.mjs';

export const version = '0.25.0';
export const nom = 'chemins des tests';

/** Inscribes the paths the tests of the project at <projet> name undeclared; what it did. */
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
    `${FICHIER} : ${constats.length} chemin(s) qu'un test nomme sans que le cadre le lise, inscrit(s) dans la dette de ${GARDE}, gelée ; un neuf est refusé, et chaque test écrit le chemin entier`,
  ];
}
