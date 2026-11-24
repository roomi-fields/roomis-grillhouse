// The reading of the key `grillhouse.circuits` of a package.json, read as written: an integer of
// 1 or more, the number of circuits of the project that run at once, which the queue of its
// tickets (src/temporal/tickets/) holds; absent or null, 1. Any other value is a fault, which
// the queue names before any work. Architecture: docs/architecture/machine.md (§4.1, §5.4).
import { readFileSync } from 'node:fs';
import path from 'node:path';

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

// The minutes between the reading of a question of a circuit that nobody answered and its
// reminder, by default.
export const RAPPEL_PAR_DEFAUT = 10;

// The reading of the key `grillhouse.rappel` of a package.json: the minutes between the reading of
// a question and its reminder, a number above 0; absent or null, 10. Any other value
// is a fault, named with its value.
// Returns { minutes, faute }: `minutes` null on a fault; `faute` null when the key reads.
export function reglageDuRappel(pkg) {
  const r = pkg?.grillhouse?.rappel;
  if (r === undefined || r === null) {
    return { minutes: RAPPEL_PAR_DEFAUT, faute: null };
  }
  if (typeof r !== 'number' || !(r > 0) || !Number.isFinite(r)) {
    return {
      minutes: null,
      faute: `grillhouse.rappel vaut ${JSON.stringify(r)}, pas un nombre > 0.`,
    };
  }
  return { minutes: r, faute: null };
}

/**
 * The re-presentation interval, in minutes, of the project at <racine>, as its package.json sets
 * it; 10 when the package.json does not read, and 10 too on a fault (the greffon names it).
 * @param {string} racine
 * @returns {number}
 */
export function rappelDuProjet(racine) {
  try {
    return (
      reglageDuRappel(JSON.parse(readFileSync(path.join(racine, 'package.json'), 'utf8')))
        .minutes ?? RAPPEL_PAR_DEFAUT
    );
  } catch {
    return RAPPEL_PAR_DEFAUT;
  }
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
