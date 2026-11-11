import { spawnSync } from 'node:child_process';
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { hasBd, racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';

// Tickets grillhouse-3uv.50 and grillhouse-3uv.50.1: the suite runs on every machine where the
// project builds. A test that needs a capacity of the machine (a directory under the home, a bwrap
// sandbox, the real bd) creates it or skips with its reason, never fails for its lack. Each case
// runs the suite itself, in a child vitest, on a machine without the capacity.
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'machine-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// The package of the frame's tests, whose configuration the child vitest reads.
const RACINE = path.resolve(__dirname, '../..');
const VITEST = path.resolve(RACINE, '../../node_modules/.bin/vitest');
const NUIT = path.join(RACINE, 'scripts/langages/typescript/vitest.nuit.config.mjs');
const LONG = 120_000;
// A test name that no test carries: the child vitest loads every file and runs none of its tests.
const AUCUN = 'grillhouse-3uv.50: no test carries this name';

type Rapport = {
  numFailedTestSuites: number;
  numTotalTestSuites: number;
  testResults: {
    name: string;
    status: string;
    message: string;
    assertionResults: { title: string; status: string }[];
  }[];
};

// The environment of a child vitest: this one, without the state of the running vitest.
function environnement(ajouts: Record<string, string>) {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined && !k.startsWith('VITEST') && k !== 'NODE_OPTIONS') {
      env[k] = v;
    }
  }
  return { ...env, ...ajouts };
}

// A child vitest of the tree <racine> on <fichiers> (empty: the whole configuration), keeping the
// tests whose name matches <filtre>: its JSON report, and the temp directory it ran with. That
// temp directory lives in the root of this file: the roots of trial the child makes there are
// removed with it, even when no test of their file runs to remove them (grillhouse-3uv.34).
let n = 0;
function jouer(
  fichiers: string[],
  filtre: string,
  ajouts: Record<string, string>,
  { config, racine = RACINE }: { config?: string; racine?: string } = {}
): Rapport & { temp: string } {
  n += 1;
  const rapport = path.join(ESSAIS, `rapport-${n}.json`);
  const temp = mkdtempSync(path.join(ESSAIS, 'temp-'));
  const r = spawnSync(
    VITEST,
    [
      'run',
      ...(config ? ['--config', config] : []),
      ...fichiers,
      '-t',
      filtre,
      '--reporter=json',
      `--outputFile=${rapport}`,
    ],
    { cwd: racine, encoding: 'utf8', env: environnement({ TMPDIR: temp, ...ajouts }) }
  );
  expect(existsSync(rapport), r.stdout + r.stderr).toBe(true);
  return { ...(JSON.parse(readFileSync(rapport, 'utf8')) as Rapport), temp };
}

// The night configuration of the frame bounded to the tests of the tree where it runs, tests/ and
// src/, as the day configuration is: the copies under the tree (.claude/worktrees/*) are other
// trees, with their own state.
function nuitDeLArbre(): string {
  const config = path.join(mkdtempSync(path.join(ESSAIS, 'config-')), 'vitest.nuit.mjs');
  writeFileSync(
    config,
    [
      `import nuit from ${JSON.stringify(NUIT)};`,
      'export default {',
      '  test: {',
      '    ...nuit.test,',
      '    include: nuit.test.include.flatMap(g => [`tests/${g}`, `src/${g}`]),',
      '  },',
      '};',
      '',
    ].join('\n')
  );
  return config;
}

// A fresh home, without ~/.cache.
const maisonNeuve = () => mkdtempSync(path.join(ESSAIS, 'maison-'));

// The files of a report that failed to load, with their message.
const nonCharges = (r: Rapport, racine = RACINE) =>
  r.testResults
    .filter(f => f.status === 'failed' && f.assertionResults.length === 0)
    .map(f => `${path.relative(racine, f.name)}: ${f.message.split('\n')[0]}`);

describe('critère 1 — on a machine without ~/.cache, no test file fails to load', () => {
  it('critère 1: the root of trial under the home creates ~/.cache when the home lacks it', () => {
    const maison = maisonNeuve();
    const racine = racineSousLaMaison('grillhouse-essais-machine-', maison);
    expect(path.dirname(racine)).toBe(path.join(maison, '.cache'));
    expect(path.basename(racine)).toMatch(/^grillhouse-essais-machine-.{6}$/);
    expect(statSync(racine).isDirectory()).toBe(true);
    // A second root beside it: the parent is there, and each root is its own.
    expect(racineSousLaMaison('grillhouse-essais-machine-', maison)).not.toBe(racine);
  });
});

