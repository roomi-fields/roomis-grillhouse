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
// pass and its measure, the base of a pass, the pressure of the machine and its lock, the last
// green, the arbitrages of a ticket.
export { arbitrageTranche, estArbitrage } from './arbitrages.mjs';
export { ecrireLaMesure, garderLeTotal, inscrireLePlan, ouvrirAvancement } from './avancement.mjs';
export { CHANGEMENTS, DEPUIS_LE_VERT, garderLeVert, mesure } from './dernier-vert.mjs';
export { lireLaListe, paquetsDeLEnveloppe } from './enveloppe/paquets-du-plan.mjs';
export { AVANCEMENT, ecrireTache } from './mesure/avancement.mjs';
export { ouvrirBase } from './mesure/base-de-passe.mjs';
export {
  A_REPASSER,
  attendreLeRepos,
  BORNE_ATTENTE_MS,
  ecrirePression,
  lirePression,
  SEUIL_PRESSION,
} from './mesure/pression.mjs';
export { AttenteDeLaMachine, avecLaMachine } from './verrou-de-machine.mjs';
