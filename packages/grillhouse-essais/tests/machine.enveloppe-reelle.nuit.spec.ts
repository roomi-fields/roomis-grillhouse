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
import { describe, expect, it, afterAll } from 'vitest';
import { canWrap } from '@roomi-fields/grillhouse-matiere/test-fixtures';

// grillhouse-44b.10.10: the cases of machine.spec.ts that play a real envelope move here, to the
// night. A test that needs a capacity of the machine (a bwrap sandbox, the real bd) skips with its
// reason on a machine without it; these cases prove that behaviour by playing, in a child vitest,
// the night test of this package that mounts the real envelope. The child runs in this package's
// root, under the frame's night configuration bounded to it (nuitDeLArbre) and named the night file
// to play — never the variable of the targeted runs (GRILLHOUSE_TESTS), which the day leaves off.
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'machine-enveloppe-reelle-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// The child vitest runs in this package's root, where the night files it plays live.
const RACINE = path.resolve(__dirname, '..');
const VITEST = path.resolve(__dirname, '../../../node_modules/.bin/vitest');
const NUIT = path.resolve(
  __dirname,
  '../../grillhouse/scripts/langages/typescript/vitest.nuit.config.mjs'
);
const LONG = 120_000;

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

// A child vitest of this package on <fichiers> under <config>, keeping the tests whose name matches
// <filtre>: its JSON report, and the temp directory it ran with (its roots of trial removed with
// it). The file to play is named, never passed through GRILLHOUSE_TESTS.
let n = 0;
function jouer(
  fichiers: string[],
  filtre: string,
  ajouts: Record<string, string>,
  config: string
): Rapport & { temp: string } {
  n += 1;
  const rapport = path.join(ESSAIS, `rapport-${n}.json`);
  const temp = mkdtempSync(path.join(ESSAIS, 'temp-'));
  const r = spawnSync(
    VITEST,
    [
      'run',
      '--config',
      config,
      ...fichiers,
      '-t',
      filtre,
      '--reporter=json',
      `--outputFile=${rapport}`,
    ],
    { cwd: RACINE, encoding: 'utf8', env: environnement({ TMPDIR: temp, ...ajouts }) }
  );
  expect(existsSync(rapport), r.stdout + r.stderr).toBe(true);
  return { ...(JSON.parse(readFileSync(rapport, 'utf8')) as Rapport), temp };
}

// The frame's night configuration bounded to this package's tree, tests/ and src/, as the day
// configuration is: the copies under the tree (.claude/worktrees/*) are other trees.
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

// The files of a report that failed to load, with their message: a report where the named night
// file did not load fails the case.
const nonCharges = (r: Rapport) =>
  r.testResults
    .filter(f => f.status === 'failed' && f.assertionResults.length === 0)
    .map(f => `${path.relative(RACINE, f.name)}: ${f.message.split('\n')[0]}`);

const statut = (r: Rapport, titre: string) =>
  r.testResults.flatMap(f => f.assertionResults).find(t => t.title === titre)?.status;

// True when a file named bd, executable, lies in a directory of the PATH, read without running bd.
const bdSurLeChemin = (process.env.PATH ?? '').split(':').some(d => {
  try {
    accessSync(path.join(d, 'bd'), constants.X_OK);
    return true;
  } catch {
    return false;
  }
});

// The night file that mounts a real envelope of the submodules, and the names of its cases: the one
// that mounts the envelope, and the two beside it that mount none.
const SOUS_MODULES = 'tests/sous-modules.nuit.spec.ts';
const ENVELOPPE_REELLE = 'critère 4: the agent copy is prepared in a repository without submodules';
const SANS_ENVELOPPE = [
  'critère 4: the integration commits a lot in a repository without submodules',
  'critère 4: the night plays a repository without submodules',
];

// The night file that needs the real bd, and the names of its cases: the one that needs bd, and the
// two beside it that need none.
const MAISON = 'tests/enveloppe.maison.nuit.spec.ts';
const BASE_REELLE = 'lets bd read and write the tickets base of the main tree with its own state';
const SANS_BD = [
  'lets the session write the tickets base of the main tree in the home',
  'leaves whole on disk every index out of the copy',
];
const filtreBase = [BASE_REELLE, ...SANS_BD].join('|');

describe('sur une machine sans bwrap, un test qui monte une vraie enveloppe se saute', () => {
  it(
    'la copie d’agent des sous-modules se saute, les tests voisins de son describe passent',
    () => {
      const r = jouer([SOUS_MODULES], 'critère 4', { PATH: cheminSans('bwrap') }, nuitDeLArbre());
      expect(nonCharges(r)).toEqual([]);
      expect(statut(r, ENVELOPPE_REELLE)).toBe('skipped');
      for (const titre of SANS_ENVELOPPE) {
        expect(statut(r, titre), titre).toBe('passed');
      }
    },
    LONG
  );
});

describe.runIf(canWrap)('sur une machine où bwrap marche, rien ne se saute', () => {
  it(
    'la copie d’agent des sous-modules tourne, avec les tests voisins',
    () => {
      const r = jouer([SOUS_MODULES], 'critère 4', {}, nuitDeLArbre());
      expect(nonCharges(r)).toEqual([]);
      expect(statut(r, ENVELOPPE_REELLE)).toBe('passed');
      for (const titre of SANS_ENVELOPPE) {
        expect(statut(r, titre), titre).toBe('passed');
      }
    },
    LONG
  );
});

describe('sur une machine sans bd, aucun fichier ne manque à charger', () => {
  it(
    'le test qui a besoin du vrai bd se saute, ceux d’à côté passent',
    () => {
      const r = jouer(
        [MAISON],
        filtreBase,
        { HOME: maisonNeuve(), PATH: cheminSans('bd') },
        nuitDeLArbre()
      );
      expect(nonCharges(r)).toEqual([]);
      expect(statut(r, BASE_REELLE)).toBe('skipped');
      for (const titre of SANS_BD) {
        expect(statut(r, titre), titre).toBe('passed');
      }
    },
    LONG
  );
});

describe.runIf(bdSurLeChemin)('sur une machine avec bd', () => {
  it(
    'le test qui a besoin du vrai bd tourne, avec ceux d’à côté',
    () => {
      const r = jouer([MAISON], filtreBase, { HOME: maisonNeuve() }, nuitDeLArbre());
      expect(nonCharges(r)).toEqual([]);
      for (const titre of [BASE_REELLE, ...SANS_BD]) {
        expect(statut(r, titre), titre).toBe('passed');
      }
    },
    LONG
  );
});
