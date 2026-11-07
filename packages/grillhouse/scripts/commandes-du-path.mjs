// The search of a command in the PATH, as `command -v` finds it: the first folder of PATH that
// holds an executable file of its name. The one search of the core, which the installation of
// Temporal (src/temporal/installation.ts), the preparation of a project (./preparation.mjs) and
// the modules of language (by ./services-du-noyau.mjs) call.
import { accessSync, constants } from 'node:fs';
import path from 'node:path';

/**
 * The path of the command <nom> in the PATH of <env>, or null.
 * @param {string} nom
 * @param {Record<string, string | undefined>} [env]
 * @returns {string | null}
 */
export function trouverDansLePath(nom, env = process.env) {
  for (const d of (env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
    const f = path.join(d, nom);
    try {
      accessSync(f, constants.X_OK);
      return f;
    } catch {
      // not in this folder
    }
  }
  return null;
}
