// The bilans the circuit keeps in the main tree (`.claude/worktrees/<ticket>.bilan.json`, written
// by scripts/bilan.mjs) and their key figures: what the board (scripts/tableau.mjs) reads of them.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const MINUTE = 60_000;

export const dossier = racine => path.join(racine, '.claude', 'worktrees');
export const SUFFIXE = '.bilan.json';

export const minutes = ms => Math.round(ms / MINUTE);
export const pourcent = (x, sur) => (sur ? Math.round((100 * x) / sur) : 0);
export const dollars = x => (x ?? 0).toFixed(2).replace('.', ',');

// The key figures of the bilan <b> in one sentence, as the ticket's card shows them.
export const enBref = b =>
  `Bilan : ${minutes(b.mur)} min, ${pourcent(b.perdu, b.mur)} % perdus, ${b.seances.total} séances, ${dollars(b.cout)} $.`;

// The bilans kept in the main tree <racine>, by ticket; a file that does not parse is left out.
export function bilansGardes(racine) {
  const d = dossier(racine);
  const out = {};
  if (!existsSync(d)) {
    return out;
  }
  for (const n of readdirSync(d).filter(x => x.endsWith(SUFFIXE))) {
    try {
      const b = JSON.parse(readFileSync(path.join(d, n), 'utf8'));
      if (b?.ticket) {
        out[b.ticket] = b;
      }
    } catch {
      // A torn bilan counts nothing.
    }
  }
  return out;
}
