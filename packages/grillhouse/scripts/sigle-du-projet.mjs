// The short name of a project on the displays shared between projects (the line of the places, the
// board of several projects): the key `grillhouse.sigle` of its package.json (grillhouse-1lf, the
// owner's word of 2026-11-12), else its ticket prefix (`issue-prefix` of .beads/config.yaml,
// ./prefixe-des-tickets.mjs). Read like the other keys `grillhouse.*` (./circuits-cles.mjs): as
// written, a faulty value is named by its key.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { prefixe } from './prefixe-des-tickets.mjs';

// Returns { sigle, faute }: `sigle` the short name declared, null when the key is absent, null or
// faulty; `faute` the fault by its key, null when the key reads.
export function lireSigle(pkg) {
  const s = pkg?.grillhouse?.sigle;
  if (s === undefined || s === null) {
    return { sigle: null, faute: null };
  }
  if (typeof s !== 'string' || s === '' || /\s/.test(s)) {
    return {
      sigle: null,
      faute: `grillhouse.sigle vaut ${JSON.stringify(s)}, pas une chaîne non vide sans espace.`,
    };
  }
  return { sigle: s, faute: null };
}

/**
 * The sigle of the project whose root is <racine>: `{ sigle, faute }`; the declared key, else its
 * ticket prefix (the prefix also when the key is faulty, `faute` saying it); no sigle, and no
 * throw, when neither reads.
 * @param {string} racine
 * @returns {{ sigle: string | null, faute: string | null }}
 */
export function sigleDuProjet(racine) {
  let pkg = null;
  try {
    pkg = JSON.parse(readFileSync(path.join(racine, 'package.json'), 'utf8'));
  } catch {
    pkg = null;
  }
  const { sigle, faute } = lireSigle(pkg);
  if (sigle) {
    return { sigle, faute: null };
  }
  try {
    return { sigle: prefixe(racine), faute };
  } catch {
    return { sigle: null, faute };
  }
}
