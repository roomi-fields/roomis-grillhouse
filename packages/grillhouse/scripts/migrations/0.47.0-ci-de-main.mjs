// No CI judges a ticket's branch: the CI plays on main, by batches. Mechanism: installation.md
// §5.4 (packages/grillhouse/docs/architecture/), the CI of main entree.md §5.2.
//
// - A workflow listing `agent/**` among the branches of its push has it taken out, its comments,
//   its layout and its other branches kept (the library yaml's document); another is left.
// - A workflow of the frame is the update's (scripts/workflows-du-cadre.mjs): the migration
//   leaves it.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseDocument } from 'yaml';
import { estDuCadre, WORKFLOWS } from '../workflows-du-cadre.mjs';

export const version = '0.47.0';
export const nom = 'ci de main';

const BRANCHES_DE_TICKET = 'agent/**';

/** `agent/**` taken out of the push of each workflow of the project; returns what it did. */
export function migrer(projet) {
  const dossier = path.join(projet, WORKFLOWS);
  if (!existsSync(dossier)) {
    return [];
  }
  const lignes = [];
  for (const n of readdirSync(dossier).filter(f => /\.ya?ml$/.test(f)).sort()) {
    const fichier = path.join(dossier, n);
    const texte = readFileSync(fichier, 'utf8');
    if (estDuCadre(texte)) {
      continue;
    }
    const doc = parseDocument(texte);
    const branches = doc.getIn(['on', 'push', 'branches'], true);
    if (!branches || !Array.isArray(branches.items)) {
      continue;
    }
    const restantes = branches.items.filter(i => (i?.value ?? i) !== BRANCHES_DE_TICKET);
    if (restantes.length === branches.items.length || restantes.length === 0) {
      continue;
    }
    branches.items = restantes;
    writeFileSync(fichier, doc.toString());
    lignes.push(
      `${WORKFLOWS}/${n} : '${BRANCHES_DE_TICKET}' retirée du push, la file n'envoie plus de branche de ticket ; la CI joue sur main`
    );
  }
  return lignes;
}
