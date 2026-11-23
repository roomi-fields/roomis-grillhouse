// What the Nuit flow of a project plays (`.github/workflows/nuit.yml`), read from the flow's own
// commands and never from a word of it: the night of the poste (scripts/nuit.sh) leaves the flow
// what the flow declares it plays, and plays the rest (the frame's charter, « Une mesure de temps
// joue la nuit »: the measures of time play on dedicated cores, which a shared flow lacks unless it
// declares a job that plays them).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The path of the Nuit flow in a copy. */
export const FLUX_DE_LA_NUIT = '.github/workflows/nuit.yml';

/**
 * Whether the flow written in <texte> plays the measures of time: one of its commands (a line that
 * is not a comment) runs `tests-de-nuit` with `--mesures`.
 * @param {string} texte
 */
export function leFluxJoueLesMesures(texte) {
  return texte
    .split('\n')
    .filter(ligne => !ligne.trim().startsWith('#'))
    .some(ligne => /\btests-de-nuit\b.*(?:^|\s)--mesures(?:\s|$)/.test(ligne));
}

/**
 * Whether the Nuit flow of the copy at <racine> plays the measures of time; false without a flow.
 * @param {string} racine
 */
export function fluxDuProjetJoueLesMesures(racine) {
  const f = path.join(racine, FLUX_DE_LA_NUIT);
  return existsSync(f) && leFluxJoueLesMesures(readFileSync(f, 'utf8'));
}

//   node flux-de-la-nuit.mjs mesures <copie>   exit 0 when the flow of the copy plays the measures
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [commande, copie] = process.argv.slice(2);
  process.exitCode = commande === 'mesures' && copie && fluxDuProjetJoueLesMesures(copie) ? 0 : 1;
}
