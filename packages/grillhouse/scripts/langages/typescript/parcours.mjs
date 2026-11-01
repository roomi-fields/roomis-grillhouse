// The walk of the repository every guard of the module typescript makes: the files under a path,
// Vite's temporary files never listed, a file or a directory gone before the walk reaches it
// passed over. The guards walk the repository while other processes write in it (`npm run
// verifier` plays them beside the tests). Node alone (./vitest-config/lances.mjs, which the
// configuration of Vitest loads, imports it).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

// The temporary file Vite writes beside a configuration it bundles, then removes
// (`vitest.config.ts.timestamp-<n>-<hash>.mjs`).
const TEMPORAIRE_DE_VITE = /\.timestamp-[^/\\]*\.mjs$/;

// <f> read by <lire>, or <absent> when it no longer exists (ENOENT).
function siPresent(lire, f, absent) {
  try {
    return lire(f);
  } catch (e) {
    if (e?.code === 'ENOENT') return absent;
    throw e;
  }
}

/**
 * The files under <chemin> (a directory, or a file), each its absolute path: an entry below it
 * whose path <sauter> keeps out is neither entered nor listed, and Vite's temporary files are
 * never listed.
 * @param {string} chemin
 * @param {(p: string) => boolean} [sauter]
 * @returns {string[]}
 */
export function parcourir(chemin, sauter = () => false) {
  const out = [];
  const walk = (p, dossier) => {
    if (!dossier) {
      if (!TEMPORAIRE_DE_VITE.test(p)) out.push(p);
      return;
    }
    for (const e of siPresent(d => readdirSync(d, { withFileTypes: true }), p, [])) {
      const q = path.join(p, e.name);
      if (!sauter(q)) walk(q, e.isDirectory());
    }
  };
  const racine = siPresent(statSync, chemin, null);
  if (racine) walk(chemin, racine.isDirectory());
  return out;
}

/** The text of the file <f> a walk listed, or null when it is gone since. */
export const lireSiPresent = f => siPresent(x => readFileSync(x, 'utf8'), f, null);
