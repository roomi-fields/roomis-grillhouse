// grillhouse-3uv.75.1: the tests kept by test file. `npm test` passes through the frame's launcher
// (scripts/integration/suites-vitest.mjs), which keeps, for each test file it plays, Vitest's
// verdict and whole output under the fingerprint of what the file reads (its content, the closure
// of its imports, the paths the project declares read by its suites, the configuration of Vitest,
// the lock file), and replays the kept output instead of playing a file whose fingerprint has a
// trace (the task cache of Turborepo and Nx, at the grain of a Bazel test target). The decisions
// are those of the grill of grillhouse-3uv.75 (Q1 to Q6, Q8).
//
// Each case plays `npm test` in a git repository of trial whose frame is this repository's (its
// scripts, its configuration of Vitest, its test command), its test files played by the real
// Vitest (./tests-en-cache-essai.ts). A file « played » wrote its line to TRACE; a file « read
// again » did not, and its kept output shows under the line « relu, code inchangé depuis … ».
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  essai,
  FICHIERS,
  JOUR,
  projetCache,
  tries,
  voir,
  type ProjetCache,
} from './tests-en-cache-essai.js';

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tests-en-cache-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const LONG = 120_000;
const RELU = /relu, code inchangé depuis/;
const tous = tries(JOUR);

// A first `npm test`, green, that plays every test file of the day and lays down their traces;
// then, unless <temoin> is false, the witness: a second run, nothing changed, plays none of them.
// Each test that then changes something reads its replay against this witness. Returns the first
// run.
const amorcer = (p: ProjetCache, temoin = true) => {
  const r = p.npmTest();
  expect(r.status, voir(r)).toBe(0);
  expect(tries(r.joues), voir(r)).toEqual(expect.arrayContaining(tous));
  if (temoin) {
    const t = p.npmTest();
    expect(t.joues, `témoin : rien n'a changé\n${voir(t)}`).toEqual([]);
  }
  return r;
};
// The number of lines of <sortie> that hold <texte>.
const occurrences = (sortie: string, texte: string) =>
  sortie.split('\n').filter(l => l.includes(texte)).length;

describe('critère 2 — a test file whose fingerprint has its trace is not replayed: its kept output shows as it is', () => {
  it(
    'critère 2: nothing changed, npm test plays no file, shows each kept output under « relu, code inchangé depuis », and exits 0',
    () => {
      const p = projetCache(ESSAIS);
      amorcer(p);
      const r = p.npmTest();
      expect(r.status, voir(r)).toBe(0);
      expect(r.joues, voir(r)).toEqual([]);
      expect(r.stdout, voir(r)).toMatch(RELU);
      for (const nom of JOUR) {
        expect(r.stdout, `${nom}\n${voir(r)}`).toContain(`sortie de ${nom}`);
      }
    },
    LONG
  );
  it(
    'critères 2 et 5: a red file is read again like a green one: not replayed, its exit code and its failing test count as if it had run',
    () => {
      const p = projetCache(ESSAIS);
      const premier = p.npmTest([], { ROUGIR: 'libre' });
      expect(premier.status, voir(premier)).not.toBe(0);
      expect(premier.rouges, voir(premier)).toEqual([`${FICHIERS.libre} > libre`]);
      const r = p.npmTest();
      expect(r.joues, voir(r)).toEqual([]);
      expect(r.status, voir(r)).toBe(premier.status);
      expect(r.rouges, voir(r)).toEqual([`${FICHIERS.libre} > libre`]);
      expect(r.stdout, voir(r)).toMatch(RELU);
      expect(r.stdout, voir(r)).toContain('rouge de libre');
    },
    LONG
  );
});

