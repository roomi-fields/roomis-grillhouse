// From 0.30.0 the guard of the sizes of the tests (scripts/langages/typescript/tailles-des-tests.mjs)
// also sees large a test that mounts a temporary directory and starts a heavy tool of the product
// there (turbo, vitest, knip, depcruise, api-extractor), with a `cwd:`; the tests it classed medium
// become large tests of the day, and the main of a project that updates would turn red at its next
// pass. As the migration 0.25.0 does for the first rule, the update inscribes them as the project's
// known debt (scripts/dette.mjs), frozen: the count never rises and a new large test of the day is
// refused.
//
// - The migration inscribes the large tests of the day the guard finds that the debt does not hold
//   yet; the debt already inscribed (the guard's, the other guards') stays.
// - It rewrites no test of the project: the project moves each one to the night (`*.nuit.test.*`)
//   or reduces it, and the debt comes down with it.
// - Replayable without effect: once every finding is inscribed, nothing.
import { FICHIER, lire, trancher } from '../../../dette.mjs';
import { GARDE, verifier } from '../tailles-des-tests.mjs';

export const version = '0.30.0';
export const nom = 'tailles des outils lourds';

/** Inscribes the large tests of the day the debt of the project at <projet> lacks; what it did. */
export function migrer(projet) {
  const inscrite = lire(projet)[GARDE] ?? {};
  const constats = verifier(projet);
  const neufs = constats.filter(c => !inscrite[c.fichier]?.[c.regle]);
  if (neufs.length === 0) {
    return [];
  }
  // Inscribed counts stay; a finding without key is added at its count.
  trancher(projet, GARDE, constats, 'inscrire', {});
  return [
    `${FICHIER} : ${neufs.length} grand(s) test(s) de jour inscrit(s) dans la dette de ${GARDE}, gelée ; un grand test de jour neuf est refusé, et chacun passe à la nuit (*.nuit.test.*) ou se réduit`,
  ];
}
