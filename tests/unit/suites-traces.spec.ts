// grillhouse-3uv.65: a suite unchanged is not replayed. The frame's suites command
// (`integration:suites`, scripts/integration/suites-vitest.mjs) keeps the verdict of each suite
// under the fingerprint of the content of what produces it, and reuses it while that fingerprint
// stays the same (the task cache of Turborepo and Nx; BPScript's traces).
//
// The interface fixed by these tests: the command's call is one of `--tous`, a list of components'
// directories, `--racine` (the root suite alone) or `--tests <files>` (these test files alone);
// ROUGES names the file of the failing tests; its exit code is not 0 when a suite is red. A suite is the suite of a component, or the root suite: the test files outside
// every component, which `--tous` plays with the others, each under its own trace. A suite « not
// replayed » makes Vitest (`npx vitest …`) run none of its test files; its verdict, exit code and
// failing tests, is the one kept. The traces live in git's common folder (critère 10). The root
// paths the suites read are declared in package.json under `grillhouse.lusParLesSuites` (a list
// of paths relative to the root, files or folders); the lock file is always read.
import { execFileSync, spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  exclusions,
  fichiersJoues,
  joue,
  projetTraces,
  tousLesFichiers,
} from './suites-traces-essai.js';

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'suites-traces-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const LONG = 60_000;
type Projet = ReturnType<typeof projetTraces>;
const jouees = (r: ReturnType<Projet['suites']>, comp: string) =>
  r.appels.filter(a => joue(a, comp));
// A first run of <args>, which must be green, laying down the traces; then the witness: a second
// run, nothing changed, replays none of them. Each test that then changes something reads its
// replay against this witness. Returns the first run.
const amorcer = (p: Projet, args: string[]) => {
  const r = p.suites(args);
  expect(r.status, r.stdout + r.stderr).toBe(0);
  const temoin = p.suites(args);
  for (const comp of args) {
    expect(jouees(temoin, comp), `témoin : ${comp} inchangé n'est pas rejoué`).toEqual([]);
  }
  return r;
};

describe('critère 1 — each suite played leaves its verdict under the fingerprint of its sources', () => {
  it(
    'critère 1: a green suite played once is not replayed while nothing changes, and stays green',
    () => {
      const p = projetTraces(ESSAIS);
      expect(jouees(amorcer(p, ['src/b']), 'src/b').length).toBeGreaterThan(0);
      const r = p.suites(['src/b']);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(jouees(r, 'src/b')).toEqual([]);
      expect(r.rouges).toEqual([]);
    },
    LONG
  );
  it(
    'critère 1: the verdict kept holds the failing tests by name, and the exit code',
    () => {
      const p = projetTraces(ESSAIS);
      const rouge = p.PLAN.map(f =>
        f.fichier === 'src/d/d.spec.ts' ? { ...f, tests: [{ nom: 'd casse', rouge: true }] } : f
      );
      p.planifier(rouge);
      const r1 = p.suites(['src/d']);
      expect(r1.status).not.toBe(0);
      expect(r1.rouges).toEqual(['src/d/d.spec.ts > d casse']);
      // The same content, Vitest now green: the kept verdict counts, red included (critère 2).
      p.planifier(p.PLAN);
      const r2 = p.suites(['src/d']);
      expect(jouees(r2, 'src/d')).toEqual([]);
      expect(r2.status).not.toBe(0);
      expect(r2.rouges).toEqual(['src/d/d.spec.ts > d casse']);
    },
    LONG
  );
  it(
    'critère 1: a change in a component it consumes replays the suite',
    () => {
      const p = projetTraces(ESSAIS);
      amorcer(p, ['src/b']);
      p.ecrire('src/a/index.ts', 'export const a = 2;\n');
      expect(jouees(p.suites(['src/b']), 'src/b').length).toBeGreaterThan(0);
    },
    LONG
  );
  it(
    'critère 1: a change in a component it consumes transitively replays the suite',
    () => {
      const p = projetTraces(ESSAIS);
      amorcer(p, ['src/c']);
      p.ecrire('src/a/index.ts', 'export const a = 2;\n');
      expect(jouees(p.suites(['src/c']), 'src/c').length).toBeGreaterThan(0);
    },
    LONG
  );
  it(
    'critère 1: a change in a component it does not consume (a consumer of it, an unrelated one) replays nothing',
    () => {
      const p = projetTraces(ESSAIS);
      amorcer(p, ['src/b']);
      p.ecrire('src/c/index.ts', "import { b } from '../b/index';\nexport const c = b + 2;\n");
      p.ecrire('src/d/index.ts', 'export const d = 5;\n');
      const r = p.suites(['src/b']);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(jouees(r, 'src/b')).toEqual([]);
    },
    LONG
  );
  it(
    'critère 1: a cycle of consumers ends, and a change on one side replays the other',
    () => {
      const p = projetTraces(ESSAIS);
      amorcer(p, ['src/e']);
      p.ecrire(
        'src/f/index.ts',
        "import { e } from '../e/index';\nexport const f = () => e;\n// x\n"
      );
      const r = p.suites(['src/e']);
      expect(r.error).toBeUndefined();
      expect(jouees(r, 'src/e').length).toBeGreaterThan(0);
    },
    LONG
  );
  it(
    'critère 1: in one call of several components, each is judged by its own trace, and the verdict joins them',
    () => {
      const p = projetTraces(ESSAIS);
      p.planifier(
        p.PLAN.map(f =>
          f.fichier === 'src/a/a.spec.ts' ? { ...f, tests: [{ nom: 'a casse', rouge: true }] } : f
        )
      );
      p.suites(['src/a', 'src/d']);
      p.planifier(p.PLAN);
      p.ecrire('src/d/index.ts', 'export const d = 5;\n');
      const r = p.suites(['src/a', 'src/d']);
      expect(jouees(r, 'src/a')).toEqual([]);
      expect(jouees(r, 'src/d').length).toBeGreaterThan(0);
      expect(r.status).not.toBe(0);
      expect(r.rouges).toEqual(['src/a/a.spec.ts > a casse']);
    },
    LONG
  );
});

