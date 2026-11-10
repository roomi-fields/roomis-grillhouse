// The types of ./langages.mjs the frame reads (src/temporal/installation.ts, its tests).
import type { Composition, Langage } from './jointure.js';

/** The frame's languages, each its module, from this directory. */
export const LANGAGES: Record<string, string>;

/** The module of the language <nom> of the frame's list, loaded once per process. */
export function langage(nom: string): Langage;

/** The languages the project at <racine> declares, each once, in the order of its table; empty
 * without document, table or language. */
export function langagesDeclares(racine: string): string[];

/** The modules of the languages the project at <racine> declares, in the order of its table;
 * throws when it declares none, or a language out of the frame's list. */
export function langagesDe(racine: string): Langage[];

/** The join of the modules that serve the project at <racine>: the module itself when the project
 * declares one, else their composition. */
export function langageDe(racine: string): Composition;
