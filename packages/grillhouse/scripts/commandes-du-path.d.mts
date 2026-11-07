// The types of ./commandes-du-path.mjs, for the frame's TypeScript (src/temporal/installation.ts).

/** The path of the command <nom> in the PATH of <env>, or null. */
export function trouverDansLePath(
  nom: string,
  env?: Record<string, string | undefined>
): string | null;