describe('critère 2 — a fingerprint with a trace is not replayed; one without a trace is played', () => {
  it(
    'critère 2 (garde): a suite without any trace is played',
    () => {
      const p = projetTraces(ESSAIS);
      const r = p.suites(['src/b', 'src/d']);
      expect(jouees(r, 'src/b').length).toBeGreaterThan(0);
      expect(jouees(r, 'src/d').length).toBeGreaterThan(0);
    },
    LONG
  );
  it(
    'critère 2: back to a content already measured, the suite is not replayed (one trace per fingerprint, not one per component)',
    () => {
      const p = projetTraces(ESSAIS);
      amorcer(p, ['src/d']);
      p.ecrire('src/d/index.ts', 'export const d = 5;\n');
      expect(jouees(p.suites(['src/d']), 'src/d').length).toBeGreaterThan(0);
      p.ecrire('src/d/index.ts', 'export const d = 4;\n');
      const r = p.suites(['src/d']);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(jouees(r, 'src/d')).toEqual([]);
    },
    LONG
  );
  it(
    'critère 2: the traces survive the cleaning of the copy (git clean -fdx, node_modules kept)',
    () => {
      const p = projetTraces(ESSAIS);
      amorcer(p, ['src/d']);
      p.git('clean', '-q', '-f', '-d', '-x', '-e', 'node_modules');
      expect(jouees(p.suites(['src/d']), 'src/d')).toEqual([]);
    },
    LONG
  );
});

describe('critère 3 — the fingerprint is the content, never the dates', () => {
  it(
    'critère 3: a file written again identically, at a later date, makes nothing stale',
    () => {
      const p = projetTraces(ESSAIS);
      amorcer(p, ['src/b']);
      const f = path.join(p.repo, 'src/a/index.ts');
      writeFileSync(f, readFileSync(f));
      const plusTard = new Date(Date.now() + 3600_000);
      utimesSync(f, plusTard, plusTard);
      const g = path.join(p.repo, 'src/b/index.ts');
      utimesSync(g, plusTard, plusTard);
      const r = p.suites(['src/b']);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(jouees(r, 'src/b')).toEqual([]);
    },
    LONG
  );
  it(
    'critère 3: one byte changed, the size and the date kept, makes the suite stale',
    () => {
      const p = projetTraces(ESSAIS);
      amorcer(p, ['src/d']);
      const f = path.join(p.repo, 'src/d/index.ts');
      const { atime, mtime } = statSync(f);
      writeFileSync(f, 'export const d = 5;\n');
      utimesSync(f, atime, mtime);
      expect(jouees(p.suites(['src/d']), 'src/d').length).toBeGreaterThan(0);
    },
    LONG
  );
  it(
    'critère 3: a file added to the component, not yet tracked, makes the suite stale',
    () => {
      const p = projetTraces(ESSAIS);
      amorcer(p, ['src/d']);
      p.ecrire('src/d/neuf.ts', 'export const n = 1;\n');
      expect(jouees(p.suites(['src/d']), 'src/d').length).toBeGreaterThan(0);
    },
    LONG
  );
  it(
    'critère 3: a file removed from a component it consumes makes the suite stale',
    () => {
      const p = projetTraces(ESSAIS);
      p.ecrire('src/a/autre.ts', 'export const x = 1;\n');
      amorcer(p, ['src/b']);
      unlinkSync(path.join(p.repo, 'src/a/autre.ts'));
      expect(jouees(p.suites(['src/b']), 'src/b').length).toBeGreaterThan(0);
    },
    LONG
  );
});

