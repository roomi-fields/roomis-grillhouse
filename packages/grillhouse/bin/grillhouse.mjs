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
// - A subcommand missing or unknown writes the usage and the list of the subcommands on the error
//   stream, and the exit code is 2.
// - A script finds its neighbours by its own directory, and the project by the working directory
//   (`CLAUDE_PROJECT_DIR` for a hook of Claude Code): the package works wherever it is installed.
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { constants } from 'node:os';
import { pathToFileURL } from 'node:url';
import { commandeDe, SOUS_COMMANDES, sousCommandes } from '../scripts/sous-commandes.mjs';

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

// The script of the subcommand, run (see the header); the exit code is set, never forced
// (`process.exitCode`), so that what the command wrote on a pipe reaches its reader.
async function lancer([nom, ...args]) {
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
  const enfant = script.endsWith('.sh')
    ? spawn('bash', [script, ...args], { stdio: 'inherit' })
    : spawn(process.execPath, [script, ...args], { stdio: 'inherit' });
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