describe('critère 3 — the fingerprint changes, and the file is replayed, when what it reads changes', () => {
  it(
    'critère 3: the test file itself changed replays that file alone',
    () => {
      const p = projetCache(ESSAIS);
      amorcer(p);
      p.ecrire(
        FICHIERS.libre,
        `// changé\n${readFileSync(path.join(p.repo, FICHIERS.libre), 'utf8')}`
      );
      const r = p.npmTest();
      expect(r.status, voir(r)).toBe(0);
      expect(r.joues, voir(r)).toEqual(['libre']);
    },
    LONG
  );
  it(
    'critère 3: a module the files import changed replays those that import it, directly or by ricochet, and no other',
    () => {
      const p = projetCache(ESSAIS);
      amorcer(p);
      p.ecrire('src/a/index.ts', 'export const a = 2;\n');
      const r = p.npmTest();
      expect(r.status, voir(r)).toBe(0);
      // a and direct import src/a; b and ricochet import src/b, which imports src/a.
      expect(tries(r.joues), voir(r)).toEqual(tries(['a', 'direct', 'b', 'ricochet']));
    },
    LONG
  );
  it(
    'critère 3: a helper outside every component changed replays the files that import it, and no other',
    () => {
      const p = projetCache(ESSAIS);
      amorcer(p);
      p.ecrire('tests/aide.ts', 'export const aide = 2;\n');
      const r = p.npmTest();
      expect(r.status, voir(r)).toBe(0);
      expect(r.joues, voir(r)).toEqual(['seul']);
    },
    LONG
  );
  it(
    'critère 3: an import cycle ends: a module of the cycle changed replays the file that reaches it through the cycle',
    () => {
      const p = projetCache(ESSAIS, {
        enPlus: {
          'tests/cycle-un.ts':
            "import { deux } from './cycle-deux';\nexport const un = () => deux;\n",
          'tests/cycle-deux.ts':
            "import { un } from './cycle-un';\nexport const deux = () => un;\n",
          'tests/cycle.spec.ts': essai('cycle', { importe: ['./cycle-un'] }),
        },
      });
      const r0 = p.npmTest();
      expect(r0.status, voir(r0)).toBe(0);
      const temoin = p.npmTest();
      expect(temoin.joues, voir(temoin)).toEqual([]);
      p.ecrire(
        'tests/cycle-deux.ts',
        "import { un } from './cycle-un';\nexport const deux = () => un();\n"
      );
      const r = p.npmTest();
      expect(r.status, voir(r)).toBe(0);
      expect(r.joues, voir(r)).toEqual(['cycle']);
    },
    LONG
  );
  it(
    'critère 3: a path of grillhouse.lusParLesSuites changed replays every file',
    () => {
      const p = projetCache(ESSAIS);
      amorcer(p);
      p.ecrire('corpus/donnees.txt', 'données changées\n');
      const r = p.npmTest();
      expect(r.status, voir(r)).toBe(0);
      expect(tries(r.joues), voir(r)).toEqual(expect.arrayContaining(tous));
    },
    LONG
  );
  it(
    'critère 3: the configuration of Vitest changed replays every file, the project not declaring it read',
    () => {
      const p = projetCache(ESSAIS);
      amorcer(p);
      const config = readFileSync(path.join(p.repo, 'vitest.config.ts'), 'utf8');
      p.ecrire('vitest.config.ts', `${config}// changé\n`);
      const r = p.npmTest();
      expect(r.status, voir(r)).toBe(0);
      expect(tries(r.joues), voir(r)).toEqual(expect.arrayContaining(tous));
    },
    LONG
  );
  it(
    'critère 3: the lock file changed replays every file',
    () => {
      const p = projetCache(ESSAIS);
      amorcer(p);
      p.ecrire(
        'package-lock.json',
        `${JSON.stringify({ name: 'essai', lockfileVersion: 3, requires: true, packages: { '': { name: 'essai', version: '1.0.1' } } }, null, 2)}\n`
      );
      const r = p.npmTest();
      expect(r.status, voir(r)).toBe(0);
      expect(tries(r.joues), voir(r)).toEqual(expect.arrayContaining(tous));
    },
    LONG
  );
});

describe('critère 4 — a file no test imports and nothing declares read replays nothing', () => {
  it(
    'critère 4: a code file of a component no test imports, and a root file nothing declares, changed: no file replayed, exit 0',
    () => {
      const p = projetCache(ESSAIS);
      amorcer(p);
      p.ecrire('src/c/orphelin.ts', 'export const c = 4;\n');
      p.ecrire('autre/notes.txt', 'notes changées\n');
      const r = p.npmTest();
      expect(r.status, voir(r)).toBe(0);
      expect(r.joues, voir(r)).toEqual([]);
      expect(r.stdout, voir(r)).toMatch(RELU);
    },
    LONG
  );
});

