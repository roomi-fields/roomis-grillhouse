import { spawnSync } from 'node:child_process';
import {
  accessSync,
  constants,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// The whole suite of the package of the frame's tests, played in a child vitest on a machine
// without a capacity (a home without ~/.cache, a PATH without bd): a test file that needs the
// capacity creates it or skips, and none fails to load. Whole-suite runs are night tests: the day
// plays the cases that run one file. The child runs in packages/grillhouse, outside the perimeter
// the night configuration loads here (tests/ and src/ of that package), so it never loads this file.
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'machine-suite-entiere-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const RACINE = path.resolve(__dirname, '../../grillhouse');
const VITEST = path.resolve(__dirname, '../../../node_modules/.bin/vitest');
const NUIT = path.join(RACINE, 'scripts/langages/typescript/vitest.nuit.config.mjs');
const LONG = 300_000;
// A test name that no test carries: the child vitest loads every file and runs none of its tests.
const AUCUN = 'no test carries this name';

type Rapport = {
  numFailedTestSuites: number;
  numTotalTestSuites: number;
  testResults: { name: string; status: string; message: string; assertionResults: unknown[] }[];
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

// A child vitest of the package of the frame on every file of <config> (default: the day
// configuration), keeping no test: its JSON report, and the temp directory it ran with.
let n = 0;
function jouer(ajouts: Record<string, string>, config?: string): Rapport & { temp: string } {
  n += 1;
  const rapport = path.join(ESSAIS, `rapport-${n}.json`);
  const temp = mkdtempSync(path.join(ESSAIS, 'temp-'));
  const r = spawnSync(
    VITEST,
    [
      'run',
      ...(config ? ['--config', config] : []),
      '-t',
      AUCUN,
      '--reporter=json',
      `--outputFile=${rapport}`,
    ],
    { cwd: RACINE, encoding: 'utf8', env: environnement({ TMPDIR: temp, ...ajouts }) }
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

// A PATH that holds every command of this one but <absente>: each directory that holds <absente>
// gives way to a directory of links to its other commands.
function cheminSans(absente: string): string {
  return (process.env.PATH ?? '')
    .split(':')
    .map(d => {
      let noms: string[];
      try {
        noms = readdirSync(d);
      } catch {
        return d;
      }
      if (!noms.includes(absente)) {
        return d;
      }
      const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
      for (const nom of noms) {
        const f = path.join(d, nom);
        if (nom === absente) {
          continue;
        }
        try {
          accessSync(f, constants.X_OK);
          if (statSync(f).isFile()) {
            symlinkSync(f, path.join(bin, nom));
          }
        } catch {
          // Not a command.
        }
      }
      return bin;
    })
    .join(':');
}

// The files of a report that failed to load, with their message.
const nonCharges = (r: Rapport) =>
  r.testResults
    .filter(f => f.status === 'failed' && f.assertionResults.length === 0)
    .map(f => `${path.relative(RACINE, f.name)}: ${f.message.split('\n')[0]}`);

describe('on a machine without ~/.cache, no test file fails to load', () => {
  it(
    'every day test file loads in a home without ~/.cache',
    () => {
      const r = jouer({ HOME: maisonNeuve() });
      expect(nonCharges(r)).toEqual([]);
      expect(r.numFailedTestSuites).toBe(0);
      // The roots of trial of the files, made at load and left by the tests that did not run, go
      // with the base of the child's run, in its temp directory: nothing stays.
      expect(readdirSync(r.temp)).toEqual([]);
    },
    LONG
  );

  it(
    'every night test file loads in a home without ~/.cache',
    () => {
      const r = jouer({ HOME: maisonNeuve() }, nuitDeLArbre());
      expect(r.numTotalTestSuites).toBeGreaterThan(0);
      expect(nonCharges(r)).toEqual([]);
      expect(r.numFailedTestSuites).toBe(0);
    },
    LONG
  );
});

describe('on a machine without bd, no test file fails to load', () => {
  it(
    'every day test file loads on a machine without bd',
    () => {
      const r = jouer({ HOME: maisonNeuve(), PATH: cheminSans('bd') });
      expect(nonCharges(r)).toEqual([]);
      expect(r.numFailedTestSuites).toBe(0);
    },
    LONG
  );
});
