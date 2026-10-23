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
 * to print after them.
 */
export function trancher(
  racine: string,
  garde: string,
  constats: Constat[],
  mode?: string,
  env?: Record<string, string | undefined>
): { refus: Constat[]; lignes: string[] };