describe('critère 4 — the root folders the suites read are declared, a submodule by its files', () => {
  it(
    'critère 4: a change in a root folder declared in grillhouse.lusParLesSuites replays the suite',
    () => {
      const p = projetTraces(ESSAIS, { grillhouse: { lusParLesSuites: ['tests'] } });
      amorcer(p, ['src/d']);
      p.ecrire('tests/aide.ts', 'export const aide = 2;\n');
      expect(jouees(p.suites(['src/d']), 'src/d').length).toBeGreaterThan(0);
    },
    LONG
  );
  it(
    'critère 4: a declared submodule counts by the content of its files: one byte changed in its working tree replays, a file written again identically does not',
    () => {
      const p = projetTraces(ESSAIS, { grillhouse: { lusParLesSuites: ['vendor'] } });
      const lib = mkdtempSync(path.join(ESSAIS, 'lib-'));
      const gitLib = (...a: string[]) =>
        execFileSync('git', ['-C', lib, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
          encoding: 'utf8',
        });
      gitLib('init', '-q', '-b', 'main');
      writeFileSync(path.join(lib, 'lib.txt'), 'version 1\n');
      gitLib('add', '.');
      gitLib('commit', '-q', '-m', 'lib');
      p.git('-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', lib, 'vendor/lib');
      p.git('commit', '-q', '-m', 'sous-module');
      amorcer(p, ['src/d']);
      const f = path.join(p.repo, 'vendor/lib/lib.txt');
      writeFileSync(f, readFileSync(f));
      const plusTard = new Date(Date.now() + 3600_000);
      utimesSync(f, plusTard, plusTard);
      expect(jouees(p.suites(['src/d']), 'src/d')).toEqual([]);
      writeFileSync(f, 'version 2\n');
      expect(jouees(p.suites(['src/d']), 'src/d').length).toBeGreaterThan(0);
    },
    LONG
  );
  it(
    'critère 4: a declared submodule shared as a link to a repository outside the copy (grillhouse.partage, as scripts/sous-modules.sh sets it) counts by the files of its target: one byte changed there replays',
    () => {
      const p = projetTraces(ESSAIS, { grillhouse: { lusParLesSuites: ['vendor'] } });
      const lib = mkdtempSync(path.join(ESSAIS, 'lib-'));
      const gitLib = (...a: string[]) =>
        execFileSync('git', ['-C', lib, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
          encoding: 'utf8',
        });
      gitLib('init', '-q', '-b', 'main');
      writeFileSync(path.join(lib, 'lib.txt'), 'version 1\n');
      gitLib('add', '.');
      gitLib('commit', '-q', '-m', 'lib');
      p.git('-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', lib, 'vendor/lib');
      p.git('commit', '-q', '-m', 'sous-module');
      // The copy as sous-modules.sh sets a shared submodule: its folder replaced by a link to the
      // main repository's (here, a repository outside the copy), marked skip-worktree.
      const sm = path.join(p.repo, 'vendor/lib');
      rmSync(sm, { recursive: true, force: true });
      symlinkSync(lib, sm);
      p.git('update-index', '--skip-worktree', '--', 'vendor/lib');
      expect(lstatSync(sm).isSymbolicLink()).toBe(true);
      amorcer(p, ['src/d']);
      writeFileSync(path.join(lib, 'lib.txt'), 'version 2\n');
      expect(jouees(p.suites(['src/d']), 'src/d').length).toBeGreaterThan(0);
    },
    LONG
  );
});

describe('critère 5 — a consumer stale only by what it consumes plays the quick set', () => {
  const rapideExclu = (r: ReturnType<Projet['suites']>) =>
    jouees(r, 'src/b').some(a => exclusions(a).some(e => e.includes('rapide.spec')));
  it(
    'critère 5: its own sources unchanged since its last full suite, it plays without the files that suite measured slow',
    () => {
      const p = projetTraces(ESSAIS);
      const r1 = amorcer(p, ['src/b']);
      // The first suite has no measure: it is full.
      expect(lentExclu(r1)).toBe(false);
      p.ecrire('src/a/index.ts', 'export const a = 2;\n');
      const r2 = p.suites(['src/b']);
      expect(jouees(r2, 'src/b').length).toBeGreaterThan(0);
      expect(lentExclu(r2)).toBe(true);
      expect(rapideExclu(r2)).toBe(false);
    },
    LONG
  );
  it(
    'critère 5: a component one of whose own sources changed plays its full suite',
    () => {
      const p = projetTraces(ESSAIS);
      amorcer(p, ['src/b']);
      p.ecrire('src/a/index.ts', 'export const a = 2;\n');
      p.ecrire('src/b/index.ts', "import { a } from '../a/index';\nexport const b = a + 3;\n");
      const r = p.suites(['src/b']);
      expect(jouees(r, 'src/b').length).toBeGreaterThan(0);
      expect(lentExclu(r)).toBe(false);
    },
    LONG
  );
  it(
    'critère 5: slow is what the LAST full suite measured: a file measured fast since is played',
    () => {
      const p = projetTraces(ESSAIS);
      amorcer(p, ['src/b']);
      // A second full suite (own source changed) measures the file fast.
      p.planifier(p.PLAN.map(f => (f.fichier === 'src/b/lent.spec.ts' ? { ...f, duree: 0.5 } : f)));
      p.ecrire('src/b/index.ts', "import { a } from '../a/index';\nexport const b = a + 3;\n");
      expect(lentExclu(amorcer(p, ['src/b']))).toBe(false);
      p.ecrire('src/a/index.ts', 'export const a = 2;\n');
      const r = p.suites(['src/b']);
      expect(jouees(r, 'src/b').length).toBeGreaterThan(0);
      expect(lentExclu(r)).toBe(false);
    },
    LONG
  );
});

describe('critère 6 — FORCER=1 replays everything, and the night plays everything', () => {
  it(
    'critère 6: under FORCER=1 every suite is replayed, traces present',
    () => {
      const p = projetTraces(ESSAIS);
      amorcer(p, ['src/b', 'src/d']);
      const r = p.suites(['src/b', 'src/d'], { FORCER: '1' });
      expect(jouees(r, 'src/b').length).toBeGreaterThan(0);
      expect(jouees(r, 'src/d').length).toBeGreaterThan(0);
      // FORCER=1 plays the full suites: no file is left out as slow.
      expect(jouees(r, 'src/b').some(a => exclusions(a).some(e => e.includes('lent.spec')))).toBe(
        false
      );
    },
    LONG
  );
  it(
    "critère 6 (garde): the night plays the project's tests twice on the same commit, reading no trace, whatever command runs them",
    () => {
      // A project whose `npm test` is the frame's suites command on src/d; the night runs from the
      // project's own scripts (as tests/unit/nuit.spec.ts sets it).
      const p = projetTraces(ESSAIS, {
        scripts: { test: 'node scripts/integration/suites-vitest.mjs src/d' },
      });
      const NUIT = path.resolve(__dirname, '../../scripts/nuit.sh');
      cpSync(path.dirname(NUIT), path.join(p.repo, 'scripts'), { recursive: true });
      writeFileSync(path.join(p.bin, 'bd'), '#!/bin/sh\necho "[]"\n', { mode: 0o755 });
      p.git('add', '.');
      p.git('commit', '-q', '-m', 'scripts');
      const nuit = () =>
        spawnSync('bash', [path.join(p.repo, 'scripts/nuit.sh')], {
          encoding: 'utf8',
          env: { ...process.env, PATH: `${p.bin}:${process.env.PATH}` },
          timeout: LONG,
        });
      const n1 = nuit();
      const journal = () => {
        const d = path.join(p.repo, '.git', 'nuit');
        return existsSync(d)
          ? tousLesFichiers(d)
              .filter(f => f.endsWith('.log'))
              .map(f => readFileSync(path.join(d, f), 'utf8'))
              .join('')
          : '';
      };
      expect(n1.status, journal()).toBe(0);
      const avant = p.appels().filter(a => joue(a, 'src/d')).length;
      expect(avant).toBeGreaterThan(0);
      expect(nuit().status, journal()).toBe(0);
      expect(p.appels().filter(a => joue(a, 'src/d')).length).toBeGreaterThan(avant);
    },
    LONG
  );
});

