#!/usr/bin/env node
// The frame's one command: `grillhouse <sous-commande> [arguments…]`, as `turbo run` or
// `changeset version` are one executable with subcommands. A project calls `npx grillhouse
// <sous-commande>` (`grillhouse <sous-commande>` in its npm scripts), never a path of the frame.
//
// - Each subcommand is a script of the package (`scripts/`), run with the arguments that follow
//   it, in the working directory of the call, which is the project's. A `.mjs` of the core runs in
//   this process, as if Node had been given its path (`process.argv[1]` is the script's, the
//   arguments after it): no second Node starts, which a hook of Claude Code called at each tool
//   pays. A command of the module of the language runs in a Node of its own, as a `.sh` runs by
//   bash: the module is loaded in this process to name it, with the scripts it imports, which a
//   second import would not run again. Each child has this process's standard streams, its exit
//   code is this command's, and a script ended by a signal gives 128 plus the signal's number, as
//   a shell gives it.
// - The subcommands and their scripts are the table of scripts/sous-commandes.mjs; `tests`,
//   `verifier` and the guards and generators of the module of the project's language
//   (`grillhouse frontieres`) run its commands, with their arguments first. A project whose language the frame refuses (scripts/langages.mjs) has the refusal on
//   the error stream, and the exit code is 2.
// - `verifier` runs with the tools of the project (`grillhouse.outils` of the package.json of its
//   main tree, `environnementDe` of scripts/sous-commandes.mjs), each variable set to its path,
//   whatever the caller's environment; a faulty key is refused by its name on the error stream,
//   nothing run, and the exit code is 2.
// - In a project whose package.json names its published version (`grillhouse.outil`, the frame's
//   repository), a subcommand of the orchestration (circuit, superviseur, nuit, tableau, the status
//   line and the hooks of Claude Code) runs by that version, installed under
//   ~/.cache/grillhouse/outil/<version>/ at its first launch, its arguments, streams and exit
//   code this command's; every other subcommand runs here (scripts/aiguillage.mjs). A faulty key
//   is refused by its name on the error stream, nothing run, and the exit code is 2; a version
//   that cannot be installed is said in one line on the error stream, and the subcommand runs
//   here.
// - A subcommand missing or unknown writes the usage and the list of the subcommands on the error
//   stream, and the exit code is 2.
// - A script finds its neighbours by its own directory, and the project by the working directory
//   (`CLAUDE_PROJECT_DIR` for a hook of Claude Code): the package works wherever it is installed.
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { constants } from 'node:os';
import { pathToFileURL } from 'node:url';
import { aiguillage, installer } from '../scripts/aiguillage.mjs';
import {
  commandeDe,
  environnementDe,
  SOUS_COMMANDES,
  sousCommandes,
} from '../scripts/sous-commandes.mjs';

// The subcommands in the working directory: the core's, and the ones of the module of its
// language; the core's alone when the frame refuses its language.
const lesSousCommandes = () => {
  try {
    return sousCommandes();
  } catch {
    return SOUS_COMMANDES;
  }
};

// The usage and the list of the subcommands, as the error stream receives them.
const usage = () =>
  'Usage : grillhouse <sous-commande> [arguments…]\n' +
  `Sous-commandes : ${Object.keys(lesSousCommandes()).join(', ')}\n`;

// The command is run by its link (`node_modules/.bin/grillhouse`), which Node resolves for the
// module, not for `process.argv[1]`.
const lance = () => {
  try {
    return pathToFileURL(realpathSync(process.argv[1] ?? '')).href;
  } catch {
    return null;
  }
};

// Runs the script <commande> (by bash for a `.sh`, else by Node) with <args> and this process's
// streams; a signal this process receives goes to it, which decides how it ends; its exit code is
// this command's.
function lancerLeScript(nom, commande, args, env = process.env) {
  const enfant = commande.endsWith('.sh')
    ? spawn('bash', [commande, ...args], { stdio: 'inherit', env })
    : spawn(process.execPath, [commande, ...args], { stdio: 'inherit', env });
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

// The subcommand <nom> handed to the published version the project names (scripts/aiguillage.mjs),
// installed at its first launch: true when it is handed, false when it runs here, a version that
// cannot be installed said in one line.
function aiguiller(nom, args) {
  let vers;
  try {
    vers = nom === undefined ? null : aiguillage(nom);
  } catch (e) {
    process.stderr.write(`⛔ grillhouse ${nom} : ${e.message}\n`);
    process.exitCode = 2;
    return true;
  }
  if (vers === null) return false;
  try {
    installer(vers.version);
  } catch (e) {
    process.stderr.write(
      `⚠️  grillhouse ${nom} : version publiée ${vers.version} non installable : ${e.message} ; le code du dépôt la remplace.\n`
    );
    return false;
  }
  lancerLeScript(nom, vers.commande, [nom, ...args]);
  return true;
}

// The script of the subcommand, run (see the header); the exit code is set, never forced
// (`process.exitCode`), so that what the command wrote on a pipe reaches its reader.
async function lancer([nom, ...args]) {
  if (aiguiller(nom, args)) return;
  let commande;
  try {
    commande = nom === undefined ? null : commandeDe(nom);
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exitCode = 2;
    return;
  }
  if (commande === null) {
    process.stderr.write(
      nom === undefined ? usage() : `⛔ sous-commande inconnue : ${nom}\n${usage()}`
    );
    process.exitCode = 2;
    return;
  }
  const script = commande.script;
  args = [...commande.args, ...args];
  const duNoyau = typeof SOUS_COMMANDES[nom] === 'string';
  if (duNoyau && script.endsWith('.mjs')) {
    process.argv = [process.argv[0], script, ...args];
    await import(pathToFileURL(script).href);
    return;
  }
  let env;
  try {
    env = environnementDe(nom);
  } catch (e) {
    process.stderr.write(`⛔ grillhouse ${nom} : ${e.message}\n`);
    process.exitCode = 2;
    return;
  }
  lancerLeScript(nom, script, args, env);
}

if (import.meta.url === lance()) {
  await lancer(process.argv.slice(2));
}
