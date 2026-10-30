#!/usr/bin/env node
// The index of the interfaces of a workspace of cargo: one line per crate, from its
// `docs/INTERFACE.md`, and one for the root's, which an agent loads at start before opening an
// interface; a generated file of the module (`fichiersEngendres` of ./index.mjs), as the module
// typescript's index (../typescript/index-interfaces.mjs), whose file and form it keeps.
//
//   node index-interfaces.mjs             writes docs/agents/index-des-interfaces.md
//   node index-interfaces.mjs --verifier  refuses (exit 1) when that file is out of date, its
//                                         finding in SARIF too (../../resultats.mjs)
//
// - An interface is found at `<crate>/docs/INTERFACE.md` for each member of the workspace
//   (./composants.mjs), and at `docs/INTERFACE.md`; in their paths' order.
// - Its title and the first sentence of the paragraph under it give its line, headed by the title
//   alone when it begins with the crate's name (followed by a blank or ending it), else by
//   `<crate> — <title>`. The root's is the crate's at the root when there is one (a crate at the
//   root, as OSC Bridge), else `(racine) — <title>`.
// - No line per element: a crate's interface has no part generated from its code, which the
//   index of the module typescript reads its elements from.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ecrireSarif } from '../../resultats.mjs';
import { composants } from './composants.mjs';

export const SORTIE = 'docs/agents/index-des-interfaces.md';
export const GARDE = 'index-interfaces';
const ICI = fileURLToPath(import.meta.url);
const RACINE = 'docs/INTERFACE.md';

const enAvant = p => p.split(path.sep).join('/');

/**
 * The interfaces of the workspace at <racine>, each `{ rel, composant }`, `composant` the crate's
 * name or `(racine)`, sorted by path.
 * @param {string} racine the root of the workspace
 */
export function interfaces(racine) {
  const parRel = new Map();
  for (const c of composants(racine)) {
    const rel = enAvant(path.relative(racine, path.join(c.dossier, 'docs', 'INTERFACE.md')));
    if (existsSync(path.join(racine, rel))) {
      parRel.set(rel, c.nom);
    }
  }
  if (existsSync(path.join(racine, RACINE)) && !parRel.has(RACINE)) {
    parRel.set(RACINE, '(racine)');
  }
  return [...parRel]
    .map(([rel, composant]) => ({ rel, composant }))
    .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}

const premierePhrase = lignes => {
  const texte = lignes.join(' ').replace(/\s+/g, ' ').trim();
  const m = /^(.+?[.!?])(\s|$)/.exec(texte);
  return m ? m[1] : texte;
};

// The lines of the interface <rel> of <composant>, its text <contenu>.
function entrees({ rel, composant }, contenu) {
  const lignes = contenu.split('\n');
  const t = lignes.findIndex(l => l.startsWith('# '));
  const titre = t >= 0 ? lignes[t].slice(2).trim() : composant;
  const paragraphe = [];
  for (const l of lignes.slice(t + 1)) {
    if (/^#{1,6} /.test(l) || (!l.trim() && paragraphe.length)) {
      break;
    }
    if (l.trim()) {
      paragraphe.push(l.trim());
    }
  }
  const parSonNom =
    composant !== '(racine)' &&
    titre.startsWith(composant) &&
    (titre.length === composant.length || /\s/.test(titre[composant.length]));
  const tetiere = parSonNom ? titre : `${composant} — ${titre}`;
  return [`## ${tetiere}`, '', `${premierePhrase(paragraphe)} (\`${rel}\`)`, ''];
}

/**
 * The index of the interfaces of the workspace at <racine>, as its file holds it.
 * @param {string} racine the root of the workspace
 */
export function index(racine) {
  const corps = interfaces(racine).flatMap(i =>
    entrees(i, readFileSync(path.join(racine, i.rel), 'utf8'))
  );
  return [
    '# Index des interfaces',
    '',
    'Généré depuis les `INTERFACE.md` des crates ; ne pas éditer.',
    "Une ligne par composant ; l'interface donne le détail.",
    '',
    ...corps,
  ].join('\n');
}

/**
 * The findings of the check of the index at <racine>: none when its file is up to date.
 * @param {string} racine the root of the workspace
 */
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
 * Runs the command in the workspace at <racine> with <args>: its exit code.
 * @param {string} racine the root of the workspace
 * @param {string[]} args `--verifier` to check, nothing to write
 * @param {{ env?: NodeJS.ProcessEnv }} [o] the environment (the results directory)
 */
export function commande(racine, args, { env = process.env } = {}) {
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
