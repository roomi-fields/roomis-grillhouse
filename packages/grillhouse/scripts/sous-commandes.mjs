// The table of the frame's subcommands, which `grillhouse <sous-commande>` (bin/grillhouse.mjs)
// runs and the migrations read (a former copy of a script becomes its subcommand): one module the
// command and the scripts import, so that no script imports the command, which is being evaluated
// when it runs one.
//
// - A subcommand is named after its script, without directory nor extension (`verifier`,
//   `circuit`, `tableau`); `maj` runs `grillhouse-maj.mjs`, whose name already says the frame's;
//   `hooks` (`crochets.mjs`, which places the git hooks) and `hook` (`crochet.mjs`, which runs one)
//   take Husky's names, which a project's `prepare` and its git hooks call.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));

// Each subcommand and its script, under `scripts/`.
export const SOUS_COMMANDES = {
  bilan: 'bilan.mjs',
  circuit: 'circuit.mjs',
  'code-mort': 'code-mort.mjs',
  commande: 'verrous/commande.mjs',
  'composants-affectes': 'composants-affectes.mjs',
  consommateurs: 'consommateurs.mjs',
  'consommateurs-arbitres': 'consommateurs-arbitres.mjs',
  droits: 'droits.mjs',
  enveloppe: 'enveloppe/enveloppe.mjs',
  file: 'integration/file.mjs',
  frontieres: 'frontieres.mjs',
  'gardes-du-cadre': 'gardes-du-cadre.mjs',
  greffons: 'greffons.mjs',
  hook: 'crochet.mjs',
  hooks: 'crochets.mjs',
  'index-interfaces': 'index-interfaces.mjs',
  init: 'init.mjs',
  integrer: 'integration/integrer.mjs',
  'interfaces-contre-code': 'interfaces-contre-code.mjs',
  lancer: 'enveloppe/lancer.sh',
  'ligne-etat': 'ligne-etat/ligne-etat.mjs',
  maj: 'grillhouse-maj.mjs',
  nuit: 'nuit.sh',
  pression: 'vitest-config/pression.mjs',
  registre: 'registre.mjs',
  resultats: 'resultats.mjs',
  resumes: 'resumes.mjs',
  'retirer-copie': 'retirer-copie.sh',
  'session-start': 'session-start.sh',
  sortie: 'sortie.mjs',
  'sous-modules': 'sous-modules.sh',
  'structure-guard': 'structure-guard.sh',
  superviseur: 'superviseur.mjs',
  tableau: 'tableau.mjs',
  tests: 'tests.mjs',
  ticket: 'ticket.sh',
  'ticket-du-sous-agent': 'verrous/ticket-du-sous-agent.mjs',
  'turbo-des-paquets': 'turbo-des-paquets.mjs',
  verifier: 'verifier.mjs',
  verrou: 'verrous/verrou.mjs',
};

// The absolute path of the script of the subcommand <nom>; null for a name the table lacks.
export function scriptDe(nom) {
  return Object.hasOwn(SOUS_COMMANDES, nom) ? path.join(SCRIPTS, SOUS_COMMANDES[nom]) : null;
}
