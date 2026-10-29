// The types of ./paquets.mjs as the entry `@roomi-fields/grillhouse/paquets` publishes it, for a
// project's guard that leaves out the packages out of the frame.

/** The code of `src/` (the root's, or a package's under `packages/`), as a pattern of a path from
 * the root: what a project publishes, out of its tests. */
export const CODE: string;
/** The script of a package that types it, which the verification plays in each package. */
export const TYPAGE: string;
/** The names listed in `racine`'s `docs/agents/hors-cadre.txt`: empty without the file. */
export function horsCadre(racine: string): Set<string>;
