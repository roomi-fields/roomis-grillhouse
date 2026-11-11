// From 0.33.0 the frame carries the CI of a project (grillhouse-44b.12.7): the template's
// `.github/workflows/ci.yml` (the verification in tranches, for a lot) and `nuit.yml` (the night
// tests out of the poste), each bearing the frame's mark on its first line, which the update keeps
// (scripts/workflows-du-cadre.mjs).
//
// - The migration changes no file: a project's CI is its own until it adopts the frame's, and the
//   update starts no CI on a repository.
// - What stays to the project (`restes`), once: a project that holds no workflow of the frame is
//   told how to adopt them. One that holds one has nothing to do.
import path from 'node:path';
import { CADRE } from '../cadre.mjs';
import { aLaCiDuCadre, GABARIT_DES_WORKFLOWS, WORKFLOWS } from '../workflows-du-cadre.mjs';

export const version = '0.33.0';
export const nom = 'ci du cadre';

/** Changes nothing: the adoption of the frame's CI is the project's gesture (`restes`). */
export function migrer() {
  return [];
}

/** The adoption of the frame's CI, for a project that holds none of its workflows. */
export function restes(projet) {
  if (aLaCiDuCadre(projet)) {
    return [];
  }
  const modele = path.relative(projet, path.join(CADRE, GABARIT_DES_WORKFLOWS, 'ci.yml'));
  return [
    `${WORKFLOWS} : le cadre porte la CI d'un projet (ci.yml, le lot en tranches ; nuit.yml, les tests de nuit hors du poste). Pour l'adopter, copier \`${modele}\` dans \`${WORKFLOWS}/\` (un ci.yml du projet cède sa place, ses étapes propres versées ailleurs), puis \`npx grillhouse maj\`, qui écrit nuit.yml et tient les deux à jour. Leur machine : la variable RUNNER du dépôt sur GitHub, facultative (ubuntu-latest sans elle).`,
  ];
}
