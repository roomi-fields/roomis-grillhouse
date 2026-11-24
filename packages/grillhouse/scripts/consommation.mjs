// `grillhouse consommation [--json]`: what the heavy passes of the project consume, per kind of
// pass, read from its register (./consommation-des-passes.mjs): the number of passes, the median
// and the maximum of the cores occupied (processor time ÷ duration) and of the peak of memory.
// Architecture: docs/architecture/machine.md (§5.6).
import { pathToFileURL } from 'node:url';
import { bilanDeLaConsommation, lireLaConsommation } from './consommation-des-passes.mjs';

const GO = 1024 ** 3;
const go = o => `${(o / GO).toFixed(1)} Go`;
const coeurs = c => c.toFixed(1);

/**
 * Writes the figures of the project at <racine> through <ecrire>; returns the exit code (0).
 * @param {{ args: string[], racine: string, ecrire: (texte: string) => void }} o
 * @returns {number}
 */
export function consommation({ args, racine, ecrire }) {
  const lignes = lireLaConsommation(racine);
  const rangs = bilanDeLaConsommation(lignes);
  if (args.includes('--json')) {
    ecrire(`${JSON.stringify(rangs)}\n`);
  } else if (rangs.length === 0) {
    ecrire('aucune mesure\n');
  } else {
    for (const r of rangs) {
      // The passes of this kind that consumed clearly more than their part, the last one said.
      const depassent = lignes.filter(l => l.sorte === r.sorte && l.depasse);
      const depasse = depassent.length
        ? ` ; ⚠ ${depassent.length} dépassent leur part (la dernière, ${depassent.at(-1).depasse})`
        : '';
      ecrire(
        `${r.sorte} : ${r.passes} passes, cœurs occupés médiane ${coeurs(r.coeursMediane)} max ${coeurs(r.coeursMax)}, ` +
          `pic de mémoire médiane ${go(r.memoireMediane)} max ${go(r.memoireMax)}${depasse}\n`
      );
    }
  }
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = consommation({
    args: process.argv.slice(2),
    racine: process.cwd(),
    ecrire: t => process.stdout.write(t),
  });
}
