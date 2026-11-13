import { readFileSync } from 'node:fs';
import path from 'node:path';

// The reading of the key `grillhouse.circuits` of a package.json (grillhouse-4nr.9, decision D9,
// the owner's word of 2026-11-04), read as written: an integer of 1 or more, the number of
// circuits of the project that run at once, which the queue of its tickets
// (src/temporal/tickets/) holds; absent or null, 1. Any other value is a fault, which the queue
// names before any work.

// Returns { max, faute }: `max` the number of circuits at once, null on a fault; `faute` the
// fault by its name, null when the key reads.
export function reglageDesCircuits(pkg) {
  const c = pkg?.grillhouse?.circuits;
  if (c === undefined || c === null) {
    return { max: 1, faute: null };
  }
  if (!Number.isInteger(c) || c < 1) {
    return {
      max: null,
      faute: `grillhouse.circuits vaut ${JSON.stringify(c)}, pas un entier ≥ 1.`,
    };
  }
  return { max: c, faute: null };
}

/**
 * The number of circuits at once of the project at <racine>, as its package.json sets it; undefined
 * when the package.json or the key does not read (the queue names the fault).
 * @param {string} racine
 * @returns {number | undefined}
 */
export function maxDuProjet(racine) {
  try {
    return (
      reglageDesCircuits(JSON.parse(readFileSync(path.join(racine, 'package.json'), 'utf8'))).max ??
      undefined
    );
  } catch {
    return undefined;
  }
}
