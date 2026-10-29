// The table of the frame's subcommands, which `grillhouse <sous-commande>` (bin/grillhouse.mjs)
// runs and the migrations read (a former copy of a script becomes its subcommand): one module the
// command and the scripts import, so that no script imports the command, which is being evaluated
// when it runs one.
//
// - A subcommand of the core is named after its script, without directory nor extension
//   (`circuit`, `tableau`); `maj` runs `grillhouse-maj.mjs`, whose name already says the frame's;
//   `hooks` (`crochets.mjs`, which places the git hooks) and `hook` (`crochet.mjs`, which runs one)
//   take Husky's names, which a project's `prepare` and its git hooks call.
// - `tests` and `verifier` run the commands the module of the project's language describes
//   (`commandes`, scripts/jointure.d.ts: `tester` and `verifier`), the project being the working
//   directory (scripts/langages.mjs); each other command it describes but `typer` is a subcommand
//   by its name (`frontieres`, `index-interfaces`), as a backend of Pants brings its goals.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { langageDe } from './langages.mjs';

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));

// Each subcommand and its script, under `scripts/`, or the command of the module of the language
// that runs it (`{ langage }`, its name in `commandes`).
export const SOUS_COMMANDES = {
  bilan: 'bilan.mjs',
  circuit: 'circuit.mjs',
  commande: 'verrous/commande.mjs',
  'composants-affectes': 'composants-affectes.mjs',
  droits: 'droits.mjs',
  enveloppe: 'enveloppe/enveloppe.mjs',
  file: 'integration/file.mjs',
  'gardes-du-cadre': 'gardes-du-cadre.mjs',
  greffons: 'greffons.mjs',
  hook: 'crochet.mjs',
  hooks: 'crochets.mjs',
  init: 'init.mjs',
  integrer: 'integration/integrer.mjs',
  lancer: 'enveloppe/lancer.sh',
  'ligne-etat': 'ligne-etat/ligne-etat.mjs',
  maj: 'grillhouse-maj.mjs',
  nuit: 'nuit.sh',
  pression: 'mesure/pression.mjs',
  registre: 'registre.mjs',
  resultats: 'resultats.mjs',
  'retirer-copie': 'retirer-copie.sh',
  'session-start': 'session-start.sh',
  sortie: 'sortie.mjs',
  'sous-modules': 'sous-modules.sh',
  'structure-guard': 'structure-guard.sh',
  superviseur: 'superviseur.mjs',
  tableau: 'tableau.mjs',
  tests: { langage: 'tester' },
  ticket: 'ticket.sh',
  'ticket-du-sous-agent': 'verrous/ticket-du-sous-agent.mjs',
  verifier: { langage: 'verifier' },
  verrou: 'verrous/verrou.mjs',
};

// The commands of the module of the language that serve the project at <racine> and are no
// subcommand by their name: the ones `tests` and `verifier` run, and the typing.
const DU_NOYAU = new Set(['tester', 'verifier', 'typer']);

/**
 * The subcommands in the project at <racine>, sorted: the core's (SOUS_COMMANDES), and the
 * commands of the module of its language, each `{ langage }`, its name in `commandes`.
 * @param {string} [racine] the root of the project, the working directory by default
 * @returns {Record<string, string | { langage: string }>}
 */
export function sousCommandes(racine = process.cwd()) {
  const du = Object.keys(langageDe(racine).commandes(racine)).filter(n => !DU_NOYAU.has(n));
  return Object.fromEntries(
    [...Object.entries(SOUS_COMMANDES), ...du.map(n => [n, { langage: n }])].sort(([a], [b]) =>
      a.localeCompare(b, 'en')
    )
  );
}

/**
 * The command of the subcommand <nom> in the project at <racine>, the script absolute; null for a
 * name neither the core nor the module of its language has.
 * @param {string} nom the subcommand
 * @param {string} [racine] the root of the project, the working directory by default
 * @returns {import('./jointure.js').Commande | null}
 */
export function commandeDe(nom, racine = process.cwd()) {
  const s = Object.hasOwn(SOUS_COMMANDES, nom) ? SOUS_COMMANDES[nom] : null;
  if (typeof s === 'string') return { script: path.join(SCRIPTS, s), args: [] };
  const commandes = langageDe(racine).commandes(racine);
  const n = s?.langage ?? (DU_NOYAU.has(nom) ? null : nom);
  return n !== null && Object.hasOwn(commandes, n) ? commandes[n] : null;
}

// The script of each subcommand in the project at <racine>, where a former copy of the frame lay
// (`scripts/<script>`): what the migrations name, a former copy becoming its subcommand. A script
// of the core is named from `scripts/`, one of a module of language by its file's name, where the
// frame kept it before its module.
export function scriptsDesSousCommandes(racine) {
  return Object.fromEntries(
    Object.entries(sousCommandes(racine)).map(([n, s]) => [
      n,
      typeof s === 'string' ? s : path.basename(commandeDe(n, racine).script),
    ])
  );
}
