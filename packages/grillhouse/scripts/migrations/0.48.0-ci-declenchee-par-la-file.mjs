// From 0.48.0 the queue of the project starts the CI of main itself after a lot entered, one pass
// an hour at most (scripts/ci-de-main.mjs `declencherLaCiDeMain`): the frame's ci.yml loses its
// hourly schedule and its job `moved`, and keeps `workflow_dispatch` and `workflow_call`.
//
// - A ci.yml of the frame (its mark on the first line, scripts/workflows-du-cadre.mjs) is rewritten
//   on the template's new one; a ci.yml without the mark, and every other workflow, stay as they
//   are. A second pass changes nothing and says nothing.
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
