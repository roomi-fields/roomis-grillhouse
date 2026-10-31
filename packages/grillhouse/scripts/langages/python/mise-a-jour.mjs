// What the module python brings to the update of a project (`grillhouse maj`,
// scripts/grillhouse-maj.mjs), the demand `miseAJour` of the join (scripts/jointure.d.ts).
//
// - The template: `templates/python/` of the frame's files. Its package.json gives the frame's
//   scripts, which run the frame's commands, and smol-toml, the reader of a pyproject.toml.
// - The root scripts `test`, `test:forcer` and `verifier` a project lacks become the template's;
//   a project's own script stays.
// - The generator: the index of the interfaces (./index-interfaces.mjs), run where the project
//   holds it, as the module cargo's.
// - The installation of uv (./binaires.json) by the commands of ./binaires.mjs, which the core runs.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SORTIE } from './index-interfaces.mjs';

const BINAIRES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'binaires.mjs');
const GABARIT = 'templates/python';
const SCRIPTS_DES_TESTS = ['test', 'test:forcer', 'verifier'];

/** @type {import('../../jointure.js').MiseAJour['appliquer']} */
function appliquer(_projet, { p, modele }) {
  p.scripts ??= {};
  const scripts = [];
  for (const nom of SCRIPTS_DES_TESTS) {
    const script = modele.scripts?.[nom];
    if (typeof script !== 'string' || typeof p.scripts[nom] === 'string') {
      continue;
    }
    p.scripts[nom] = script;
    scripts.push(nom);
  }
  return {
    bilan: { scripts: scripts.length > 0 ? scripts : null },
    lignes:
      scripts.length > 0
        ? [
            `Scripts des tests : ${scripts.map(n => `${n} (\`${p.scripts[n]}\`)`).join(', ')} écrits ; les agents lancent \`npm test\`, l'intégration et la nuit \`npm run verifier\`.`,
          ]
        : [],
    aFaire: [],
    installer: false,
    sansVerifier: null,
  };
}

/** The share of the module python in the update. */
export const miseAJour = {
  gabarit: GABARIT,
  appliquer,
  generateurs: [{ commande: 'index-interfaces', args: [], sortie: SORTIE }],
  installation: {
    liste: { script: BINAIRES, args: ['liste'] },
    installer: (nom, version) => ({ script: BINAIRES, args: ['installer', `${nom}@${version}`] }),
  },
};
