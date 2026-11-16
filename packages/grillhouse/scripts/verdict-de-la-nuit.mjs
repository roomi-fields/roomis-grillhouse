// The durable verdict of a project's night: the night pass (scripts/nuit.sh) notes it at its end in
// `<git common dir>/nuit/verdict`, and the board reads it without a server. `vert` when the pass
// exits 0, `rouge` for any other code but 75 (a missing code included); 75 (« à repasser ») writes
// nothing and leaves the previous verdict. A read that fails gives no verdict.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CODE_A_REPASSER = 75;
const fichierDuVerdict = commun => path.join(commun, 'nuit', 'verdict');

/**
 * @param {string} commun the git common dir of the project
 * @param {number} code the exit code of the night pass
 * @returns {'vert' | 'rouge' | null} the verdict written, null when the night is to be replayed
 */
export function noterLeVerdict(commun, code) {
  if (code === CODE_A_REPASSER) {
    return null;
  }
  const verdict = code === 0 ? 'vert' : 'rouge';
  mkdirSync(path.join(commun, 'nuit'), { recursive: true });
  writeFileSync(fichierDuVerdict(commun), `${verdict}\n`);
  return verdict;
}

/**
 * @param {string | null} commun the git common dir of the project
 * @returns {'vert' | 'rouge' | null} the last night's verdict, null when none is known or it does not read
 */
export function lireLeVerdict(commun) {
  if (!commun) {
    return null;
  }
  try {
    const v = readFileSync(fichierDuVerdict(commun), 'utf8').trim();
    return v === 'vert' || v === 'rouge' ? v : null;
  } catch {
    return null;
  }
}

// `node verdict-de-la-nuit.mjs <commun> <code>`: what nuit.sh calls at the end of the night.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [commun, code] = process.argv.slice(2);
  noterLeVerdict(commun, code === undefined || code === '' ? NaN : Number(code));
}