describe('critère 15 — an unreadable trace replays its suite; a suite killed by a signal writes none', () => {
  it.each(['{', '{}', 'null', '{"code":"x"}'])(
    'critère 15: an unreadable trace (%s) is no trace: the suite is replayed, never a false green',
    illisible => {
      const p = projetTraces(ESSAIS);
      const avant = new Set(tousLesFichiers(p.repo));
      amorcer(p, ['src/d']);
      // Every file the run left in the project, outside git's own objects, made unreadable.
      const neufs = tousLesFichiers(p.repo).filter(
        f => !avant.has(f) && !/^\.git\/(objects|index|logs|refs|HEAD|ORIG_HEAD)/.test(f)
      );
      expect(neufs.length, 'the run leaves its trace in the project').toBeGreaterThan(0);
      for (const f of neufs) {
        writeFileSync(path.join(p.repo, f), illisible);
      }
      p.planifier(
        p.PLAN.map(f =>
          f.fichier === 'src/d/d.spec.ts' ? { ...f, tests: [{ nom: 'd casse', rouge: true }] } : f
        )
      );
      const r = p.suites(['src/d']);
      expect(jouees(r, 'src/d').length).toBeGreaterThan(0);
      expect(r.status).not.toBe(0);
      expect(r.rouges).toEqual(['src/d/d.spec.ts > d casse']);
    },
    LONG
  );
  it(
    'critère 15: a suite killed by a signal leaves no verdict: the next run replays it',
    () => {
      const p = projetTraces(ESSAIS);
      p.planifier(p.PLAN.map(f => (f.fichier === 'src/d/d.spec.ts' ? { ...f, signal: true } : f)));
      const r1 = p.suites(['src/d']);
      expect(r1.status).not.toBe(0);
      p.planifier(p.PLAN);
      const r2 = p.suites(['src/d']);
      expect(jouees(r2, 'src/d').length).toBeGreaterThan(0);
      expect(r2.status, r2.stdout + r2.stderr).toBe(0);
      // The run that ended leaves its verdict.
      expect(jouees(p.suites(['src/d']), 'src/d')).toEqual([]);
    },
    LONG
  );
});

describe('critères 1 et 15 — a root suite that failed without naming a test keeps that failure', () => {
  // s.spec.ts, which reaches no component, makes Vitest fail without any red test.
  const echecSansTest = (p: Projet) =>
    p.planifier(
      p.PLAN.map(f => (f.fichier === 'tests/s.spec.ts' ? { ...f, echecSansTest: true } : f))
    );
  it(
    'critère 1 (garde): a root suite that failed without naming a test, nothing changed, keeps its failure',
    () => {
      const p = projetTraces(ESSAIS);
      echecSansTest(p);
      expect(p.suites(['--tous']).status).not.toBe(0);
      const r = p.suites(['--tous']);
      expect(r.status, r.stdout + r.stderr).not.toBe(0);
    },
    LONG
  );
  it(
    'critères 1 et 15: a root suite that failed without naming a test, then stale by a component alone, keeps its failure: the partial replay is no false green',
    () => {
      const p = projetTraces(ESSAIS);
      echecSansTest(p);
      expect(p.suites(['--tous']).status).not.toBe(0);
      p.ecrire('src/d/index.ts', 'export const d = 5;\n');
      const r = p.suites(['--tous']);
      expect(fichiersJoues(r.appels)).not.toContain('tests/s.spec.ts');
      expect(r.status, r.stdout + r.stderr).not.toBe(0);
    },
    LONG
  );
  it(
    'critères 1 et 15: the same through --racine: the partial replay of the root suite keeps the failure without a name',
    () => {
      const p = projetTraces(ESSAIS);
      echecSansTest(p);
      expect(p.suites(['--racine']).status).not.toBe(0);
      p.ecrire('src/d/index.ts', 'export const d = 5;\n');
      const r = p.suites(['--racine']);
      expect(fichiersJoues(r.appels)).not.toContain('tests/s.spec.ts');
      expect(r.status, r.stdout + r.stderr).not.toBe(0);
    },
    LONG
  );
  it(
    'critère 2 (garde): a root suite replayed whole after that failure judges again: green once Vitest is',
    () => {
      const p = projetTraces(ESSAIS);
      echecSansTest(p);
      p.suites(['--tous']);
      p.planifier(p.PLAN);
      p.ecrire('tests/s.spec.ts', '// s, changé\n');
      const r = p.suites(['--tous']);
      expect(r.status, r.stdout + r.stderr).toBe(0);
    },
    LONG
  );
});

