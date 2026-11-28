// The table of the frame's subcommands, which `grillhouse <sous-commande>` (bin/grillhouse.mjs)
// runs and the migrations read (a former copy of a script becomes its subcommand): one module the
// command and the scripts import, so that no script imports the command, which is being evaluated
// when it runs one. The aiguillage of each subcommand is installation.md §5.5 and §3.1
// (packages/grillhouse/docs/architecture/).
//
// - A subcommand of the core is named after its script, without directory nor extension
//   (`circuit`, `tableau`); `maj` runs `grillhouse-maj.mjs`, whose name already says the frame's;
//   `hooks` (`crochets.mjs`, which places the git hooks) and `hook` (`crochet.mjs`, which runs one)
//   take Husky's names, which a project's `prepare` and its git hooks call.
// - `tests` and `verifier` run the commands the modules of the project's languages describe
//   (`commandes`, scripts/jointure.d.ts: `tester` and `verifier`; for several languages, the
//   composed command, scripts/commandes-composees.mjs), the project being the working directory
//   (scripts/langages.mjs); each other command it describes is a subcommand by its name
//   (`frontieres`, `index-interfaces`, `typer`, `construire`), as a backend of Pants brings its
//   goals.
// - `fusion-des-tranches` is a subcommand of every project (DE_TOUT_PROJET), which the frame's
//   workflows call after the tranches of a pass, whatever the languages: the command of the
//   modules that describe it (typescript, which merges Vitest's reports), else the composed
//   command by its name, which finds no module to play and is green (cargo alone, python alone, c
//   alone: no report of a tranche to merge, a red of theirs is the red of its tranche's job).
// - `nuit` runs the build of src/temporal/nuits/commande.ts, which plays the night's pass
//   (`nuit.sh`) when called alone: the script it replaces is that pass (`PASSES`).
// - `temporal` runs the build of src/temporal/commande.ts (dist/temporal/commande.js), the
//   package's TypeScript, which Turborepo builds before the tests and the package publishes.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { langageDe, langagesDe } from './langages.mjs';
import { avecLesDonnees, donneesDe } from './donnees-cles.mjs';
import { matieresDeclareesDe } from './matieres-cles.mjs';
import { avecLesOutils, empreintesDe, outilsDe } from './outils-cles.mjs';

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));

// Each subcommand and its script, under `scripts/`, or the command of the module of the language
// that runs it (`{ langage }`, its name in `commandes`).
export const SOUS_COMMANDES = {
  'attente-au-tour': 'attente-au-tour.mjs',
  bilan: 'bilan.mjs',
  binaires: 'binaires.mjs',
  circuit: '../dist/temporal/circuit/commande.js',
  'composants-affectes': 'composants-affectes.mjs',
  consommation: 'consommation.mjs',
  'dependances-internes': 'dependances-internes.mjs',
  direct: 'direct.mjs',
  droits: 'droits.mjs',
  enveloppe: 'enveloppe/enveloppe.mjs',
  'flux-des-paquets': 'flux-des-paquets.mjs',
  'fusion-du-changelog': 'fusion-du-changelog.mjs',
  'gardes-du-cadre': 'gardes-du-cadre.mjs',
  greffons: 'greffons.mjs',
  hook: 'crochet.mjs',
  hooks: 'crochets.mjs',
  init: 'init.mjs',
  'langages-des-paquets': 'langages-des-paquets.mjs',
  integrer: 'integration/integrer.mjs',
  lancer: 'enveloppe/lancer.sh',
  journal: 'journal.mjs',
  'ligne-etat': 'ligne-etat/ligne-etat.mjs',
  machine: 'machine.mjs',
  maj: 'grillhouse-maj.mjs',
  'messages-non-lus': 'messages-non-lus.mjs',
  newday: 'newday.mjs',
  nuit: '../dist/temporal/nuits/commande.js',
  outil: 'outil.mjs',
  paquet: 'paquet.mjs',
  pression: 'mesure/pression.mjs',
  registre: 'registre.mjs',
  resultats: 'resultats.mjs',
  'retirer-copie': 'retirer-copie.sh',
  'session-start': 'session-start.sh',
  sortie: 'sortie.mjs',
  'style-a-l-ecriture': 'style-a-l-ecriture.mjs',
  'sous-modules': 'sous-modules.sh',
  'structure-guard': 'structure-guard.sh',
  superviseur: 'superviseur.mjs',
  tableau: 'tableau.mjs',
  temporaire: 'mesure/base-de-passe.mjs',
  temporal: '../dist/temporal/commande.js',
  tests: { langage: 'tester' },
  ticket: 'ticket.mjs',
  'ticket-du-sous-agent': 'verrous/ticket-du-sous-agent.mjs',
  verifier: { langage: 'verifier' },
  'verrou-hors-enveloppe': 'verrous/ecriture-hors-enveloppe.mjs',
};

// The script a subcommand plays when called alone, where its command is a client of Temporal that
// runs it: `nuit`, the night's pass.
const PASSES = { nuit: 'nuit.sh' };

// The commands of the module of the language that serve the project at <racine> and are no
// subcommand by their name: the ones `tests` and `verifier` run.
const DU_NOYAU = new Set(['tester', 'verifier']);

