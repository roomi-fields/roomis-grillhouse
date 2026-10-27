// The types of ./resultats.mjs as the entry `@roomi-fields/grillhouse/resultats` publishes it, for
// a project's guard that writes its findings in SARIF.

/**
 * A finding of a guard: its `fichier` (from the root) and its `ligne` (from 1) place it, `regle`
 * is the guard's own rule, `niveau` the SARIF level (`error` by default) and `genre` who settles
 * it (`a-corriger`, the default, or `a-arbitrer`, a person, never a developpeur).
 */
export type Constat = {
  fichier?: string;
  ligne?: number;
  message: string;
  regle?: string;
  niveau?: 'error' | 'warning' | 'note' | 'none';
  genre?: 'a-corriger' | 'a-arbitrer';
};

/**
 * Writes the SARIF 2.1.0 of the findings `constats` of `garde` at `racine` under the results
 * directory `GRILLHOUSE_RESULTATS` of `env` (`process.env` by default): its path, or null without
 * the variable. A green guard writes its run too, `constats` empty.
 */
export function ecrireSarif(options: {
  garde: string;
  constats: Constat[];
  racine?: string;
  env?: Record<string, string | undefined>;
}): string | null;