describe('critère 5 — FORCER=1 reads no trace, replays everything and writes the traces again', () => {
  it(
    'critère 5: under FORCER=1 every file plays though each has its trace, and the next run reads what the forced run wrote',
    () => {
      const p = projetCache(ESSAIS);
      amorcer(p);
      // The forced run sees a red the content does not explain (ROUGIR is read at the run).
      const force = p.npmTest([], { FORCER: '1', ROUGIR: 'libre' });
      expect(tries(force.joues), voir(force)).toEqual(expect.arrayContaining(tous));
      expect(force.status, voir(force)).not.toBe(0);
      const r = p.npmTest();
      expect(r.joues, voir(r)).toEqual([]);
      expect(r.status, voir(r)).not.toBe(0);
      expect(r.rouges, voir(r)).toEqual([`${FICHIERS.libre} > libre`]);
    },
    LONG
  );
});

// Constat 1 of the review: the verdict a trace keeps is the file's alone, never the launch's. A
// test file reads its environment; the launch sets its own variables there (FORCER, ROUGES) and
// npm its own (`npm test --ignore-scripts`, the call of the replay and of the night, sets
// npm_config_ignore_scripts). The fingerprint does not hold them: a file at the same fingerprint
// gives the same verdict however it was launched (the strict environment of Turborepo).
describe('critères 2, 5 et 11 — a test file at the same fingerprint gives the same verdict, and keeps a true trace, however it is launched', () => {
  it(
    'critères 2, 5 et 11: a file that fails when it sees FORCER, ROUGES or npm_config_ignore_scripts stays green, and its trace green, launched by npm test, under FORCER=1, with ROUGES set, or by npm test --ignore-scripts',
    () => {
      const fichier = 'tests/environnement.spec.ts';
      const p = projetCache(ESSAIS, {
        enPlus: {
          [fichier]:
            "import { test } from 'vitest';\n" +
            "test('environnement', () => {\n" +
            "  const vus = ['FORCER', 'ROUGES', 'npm_config_ignore_scripts'].filter(k => process.env[k]);\n" +
            "  if (vus.length > 0) throw new Error('lancement vu : ' + vus.join(','));\n" +
            '});\n',
        },
      });
      const sansRouges = { ROUGES: '' };
      // Each launch, from an empty store, plays the file; the plain run that follows reads what it
      // kept (or plays it again): both green.
      const lancements: [string, () => ReturnType<ProjetCache['npmTest']>][] = [
        ['npm test', () => p.npmTest([fichier], sansRouges)],
        ['FORCER=1', () => p.npmTest([fichier], { ...sansRouges, FORCER: '1' })],
        ['ROUGES posé', () => p.npmTest([fichier])],
        [
          'npm test --ignore-scripts',
          () => {
            const r = spawnSync('npm', ['test', '--ignore-scripts', '--', fichier], {
              cwd: p.repo,
              encoding: 'utf8',
              env: { ...p.env, ROUGES: '' },
              timeout: LONG,
            });
            return {
              status: r.status,
              sortie: `${r.stdout ?? ''}\n${r.stderr ?? ''}`,
              joues: [],
            } as unknown as ReturnType<ProjetCache['npmTest']>;
          },
        ],
      ];
      for (const [nom, lancer] of lancements) {
        rmSync(p.magasin, { recursive: true, force: true });
        const r = lancer();
        expect.soft(r.status, `${nom}\n${voir(r)}`).toBe(0);
        const apres = p.npmTest([fichier], sansRouges);
        expect.soft(apres.status, `après ${nom}\n${voir(apres)}`).toBe(0);
        expect.soft(apres.sortie, `après ${nom}\n${voir(apres)}`).not.toContain('lancement vu');
      }
    },
    LONG * 2
  );
});

describe('critère 15 — FORCER=1 on a targeted run replays the files of that run alone and writes their traces again', () => {
  it(
    'critère 15: FORCER=1 npm test -- <files> plays those files though they have their traces, and no other file',
    () => {
      const p = projetCache(ESSAIS);
      amorcer(p);
      const r = p.npmTest([FICHIERS.libre, FICHIERS.a], { FORCER: '1' });
      expect(r.status, voir(r)).toBe(0);
      expect(tries(r.joues), voir(r)).toEqual(tries(['libre', 'a']));
    },
    LONG
  );
  it(
    'critère 15: the forced targeted run writes the traces of its files again, and leaves the others as they were',
    () => {
      const p = projetCache(ESSAIS);
      amorcer(p);
      // The forced run sees a red the content does not explain (ROUGIR is read at the run).
      const force = p.npmTest([FICHIERS.libre], { FORCER: '1', ROUGIR: 'libre,seul' });
      expect(force.joues, voir(force)).toEqual(['libre']);
      expect(force.status, voir(force)).not.toBe(0);
      // The full run reads every trace: libre's rewritten red, the others' kept green.
      const r = p.npmTest();
      expect(r.joues, voir(r)).toEqual([]);
      expect(r.status, voir(r)).not.toBe(0);
      expect(r.rouges, voir(r)).toEqual([`${FICHIERS.libre} > libre`]);
    },
    LONG
  );
  it(
    'critère 15: FORCER=1 on a scope (the root) replays the files of that scope alone',
    () => {
      const p = projetCache(ESSAIS);
      amorcer(p);
      const r = p.npmTest(['--racine'], { FORCER: '1' });
      expect(r.status, voir(r)).toBe(0);
      expect(tries(r.joues), voir(r)).toEqual(tries(['direct', 'ricochet', 'seul', 'libre']));
    },
    LONG
  );
});

