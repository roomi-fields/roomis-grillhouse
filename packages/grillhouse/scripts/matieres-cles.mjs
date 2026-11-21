// The folders of test material a project declares (`grillhouse.matieres` of its root package.json,
// read by ./matieres-lues.mjs, which holds the rules of the key), asked by a directory of the
// project: the callers of the circuit, the envelope, the integration, the queue and the move of a
// copy, which refuse a faulty key by its name before any work.
import { langageDe } from './langages.mjs';
import { matieresDeclarees } from './matieres-lues.mjs';

/**
 * The folders of test material that the project that holds <dir> declares, from the root, in the
 * order of the key; none without the key.
 * @param {string} dir a directory of the project: its main tree or a copy
 * @returns {string[]}
 * @throws {Error} the faults of the key, one per line
 */
export function matieresDeclareesDe(dir) {
  return matieresDeclarees(dir, d => langageDe(d).composants(d));
}
