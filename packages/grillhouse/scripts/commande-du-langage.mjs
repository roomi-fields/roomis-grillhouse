#!/usr/bin/env node
// A command of the module of the project's language, run when the module describes it: the one
// point by which the launcher (scripts/enveloppe/lancer.sh, `construire`) and the night
// (scripts/nuit.sh, `tests-de-nuit`) play a step that a language may have or not, as a build tool
// skips a goal its backend does not bring.
//
//   node commande-du-langage.mjs <nom> [arguments…]     from the root of the project
//
// - The command is the subcommand <nom> of the module (`commandeDe` of ./sous-commandes.mjs), run
//   by Node with its arguments then these, in the working directory, this process's standard
//   streams; its exit code is this command's, 128 plus the number of a signal that ended it.
// - A project that declares no language (`grillhouse.langages`), or whose module describes no
//   command <nom>, plays nothing: exit 0.
// - A name of the core (`grillhouse <nom>`), or none, is refused, exit 2.
import { spawnSync } from 'node:child_process';
import { constants } from 'node:os';
import { pathToFileURL } from 'node:url';
import { langagesDeclares } from './langages.mjs';
import { commandeDe, SOUS_COMMANDES } from './sous-commandes.mjs';

/**
 * Runs the command <nom> of the module of the language of the project at <racine> with <args>,
 * when the project declares a language and its module describes it: its exit code, 0 otherwise.
 * @param {string} nom the command of the module
 * @param {string[]} args its arguments
 * @param {string} [racine] the root of the project, the working directory by default
 * @returns {number}
 */
export function lancerDuLangage(nom, args, racine = process.cwd()) {
  if (langagesDeclares(racine).length === 0) {
    return 0;
  }
  const c = commandeDe(nom, racine);
  if (c === null) {
    return 0;
  }
  const r = spawnSync(process.execPath, [c.script, ...c.args, ...args], {
    cwd: racine,
    stdio: 'inherit',
  });
  if (r.error) {
    process.stderr.write(`⛔ ${nom} : ${r.error.message}\n`);
    return 1;
  }
  return r.status ?? 128 + (constants.signals[r.signal ?? 'SIGTERM'] ?? 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [nom, ...args] = process.argv.slice(2);
  if (!nom || Object.hasOwn(SOUS_COMMANDES, nom)) {
    process.stderr.write('usage: commande-du-langage.mjs <commande du module> [arguments…]\n');
    process.exitCode = 2;
  } else {
    process.exitCode = lancerDuLangage(nom, args);
  }
}
