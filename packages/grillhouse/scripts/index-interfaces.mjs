#!/usr/bin/env node
// The index of the interfaces of a project of several languages, one generated file of the core,
// as a build of several languages writes one output from the outputs of each rule: each declared
// module gives the entries of its interfaces (`entreesDeLIndex` of the join), and the core
// assembles them, so that one file has one command and one check (./composition-des-langages.mjs
// gives them in place of each module's).
//
//   node index-interfaces.mjs                        writes docs/agents/index-des-interfaces.md
//   node index-interfaces.mjs --verifier             refuses (exit 1) when that file is out of
//                                                        date, its finding in SARIF too
//   node index-interfaces.mjs --publie <composant>   asks each module (./commandes-composees.mjs)
//
// - The index and its check are the composition's (`indexDesInterfaces`, `indexEnRetard`), which
//   this command writes and judges. The entries are each module's, in the order of their interfaces' paths; an interface two
//   modules give (the root's) is written once, the first module's in the order of the declaration.
// - The finding of the check carries the name `index-interfaces`, as each module's.
// - Any other argument goes to the command `index-interfaces` of each module that describes it,
//   which writes nothing then: what the providers of a component publish.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  INDEX_DES_INTERFACES,
  indexDesInterfaces as index,
  indexEnRetard as enRetard,
} from './composition-des-langages.mjs';
import { ecrireSarif } from './resultats.mjs';

/** This script. */
export const SCRIPT = fileURLToPath(import.meta.url);
/** The index of the interfaces, from the root. */
export const SORTIE = INDEX_DES_INTERFACES;
/** The name its finding carries, its command's in a module and in the project. */
export const GARDE = 'index-interfaces';

/**
 * Runs the command in the project at <racine> with <args>: its exit code.
 * @param {string} racine
 * @param {string[]} args
 * @param {{ modules: import('./jointure.js').Langage[], env?: NodeJS.ProcessEnv }} o
 */
export function commande(racine, args, { modules, env = process.env }) {
  if (args.length === 0) {
    mkdirSync(path.dirname(path.join(racine, SORTIE)), { recursive: true });
    writeFileSync(path.join(racine, SORTIE), index(racine, modules));
    return 0;
  }
  const refus = enRetard(racine, modules);
  for (const r of refus) {
    process.stderr.write(`⛔ ${r.message}\n`);
  }
  ecrireSarif({ garde: GARDE, racine, constats: refus, env });
  return refus.length ? 1 : 0;
}

// Run as a command: the join and the composed commands are loaded here, without a top-level await,
// since the join, which composes the modules with this script, is loaded by `require`.
async function principal(racine, args) {
  const { langagesDe } = await import('./langages.mjs');
  const modules = langagesDe(racine);
  if (args.length === 0 || (args.length === 1 && args[0] === '--verifier')) {
    return commande(racine, args, { modules });
  }
  const { jouer } = await import('./commandes-composees.mjs');
  return jouer('index-interfaces', args, { racine, modules });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  principal(process.cwd(), process.argv.slice(2)).then(
    code => {
      process.exitCode = code;
    },
    e => {
      process.stderr.write(`${e.message}\n`);
      process.exitCode = 1;
    }
  );
}
