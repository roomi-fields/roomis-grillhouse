// From 0.33.0 the guard of the sizes of the tests (scripts/langages/typescript/tailles-des-tests.mjs)
// also refuses a test of the day that starts the frame's command (its binary, or a script of its
// `bin/` or `scripts/`) out of the zone of the end-to-end tests (a directory `e2e/`): a test of
// the day validates the code by importing it. A project whose tests start it would turn red at its
// next pass; as the migration 0.30.0 does for the heavy tools, the update inscribes them as the
// project's known debt (scripts/dette.mjs), frozen: the count never rises and a new one is refused.
//
// - The migration inscribes the findings of the guard that the debt does not hold yet; the debt
//   already inscribed (the guard's, the other guards') stays.
// - It rewrites no test of the project: the project makes each one import what it proves, or moves
//   it under a directory `e2e/`, and the debt comes down with it.
// - Replayable without effect: once every finding is inscribed, nothing.
import { FICHIER, lire, trancher } from '../../../dette.mjs';
import { BINAIRE_DE_JOUR, GARDE, verifier } from '../tailles-des-tests.mjs';

export const version = '0.33.0';
export const nom = 'binaire de jour';

/** Inscribes the tests of the day that start the frame's command the debt of <projet> lacks. */
export function migrer(projet) {
  const inscrite = lire(projet)[GARDE] ?? {};
  const constats = verifier(projet);
  const neufs = constats.filter(
    c => c.regle === BINAIRE_DE_JOUR && !inscrite[c.fichier]?.[c.regle]
  );
  if (neufs.length === 0) {
    return [];
  }
  // Inscribed counts stay; a finding without key is added at its count.
  trancher(projet, GARDE, constats, 'inscrire', {});
  return [
    `${FICHIER} : ${neufs.length} test(s) de jour qui lance(nt) la commande grillhouse inscrit(s) dans la dette de ${GARDE}, gelée ; un neuf est refusé, et chacun importe ce qu'il prouve ou passe sous un dossier e2e/`,
  ];
}
