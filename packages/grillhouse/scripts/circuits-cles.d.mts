// The types of the reading of the key `grillhouse.circuits` (./circuits-cles.mjs).

/** The number of circuits at once (1 when absent), or the fault by its name. */
export function reglageDesCircuits(pkg: unknown): { max: number | null; faute: string | null };

/** The minutes between two presentations of a question not answered, by default (5). */
export const RAPPEL_PAR_DEFAUT: number;

/** The re-presentation interval in minutes (5 when absent), or the fault by its name. */
export function reglageDuRappel(pkg: unknown): { minutes: number | null; faute: string | null };

/** The re-presentation interval of the project at <racine>; 5 when it does not read. */
export function rappelDuProjet(racine: string): number;

/** The number of circuits at once of the project at <racine>, undefined when it does not read. */
export function maxDuProjet(racine: string): number | undefined;
