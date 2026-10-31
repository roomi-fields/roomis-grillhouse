// The join of the languages: the modules of language that serve a project, as Pants activates the
// backends its configuration names (`backend_packages`). The core asks them what docs/INTERFACE.md
// writes and scripts/jointure.d.ts types, and imports no other file of a module of language.
//
// - A project declares its languages in its package.json, `grillhouse.langages`, a list of names
//   of the frame's closed list (`LANGAGES`), each a module under `scripts/langages/<nom>/`. The
//   declaration is the only reading (`langagesDeclares`, the one function that reads it): a
//   project that declares none, or a directory without package.json, is refused, named, with the
//   command that writes it (`grillhouse maj`).
// - What the update writes is what the modules find in the repository (`langagesTrouves`), as each
//   plugin of Nx infers its projects from its own files (`createNodes`): each module answers by
//   its `trouve`.
// - A project has several languages, a package one, as Bazel and Nx run one list of targets, one
//   tool per language: `langagesDe` gives the declared modules, in the order of the declaration,
//   and `langageDe` their join (./composition-des-langages.mjs), which gives each file to the
//   module of its component, the module itself when one is declared. A name out of the list, or
//   one declared twice, is refused, named.
// - A module is loaded once per process, synchronously (`require` of an ES module, Node 22): the
//   locks and the guards ask it in a hook, where nothing waits.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { composer } from './composition-des-langages.mjs';

// The frame's languages, each its module, from this directory.
export const LANGAGES = {
  typescript: './langages/typescript/index.mjs',
  cargo: './langages/cargo/index.mjs',
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

// The languages the project at <racine> declares (`grillhouse.langages` of its package.json), an
// empty list when it declares none.
export function langagesDeclares(racine) {
  let declares;
  try {
    declares = JSON.parse(readFileSync(path.join(racine, 'package.json'), 'utf8'))?.grillhouse
      ?.langages;
  } catch {
    declares = undefined;
  }
  return Array.isArray(declares) ? declares.map(String) : [];
}

// The languages of the frame whose module finds its code in the repository at <racine>, in the
// order of the list.
export function langagesTrouves(racine) {
  return Object.keys(LANGAGES).filter(nom => charger(nom).trouve(racine));
}

/**
 * The modules of the languages the project at <racine> declares, in the order of the declaration.
 * Throws when it declares none, a language out of the frame's list, or one twice.
 * @param {string} racine the root of the project
 * @returns {import('./jointure.js').Langage[]}
 */
export function langagesDe(racine) {
  const noms = langagesDeclares(racine);
  const fichier = path.join(racine, 'package.json');
  if (noms.length === 0) {
    throw new Error(
      `⛔ ${fichier} ne déclare aucun langage (grillhouse.langages) ; \`npx grillhouse maj\` l'écrit d'après ce qu'il trouve (les langages du cadre : ${Object.keys(LANGAGES).join(', ')}).`
    );
  }
  const inconnus = noms.filter(n => !Object.hasOwn(LANGAGES, n));
  if (inconnus.length) {
    throw new Error(
      `⛔ langage inconnu du cadre : ${inconnus.join(', ')} (grillhouse.langages de ${fichier}) ; les langages du cadre : ${Object.keys(LANGAGES).join(', ')}.`
    );
  }
  const doubles = [...new Set(noms.filter((n, i) => noms.indexOf(n) !== i))];
  if (doubles.length) {
    throw new Error(
      `⛔ ${doubles.join(', ')} : déclaré deux fois (grillhouse.langages de ${fichier}).`
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
