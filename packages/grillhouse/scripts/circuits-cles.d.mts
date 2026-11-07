// The types of the reading of the key `grillhouse.circuits` (./circuits-cles.mjs).

/** The number of circuits at once (1 when absent), or the fault by its name. */
export function reglageDesCircuits(pkg: unknown): { max: number | null; faute: string | null };