// The commands of the modules that every project has as a subcommand, the frame's workflows
// calling them in each project: in a project no module of which describes one, the composed
// command plays it (scripts/commandes-composees.mjs), in no module, green.
const DE_TOUT_PROJET = ['fusion-des-tranches'];
const COMMANDES_COMPOSEES = path.join(SCRIPTS, 'commandes-composees.mjs');

/**
 * The subcommands in the project at <racine>, sorted: the core's (SOUS_COMMANDES), the commands
 * of the module of its language and those every project has (DE_TOUT_PROJET), each
 * `{ langage }`, its name in `commandes`.
 * @param {string} [racine] the root of the project, the working directory by default
 * @returns {Record<string, string | { langage: string }>}
 */
export function sousCommandes(racine = process.cwd()) {
  const du = [
    ...new Set([...Object.keys(langageDe(racine).commandes(racine)), ...DE_TOUT_PROJET]),
  ].filter(n => !DU_NOYAU.has(n));
  return Object.fromEntries(
    [...Object.entries(SOUS_COMMANDES), ...du.map(n => [n, { langage: n }])].sort(([a], [b]) =>
      a.localeCompare(b, 'en')
    )
  );
}

/**
 * The command of the subcommand <nom> in the project at <racine>, the script absolute; null for a
 * name neither the core nor the module of its language has, unless every project has it
 * (DE_TOUT_PROJET): the composed command by its name then.
 * @param {string} nom the subcommand
 * @param {string} [racine] the root of the project, the working directory by default
 * @returns {import('./jointure.js').Commande | null}
 */
export function commandeDe(nom, racine = process.cwd()) {
  const s = Object.hasOwn(SOUS_COMMANDES, nom) ? SOUS_COMMANDES[nom] : null;
  if (typeof s === 'string') {
    return { script: path.join(SCRIPTS, s), args: [] };
  }
  const commandes = langageDe(racine).commandes(racine);
  const n = s?.langage ?? (DU_NOYAU.has(nom) ? null : nom);
  if (n === null || !Object.hasOwn(commandes, n)) {
    return DE_TOUT_PROJET.includes(nom) ? { script: COMMANDES_COMPOSEES, args: [nom] } : null;
  }
  // The verification of a project whose one module is not the one of package.json (cargo alone,
  // python alone) goes by the composed command, which keeps its last green and its judged tree: no
  // pass of the graph does it there (scripts/commandes-composees.mjs, `garderSansLeGraphe`).
  const modules = langagesDe(racine);
  if (n === 'verifier' && modules.length === 1 && modules[0].manifeste !== 'package.json') {
    return { script: COMMANDES_COMPOSEES, args: [n] };
  }
  return commandes[n];
}

/**
 * The refusal of the subcommand <nom> whose script <script> is missing, or null when it exists: a
 * script of the package's TypeScript (under `dist/`) is named with the command that builds it,
 * as a fresh clone has it unbuilt.
 * @param {string} nom the subcommand
 * @param {string} script its script, absolute
 * @returns {string | null}
 */
export function scriptAbsent(nom, script) {
  if (existsSync(script)) {
    return null;
  }
  const construit = script.split(path.sep).includes('dist')
    ? ' : la construction du paquet le pose, `npm run build --workspace @roomi-fields/grillhouse`'
    : '';
  return `⛔ grillhouse ${nom} : ${script} n'existe pas${construit}.`;
}

/**
 * The environment the subcommand <nom> runs under, in the project at <racine>, from <env>: a
 * command of the module of the project's language (`tests`, `verifier`, `construire`…), the
 * ones that run its task runner, gets the module's environment of the poste
 * (`environnementDuPoste`, scripts/jointure.d.ts: the remote cache read-only, when the poste holds
 * its file), and also the tools of the project (`grillhouse.outils`, scripts/outils-cles.mjs) and
 * its data (`grillhouse.donnees`, scripts/donnees-cles.mjs), each variable set to its path,
 * whatever <env> holds; a subcommand of the core gets <env> as it is.
 * @param {string} nom the subcommand
 * @param {string} [racine] the root of the project, the working directory by default
 * @param {Record<string, string | undefined>} [env]
 * @returns {Record<string, string | undefined>}
 * @throws {Error} the faults of the key, for a subcommand of the module of the language
 */
export function environnementDe(nom, racine = process.cwd(), env = process.env) {
  if (typeof SOUS_COMMANDES[nom] === 'string') {
    return env;
  }
  matieresDeclareesDe(racine);
  const poste = langageDe(racine).environnementDuPoste(env);
  return avecLesDonnees(
    donneesDe(racine),
    avecLesOutils(outilsDe(racine), poste, empreintesDe(racine))
  );
}

// The script of each subcommand in the project at <racine>, where a former copy of the frame lay
// (`scripts/<script>`): what the migrations name, a former copy becoming its subcommand. A script
// of the core is named from `scripts/` (the pass it plays alone, `PASSES`, for a client of
// Temporal), one of a module of language by its file's name, where the frame kept it before its
// module.
export function scriptsDesSousCommandes(racine) {
  return Object.fromEntries(
    Object.entries(sousCommandes(racine)).map(([n, s]) => [
      n,
      Object.hasOwn(PASSES, n)
        ? PASSES[n]
        : typeof s === 'string'
          ? s
          : path.basename(commandeDe(n, racine).script),
    ])
  );
}
