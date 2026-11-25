// The entry `@roomi-fields/grillhouse/jointure`: the join of the languages (./langages.mjs), and
// the services of the core to a module of language, whose types are ./jointure.d.ts.
//
// - A module of language imports of the core its published entries alone (./jointure, ./paquets,
//   ./dette, ./resultats, ./conformite), as a plugin of Nx imports `@nx/devkit` alone; the guard
//   of the boundaries refuses any other import (.dependency-cruiser.projet.cjs of the frame's
//   repository).
// - The core imports ./langages.mjs, never this entry: the command (bin/grillhouse.mjs) loads it
//   at each call, and a script of the core it loads before running one would not run again.
//
// What the core asks of a module, and the boundary: docs/architecture/tests.md §3.3 and §3.5.
import { fileURLToPath } from 'node:url';

// `generateursDe`, which the update alone reads, stays inside the core.
export {
  LANGAGES,
  langage,
  langageDe,
  langageDeLaCopie,
  langagesDe,
  langagesDeclares,
} from './langages.mjs';

// The services of the core to a module of language: the plan of an envelope, the progress of a
// pass and its measure, the tasks of the graph of the packages, the base of a pass, the pressure of the machine, its place and its lock, the last
// green, the arbitrages of a ticket, the source files of a project, the search of a command in the
// PATH, the copy of a template a project lacks.
export { arbitrageTranche, estArbitrage } from './arbitrages.mjs';
export { garderLeTotal, inscrireLePlan, ouvrirAvancement } from './avancement.mjs';
export { sources } from './sources.mjs';
export { trouverDansLePath } from './commandes-du-path.mjs';
export { paquetsSansPackageJson } from './paquet-npm.mjs';
export { fournisseursDuPaquet } from './donnees-cles.mjs';
export { poserLeGabaritAbsent } from './gabarit-absent.mjs';
export {
  cheminsDeLaTache,
  construireDepuisLesArguments,
  constructionDuGraphe,
  empreintesDesTaches,
  GRAPHE_JOUE,
  joueCeQuiNeSeDivisePas,
  LA_FORME,
  lancerLesTaches,
  lireLaTranche,
  nomDuPaquet,
  PASSE_ROUGE,
  SCRIPT_DES_TESTS,
  SCRIPTS_DE_GARDES,
  tachesCoteACote,
  tachesDuVerdict,
  TESTS_CIBLES,
  testsCibles,
  TRACE,
  tracesDuPlan,
} from './taches-du-graphe.mjs';
export { luUneFois } from './lecture-unique.mjs';
export { avecLeFichierDuPoste } from './fichier-du-poste.mjs';
export { fluxDuProjetJoueLesMesures } from './flux-de-la-nuit.mjs';
export { BASE_DU_LOT, CHANGEMENTS, DEPUIS_LE_VERT, garderLeVert, mesure } from './dernier-vert.mjs';
export {
  consignerLesRegressions,
  garderLeRegistre,
  lireLeRegistre,
  vertsDuRegistre,
} from './registre-des-resultats.mjs';
export { lireLaListe, paquetsDeLEnveloppe } from './enveloppe/paquets-du-plan.mjs';
export { AVANCEMENT, ecrireTache } from './mesure/avancement.mjs';
export {
  cacheDeCompilation,
  cacheDeLaRacine,
  dansLeTemporaire,
  ligneDesRestes,
  ouvrirBase,
  retirerALInterruption,
} from './mesure/base-de-passe.mjs';
export { A_REPASSER, MEMOIRE_COUPEE } from './codes-de-sortie.mjs';
/** The watch of the memory of a pass (./garde-de-la-memoire.mjs), the script a pass runs under. */
export const GARDE_DE_LA_MEMOIRE = fileURLToPath(
  new URL('./garde-de-la-memoire.mjs', import.meta.url)
);
export { ecrirePression, lirePression, SEUIL_PRESSION } from './mesure/pression.mjs';
export { avecLaPasse, surUnePart } from './passe-de-la-machine.mjs';
export {
  nommerLAvancement,
  travailleursDeLaSeance,
  VARIABLE_TRAVAILLEURS,
} from './places-de-la-machine.mjs';
export { attendreDeLaPlace, AttenteDeLaMachine } from './attente-de-la-machine.mjs';
export { CONFIG_BEADS, ecrireLePrefixe, prefixe } from './prefixe-des-tickets.mjs';
