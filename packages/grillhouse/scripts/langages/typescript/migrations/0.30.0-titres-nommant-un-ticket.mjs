// From 0.30.0 the guard of the titles of the tests (scripts/langages/typescript/titres-de-tests.mjs)
// refuses a test file whose titles name a ticket or a « critère N » beyond its debt; the titles a
// project already has would turn its main red at its next pass. As the migration of the large
// tests of the day does (./0.30.0-tailles-des-outils-lourds.mjs), the update inscribes them as the
// project's known debt (scripts/dette.mjs), frozen: the count never rises, and each title renamed
// by its behaviour lowers it.
//
// - It plays after the migration of the prefix of the tickets (./0.30.0-prefixe-des-tickets.mjs),
//   whose key it reads; without the key it inscribes nothing, and the guard names the key.
// - The migration inscribes the files the debt does not hold yet; the debt already inscribed (the
//   guard's, the other guards') stays.
// - It rewrites no test of the project.
// - Replayable without effect: once every finding is inscribed, nothing.
import { FICHIER, lire, trancher } from '../../../dette.mjs';
import { prefixe } from '../../../services-du-noyau.mjs';
import { GARDE, verifier } from '../titres-de-tests.mjs';

export const version = '0.30.0';
export const nom = 'titres nommant un ticket';

/** Inscribes the titles naming a ticket that the debt of the project at <projet> lacks; what it did. */
export function migrer(projet) {
  let pref;
  try {
    pref = prefixe(projet);
  } catch {
    return [];
  }
  const inscrite = lire(projet)[GARDE] ?? {};
  const constats = verifier(projet, pref);
  const neufs = constats.filter(c => !inscrite[c.fichier]?.[c.regle]);
  if (neufs.length === 0) {
    return [];
  }
  trancher(projet, GARDE, constats, 'inscrire', {});
  const fichiers = new Set(neufs.map(c => c.fichier)).size;
  return [
    `${FICHIER} : ${neufs.length} titre(s) de test nommant un ticket ou un « critère N », dans ${fichiers} fichier(s), inscrit(s) dans la dette de ${GARDE}, gelée ; chacun se renomme par son comportement, et la dette baisse avec lui`,
  ];
}
