// From 0.44.0 the frame supports Node 26 alone (grillhouse-3uv.103): the CI and the night of
// GitHub play Node 26 only, and the template declares `engines.node` `>=26.0.0`.
//
// - A project's package.json that holds the exact value the template held before (`>=22.0.0` or
//   `>=24.0.0`) receives `>=26.0.0`; only that value changes in the text.
// - Any other value stays, and a line names it: the workflows of the project play Node 26 alone,
//   with no proof of the version it declares; the project raises it or widens its matrix.
// - The frame's workflows of the project are written again from the template
//   (scripts/workflows-du-cadre.mjs): a project that holds none receives none.
// - A project already migrated, or without package.json, changes nothing and returns no line.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CADRE } from '../cadre.mjs';
import { poserLesWorkflows } from '../workflows-du-cadre.mjs';

export const version = '0.44.0';
export const nom = 'node 26 seul';

// The values of the template before this version, and the one it holds from it.
const MOTEURS_AVANT = ['>=22.0.0', '>=24.0.0'];
const MOTEUR = '>=26.0.0';

// A text as a pattern that matches it alone.
const litteral = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Gives the project `engines.node` `>=26.0.0` and the template's workflows. */
export function migrer(projet) {
  const lignes = [];
  const f = path.join(projet, 'package.json');
  if (existsSync(f)) {
    const texte = readFileSync(f, 'utf8');
    const actuel = JSON.parse(texte).engines?.node;
    if (MOTEURS_AVANT.includes(actuel)) {
      const motif = new RegExp(`("node"\\s*:\\s*)${litteral(JSON.stringify(actuel))}`);
      writeFileSync(f, texte.replace(motif, (_, debut) => `${debut}${JSON.stringify(MOTEUR)}`));
      lignes.push(`package.json : engines.node passe à ${MOTEUR}`);
    } else if (typeof actuel === 'string' && actuel !== MOTEUR) {
      lignes.push(
        `package.json : engines.node vaut ${actuel}, laissé tel quel ; les workflows du cadre jouent Node 26 seul, sans preuve sur cette version : la relever (${MOTEUR}) ou étendre la matrice des workflows`
      );
    }
  }
  for (const ecrit of poserLesWorkflows(projet, CADRE)) {
    lignes.push(`${ecrit} : réécrit depuis le gabarit (Node 26 seul)`);
  }
  return lignes;
}
