// The types of ./conformite.mjs as the entry `@roomi-fields/grillhouse/conformite` publishes it:
// the suite of conformity of a module of language to the join (./jointure.d.ts).
import type { Langage } from './jointure.js';

/** A case of the join: the faults its check finds on the valid entry (none expected) and on the
 * defective entry (exactly `attendu` expected). */
export interface Cas {
  nom: string;
  valide(): string[];
  invalide(): string[];
  attendu: string[];
}

/** The entries of a module of language, prepared once under a directory. */
export interface Exemples {
  preparer(dans: string): Record<string, unknown>;
}

/** The cases of the join for the module `langage`, its entries `exemples` prepared under `dans`. */
export function cas(langage: Langage, exemples: Exemples, options?: { dans?: string }): Cas[];

/** The cases the module `langage` fails, each with its reason. */
export function echecs(
  langage: Langage,
  exemples: Exemples,
  options?: { dans?: string }
): { nom: string; raison: string }[];
