// The results directory of a nested trial (scripts/vitest-config/resultats.setup.mjs), as Bazel
// gives each test its own outputs directory (TEST_UNDECLARED_OUTPUTS_DIR): a test file that plays
// a run of its own (a Vitest, a `npm run verifier`, a circuit in a repository of trial) hands it a
// results directory of its own, never the one of the pass that plays it.
// Witness: BPScript 325 (2026-10-21), where the toy tests of a trial (deux-lancements) wrote their
// report in the results directory of the proof that played them, which counted them as 5 reds and
// launched the developpeur on nothing.
//
// The case plays the real Vitest of the repository: a pass with the base configuration and a
// results directory, whose two test files each play a nested Vitest on a red toy test, its
// environment inherited.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { lireRapportsVitest as lire } from '../../scripts/langages/typescript/verdict.mjs';
import { RESULTATS } from '../../scripts/resultats.mjs';

// The test files of the reports of Vitest under a results directory, as the circuit reads them.
const lireRapportsVitest = (dossier: string) =>
  lire(dossier) as { fichier: string; etat: string }[];

const DEPOT = path.resolve(__dirname, '../../../..');
const BASE = path.join(DEPOT, 'packages/grillhouse/scripts/vitest-config/base.mjs');
const VITEST = path.join(DEPOT, 'node_modules/vitest/vitest.mjs');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'resultats-imbriques-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const LONG = 120_000;

const ENV = Object.fromEntries(
  Object.entries(process.env).filter(
    ([k]) => !k.startsWith('VITEST') && k !== 'NODE_OPTIONS' && !k.startsWith('GRILLHOUSE_')
  )
);
const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const config = (include: string) =>
  `import { mergeConfig } from 'vitest/config';\nimport base from ${JSON.stringify(BASE)};\nexport default mergeConfig(base, { test: { include: [${JSON.stringify(include)}] } });\n`;

// A test file of the pass: it plays the nested Vitest of <jouet> with the environment it inherits
// (Vitest's own variables aside, as a nested run needs), expects it red, and writes to <sonde> the
// results directory it saw.
const essai = (jouet: string, sonde: string) =>
  [
    "import { spawnSync } from 'node:child_process';",
    "import { writeFileSync } from 'node:fs';",
    "import { expect, it } from 'vitest';",
    `it('un essai imbriqué rouge', () => {`,
    '  const env = Object.fromEntries(',
    "    Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST') && k !== 'NODE_OPTIONS')",
    '  );',
    `  const r = spawnSync(process.execPath, [${JSON.stringify(VITEST)}, 'run'], { cwd: ${JSON.stringify(jouet)}, env, encoding: 'utf8' });`,
    '  expect(r.status, r.stdout + r.stderr).toBe(1);',
    `  writeFileSync(${JSON.stringify(sonde)}, process.env.${RESULTATS} ?? '');`,
    '}, 60_000);',
    '',
  ].join('\n');

// The trial repository: the pass's two test files, each with its red toy of trial.
function depot() {
  const r = mkdtempSync(path.join(ESSAIS, 'depot-'));
  symlinkSync(path.join(DEPOT, 'node_modules'), path.join(r, 'node_modules'), 'dir');
  ecrire(r, 'package.json', '{ "name": "essai", "private": true, "type": "module" }\n');
  ecrire(r, 'vitest.config.mjs', config('test/**/*.test.mjs'));
  const sondes = ['a', 'b'].map(nom => {
    const jouet = path.join(r, `jouets/${nom}`);
    ecrire(jouet, 'vitest.config.mjs', config('**/*.jouet.mjs'));
    ecrire(
      jouet,
      'rouge.jouet.mjs',
      "import { it } from 'vitest';\nit('rouge', () => { throw new Error('rouge du jouet'); });\n"
    );
    const sonde = path.join(r, `sonde-${nom}.txt`);
    ecrire(r, `test/${nom}.test.mjs`, essai(jouet, sonde));
    return sonde;
  });
  return { racine: r, sondes };
}

describe('a nested trial writes its results in a directory of its own', () => {
  it(
    'the red reports of the nested trials leave the pass that plays them green; each trial had its own directory, which holds its red',
    () => {
      const { racine, sondes } = depot();
      const dossier = mkdtempSync(path.join(ESSAIS, 'resultats-'));
      const r = spawnSync(process.execPath, [VITEST, 'run'], {
        cwd: racine,
        env: { ...ENV, [RESULTATS]: dossier },
        encoding: 'utf8',
      });
      expect(r.status, r.stdout + r.stderr).toBe(0);

      // Criterion 1: the pass reads its own two test files, green, and no red of the toys.
      const lus = lireRapportsVitest(dossier);
      expect(lus.map(f => path.relative(racine, f.fichier)).sort()).toEqual([
        'test/a.test.mjs',
        'test/b.test.mjs',
      ]);
      expect(lus.every(f => f.etat === 'passed')).toBe(true);

      // Criterion 2: each nested trial received a directory of its own, where its red lies.
      const propres = sondes.map(s => readFileSync(s, 'utf8'));
      expect(propres.every(d => d !== '' && d !== dossier)).toBe(true);
      expect(new Set(propres).size).toBe(2);
      for (const d of propres) {
        expect(lireRapportsVitest(d).map(f => [path.basename(f.fichier), f.etat])).toEqual([
          ['rouge.jouet.mjs', 'failed'],
        ]);
      }
    },
    LONG
  );
});
