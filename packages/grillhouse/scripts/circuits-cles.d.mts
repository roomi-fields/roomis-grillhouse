// The types of the reading of the key `grillhouse.circuits` (./circuits-cles.mjs).

/** The number of circuits at once (1 when absent), or the fault by its name. */
export function reglageDesCircuits(pkg: unknown): { max: number | null; faute: string | null };

/** The minutes between the reading of a question not answered and its reminder, by default (10). */
export const RAPPEL_PAR_DEFAUT: number;

/** The reminder delay in minutes (10 when absent), or the fault by its name. */
export function reglageDuRappel(pkg: unknown): { minutes: number | null; faute: string | null };

/** The reminder delay of the project at <racine>; 10 when it does not read. */
export function rappelDuProjet(racine: string): number;

/** The number of circuits at once of the project at <racine>, undefined when it does not read. */
export function maxDuProjet(racine: string): number | undefined;
