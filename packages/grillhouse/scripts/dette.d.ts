// The types of ./dette.mjs as the entry `@roomi-fields/grillhouse/dette` publishes it, for a
// project's guard that judges its findings against the project's known debt.

/** A finding of a guard: inscribed in the debt only with its `fichier` and its `regle`. */
export type Constat = {
  fichier?: string;
  regle?: string;
  message: string;
  ligne?: number;
};

/**
 * Judges the findings of `garde` at `racine` against `grillhouse-dette.json`, in the mode `mode`
 * (`GRILLHOUSE_DETTE` by default): `refus` the findings to print as refusals, `lignes` the lines
 * to print after them. A guard that reads a part of the repository gives `mesure`, whether it read
 * a file (from the root): the keys of the other files stay as they are.
 */
export function trancher(
  racine: string,
  garde: string,
  constats: Constat[],
  mode?: string,
  env?: Record<string, string | undefined>,
  mesure?: (fichier: string) => boolean
): { refus: Constat[]; lignes: string[] };
