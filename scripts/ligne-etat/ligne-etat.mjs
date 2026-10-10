#!/usr/bin/env node
// The status line of a Grillhouse project: the person's own status line on the left, the chantier
// in progress on the right. The project's settings name it as their `statusLine` command.
//
//   node scripts/ligne-etat/ligne-etat.mjs    reads Claude Code's status line input on stdin
//
// - The left part: the status line command of the person's own settings (~/.claude/settings.json),
//   run on the same input; without one, `defaut.sh` beside this file.
// - The right part: `grillhouse-etat.txt` in the project's common git directory, which each
//   measure of the board writes (`scripts/tableau.mjs`), dim, aligned on the terminal's width
//   (COLUMNS), on the first line.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
// The columns Claude Code keeps around the status line: two before it, two after.
const MARGE = 4;

// A colour sequence of the terminal (ESC [ … m).
const COULEUR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

/** A text without its colour sequences. @param {string} texte */
export const sansCouleur = texte => texte.replace(COULEUR, '');

/** The cells a text takes on screen. @param {string} texte */
export const largeurVisible = texte => Array.from(sansCouleur(texte)).length;

/**
 * The left part with the right one aligned on `colonnes`, on its first line; at least two spaces
 * between them.
 * @param {string} gauche
 * @param {string} droite
 * @param {number} colonnes
 * @returns {string}
 */
export function composer(gauche, droite, colonnes) {
  if (!droite) {
    return gauche;
  }
  const [premiere, ...suite] = gauche.split('\n');
  const vide = Math.max(2, colonnes - largeurVisible(premiere) - largeurVisible(droite) - MARGE);
  return [`${premiere}${' '.repeat(vide)}\x1b[0;90m${droite}\x1b[0m`, ...suite].join('\n');
}

/**
 * The status line command of the person's own settings, or null: none, or this one.
 * @param {string} home
 * @returns {string | null}
 */
export function commandePersonnelle(home) {
  try {
    const s = JSON.parse(readFileSync(path.join(home, '.claude', 'settings.json'), 'utf8'));
    const c = s.statusLine?.type === 'command' ? s.statusLine.command : null;
    return c && !c.includes('ligne-etat/ligne-etat.mjs') ? c : null;
  } catch {
    return null;
  }
}

// What a command prints on `entree`, its output kept when it fails.
function sortie(commande, entree, cwd) {
  try {
    return execFileSync('/bin/sh', ['-c', commande], { input: entree, cwd, encoding: 'utf8' });
  } catch (e) {
    return typeof e.stdout === 'string' ? e.stdout : '';
  }
}

// The chantier in progress the board last wrote for the project at `projet`, or ''.
function etat(projet) {
  try {
    const commun = execFileSync(
      'git',
      ['-C', projet, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
    return readFileSync(path.join(commun, 'grillhouse-etat.txt'), 'utf8').split('\n')[0].trim();
  } catch {
    return '';
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const entree = readFileSync(0, 'utf8');
  const projet = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const commande = commandePersonnelle(os.homedir()) ?? `bash "${path.join(ICI, 'defaut.sh')}"`;
  const gauche = sortie(commande, entree, projet).replace(/\n+$/, '');
  const colonnes = Number(process.env.COLUMNS) || 80;
  process.stdout.write(`${composer(gauche, etat(projet), colonnes)}\n`);
}
