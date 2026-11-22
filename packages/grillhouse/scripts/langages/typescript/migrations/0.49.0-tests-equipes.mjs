// From 0.49.0 the guard of the night tests of the poste (scripts/langages/typescript/tests-du-poste.mjs)
// asks the tag `@equipee` of a night test that needs the equipment of a machine (the envelope, a
// Temporal server, sccache, the binaries of the module cargo), and `@poste` stays for what only the
// poste has (the real bd, systemd, the keyring, the user's session, a session of claude). A project
// whose night tests need equipment without the tag would turn red at its next pass; the update
// inscribes them as the project's known debt (scripts/dette.mjs), frozen: the count never rises and
// a new one is refused.
//
// - The migration inscribes the findings of the guard that the debt does not hold yet; the debt
//   already inscribed (the guard's, the other guards') stays.
// - It rewrites no test of the project: the project tags each one (`// @equipee: <raison>` at its
//   head), and the debt comes down with it.
// - Replayable without effect: once every finding is inscribed, nothing.
import { FICHIER, lire, trancher } from '../../../dette.mjs';
import { GARDE, verifier } from '../tests-du-poste.mjs';

export const version = '0.49.0';
export const nom = 'tests equipes';

/** Inscribes the night tests of equipment without the tag that the debt of <projet> lacks. */
export function migrer(projet) {
  const inscrite = lire(projet)[GARDE] ?? {};
  const constats = verifier(projet);
  const neufs = constats.filter(c => !inscrite[c.fichier]?.[c.regle]);
  if (neufs.length === 0) {
    return [];
  }
  trancher(projet, GARDE, constats, 'inscrire', {});
  return [
    `${FICHIER} : ${neufs.length} test(s) de nuit qui exige(nt) l'équipement d'une machine sans l'étiquette @equipee inscrit(s) dans la dette de ${GARDE}, gelée ; un neuf est refusé, et chacun porte « // @equipee: <raison> » en tête`,
  ];
}
