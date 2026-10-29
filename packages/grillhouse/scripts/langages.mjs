// The join of the languages: the module of language that serves a project, as Pants activates the
// backends its configuration names (`backend_packages`). The core asks it what docs/INTERFACE.md
// writes and scripts/jointure.d.ts types, and imports no other file of a module of language.
//
// - A project declares its languages in its package.json, `grillhouse.langages`, a list of names
//   of the frame's closed list (`LANGAGES`), each a module under `scripts/langages/<nom>/`. A
//   project that declares none, or a directory without package.json, is read as `["typescript"]`
//   (`PAR_DEFAUT`), until grillhouse-3dr.2.3 has `init` and `maj` write the declaration.
// - One language is served: a declaration of several is refused, as their merge is grillhouse-pkl.3;
//   a name out of the list is refused, the list named.
// - A module is loaded once per process, synchronously (`require` of an ES module, Node 22): the
//   locks and the guards ask it in a hook, where nothing waits.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

// The frame's languages, each its module, from this directory.
export const LANGAGES = { typescript: './langages/typescript/index.mjs' };
export const PAR_DEFAUT = ['typescript'];

const requis = createRequire(import.meta.url);
const charges = new Map();

// The languages the project at <racine> declares (`grillhouse.langages` of its package.json), or
// PAR_DEFAUT when it declares none.
export function langagesDeclares(racine) {
  let declares;
  try {
    declares = JSON.parse(readFileSync(path.join(racine, 'package.json'), 'utf8'))?.grillhouse
      ?.langages;
  } catch {
    declares = undefined;
  }
  return Array.isArray(declares) && declares.length ? declares.map(String) : PAR_DEFAUT;
}

/**
 * The module of the language that serves the project at <racine>. Throws when the project declares
 * a language out of the frame's list, or several.
 * @param {string} racine the root of the project
 * @returns {import('./jointure.js').Langage}
 */
export function langageDe(racine) {
  const noms = langagesDeclares(racine);
  const inconnus = noms.filter(n => !Object.hasOwn(LANGAGES, n));
  if (inconnus.length) {
    throw new Error(
      `⛔ langage inconnu du cadre : ${inconnus.join(', ')} (grillhouse.langages de ${path.join(racine, 'package.json')}) ; les langages du cadre : ${Object.keys(LANGAGES).join(', ')}.`
    );
  }
  if (noms.length > 1) {
    throw new Error(
      `⛔ ${noms.join(', ')} : le cadre sert un seul langage par projet ; la fusion de plusieurs est grillhouse-pkl.3.`
    );
  }
  const [nom] = noms;
  if (!charges.has(nom)) charges.set(nom, requis(LANGAGES[nom]).default);
  return charges.get(nom);
}
