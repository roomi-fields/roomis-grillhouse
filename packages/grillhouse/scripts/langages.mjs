// The join of the languages: the module of language that serves a project, as Pants activates the
// backends its configuration names (`backend_packages`). The core asks it what docs/INTERFACE.md
// writes and scripts/jointure.d.ts types, and imports no other file of a module of language.
//
// - A project declares its languages in its package.json, `grillhouse.langages`, a list of names
//   of the frame's closed list (`LANGAGES`), each a module under `scripts/langages/<nom>/`. The
//   declaration is the only reading: a project that declares none, or a directory without
//   package.json, is refused, named, with the command that writes it (`grillhouse maj`).
// - What the update writes is what the modules find in the repository (`langagesTrouves`), as each
//   plugin of Nx infers its projects from its own files (`createNodes`): each module answers by
//   its `trouve`.
// - One language is served: a declaration of several is refused, each named; a name out of the
//   list is refused, the list named.
// - A module is loaded once per process, synchronously (`require` of an ES module, Node 22): the
//   locks and the guards ask it in a hook, where nothing waits.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

// The frame's languages, each its module, from this directory.
export const LANGAGES = {
  typescript: './langages/typescript/index.mjs',
  cargo: './langages/cargo/index.mjs',
};

const requis = createRequire(import.meta.url);
const charges = new Map();
const charger = nom => {
  if (!charges.has(nom)) {charges.set(nom, requis(LANGAGES[nom]).default);}
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
 * The module of the language that serves the project at <racine>. Throws when the project
 * declares none, a language out of the frame's list, or several.
 * @param {string} racine the root of the project
 * @returns {import('./jointure.js').Langage}
 */
export function langageDe(racine) {
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
  if (noms.length > 1) {
    throw new Error(
      `⛔ ${noms.join(', ')} : le cadre sert un seul langage par projet (grillhouse.langages de ${fichier}).`
    );
  }
  return charger(noms[0]);
}
