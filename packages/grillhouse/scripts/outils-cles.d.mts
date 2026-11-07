// The types of ./outils-cles.mjs, for the frame's TypeScript (src/temporal/installation.ts) and
// its tests.

/** The tools of the package.json <pkg> (`grillhouse.outils`), each path resolved, and its faults. */
export function lireOutils(
  pkg: unknown,
  options?: {
    maison?: string;
    existe?: (p: string) => boolean;
    reel?: (p: string) => string;
    montages?: string[];
  }
): { outils: Record<string, string>; fautes: string[] };
/** The main tree of the repository that holds <dir>. */
export function arbrePrincipal(dir: string): string;
/** The tools of the project that holds <dir>; throws the faults of the key. */
export function outilsDe(dir: string, options?: { montages?: string[] }): Record<string, string>;
/** The environment <env> of a pass with the tools <outils>, the tools winning. */
export function avecLesOutils<T extends Record<string, string | undefined>>(
  outils: Record<string, string>,
  env: T
): T & Record<string, string>;
/** The shell's text that exports the tools <outils>, one line each. */
export function exportsDesOutils(outils: Record<string, string>): string;