describe('critère 6 — a targeted run and a full run read the same trace of each file', () => {
  it(
    'critère 6: npm test after npm test -- <file> plays every other file and reads that one again',
    () => {
      const p = projetCache(ESSAIS);
      const cible = p.npmTest([FICHIERS.libre]);
      expect(cible.status, voir(cible)).toBe(0);
      expect(cible.joues, voir(cible)).toEqual(['libre']);
      const r = p.npmTest();
      expect(r.status, voir(r)).toBe(0);
      expect(r.joues, voir(r)).not.toContain('libre');
      expect(r.joues, voir(r)).toEqual(expect.arrayContaining(tous.filter(n => n !== 'libre')));
      expect(r.stdout, voir(r)).toContain('sortie de libre');
    },
    LONG
  );
  it(
    'critère 6: npm test -- <files> after npm test plays none of them, reads them again and exits 0',
    () => {
      const p = projetCache(ESSAIS);
      amorcer(p);
      const r = p.npmTest([FICHIERS.libre, FICHIERS.a]);
      expect(r.status, voir(r)).toBe(0);
      expect(r.joues, voir(r)).toEqual([]);
      expect(r.stdout, voir(r)).toMatch(RELU);
      expect(r.stdout, voir(r)).toContain('sortie de libre');
      expect(r.stdout, voir(r)).toContain('sortie de a');
    },
    LONG
  );
});

describe('critère 7 — the files to play go in one call of Vitest; the output of each is kept apart', () => {
  it(
    'critère 7: a run that plays every file plays them in a single call of Vitest',
    () => {
      const p = projetCache(ESSAIS);
      const r = amorcer(p, false);
      expect(r.pids, voir(r)).toHaveLength(1);
    },
    LONG
  );
  it(
    'critère 7: the files of one call read again show each its own output, once, not the output of the whole call',
    () => {
      const p = projetCache(ESSAIS);
      amorcer(p);
      const r = p.npmTest();
      expect(r.joues, voir(r)).toEqual([]);
      for (const nom of JOUR) {
        expect(occurrences(r.stdout, `sortie de ${nom}`), `${nom}\n${voir(r)}`).toBe(1);
      }
    },
    LONG
  );
});

describe('critère 8 — an interrupted file writes no trace; a file Vitest leaves unnamed writes no green trace', () => {
  it(
    'critère 8: a file whose run is ended by a signal writes no trace: the next run plays it again',
    () => {
      const p = projetCache(ESSAIS);
      const arrete = p.npmTest([FICHIERS.libre], { ARRETER: 'libre' });
      expect(arrete.joues, voir(arrete)).toEqual(['libre']);
      expect(arrete.status, voir(arrete)).not.toBe(0);
      const r = p.npmTest([FICHIERS.libre]);
      expect(r.joues, voir(r)).toEqual(['libre']);
      expect(r.status, voir(r)).toBe(0);
      // The run that completed wrote its trace: the next one reads it.
      const relu = p.npmTest([FICHIERS.libre]);
      expect(relu.joues, voir(relu)).toEqual([]);
    },
    LONG
  );
  it(
    'critère 8: a call of Vitest that exits without naming the file (its global setup throws) writes no green trace of it',
    () => {
      const p = projetCache(ESSAIS, {
        enPlus: {
          'vitest.config.ts':
            "import { defineConfig } from 'vitest/config';\n" +
            "export default defineConfig({ test: { include: ['src/**/*.{test,spec}.ts', 'tests/**/*.{test,spec}.ts'],\n" +
            "  exclude: ['**/node_modules/**', '**/*.nuit.{test,spec}.*', '**/*.budget.{test,spec}.*'],\n" +
            "  globalSetup: ['./tests/mise-en-place.ts'] } });\n",
          'tests/mise-en-place.ts':
            "export default function () {\n  if (process.env.CASSER === '1') throw new Error('chargement cassé');\n}\n",
        },
      });
      const casse = p.npmTest([FICHIERS.libre], { CASSER: '1' });
      expect(casse.joues, voir(casse)).toEqual([]);
      expect(casse.status, voir(casse)).not.toBe(0);
      // Nothing changed in the content: a green trace would give a green run that plays nothing.
      const r = p.npmTest([FICHIERS.libre]);
      expect(r.joues.includes('libre') || r.status !== 0, voir(r)).toBe(true);
      // The setup back, the file plays green and writes its trace: the next run reads it.
      const vert = p.npmTest([FICHIERS.libre]);
      expect(vert.status, voir(vert)).toBe(0);
      const relu = p.npmTest([FICHIERS.libre]);
      expect(relu.joues, voir(relu)).toEqual([]);
    },
    LONG
  );
});

