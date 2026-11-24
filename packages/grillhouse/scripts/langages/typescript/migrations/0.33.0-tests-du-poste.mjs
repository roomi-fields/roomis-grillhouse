// The migration of the guard of the night tests of the poste
// (scripts/langages/typescript/tests-du-poste.mjs) for the night test that depends on the poste
// (the envelope, the real bd, a Temporal server, sccache, systemd, the keyring, the user's
// session, a session of claude) without the tag `@poste` at its head: it inscribes them as the
// project's known debt (scripts/dette.mjs), frozen: the count never rises and a new one is refused.
// Migrations: packages/grillhouse/docs/architecture/installation.md §5.4; the guard: tests.md §3.4.
//
// - The migration inscribes the findings of the guard that the debt does not hold yet; the debt
//   already inscribed (the guard's, the other guards') stays.
// - It rewrites no test of the project: the project tags each one (`// @poste: <raison>` at its
//   head), and the debt comes down with it.
// - Replayable without effect: once every finding is inscribed, nothing.
import { FICHIER, lire, trancher } from '../../../dette.mjs';
import { GARDE, verifier } from '../tests-du-poste.mjs';

export const version = '0.33.0';
export const nom = 'tests du poste';

/** Inscribes the night tests of the poste without the tag that the debt of <projet> lacks. */
export function migrer(projet) {
  const inscrite = lire(projet)[GARDE] ?? {};
  const constats = verifier(projet);
  const neufs = constats.filter(c => !inscrite[c.fichier]?.[c.regle]);
  if (neufs.length === 0) {
    return [];
  }
  trancher(projet, GARDE, constats, 'inscrire', {});
  return [
    `${FICHIER} : ${neufs.length} test(s) de nuit qui dépend(ent) du poste sans l'étiquette @poste inscrit(s) dans la dette de ${GARDE}, gelée ; un neuf est refusé, et chacun porte « // @poste: <raison> » en tête`,
  ];
}
