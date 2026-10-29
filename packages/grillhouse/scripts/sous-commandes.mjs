// The table of the frame's subcommands, which `grillhouse <sous-commande>` (bin/grillhouse.mjs)
// runs and the migrations read (a former copy of a script becomes its subcommand): one module the
// command and the scripts import, so that no script imports the command, which is being evaluated
// when it runs one.
//
// - A subcommand is named after its script, without directory nor extension (`verifier`,
//   `circuit`, `tableau`); `maj` runs `grillhouse-maj.mjs`, whose name already says the frame's;
//   `hooks` (`crochets.mjs`, which places the git hooks) and `hook` (`crochet.mjs`, which runs one)
//   take Husky's names, which a project's `prepare` and its git hooks call.
// - `tests` and `verifier` run the commands the module of the project's language describes
//   (`commandes`, scripts/jointure.d.ts: `tester` and `verifier`), the project being the working
//   directory (scripts/langages.mjs).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { langageDe } from './langages.mjs';

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));

// Each subcommand and its script, under `scripts/`, or the command of the module of the language
// that runs it (`{ langage }`, its name in `commandes`).
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
  pression: 'mesure/pression.mjs',
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
  'tailles-des-tests': 'tailles-des-tests.mjs',
  tests: { langage: 'tester' },
  ticket: 'ticket.sh',
  'ticket-du-sous-agent': 'verrous/ticket-du-sous-agent.mjs',
  'turbo-des-paquets': 'turbo-des-paquets.mjs',
  verifier: { langage: 'verifier' },
  verrou: 'verrous/verrou.mjs',
};

/**
 * The command of the subcommand <nom> in the project at <racine>, the script absolute; null for a
 * name the table lacks.
 * @param {string} nom the subcommand
 * @param {string} [racine] the root of the project, the working directory by default
 * @returns {import('./jointure.js').Commande | null}
 */
export function commandeDe(nom, racine = process.cwd()) {
  if (!Object.hasOwn(SOUS_COMMANDES, nom)) return null;
  const s = SOUS_COMMANDES[nom];
  if (typeof s === 'string') return { script: path.join(SCRIPTS, s), args: [] };
  return langageDe(racine).commandes(racine)[s.langage];
}

// The script of each subcommand in the project at <racine>, from `scripts/`: what the migrations
// name, a former copy of a script becoming its subcommand.
export function scriptsDesSousCommandes(racine) {
  return Object.fromEntries(
    Object.keys(SOUS_COMMANDES).map(n => [n, path.relative(SCRIPTS, commandeDe(n, racine).script)])
  );
}