// The quick set of src/b: a call that plays src/b leaves its slow file out.
const lentExclu = (r: ReturnType<Projet['suites']>) =>
  jouees(r, 'src/b').some(a => exclusions(a).some(e => e.includes('lent.spec')));
const avecPlan = (p: Projet, fichier: string, change: Record<string, unknown>) =>
  p.planifier(p.PLAN.map(f => (f.fichier === fichier ? { ...f, ...change } : f)));

describe('critère 10 — the traces live in the common folder of git, shared by every copy', () => {
  it(
    'critère 10: a copy of the repository (git worktree) reads the traces the main tree wrote, and the main tree those the copy wrote',
    () => {
      const p = projetTraces(ESSAIS);
      amorcer(p, ['src/d']);
      const copie = path.join(mkdtempSync(path.join(ESSAIS, 'copies-')), 'copie');
      p.git('worktree', 'add', '-q', '--detach', copie, 'HEAD');
      expect(jouees(p.suites(['src/d'], {}, copie), 'src/d')).toEqual([]);
      writeFileSync(path.join(copie, 'src/d/index.ts'), 'export const d = 5;\n');
      expect(jouees(p.suites(['src/d'], {}, copie), 'src/d').length).toBeGreaterThan(0);
      p.ecrire('src/d/index.ts', 'export const d = 5;\n');
      expect(jouees(p.suites(['src/d']), 'src/d')).toEqual([]);
    },
    LONG
  );
  it(
    'critère 10: a copy removed takes none of the traces it wrote with it',
    () => {
      const p = projetTraces(ESSAIS);
      const copie = path.join(mkdtempSync(path.join(ESSAIS, 'copies-')), 'copie');
      p.git('worktree', 'add', '-q', '--detach', copie, 'HEAD');
      writeFileSync(path.join(copie, 'src/d/index.ts'), 'export const d = 6;\n');
      const r = p.suites(['src/d'], {}, copie);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      p.git('worktree', 'remove', '--force', copie);
      p.ecrire('src/d/index.ts', 'export const d = 6;\n');
      expect(jouees(p.suites(['src/d']), 'src/d')).toEqual([]);
    },
    LONG
  );
  it(
    "critère 10: a run in a copy writes nothing in the copy's tree, and its traces in git's common folder",
    () => {
      const p = projetTraces(ESSAIS);
      const copie = path.join(mkdtempSync(path.join(ESSAIS, 'copies-')), 'copie');
      p.git('worktree', 'add', '-q', '--detach', copie, 'HEAD');
      const commun = path.resolve(
        copie,
        execFileSync('git', ['-C', copie, 'rev-parse', '--git-common-dir'], {
          encoding: 'utf8',
        }).trim()
      );
      const avantCopie = tousLesFichiers(copie);
      const avantCommun = new Set(tousLesFichiers(commun));
      const r = p.suites(['src/d'], {}, copie);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(tousLesFichiers(copie)).toEqual(avantCopie);
      const neufs = tousLesFichiers(commun).filter(
        f => !avantCommun.has(f) && !/^(objects|logs|refs|worktrees)\//.test(f)
      );
      expect(neufs.length, 'the run leaves its traces in the common folder').toBeGreaterThan(0);
    },
    LONG
  );
});

describe('critère 11 — a file git ignores does not count; a tracked or untracked file counts by its path and content', () => {
  it(
    'critère 11: files git ignores in the component (dist, node_modules) make nothing stale',
    () => {
      const p = projetTraces(ESSAIS);
      amorcer(p, ['src/d']);
      p.ecrire('src/d/dist/index.js', 'export const d = 4;\n');
      p.ecrire('src/d/node_modules/x/index.js', 'module.exports = 1;\n');
      const r = p.suites(['src/d']);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(jouees(r, 'src/d')).toEqual([]);
    },
    LONG
  );
  it(
    'critère 11: a tracked file renamed, its content the same, makes the suite stale',
    () => {
      const p = projetTraces(ESSAIS);
      amorcer(p, ['src/d']);
      p.git('mv', 'src/d/index.ts', 'src/d/principal.ts');
      expect(jouees(p.suites(['src/d']), 'src/d').length).toBeGreaterThan(0);
    },
    LONG
  );
  it(
    'critère 11: an untracked file counts by its path and its content: renamed, then changed, each makes the suite stale',
    () => {
      const p = projetTraces(ESSAIS);
      p.ecrire('src/d/neuf.ts', 'export const n = 1;\n');
      amorcer(p, ['src/d']);
      renameSync(path.join(p.repo, 'src/d/neuf.ts'), path.join(p.repo, 'src/d/autre.ts'));
      expect(jouees(p.suites(['src/d']), 'src/d').length).toBeGreaterThan(0);
      p.ecrire('src/d/autre.ts', 'export const n = 2;\n');
      expect(jouees(p.suites(['src/d']), 'src/d').length).toBeGreaterThan(0);
    },
    LONG
  );
});

describe('critère 12 — FORCER=1 writes again the trace of each suite it replays', () => {
  it(
    'critère 12: a red verdict kept is replaced by the green one FORCER=1 measures, and the next run keeps the green',
    () => {
      const p = projetTraces(ESSAIS);
      avecPlan(p, 'src/d/d.spec.ts', { tests: [{ nom: 'd instable', rouge: true }] });
      expect(p.suites(['src/d']).status).not.toBe(0);
      p.planifier(p.PLAN);
      const force = p.suites(['src/d'], { FORCER: '1' });
      expect(jouees(force, 'src/d').length).toBeGreaterThan(0);
      expect(force.status, force.stdout + force.stderr).toBe(0);
      const r = p.suites(['src/d']);
      expect(jouees(r, 'src/d')).toEqual([]);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(r.rouges).toEqual([]);
    },
    LONG
  );
});

