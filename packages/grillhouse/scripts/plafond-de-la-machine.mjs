// The ceiling of the places of the machine (scripts/places-de-la-machine.mjs), a configuration of
// the poste read again at each judgement, as Buildkite reads the number of its agents from its
// configuration and Nomad its `client.reserved`: the workflow of the machine reads it by an
// activity (src/temporal/places/activites.ts), the board and the number of workers of the tests
// by this same function, so that a ceiling changed counts without restarting anything.
//
// - The file of the poste `machine.env`, under the frame's directory of configuration
//   (`~/.config/grillhouse/`, scripts/fichier-du-poste.mjs), holds `GRILLHOUSE_PLACES=<n>`, as
//   `turbo-cache.env` holds the server of the cache.
// - The environment wins, as for every file of the poste: GRILLHOUSE_PLACES set (a trial machine,
//   a test) is read instead of the file. Without either, PLAFOND_PAR_DEFAUT, 3.
// - A value that is not a positive integer is refused by its name and its place.
import path from 'node:path';
import { avecLeFichierDuPoste, configurationDuPoste } from './fichier-du-poste.mjs';

export const VARIABLE_PLACES = 'GRILLHOUSE_PLACES';
/** The file of the poste that holds the ceiling, under `~/.config/grillhouse/`. */
export const FICHIER_DE_LA_MACHINE = 'machine.env';
/** The ceiling of the places of the machine when nothing names another. */
export const PLAFOND_PAR_DEFAUT = 3;

/**
 * The ceiling of the places under <env>: GRILLHOUSE_PLACES of the environment, else of the file
 * of the poste `machine.env`, else 3.
 * @param {Record<string, string | undefined>} [env]
 * @param {{ lire?: (f: string) => string | null }} [o] the reading of the file, for a trial
 * @returns {number}
 * @throws {Error} naming GRILLHOUSE_PLACES and where it is set when its value is not a positive integer
 */
export function plafondDe(env = process.env, o = {}) {
  const dedans = env[VARIABLE_PLACES] !== undefined;
  const v = avecLeFichierDuPoste(env, { fichier: FICHIER_DE_LA_MACHINE, ...o })[VARIABLE_PLACES];
  if (v === undefined || v === '') {
    return PLAFOND_PAR_DEFAUT;
  }
  if (!/^[1-9]\d*$/.test(v)) {
    const ou = dedans
      ? 'dans l’environnement'
      : `dans ${path.join(configurationDuPoste(env) ?? '~/.config/grillhouse', FICHIER_DE_LA_MACHINE)}`;
    throw new Error(
      `${VARIABLE_PLACES} vaut « ${v} » ${ou} : un entier positif est attendu (${PLAFOND_PAR_DEFAUT} par défaut).`
    );
  }
  return Number(v);
}
