// From 0.25.0 the guard of the paths of the tests (scripts/langages/typescript/chemins-des-tests.mjs)
// refuses a test that names a module of its package by a path the frame cannot read, which a pass
// measured against the last green would not play when that module changes (2026-10-30: 11 in
// BPScript). As ESLint's `--suppress-all` does once at the passage of a rule, the update inscribes
// them as the project's known debt (scripts/dette.mjs), frozen: the count never rises, a new one
// is refused, and its verification does not change that day.
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
  if (lire(projet)[GARDE]) return [];
  const constats = verifier(projet);
  if (constats.length === 0) return [];
  trancher(projet, GARDE, constats, 'inscrire', {});
  return [
    `${FICHIER} : ${constats.length} chemin(s) qu'un test nomme sans que le cadre le lise, inscrit(s) dans la dette de ${GARDE}, gelée ; un neuf est refusé, et chaque test écrit le chemin entier`,
  ];
}