describe('critère 13 — the quick set has its own trace; a last full suite red plays the full suite', () => {
  it(
    'critère 13 (garde): a component whose last full suite is red plays its full suite when stale by what it consumes',
    () => {
      const p = projetTraces(ESSAIS);
      avecPlan(p, 'src/b/lent.spec.ts', { tests: [{ nom: 'lent casse', rouge: true }] });
      expect(p.suites(['src/b']).status).not.toBe(0);
      p.ecrire('src/a/index.ts', 'export const a = 2;\n');
      const r = p.suites(['src/b']);
      expect(jouees(r, 'src/b').length).toBeGreaterThan(0);
      expect(lentExclu(r)).toBe(false);
      expect(r.status).not.toBe(0);
      expect(r.rouges).toContain('src/b/lent.spec.ts > lent casse');
    },
    LONG
  );
  it(
    'critère 13: the trace of a quick set is never read as a full suite: back to a content a quick set measured, a full suite due is played',
    () => {
      const p = projetTraces(ESSAIS);
      avecPlan(p, 'src/b/b.spec.ts', { tests: [{ nom: 'b casse', si: 'src/b/casse.ts' }] });
      amorcer(p, ['src/b']);
      // Stale by src/a only: the quick set, under its own trace.
      p.ecrire('src/a/index.ts', 'export const a = 2;\n');
      expect(lentExclu(p.suites(['src/b']))).toBe(true);
      // An own source changes: the full suite, red.
      p.ecrire('src/b/casse.ts', 'export const casse = 1;\n');
      expect(p.suites(['src/b']).status).not.toBe(0);
      // Back to the content the quick set measured: the last full suite is red, the full suite
      // is due, and the quick set's trace does not stand for it.
      unlinkSync(path.join(p.repo, 'src/b/casse.ts'));
      const r = p.suites(['src/b']);
      expect(jouees(r, 'src/b').length).toBeGreaterThan(0);
      expect(lentExclu(r)).toBe(false);
    },
    LONG
  );
});

describe('critère 14 — a test file is slow at 10 s or more, measured by its last full suite; never measured, never left out', () => {
  it.each([
    [10, true],
    [9.9, false],
  ])(
    'critère 14: a file measured %s s by the last full suite is left out of the quick set: %s',
    (duree, exclu) => {
      const p = projetTraces(ESSAIS);
      avecPlan(p, 'src/b/lent.spec.ts', { duree });
      amorcer(p, ['src/b']);
      p.ecrire('src/a/index.ts', 'export const a = 2;\n');
      const r = p.suites(['src/b']);
      expect(jouees(r, 'src/b').length).toBeGreaterThan(0);
      expect(lentExclu(r)).toBe(exclu);
    },
    LONG
  );
  it(
    'critère 14: a file the last full suite did not measure (no times in its report) is never left out',
    () => {
      const p = projetTraces(ESSAIS);
      avecPlan(p, 'src/b/lent.spec.ts', { sansDuree: true });
      amorcer(p, ['src/b']);
      avecPlan(p, 'src/b/lent.spec.ts', {});
      p.ecrire('src/a/index.ts', 'export const a = 2;\n');
      const r = p.suites(['src/b']);
      expect(lentExclu(r)).toBe(false);
      expect(fichiersJoues(r.appels)).toContain('src/b/lent.spec.ts');
    },
    LONG
  );
});

describe('critère 16 — the lock file is in every fingerprint; another root file only when declared', () => {
  it(
    'critère 16: the lock file of the dependencies changed replays the suite, undeclared',
    () => {
      const p = projetTraces(ESSAIS);
      p.ecrire('package-lock.json', '{"lockfileVersion":3,"packages":{}}\n');
      amorcer(p, ['src/d']);
      p.ecrire('package-lock.json', '{"lockfileVersion":3,"packages":{"x":{}}}\n');
      expect(jouees(p.suites(['src/d']), 'src/d').length).toBeGreaterThan(0);
    },
    LONG
  );
  it(
    'critère 16: a root file declared in grillhouse.lusParLesSuites (a file, not a folder) changed replays the suite',
    () => {
      const p = projetTraces(ESSAIS, { grillhouse: { lusParLesSuites: ['vitest.config.ts'] } });
      p.ecrire('vitest.config.ts', 'export default {};\n');
      amorcer(p, ['src/d']);
      p.ecrire('vitest.config.ts', 'export default { test: {} };\n');
      expect(jouees(p.suites(['src/d']), 'src/d').length).toBeGreaterThan(0);
    },
    LONG
  );
  it(
    'critère 16: root files no declaration names (a setting, a script, a hook, a note) make nothing stale',
    () => {
      const p = projetTraces(ESSAIS, { grillhouse: { lusParLesSuites: ['vitest.config.ts'] } });
      p.ecrire('vitest.config.ts', 'export default {};\n');
      amorcer(p, ['src/d']);
      p.ecrire('tsconfig.json', '{}\n');
      p.ecrire('scripts/outil.mjs', 'export const o = 1;\n');
      p.ecrire('.claude/hooks/garde.sh', 'exit 0\n');
      p.ecrire('autre/notes.txt', 'notes changées\n');
      const r = p.suites(['src/d']);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(jouees(r, 'src/d')).toEqual([]);
    },
    LONG
  );
});

