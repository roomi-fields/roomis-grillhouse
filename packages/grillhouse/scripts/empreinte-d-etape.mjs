// The fingerprint of a step, on the side of the activities (it hashes with `node:crypto`, which a
// decision of the circuit imports none of). Mature model: the cache key of a task of Turborepo.
import { createHash } from 'node:crypto';

/**
 * The fingerprint of a step: the hash of its <commande> and of the content hashes <hashes> of the
 * files it reads (by package, the root configuration under `//`); the same inputs give the same
 * fingerprint, whatever the order of the packages.
 */
export function empreinteDEtape({ commande, hashes }) {
  const entrees = Object.keys(hashes)
    .sort()
    .map(k => [k, hashes[k]]);
  return createHash('sha256')
    .update(JSON.stringify([commande, entrees]))
    .digest('hex');
}
