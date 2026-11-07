// The configurations of the tests a project extends (scripts/langages/typescript/vitest-config/),
// which Vite bundles with esbuild at their load, following every relative import, static or
// dynamic with a literal path: none of the modules they reach imports the built `dist/`, which a
// project of trial does not hold beside the frame's scripts (grillhouse-essais, cadre.ts
// `copierLesScripts`), so that its configuration loads (the night of the branch temporal: « Could
// not resolve "../dist/temporal/client.js" » from copies-finies.mjs).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPTS = path.resolve(__dirname, '../../scripts');
const CONFIGS = path.join(SCRIPTS, 'langages/typescript/vitest-config');
const ENTREES = ['base.mjs', 'vitest.nuit.config.mjs', 'machine.setup.mjs'].map(f =>
  path.join(CONFIGS, f)
);
const MOTIF = /(?:from\s+|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g;

// Each relative import of the graph from <entrees>, as `module → specifier`.
function importsDuGraphe(entrees: string[]): { de: string; vers: string; chemin: string }[] {
  const vus = new Set<string>();
  const out: { de: string; vers: string; chemin: string }[] = [];
  const pile = entrees.filter(f => existsSync(f));
  while (pile.length) {
    const f = pile.pop()!;
    if (vus.has(f)) {
      continue;
    }
    vus.add(f);
    for (const m of readFileSync(f, 'utf8').matchAll(MOTIF)) {
      const chemin = path.resolve(path.dirname(f), m[1]!);
      out.push({ de: path.relative(SCRIPTS, f), vers: m[1]!, chemin });
      if (
        /\.m?js$/.test(chemin) &&
        existsSync(chemin) &&
        !chemin.includes(`${path.sep}dist${path.sep}`)
      ) {
        pile.push(chemin);
      }
    }
  }
  return out;
}

describe('the configurations of the tests load without the built dist/', () => {
  it('no module their imports reach imports dist/', () => {
    const graphe = importsDuGraphe(ENTREES);
    // The walk reaches the lock of the machine and the removal of the finished copies.
    expect(graphe.map(x => x.de)).toEqual(
      expect.arrayContaining(['verrou-de-machine.mjs', 'copies-finies.mjs'])
    );
    const versDist = graphe
      .filter(x => x.chemin.split(path.sep).includes('dist'))
      .map(x => `${x.de} → ${x.vers}`);
    expect(versDist).toEqual([]);
  });
});