describe('critère 21 — the tests outside every component form the root suite, under its own trace', () => {
  const RACINE_SUITE = ['tests/r.spec.ts', 'tests/s.spec.ts'];
  const deComposants = (r: ReturnType<Projet['suites']>) =>
    fichiersJoues(r.appels).filter(f => f.startsWith('src/'));
  it(
    'critère 21: --tous plays the root suite with the others, then replays none of them while nothing changes',
    () => {
      const p = projetTraces(ESSAIS);
      const r1 = p.suites(['--tous']);
      expect(r1.status, r1.stdout + r1.stderr).toBe(0);
      expect(fichiersJoues(r1.appels)).toEqual(expect.arrayContaining(RACINE_SUITE));
      const r2 = p.suites(['--tous']);
      expect(r2.status, r2.stdout + r2.stderr).toBe(0);
      expect(fichiersJoues(r2.appels)).toEqual([]);
    },
    LONG
  );
  it(
    'critère 21: the verdict of the root suite is kept, red included',
    () => {
      const p = projetTraces(ESSAIS);
      avecPlan(p, 'tests/s.spec.ts', { tests: [{ nom: 's casse', rouge: true }] });
      expect(p.suites(['--tous']).status).not.toBe(0);
      p.planifier(p.PLAN);
      const r = p.suites(['--tous']);
      expect(fichiersJoues(r.appels)).toEqual([]);
      expect(r.status).not.toBe(0);
      expect(r.rouges).toEqual(['tests/s.spec.ts > s casse']);
    },
    LONG
  );
  it(
    'critère 21, 25: a test file of the root suite changed replays the whole root suite, and no suite of a component',
    () => {
      const p = projetTraces(ESSAIS);
      p.suites(['--tous']);
      p.ecrire('tests/s.spec.ts', '// s, changé\n');
      const r = p.suites(['--tous']);
      expect(fichiersJoues(r.appels)).toEqual(RACINE_SUITE);
      expect(deComposants(r)).toEqual([]);
    },
    LONG
  );
  it(
    'critère 21, 25: the root suite stale by a component alone plays only its tests that import it (vitest related)',
    () => {
      const p = projetTraces(ESSAIS);
      p.suites(['--tous']);
      p.ecrire('src/d/index.ts', 'export const d = 5;\n');
      const r = p.suites(['--tous']);
      expect(fichiersJoues(r.appels).filter(f => f.startsWith('tests/'))).toEqual([
        'tests/r.spec.ts',
      ]);
      expect(jouees(r, 'src/a')).toEqual([]);
    },
    LONG
  );
  it(
    'critère 21 (garde): a declared path changed replays every suite, the root suite included',
    () => {
      const p = projetTraces(ESSAIS, { grillhouse: { lusParLesSuites: ['autre'] } });
      p.suites(['--tous']);
      p.ecrire('autre/notes.txt', 'notes changées\n');
      const r = p.suites(['--tous']);
      for (const c of ['a', 'b', 'c', 'd', 'e', 'f']) {
        expect(jouees(r, `src/${c}`).length, `src/${c}`).toBeGreaterThan(0);
      }
      expect(fichiersJoues(r.appels)).toEqual(expect.arrayContaining(RACINE_SUITE));
    },
    LONG
  );
  it(
    'critère 21: a root file no declaration names changed replays no suite, the root suite included',
    () => {
      const p = projetTraces(ESSAIS);
      p.suites(['--tous']);
      p.ecrire('autre/notes.txt', 'notes changées\n');
      p.ecrire('scripts/outil.mjs', 'export const o = 1;\n');
      const r = p.suites(['--tous']);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(fichiersJoues(r.appels)).toEqual([]);
    },
    LONG
  );
});

describe('critère 22 — the root suite counts every file of its test folders, helpers and test material included', () => {
  const RACINE_SUITE = ['tests/r.spec.ts', 'tests/s.spec.ts'];
  it(
    'critère 22: a helper of the tests changed alone replays the root suite, and no suite of a component',
    () => {
      const p = projetTraces(ESSAIS);
      p.suites(['--tous']);
      p.ecrire('tests/aide.ts', 'export const aide = 2;\n');
      const r = p.suites(['--tous']);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(fichiersJoues(r.appels)).toEqual(RACINE_SUITE);
    },
    LONG
  );
  it(
    'critère 22: a data file of the test material (not code) changed alone replays the root suite',
    () => {
      const p = projetTraces(ESSAIS);
      p.ecrire('tests/donnees/exemple.json', '{"n":1}\n');
      p.suites(['--tous']);
      p.ecrire('tests/donnees/exemple.json', '{"n":2}\n');
      const r = p.suites(['--tous']);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(fichiersJoues(r.appels)).toEqual(RACINE_SUITE);
    },
    LONG
  );
});

describe('critère 24 — a component stale only by the lock file or a declared path plays its full suite', () => {
  it(
    'critère 24: src/b, its last full suite green and measured, stale by the lock file alone, plays without leaving out its slow file',
    () => {
      const p = projetTraces(ESSAIS);
      p.ecrire('package-lock.json', '{"lockfileVersion":3,"packages":{}}\n');
      amorcer(p, ['src/b']);
      p.ecrire('package-lock.json', '{"lockfileVersion":3,"packages":{"x":{}}}\n');
      const r = p.suites(['src/b']);
      expect(jouees(r, 'src/b').length).toBeGreaterThan(0);
      expect(lentExclu(r)).toBe(false);
    },
    LONG
  );
  it(
    'critère 24: src/b stale by a declared path alone plays without leaving out its slow file',
    () => {
      const p = projetTraces(ESSAIS, { grillhouse: { lusParLesSuites: ['autre'] } });
      amorcer(p, ['src/b']);
      p.ecrire('autre/notes.txt', 'notes changées\n');
      const r = p.suites(['src/b']);
      expect(jouees(r, 'src/b').length).toBeGreaterThan(0);
      expect(lentExclu(r)).toBe(false);
    },
    LONG
  );
});

