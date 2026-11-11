// The entry `@roomi-fields/grillhouse/jointure`: the join of the languages (./langages.mjs), and
// the services of the core to a module of language, whose types are ./jointure.d.ts.
//
// - A module of language imports of the core its published entries alone (./jointure, ./paquets,
//   ./dette, ./resultats, ./conformite), as a plugin of Nx imports `@nx/devkit` alone; the guard
//   of the boundaries refuses any other import (.dependency-cruiser.projet.cjs of the frame's
//   repository).
// - The core imports ./langages.mjs, never this entry: the command (bin/grillhouse.mjs) loads it
//   at each call, and a script of the core it loads before running one would not run again.
export * from './langages.mjs';

// The services of the core to a module of language: the plan of an envelope, the progress of a
// pass and its measure, the tasks of the graph of the packages, the base of a pass, the pressure of the machine, its place and its lock, the last
// green, the arbitrages of a ticket, the source files of a project, the search of a command in the
// PATH.
export { arbitrageTranche, estArbitrage } from './arbitrages.mjs';
export { garderLeTotal, inscrireLePlan, ouvrirAvancement } from './avancement.mjs';
export { sources } from './sources.mjs';
export { trouverDansLePath } from './commandes-du-path.mjs';
export { paquetsSansPackageJson } from './paquet-npm.mjs';
export {
  cheminsDeLaTache,
  construireDepuisLesArguments,
  empreintesDesTaches,
  GRAPHE_JOUE,
  joueCeQuiNeSeDivisePas,
  LA_FORME,
  lancerLesTaches,
  lireLaTranche,
  nomDuPaquet,
  PASSE_ROUGE,
  SCRIPT_DES_TESTS,
  TESTS_CIBLES,
  testsCibles,
  TRACE,
  tracesDuPlan,
} from './taches-du-graphe.mjs';
export { luUneFois } from './lecture-unique.mjs';
export { avecLeFichierDuPoste } from './fichier-du-poste.mjs';
export { CHANGEMENTS, DEPUIS_LE_VERT, garderLeVert, mesure } from './dernier-vert.mjs';
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
export { A_REPASSER } from './codes-de-sortie.mjs';
export { ecrirePression, lirePression, SEUIL_PRESSION } from './mesure/pression.mjs';
export {
  avecLaMachineEtUnePlace,
  surUnePlace,
  travailleursDeLaSeance,
} from './places-de-la-machine.mjs';
export { attendreDeLaPlace, AttenteDeLaMachine, nommerLAvancement } from './verrou-de-machine.mjs';
export { CONFIG_BEADS, ecrireLePrefixe, prefixe } from './prefixe-des-tickets.mjs';
