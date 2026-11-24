// The durable verdict of a project's night (packages/grillhouse/docs/architecture/entree.md §3.1
// « Verdict de la nuit », §4.1, §5.3), in two parts: the night plays on two machines, the part
// of PC2 (the tranches of the Nuit flow, which PC3 reads by `gh`) and the part of PC3 (the tests of
// the poste, scripts/nuit.sh). Each part is noted at its end in `<git common dir>/nuit/verdict` (PC3)
// and `<git common dir>/nuit/verdict-pc2` (PC2), and the board reads them without a server. A part is
// `vert` when it exits 0, `rouge` for any other code but 75 (a missing code included); 75 (« à
// repasser ») writes nothing and leaves the previous verdict of that part, the other untouched. The
// night is `rouge` when a part is, else `vert` when a part is, else none. A read that fails gives
// no verdict for that part.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CODE_A_REPASSER = 75;
const FICHIERS = { pc2: 'verdict-pc2', pc3: 'verdict' };
const fichierDuVerdict = (commun, part) => path.join(commun, 'nuit', FICHIERS[part]);

/**
 * @param {string} commun the git common dir of the project
 * @param {number} code the exit code of the part's pass
 * @param {'pc2' | 'pc3'} [part] the part noted: that of the machine that plays, PC3 by default
 * @returns {'vert' | 'rouge' | null} the verdict written, null when the part is to be replayed
 */
export function noterLeVerdict(commun, code, part = 'pc3') {
  if (code === CODE_A_REPASSER) {
    return null;
  }
  const verdict = code === 0 ? 'vert' : 'rouge';
  mkdirSync(path.join(commun, 'nuit'), { recursive: true });
  writeFileSync(fichierDuVerdict(commun, part), `${verdict}\n`);
  return verdict;
}

function lireLaPart(commun, part) {
  try {
    const v = readFileSync(fichierDuVerdict(commun, part), 'utf8').trim();
    return v === 'vert' || v === 'rouge' ? v : null;
  } catch {
    return null;
  }
}

/**
 * @param {string | null} commun the git common dir of the project
 * @returns {{ pc2: 'vert' | 'rouge' | null, pc3: 'vert' | 'rouge' | null }} each part's last verdict,
 * null when it has none or it does not read
 */
export function lireLesParts(commun) {
  if (!commun) {
    return { pc2: null, pc3: null };
  }
  return { pc2: lireLaPart(commun, 'pc2'), pc3: lireLaPart(commun, 'pc3') };
}

/**
 * @param {string | null} commun the git common dir of the project
 * @returns {'vert' | 'rouge' | null} the last night's verdict over its two parts, null when none is known
 */
export function lireLeVerdict(commun) {
  const parts = Object.values(lireLesParts(commun));
  if (parts.includes('rouge')) {
    return 'rouge';
  }
  return parts.includes('vert') ? 'vert' : null;
}

// `node verdict-de-la-nuit.mjs <commun> <code> [pc2|pc3]`: what nuit.sh calls at the end of the night.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [commun, code, part] = process.argv.slice(2);
  noterLeVerdict(
    commun,
    code === undefined || code === '' ? NaN : Number(code),
    part === 'pc2' ? 'pc2' : 'pc3'
  );
}
