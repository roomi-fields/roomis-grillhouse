// The queue starts the CI of main itself, one pass an hour at most (scripts/ci-de-main.mjs
// `declencherLaCiDeMain`): the frame's ci.yml has no schedule and no job `moved`, and keeps
// `workflow_dispatch` and `workflow_call`. Mechanism: installation.md §5.4, entree.md §5.2
// (packages/grillhouse/docs/architecture/).
//
// - A ci.yml with the frame's mark on its first line (scripts/workflows-du-cadre.mjs) is rewritten
//   on the template's; a ci.yml without the mark, and every other workflow, stay.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CADRE } from '../cadre.mjs';
import { estDuCadre, GABARIT_DES_WORKFLOWS, WORKFLOWS } from '../workflows-du-cadre.mjs';

export const version = '0.48.0';
export const nom = 'ci declenchee par la file';

/** The ci.yml of the frame of <projet> written on the template's; returns what it did. */
export function migrer(projet) {
  const fichier = path.join(projet, WORKFLOWS, 'ci.yml');
  const modele = path.join(CADRE, GABARIT_DES_WORKFLOWS, 'ci.yml');
  if (!existsSync(fichier) || !existsSync(modele)) {
    return [];
  }
  const actuel = readFileSync(fichier, 'utf8');
  const voulu = readFileSync(modele, 'utf8');
  if (!estDuCadre(actuel) || actuel === voulu) {
    return [];
  }
  writeFileSync(fichier, voulu);
  return [
    `${WORKFLOWS}/ci.yml : la planification horaire et le travail moved sont retirés, la file déclenche elle-même la CI de main après l'entrée d'un lot, au plus une fois par heure`,
  ];
}
