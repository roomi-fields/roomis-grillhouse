#!/usr/bin/env node
// The index of the interfaces of a project of Python: one line per package, from its
// `docs/INTERFACE.md`, and one for the root's, which an agent loads at start before opening an
// interface; a generated file of the module (`fichiersEngendres` of ./index.mjs), as the module
// cargo's (../cargo/index-interfaces.mjs), whose file and form it keeps. In a project of several
// languages the core's index takes its place, assembled from each module's entries.
//
//   node index-interfaces.mjs             writes docs/agents/index-des-interfaces.md
//   node index-interfaces.mjs --verifier  refuses (exit 1) when that file is out of date, its
//                                         finding in SARIF too (../../resultats.mjs)
//   node index-interfaces.mjs --publie <composant>
//                                         prints nothing: a package's interface names no
//                                         consumer, which the launcher reads (lancer.sh)
//
// - The entries are those of ./composants.mjs (`entreesDeLIndex`), in their paths' order.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ecrireSarif } from '../../resultats.mjs';
import { entreesDeLIndex } from './composants.mjs';

export const SORTIE = 'docs/agents/index-des-interfaces.md';
export const GARDE = 'index-interfaces';
const ICI = fileURLToPath(import.meta.url);

/** The index of the interfaces of the project at <racine>, as its file holds it. */
export function index(racine) {
  return [
    '# Index des interfaces',
    '',
    'Généré depuis les `INTERFACE.md` des paquets Python ; ne pas éditer.',
    "Une ligne par composant ; l'interface donne le détail.",
    '',
    ...entreesDeLIndex(racine).flatMap(e => e.lignes),
  ].join('\n');
}

/** The findings of the check of the index at <racine>: none when its file is up to date. */
export function enRetard(racine) {
  const cible = path.join(racine, SORTIE);
  const present = existsSync(cible) ? readFileSync(cible, 'utf8') : '';
  return present === index(racine)
    ? []
    : [
        {
          fichier: SORTIE,
          message: `${SORTIE} n'est pas à jour avec les interfaces : sa commande le régénère (node ${JSON.stringify(ICI)}).`,
        },
      ];
}

/**
 * Runs the command in the project at <racine> with <args>: its exit code.
 * @param {string} racine
 * @param {string[]} args `--verifier` to check, `--publie` to print nothing, nothing to write
 * @param {{ env?: NodeJS.ProcessEnv }} [o]
 */
export function commande(racine, args, { env = process.env } = {}) {
  if (args.includes('--publie')) {
    return 0;
  }
  if (!args.includes('--verifier')) {
    mkdirSync(path.dirname(path.join(racine, SORTIE)), { recursive: true });
    writeFileSync(path.join(racine, SORTIE), index(racine));
    return 0;
  }
  const refus = enRetard(racine);
  for (const r of refus) {
    process.stderr.write(`⛔ ${r.message}\n`);
  }
  ecrireSarif({ garde: GARDE, racine, constats: refus, env });
  return refus.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = commande(process.cwd(), process.argv.slice(2));
}