describe('critère 25 — the root suite stale by a component alone plays its tests that import it; otherwise it replays whole', () => {
  const RACINE_SUITE = ['tests/r.spec.ts', 'tests/s.spec.ts'];
  const deRacine = (r: ReturnType<Projet['suites']>) =>
    fichiersJoues(r.appels).filter(f => f.startsWith('tests/'));
  it(
    'critère 25: a component no root test imports changed plays no test of the root suite',
    () => {
      const p = projetTraces(ESSAIS);
      p.suites(['--tous']);
      p.ecrire('src/a/index.ts', 'export const a = 2;\n');
      const r = p.suites(['--tous']);
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(jouees(r, 'src/a').length).toBeGreaterThan(0);
      expect(deRacine(r)).toEqual([]);
    },
    LONG
  );
  it(
    'critère 25 (garde): the root suite stale by the lock file replays whole',
    () => {
      const p = projetTraces(ESSAIS);
      p.ecrire('package-lock.json', '{"lockfileVersion":3,"packages":{}}\n');
      p.suites(['--tous']);
      p.ecrire('package-lock.json', '{"lockfileVersion":3,"packages":{"x":{}}}\n');
      expect(deRacine(p.suites(['--tous']))).toEqual(RACINE_SUITE);
    },
    LONG
  );
  it(
    'critère 25 (garde): stale by a component AND by one of its test files, the root suite replays whole',
    () => {
      const p = projetTraces(ESSAIS);
      p.suites(['--tous']);
      p.ecrire('src/d/index.ts', 'export const d = 5;\n');
      p.ecrire('tests/s.spec.ts', '// s, changé\n');
      expect(deRacine(p.suites(['--tous']))).toEqual(RACINE_SUITE);
    },
    LONG
  );
});

describe('critère 23 — a project created or updated by the frame does not receive grillhouse.lusParLesSuites', () => {
  const DEPOT = path.resolve(__dirname, '../..');
  const declaration = (pkg: string) =>
    (JSON.parse(readFileSync(pkg, 'utf8')) as { grillhouse?: { lusParLesSuites?: unknown } })
      .grillhouse?.lusParLesSuites;
  it(
    'critère 23: npm run new (scripts/new-project.sh) writes a package.json without the template’s lusParLesSuites',
    () => {
      // A template whose package.json declares its paths, scripts/setup.sh stood in by git init.
      const gabarit = mkdtempSync(path.join(ESSAIS, 'gabarit-'));
      const ecrire = (rel: string, contenu: string, mode = 0o644) => {
        mkdirSync(path.dirname(path.join(gabarit, rel)), { recursive: true });
        writeFileSync(path.join(gabarit, rel), contenu, { mode });
      };
      ecrire(
        'package.json',
        JSON.stringify({
          name: 'gabarit',
          private: true,
          scripts: { new: 'bash scripts/new-project.sh', test: 'vitest run' },
          grillhouse: { lusParLesSuites: ['scripts', 'vitest.config.ts'] },
        })
      );
      cpSync(
        path.join(DEPOT, 'scripts/new-project.sh'),
        path.join(gabarit, 'scripts/new-project.sh')
      );
      ecrire('scripts/setup.sh', 'git -C "$(dirname "$0")/.." init -q\n', 0o755);
      ecrire('scripts/outil.mjs', 'export const o = 1;\n');
      ecrire('templates/README.md', '# Projet\n');
      const dest = path.join(mkdtempSync(path.join(ESSAIS, 'nouveau-')), 'projet');
      const r = spawnSync('bash', [path.join(gabarit, 'scripts/new-project.sh'), dest, 'np'], {
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 't',
          GIT_AUTHOR_EMAIL: 't@t',
          GIT_COMMITTER_NAME: 't',
          GIT_COMMITTER_EMAIL: 't@t',
        },
        timeout: 60_000,
      });
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(existsSync(path.join(dest, 'scripts/outil.mjs'))).toBe(true);
      expect(declaration(path.join(dest, 'package.json'))).toBeUndefined();
    },
    LONG
  );
  // A project whose package.json is <pkg>, updated from a frame whose package.json declares
  // scripts read by its suites; the project's declaration after the update.
  const mettreAJourDepuisCadre = async (pkg: Record<string, unknown>) => {
    const { mettreAJour } = await import('../../scripts/grillhouse-maj.mjs');
    const source = mkdtempSync(path.join(ESSAIS, 'cadre-'));
    mkdirSync(path.join(source, '.claude/grillhouse'), { recursive: true });
    writeFileSync(path.join(source, '.claude/grillhouse/fichiers.txt'), 'METACADRE.md\n');
    writeFileSync(path.join(source, 'METACADRE.md'), 'meta');
    writeFileSync(
      path.join(source, 'package.json'),
      JSON.stringify({ name: 'cadre', grillhouse: { lusParLesSuites: ['scripts'] } })
    );
    const projet = mkdtempSync(path.join(ESSAIS, 'installe-'));
    writeFileSync(path.join(projet, 'package.json'), JSON.stringify(pkg));
    mettreAJour(projet, source, 'essai');
    return declaration(path.join(projet, 'package.json'));
  };
  it('critère 23 (garde): the update (grillhouse:maj) does not write the frame’s lusParLesSuites into the project', async () => {
    expect(await mettreAJourDepuisCadre({ name: 'p' })).toBeUndefined();
  });
  it('critère 23 (garde): the update keeps the project’s own lusParLesSuites as it is', async () => {
    expect(
      await mettreAJourDepuisCadre({ name: 'p', grillhouse: { lusParLesSuites: ['corpus'] } })
    ).toEqual(['corpus']);
  });
});
