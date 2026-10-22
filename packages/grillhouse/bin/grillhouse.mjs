#!/usr/bin/env node
// The frame's one command: `grillhouse <sous-commande> [arguments…]`, as `turbo run` or
// `changeset version` are one executable with subcommands. A project calls `npx grillhouse
// <sous-commande>` (`grillhouse <sous-commande>` in its npm scripts), never a path of the frame.
//
// - Each subcommand is a script of the package (`scripts/`), run with the arguments that follow
//   it, in the working directory of the call, which is the project's. A `.mjs` runs in this
//   process, as if Node had been given its path (`process.argv[1]` is the script's, the arguments
//   after it): no second Node starts, which a hook of Claude Code called at each tool pays. A `.sh`
//   runs by bash, its standard streams this process's, its exit code this command's, and a script
//   ended by a signal gives 128 plus the signal's number, as a shell gives it.
// - A subcommand is named after its script, without directory nor extension (`verifier`,
//   `circuit`, `tableau`); `maj` runs `grillhouse-maj.mjs`, whose name already says the frame's;
//   `hooks` (`crochets.mjs`, which places the git hooks) and `hook` (`crochet.mjs`, which runs one)
//   take Husky's names, which a project's `prepare` and its git hooks call.
// - A subcommand missing or unknown writes the usage and the list of the subcommands on the error
//   stream, and the exit code is 2.
// - A script finds its neighbours by its own directory, and the project by the working directory
//   (`CLAUDE_PROJECT_DIR` for a hook of Claude Code): the package works wherever it is installed.
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { constants } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts');

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
  'etat-du-circuit': 'etat-du-circuit.mjs',
  file: 'integration/file.mjs',
  frontieres: 'frontieres.mjs',
  'gardes-du-cadre': 'gardes-du-cadre.mjs',
  greffons: 'greffons.mjs',
  hook: 'crochet.mjs',
  hooks: 'crochets.mjs',
  'index-interfaces': 'index-interfaces.mjs',
  integrer: 'integration/integrer.mjs',
  'interfaces-contre-code': 'interfaces-contre-code.mjs',
  lancer: 'enveloppe/lancer.sh',
  'ligne-etat': 'ligne-etat/ligne-etat.mjs',
  maj: 'grillhouse-maj.mjs',
  'new-project': 'new-project.sh',
  nuit: 'nuit.sh',
  pression: 'vitest-config/pression.mjs',
  registre: 'registre.mjs',
  resultats: 'resultats.mjs',
  resumes: 'resumes.mjs',
  'retirer-copie': 'retirer-copie.sh',
  'session-start': 'session-start.sh',
  setup: 'setup.sh',
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

// The usage and the list of the subcommands, as the error stream receives them.
const usage = () =>
  'Usage : grillhouse <sous-commande> [arguments…]\n' +
  `Sous-commandes : ${Object.keys(SOUS_COMMANDES).join(', ')}\n`;

// The command is run by its link (`node_modules/.bin/grillhouse`), which Node resolves for the
// module, not for `process.argv[1]`.
const lance = () => {
  try {
    return pathToFileURL(realpathSync(process.argv[1] ?? '')).href;
  } catch {
    return null;
  }
};

// The script of the subcommand, run (see the header); the exit code is set, never forced
// (`process.exitCode`), so that what the command wrote on a pipe reaches its reader.
async function lancer([nom, ...args]) {
  const script = nom === undefined ? null : scriptDe(nom);
  if (script === null) {
    process.stderr.write(
      nom === undefined ? usage() : `⛔ sous-commande inconnue : ${nom}\n${usage()}`
    );
    process.exitCode = 2;
    return;
  }
  if (script.endsWith('.mjs')) {
    process.argv = [process.argv[0], script, ...args];
    await import(pathToFileURL(script).href);
    return;
  }
  const enfant = spawn('bash', [script, ...args], { stdio: 'inherit' });
  // A signal this process receives goes to the script, which decides how it ends.
  const relais = s => enfant.kill(s);
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(s, relais);
  enfant.on('error', e => {
    process.stderr.write(`⛔ grillhouse ${nom} : ${e.message}\n`);
    process.exitCode = 1;
  });
  enfant.on('exit', (code, signal) => {
    process.exitCode = code ?? 128 + (constants.signals[signal] ?? 0);
    for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.off(s, relais);
  });
}

if (import.meta.url === lance()) {
  await lancer(process.argv.slice(2));
}
