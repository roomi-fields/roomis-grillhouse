import { spawnSync } from 'node:child_process';
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
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
import { canWrap, racineSousLaMaison } from '../machine.js';

// Ticket grillhouse-3uv.50: the suite runs on every machine where the project builds. A test that
// needs a capacity of the machine (a directory under the home, a bwrap sandbox) creates it or
// skips with its reason, never fails for its lack. Each case runs the suite itself, in a child
// vitest, on a machine without the capacity.
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'machine-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const RACINE = path.resolve(__dirname, '../..');
const VITEST = path.join(RACINE, 'node_modules/.bin/vitest');
const NUIT = path.join(RACINE, 'scripts/vitest.nuit.config.mjs');
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

// A PATH that holds every command of this one but bwrap: a directory of links.
function cheminSansBwrap(): string {
  const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
  for (const d of (process.env.PATH ?? '').split(':')) {
    let noms: string[];
    try {
      noms = readdirSync(d);
    } catch {
      continue;
    }
    for (const nom of noms) {
      const f = path.join(d, nom);
      const lien = path.join(bin, nom);
      if (nom === 'bwrap' || existsSync(lien)) {
        continue;
      }
      try {
        accessSync(f, constants.X_OK);
        if (statSync(f).isFile()) {
          symlinkSync(f, lien);
        }
      } catch {
        // Not a command.
      }
    }
  }
  return bin;
}

// The files of a report that failed to load, with their message.
const nonCharges = (r: Rapport, racine = RACINE) =>
  r.testResults
    .filter(f => f.status === 'failed' && f.assertionResults.length === 0)
    .map(f => `${path.relative(racine, f.name)}: ${f.message.split('\n')[0]}`);

const statut = (r: Rapport, titre: string) =>
  r.testResults.flatMap(f => f.assertionResults).find(t => t.title === titre)?.status;

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

  it(
    'critère 1: every day test file loads in a home without ~/.cache',
    () => {
      const maison = maisonNeuve();
      const r = jouer([], AUCUN, { HOME: maison });
      expect(nonCharges(r)).toEqual([]);
      expect(r.numFailedTestSuites).toBe(0);
      expect(existsSync(path.join(maison, '.cache'))).toBe(true);
      // The roots of trial of the files, made at load, stay in the temp directory of the child.
      expect(readdirSync(r.temp)).toEqual(
        expect.arrayContaining([expect.stringMatching(/^verrous-/)])
      );
    },
    LONG
  );

  it(
    'critère 1: every night test file loads in a home without ~/.cache',
    () => {
      const maison = maisonNeuve();
      const r = jouer([], AUCUN, { HOME: maison }, { config: nuitDeLArbre() });
      expect(r.numTotalTestSuites).toBeGreaterThan(0);
      expect(nonCharges(r)).toEqual([]);
      expect(r.numFailedTestSuites).toBe(0);
    },
    LONG
  );
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
const ENVELOPPE_REELLE = 'critère 4: the agent copy is prepared in a repository without submodules';
const SANS_ENVELOPPE = [
  'critère 4: the integration commits a lot in a repository without submodules',
  'critère 4: the night plays a repository without submodules',
];

describe('critère 2 — on a machine without bwrap, a test that launches a real envelope skips', () => {
  it(
    'critère 2: the agent copy of the submodules skips, the other tests of its describe run green',
    () => {
      const r = jouer(['tests/unit/sous-modules.spec.ts'], 'critère 4', {
        PATH: cheminSansBwrap(),
      });
      expect(statut(r, ENVELOPPE_REELLE)).toBe('skipped');
      for (const titre of SANS_ENVELOPPE) {
        expect(statut(r, titre), titre).toBe('passed');
      }
    },
    LONG
  );
});

describe.runIf(canWrap)('critère 4 — on a machine where bwrap works, nothing skips', () => {
  it(
    'critère 4: the agent copy of the submodules runs, with the tests beside it',
    () => {
      const r = jouer(['tests/unit/sous-modules.spec.ts'], 'critère 4', {});
      expect(statut(r, ENVELOPPE_REELLE)).toBe('passed');
      for (const titre of SANS_ENVELOPPE) {
        expect(statut(r, titre), titre).toBe('passed');
      }
    },
    LONG
  );
});
