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
// - The entries are each module's, in the order of their interfaces' paths; an interface two
//   modules give (the root's) is written once, the first module's in the order of the declaration.
// - The finding of the check carries the name `index-interfaces`, as each module's.
// - Any other argument goes to the command `index-interfaces` of each module that describes it,
//   which writes nothing then: what the providers of a component publish.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ecrireSarif } from './resultats.mjs';

/** This script. */
export const SCRIPT = fileURLToPath(import.meta.url);
/** The index of the interfaces, from the root. */
export const SORTIE = 'docs/agents/index-des-interfaces.md';
/** The name its finding carries, its command's in a module and in the project. */
export const GARDE = 'index-interfaces';

/**
 * The index of the interfaces of the project at <racine>, from the modules <modules>.
 * @param {string} racine
 * @param {import('./jointure.js').Langage[]} modules
 */
export function index(racine, modules) {
  const parRel = new Map();
  for (const m of modules) {
    for (const e of m.entreesDeLIndex(racine)) {
      if (!parRel.has(e.rel)) {
        parRel.set(e.rel, e.lignes);
      }
    }
  }
  const corps = [...parRel]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .flatMap(([, lignes]) => lignes);
  return [
    '# Index des interfaces',
    '',
    'Généré par `npx grillhouse index-interfaces` depuis les `INTERFACE.md` de chaque langage ; ne pas éditer.',
    "Une ligne par composant, puis, selon son langage, une par élément qu'il fournit ; l'interface donne le détail.",
    '',
    ...corps,
  ].join('\n');
}

/**
 * The findings of the check of the index of the project at <racine>: none when it is up to date.
 * @param {string} racine
 * @param {import('./jointure.js').Langage[]} modules
 */
export function enRetard(racine, modules) {
  const cible = path.join(racine, SORTIE);
  const present = existsSync(cible) ? readFileSync(cible, 'utf8') : '';
  return present === index(racine, modules)
    ? []
    : [
        {
          fichier: SORTIE,
          message: `${SORTIE} n'est pas à jour avec les interfaces : npx grillhouse index-interfaces le régénère.`,
        },
      ];
}

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
