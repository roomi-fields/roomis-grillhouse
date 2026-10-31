// The tables of the components of a project, in its docs/ARCHITECTURE.md: where the project
// declares the language of each package, as the BUILD file of Bazel names the rule of each target.
// The core reads them (./langages.mjs), the guard of the languages judges the packages against
// them (./langages-des-paquets.mjs), and the migration of 0.27.0 writes their column
// (./migrations/0.27.0-langages-dans-l-architecture.mjs).
//
// - A table of the components is a table of Markdown of docs/ARCHITECTURE.md whose header holds a
//   column « Langage » (COLONNE): BPScript's table of the stages, and its section « Les paquets »
//   for the packages that table does not name; each counts, in the order of the document. A row
//   declares a package when its cell of that column is not empty: the language is that cell, its backquotes and its case left out. A row
//   with an empty cell names a part that is no package of the project (a crate of another
//   repository, a folder of data).
// - The names of a cell are its spans in backquotes, the whole cell when it has none: « `osd`
//   (`osd/`, the workspace) » names `osd` and `osd/`, « service » names service.
// - A row names a component when one name of its cell of the names is the component's folder name,
//   its package name or its path from the root (`.` for the root; a trailing `/` and a leading
//   `./` left out). The column of the names of a table is its first column, left to right, where a
//   cell names a component: the phase of BPScript's table comes before its package, the crates a row calls
//   come after the component of SyntHub's.
// - A cell holds no `|` but in backquotes, as GitHub's tables read it.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** The document that holds the table, from the root of the project. */
export const ARCHITECTURE = 'docs/ARCHITECTURE.md';
/** The header of the column of the languages. */
export const COLONNE = 'Langage';

// The cells of the row <ligne> of a table, its outer pipes left out.
export function cellules(ligne) {
  const out = [];
  let courante = '';
  let code = false;
  for (const c of ligne.trim().replace(/^\|/, '')) {
    if (c === '`') {
      code = !code;
    }
    if (c === '|' && !code) {
      out.push(courante.trim());
      courante = '';
    } else {
      courante += c;
    }
  }
  if (courante.trim() !== '') {
    out.push(courante.trim());
  }
  return out;
}

const SEPARATEUR = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

/**
 * The tables of Markdown of <texte>: `{ entete, ligneEntete, lignes }`, `ligneEntete` the index of
 * its header in the lines of the text, each row `{ index, cellules }`.
 * @param {string} texte
 */
export function tableaux(texte) {
  const lignes = texte.split('\n');
  const out = [];
  for (let i = 0; i + 1 < lignes.length; i++) {
    if (!lignes[i].trim().startsWith('|') || !SEPARATEUR.test(lignes[i + 1].trim())) {
      continue;
    }
    const t = { entete: cellules(lignes[i]), ligneEntete: i, lignes: [] };
    let j = i + 2;
    while (j < lignes.length && lignes[j].trim().startsWith('|')) {
      t.lignes.push({ index: j, cellules: cellules(lignes[j]) });
      j++;
    }
    out.push(t);
    i = j - 1;
  }
  return out;
}

/** The index of the column of the languages in the header <entete>, -1 without one. */
export const colonneDesLangages = entete =>
  entete.findIndex(c => c.replace(/[`*]/g, '').trim().toLowerCase() === COLONNE.toLowerCase());

/**
 * The tables of the components of the project at <racine> (each table whose header holds the
 * column « Langage »), in the order of the document, each with `colonne`, the index of that
 * column; none without document or without such a table.
 * @param {string} racine
 */
export function tableauxDesComposants(racine) {
  const f = path.join(racine, ARCHITECTURE);
  if (!existsSync(f)) {
    return [];
  }
  return tableaux(readFileSync(f, 'utf8'))
    .filter(x => colonneDesLangages(x.entete) >= 0)
    .map(t => ({ ...t, colonne: colonneDesLangages(t.entete) }));
}

/** The language a cell declares: its text without backquotes nor emphasis, lower case. */
export const langageDeLaCellule = cellule =>
  (cellule ?? '').replace(/[`*]/g, '').trim().toLowerCase();

/** The names of the cell <cellule>: its spans in backquotes, the whole cell without one. */
export function nomsDe(cellule) {
  const spans = [...(cellule ?? '').matchAll(/`([^`]+)`/g)].map(m => m[1].trim());
  const noms = spans.length ? spans : [(cellule ?? '').trim()];
  return noms.filter(Boolean).map(n => n.replace(/^\.\//, '').replace(/(.)\/$/, '$1'));
}

/**
 * Whether one of <noms> names the component <c> of the project at <racine>.
 * @param {string[]} noms
 * @param {import('./jointure.js').Composant} c
 * @param {string} racine
 */
export function nomme(noms, c, racine) {
  const rel = path.relative(racine, c.dossier).split(path.sep).join('/') || '.';
  return noms.some(n => n === c.nom || n === c.paquet || n === rel);
}

/**
 * The column of the names of the rows <lignes>: the first, left to right, out of <hors>, where a
 * cell names one of the components <composants>; -1 when none does.
 * @param {{ cellules: string[] }[]} lignes
 * @param {import('./jointure.js').Composant[]} composants
 * @param {string} racine
 * @param {number} [hors] a column left out (the languages')
 */
export function colonneDesNoms(lignes, composants, racine, hors = -1) {
  const largeur = Math.max(0, ...lignes.map(l => l.cellules.length));
  for (let i = 0; i < largeur; i++) {
    if (i === hors) {
      continue;
    }
    if (lignes.some(l => composants.some(c => nomme(nomsDe(l.cellules[i]), c, racine)))) {
      return i;
    }
  }
  return -1;
}
