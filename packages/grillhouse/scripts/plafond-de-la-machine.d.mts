// The types of the ceiling of the places of the machine (./plafond-de-la-machine.mjs), which the
// activities of the workflow of the machine (src/temporal/places/activites.ts) import.

export const VARIABLE_PLACES: 'GRILLHOUSE_PLACES';
/** The file of the poste that holds the ceiling, under `~/.config/grillhouse/`. */
export const FICHIER_DE_LA_MACHINE: 'machine.env';
/** The ceiling of the places of the machine when nothing names another. */
export const PLAFOND_PAR_DEFAUT: 3;

/**
 * The ceiling of the places under <env>: GRILLHOUSE_PLACES of the environment, else of the file of
 * the poste `machine.env`, else 3; throws naming GRILLHOUSE_PLACES on a value that is not a
 * positive integer.
 */
export function plafondDe(
  env?: Record<string, string | undefined>,
  o?: { lire?: (f: string) => string | null }
): number;
