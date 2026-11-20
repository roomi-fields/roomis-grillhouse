// The module of language c: what the core asks of a language (scripts/jointure.d.ts,
// docs/INTERFACE.md), answered for the packages of C by CMake and CTest, as Bazel's rules_cc
// builds them. The core loads it by scripts/langages.mjs, and this module imports of the core its
// published entries alone.
//
// - The manifest of its package, which the guard of the languages asks of a package the
//   architecture declares c (`manifeste`): a CMakeLists.txt whose `project(<nom>` names the
//   component (./composants.mjs). Its one tool of npm is Turborepo, which plays the tasks of the
//   projects (`outils`); cmake and ctest live on the machine, required of the poste (`executables`).
//   What CMake writes in a project: `.build-cmake`, one directory per package (`ignorer`).
// - Where it writes, which the envelope opens to a session (`sorties`): `.build-cmake/` at the
//   root. The rule that refuses a role that writes ctest run directly (`droits`).
// - The packages, a file's, the test files, what the testwriter writes, of the manifests too, the
//   readers, the entries of the index of the interfaces (./composants.mjs); the elements of a lot
//   (./lot.mjs).
// - The commands `tester`, `tests-du-paquet`, `verifier`, `typer` and `construire`
//   (./commandes.mjs), each described, never run, and the verdict of a run (./verdict.mjs); the
//   index of the interfaces up to date, a command and a guard by its name (./index-interfaces.mjs).
//   No guard of the sizes of the tests, no night test, no migration yet.
// - Its share of the update (./mise-a-jour.mjs): the template `templates/c/`, its test scripts and
//   the generator of the index.
// - The skeleton of a new package (./squelette.mjs, `squelette`), which `grillhouse paquet` writes.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { avecLeFichierDuPoste, empreintesDesTaches } from '../../services-du-noyau.mjs';
import { CONSTRUCTION, commandes, echecDeCompilation, GARDES } from './commandes.mjs';
import {
  composantDans,
  composants,
  entreesDeLIndex,
  estUnTest,
  joueDesTests,
  lecteurs,
  liensDuManifeste,
  manifestes,
  MANIFESTE,
  nomDuManifeste,
} from './composants.mjs';
import { enRetard, SORTIE } from './index-interfaces.mjs';
import { elementsDuLot } from './lot.mjs';
import { miseAJour } from './mise-a-jour.mjs';
import { squelette } from './squelette.mjs';
import { verdict } from './verdict.mjs';

const ici = nom => path.join(path.dirname(fileURLToPath(import.meta.url)), nom);

export default {
  nom: 'c',
  // The expected size of a copy before any is measured: its construction, a few MB (2026-11-20).
  tailleDUneCopie: 1024 ** 3,
  manifeste: MANIFESTE,
  nomDuManifeste,
  liensDuManifeste,
  construireLesPaquets: () => {
    throw new Error('construction non prise en charge pour c');
  },
  // No output of a package of C is a datum of another package's tests.
  sortieDuPaquet: () => {
    throw new Error('sortie non prise en charge pour c');
  },
  // Turborepo, which plays the tasks of the projects (./commandes.mjs).
  outils: ['turbo'],
  // The programs the installer of Temporal requires in the PATH of the workers, and the poste.
  executables: ['cmake', 'ctest'],
  // Nothing to install: CMake is the poste's.
  binaires: {},
  ignorer: [CONSTRUCTION],
  sorties: {
    ecrites: [`${CONSTRUCTION}/`],
    propres: [],
    lues: [],
  },
  // ctest run directly: `npm test` and `npm run verifier` play it.
  droits: ['Bash(ctest*)'],
  composants,
  composantDe: (racine, fichier) => composantDans(composants(racine), racine, fichier),
  matieres: () => [],
  joueDesTests,
  lecteurs,
  elementsDuLot,
  // The remote cache of Turborepo on the poste, as the other modules play by Turborepo.
  environnementDuPoste: env =>
    avecLeFichierDuPoste(env, {
      fichier: 'turbo-cache.env',
      ajouts: { TURBO_CACHE: 'local:rw,remote:r' },
    }),
  empreintes: (racine, noms) => empreintesDesTaches('turbo', racine, noms),
  commandes,
  verdict,
  echecDeCompilation,
  estUnTest,
  // No night test in C yet.
  horsDuJour: () => false,
  manifestes,
  fichiersEngendres: () => [
    {
      nom: "l'index des interfaces",
      commande: `node ${JSON.stringify(ici('index-interfaces.mjs'))}`,
      fichiers: [SORTIE],
      lit: ['docs/INTERFACE.md', '**/docs/INTERFACE.md'],
      gardes: ['index-interfaces'],
      entiers: [SORTIE],
      verifier: enRetard,
    },
  ],
  entreesDeLIndex,
  gardes: () => GARDES.map(({ script, args }) => [script, ...args]),
  migrations: [],
  miseAJour,
  squelette,
};