describe('critère 10 — the purge keeps the traces of the live test files, and only those', () => {
  it(
    'critère 10: after a passage of the entry point, the trace of a file no live content holds is gone, that of a live file stays',
    () => {
      const p = projetCache(ESSAIS);
      amorcer(p);
      const ancien = readFileSync(path.join(p.repo, FICHIERS.libre), 'utf8');
      // libre changes and is committed; two more commits make main and main^ hold the new libre.
      p.ecrire(FICHIERS.libre, `// v2\n${ancien}`);
      p.git('commit', '-q', '-am', 'libre v2');
      for (const n of [1, 2]) {
        p.ecrire('autre/notes.txt', `notes ${n}\n`);
        p.git('commit', '-q', '-am', `notes ${n}`);
      }
      const passage = spawnSync('node', ['scripts/integration/constructions.mjs'], {
        cwd: p.repo,
        encoding: 'utf8',
        env: p.env,
        timeout: 60_000,
      });
      expect(passage.status, passage.stdout + passage.stderr).toBe(0);
      // The old libre back in the tree: its trace was purged, seul's (live all along) stays.
      p.ecrire(FICHIERS.libre, ancien);
      const r = p.npmTest([FICHIERS.libre, FICHIERS.seul]);
      expect(r.status, voir(r)).toBe(0);
      expect(r.joues, voir(r)).toEqual(['libre']);
    },
    LONG
  );
});

describe('the store of the traces (scripts/integration/traces.mjs): shared by the copies, a trace that does not read is none, no store outside git', () => {
  it(
    'critère 6 (the store in the common folder of git): a copy at the same content reads the traces another copy wrote',
    () => {
      const p = projetCache(ESSAIS);
      amorcer(p);
      const copie = path.join(p.repo, '.claude/worktrees/copie');
      p.git('worktree', 'add', '-q', '--detach', copie, 'HEAD');
      const r = p.npmTest([], {}, copie);
      expect(r.status, voir(r)).toBe(0);
      expect(r.joues, voir(r)).toEqual([]);
    },
    LONG
  );
  it(
    'a trace that does not read is none: every file whose trace is unreadable plays again, green',
    () => {
      const p = projetCache(ESSAIS);
      amorcer(p);
      const noms = p.traces();
      expect(noms.length, 'the first run wrote traces').toBeGreaterThan(0);
      for (const n of noms) {
        writeFileSync(path.join(p.magasin, n), '{"illisible');
      }
      const r = p.npmTest();
      expect(r.status, voir(r)).toBe(0);
      expect(tries(r.joues), voir(r)).toEqual(expect.arrayContaining(tous));
    },
    LONG
  );
  it(
    'outside a git repository there is no store: every run plays every file',
    () => {
      const p = projetCache(ESSAIS);
      // The same project, its git repository taken away.
      rmSync(path.join(p.repo, '.git'), { recursive: true, force: true });
      for (let i = 0; i < 2; i++) {
        const r = p.npmTest();
        expect(r.status, voir(r)).toBe(0);
        expect(tries(r.joues), voir(r)).toEqual(expect.arrayContaining(tous));
      }
      expect(readdirSync(p.repo)).not.toContain('.git');
    },
    LONG
  );
});
