// What the module c brings to the update of a project (`grillhouse maj`,
// scripts/grillhouse-maj.mjs), the demand `miseAJour` of the join (scripts/jointure.d.ts).
//
// - The template: `templates/c/` of the frame's files. Its package.json gives the frame's
//   scripts, which run the frame's commands, and Turborepo, which plays the tasks of the projects.
// - `turbo.json`, which a project lacks, from the frame's template of its form (`TURBO`).
// - The root scripts `test`, `test:forcer` and `verifier` a project lacks become the template's;
//   a project's own script stays.
// - The generator: the index of the interfaces (./index-interfaces.mjs), run where the project
//   holds it, as the module python's.
// - No binary to install: cmake and ctest are the poste's, required of it (`executables`).
import { poserLeGabaritAbsent } from '../../services-du-noyau.mjs';
import { SORTIE } from './index-interfaces.mjs';

const GABARIT = 'templates/c';
const SCRIPTS_DES_TESTS = ['test', 'test:forcer', 'verifier'];
// The frame's templates of `turbo.json`, one per form of repository.
const TURBO = {
  fichier: 'turbo.json',
  avecEspaces: 'templates/turbo/paquets.json',
  sansEspaces: 'templates/turbo/sans-paquets.json',
};

/** @type {import('../../jointure.js').MiseAJour['appliquer']} */
function appliquer(projet, { p, modele, source }) {
  const turbo = poserLeGabaritAbsent(projet, source, p, TURBO);
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
    bilan: { scripts: scripts.length > 0 ? scripts : null, turbo },
    lignes: [
      ...(turbo
        ? [
            `turbo.json écrit depuis le gabarit du cadre ${turbo} ; il est au projet, la mise à jour n'y touche plus.`,
          ]
        : []),
      ...(scripts.length > 0
        ? [
            `Scripts des tests : ${scripts.map(n => `${n} (\`${p.scripts[n]}\`)`).join(', ')} écrits ; les agents lancent \`npm test\`, l'intégration et la nuit \`npm run verifier\`.`,
          ]
        : []),
    ],
    aFaire: [],
    installer: false,
    sansVerifier: null,
  };
}

/** The share of the module c in the update. */
export const miseAJour = {
  gabarit: GABARIT,
  appliquer,
  generateurs: [{ commande: 'index-interfaces', args: [], sortie: SORTIE }],
  installation: null,
};
