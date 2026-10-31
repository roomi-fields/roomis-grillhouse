// The join of the languages: the modules of language that serve a project, as Pants activates the
// backends its configuration names (`backend_packages`). The core asks them what docs/INTERFACE.md
// writes and scripts/jointure.d.ts types, and imports no other file of a module of language.
//
// - A project declares the language of each package at its design, in the column « Langage » of
//   the table of the components of its docs/ARCHITECTURE.md (./tableau-des-composants.mjs), as
//   the BUILD file of Bazel names the rule of each target: nothing is guessed from the files. Its
//   languages are the set of that column, in every table that holds it, each a name of the
//   frame's closed list (`LANGAGES`), a module under `scripts/langages/<nom>/`. That column is the only reading (`langagesDeclares`,
//   the one function that reads it): a project that declares none is refused, named, with the
//   column to write. The guard of the languages (./langages-des-paquets.mjs) judges each package
//   against its row.
// - A project has several languages, a package one, as Bazel and Nx run one list of targets, one
//   tool per language: `langagesDe` gives the declared modules, in the order of the table, and
//   `langageDe` their join (./composition-des-langages.mjs), which gives each file to the module
//   of its component, the module itself when one is declared. A name out of the list is refused,
//   named.
// - A module is loaded once per process, synchronously (`require` of an ES module, Node 22): the
//   locks and the guards ask it in a hook, where nothing waits.
import { createRequire } from 'node:module';
import path from 'node:path';
import { composer } from './composition-des-langages.mjs';
import {
  ARCHITECTURE,
  COLONNE,
  langageDeLaCellule,
  tableauxDesComposants,
} from './tableau-des-composants.mjs';

// The frame's languages, each its module, from this directory.
export const LANGAGES = {
  typescript: './langages/typescript/index.mjs',
  cargo: './langages/cargo/index.mjs',
  python: './langages/python/index.mjs',
};

const requis = createRequire(import.meta.url);
const charges = new Map();
const charger = nom => {
  if (!charges.has(nom)) {
    charges.set(nom, requis(LANGAGES[nom]).default);
  }
  return charges.get(nom);
};

/**
 * The module of the language <nom> of the frame's list, loaded once per process.
 * @param {string} nom a name of LANGAGES
 * @returns {import('./jointure.js').Langage}
 */
export const langage = nom => charger(nom);

/**
 * The languages the project at <racine> declares: the cells of the column « Langage » of the tables
 * of the components of its docs/ARCHITECTURE.md (./tableau-des-composants.mjs), each once, in the
 * order of the document; an empty list without document, table or language.
 * @param {string} racine the root of the project
 * @returns {string[]}
 */
export function langagesDeclares(racine) {
  const noms = tableauxDesComposants(racine).flatMap(t =>
    t.lignes.map(l => langageDeLaCellule(l.cellules[t.colonne])).filter(Boolean)
  );
  return [...new Set(noms)];
}

/**
 * The modules of the languages the project at <racine> declares, in the order of the table.
 * Throws when it declares none, or a language out of the frame's list.
 * @param {string} racine the root of the project
 * @returns {import('./jointure.js').Langage[]}
 */
export function langagesDe(racine) {
  const noms = langagesDeclares(racine);
  const fichier = path.join(racine, ARCHITECTURE);
  if (noms.length === 0) {
    throw new Error(
      `⛔ ${fichier} ne déclare aucun langage : la colonne « ${COLONNE} » de son tableau des composants nomme le langage de chaque paquet (le grill l'écrit, branche 8 ; \`npx grillhouse maj\` y reporte la déclaration d'une version antérieure du cadre ; les langages du cadre : ${Object.keys(LANGAGES).join(', ')}).`
    );
  }
  const inconnus = noms.filter(n => !Object.hasOwn(LANGAGES, n));
  if (inconnus.length) {
    throw new Error(
      `⛔ langage inconnu du cadre : ${inconnus.join(', ')} (colonne « ${COLONNE} » de ${fichier}) ; les langages du cadre : ${Object.keys(LANGAGES).join(', ')}.`
    );
  }
  return noms.map(charger);
}

const composes = new Map();
/**
 * The join of the modules that serve the project at <racine> (`langagesDe`): the module itself
 * when the project declares one, else their composition, built once per list of languages.
 * @param {string} racine the root of the project
 * @returns {import('./jointure.js').Composition}
 */
export function langageDe(racine) {
  const modules = langagesDe(racine);
  const cle = modules.map(m => m.nom).join('+');
  if (!composes.has(cle)) {
    composes.set(cle, composer(modules));
  }
  return composes.get(cle);
}