// The whole suite in a child vitest is a night test (packages/grillhouse-essais/tests/
// machine.suite-entiere.nuit.spec.ts): a call of the child here names the root of its package.
describe('critère 7 — a child vitest of the day never plays a whole suite', () => {
  it('critère 7: every call of the child names the root of a package', () => {
    const source = readFileSync(path.resolve(__dirname, 'machine.spec.ts'), 'utf8');
    const appels: string[] = [];
    for (const m of source.matchAll(/(?<!function )\bjouer\(/g)) {
      let profondeur = 0;
      let fin = m.index + m[0].length - 1;
      for (; fin < source.length; fin++) {
        if (source[fin] === '(') {
          profondeur++;
        }
        if (source[fin] === ')' && --profondeur === 0) {
          break;
        }
      }
      appels.push(source.slice(m.index, fin + 1));
    }
    expect(appels.length).toBeGreaterThan(0);
    expect(appels.filter(a => !/\bracine\b/.test(a))).toEqual([]);
  });
});

describe('critère 1 — the night run of a tree loads the night tests of that tree, not of its copies', () => {
  it(
    'critère 1: a broken night test in a copy under the tree leaves the night run of the tree green',
    () => {
      const arbre = mkdtempSync(path.join(ESSAIS, 'arbre-'));
      const ecrire = (rel: string, texte: string) => {
        mkdirSync(path.dirname(path.join(arbre, rel)), { recursive: true });
        writeFileSync(path.join(arbre, rel), texte);
      };
      ecrire('tests/unit/a.nuit.test.mjs', "throw new Error('a: loaded');\n");
      ecrire('src/b.nuit.test.mjs', "throw new Error('b: loaded');\n");
      ecrire('.claude/worktrees/x/tests/unit/c.nuit.test.mjs', "throw new Error('c: loaded');\n");
      const r = jouer([], AUCUN, {}, { config: nuitDeLArbre(), racine: arbre });
      expect(
        nonCharges(r, arbre)
          .map(x => x.split(':')[0])
          .sort()
      ).toEqual(['src/b.nuit.test.mjs', 'tests/unit/a.nuit.test.mjs']);
    },
    LONG
  );
});

// The test of the submodules that launches a real envelope, and the two beside it in its describe
// that launch none.
// The cases that mount a real envelope (bwrap absent/present, bd absent/present) moved to the night
// of grillhouse-essais (grillhouse-44b.10.10, its tests/machine.enveloppe-reelle): a test of the day
// never plays a night test of the repository.

// True when a file named bd, executable, lies in a directory of the PATH: read without running bd,
// apart from the detection of packages/grillhouse-matiere/src/machine.ts that the critère 3 watches.
const bdSurLeChemin = (process.env.PATH ?? '').split(':').some(d => {
  try {
    accessSync(path.join(d, 'bd'), constants.X_OK);
    return true;
  } catch {
    return false;
  }
});

// Guarded by bd found on the PATH, not by the detection it watches: a detection that misses bd
// fails here.
describe.runIf(bdSurLeChemin)('critère 3 (grillhouse-3uv.50.1) — on a machine with bd', () => {
  it('critère 3 (grillhouse-3uv.50.1): the detection of the machine sees bd', () => {
    expect(hasBd).toBe(true);
  });
});

// grillhouse-44b.10.10: a test of the day never plays a night test of the repository. This file's
// cases run one file of this package; the cases that mounted a real envelope by playing a night test
// of grillhouse-essais (through the variable of the targeted runs) moved to that package's night.
describe('le jour ne fait jouer aucun test de nuit du dépôt', () => {
  it('ce fichier ne cite ni la variable des lancements ciblés, ni un chemin de nuit d’un autre paquet', () => {
    const source = readFileSync(path.join(__dirname, 'machine.spec.ts'), 'utf8');
    // The forbidden tokens are built from fragments, so this guard never names them itself.
    expect(source).not.toContain(['GRILLHOUSE', 'TESTS'].join('_'));
    expect(source).not.toMatch(
      new RegExp(['grillhouse', 'essais'].join('-') + '[^\\n]*' + '[.]nuit[.]')
    );
  });
});
