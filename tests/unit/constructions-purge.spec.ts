// grillhouse-3uv.67, critères 6 and 18: the old entries of the store are purged, builds and traces
// of the suites alike, at the start of each passage of the entry point. The store keeps the
// entries whose fingerprint is that of the content of main, of main's previous commit, or of a
// ticket in progress: every copy git knows for the repository (its content on disk), and every
// branch the queue holds (scripts/integration/file-attente.mjs), read in git when it has no copy.
// Any other entry goes, with no size cap (the reachability of git's garbage collector). The
// interface these tests fix is written at the head of ./constructions-essai.ts.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { inscrireEntree } from '../../scripts/integration/file-attente.mjs';
import { ouvrirTraces } from '../../scripts/integration/traces.mjs';
import { depot, fichiersPaquets, fichiersUnique, type Depot } from './constructions-essai.js';

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'constructions-purge-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const LONG = 90_000;

const vert = (r: { status: number | null; stdout: string; stderr: string }) =>
  expect(r.status, r.stdout + r.stderr).toBe(0);

// A project without packages whose main holds four commits C0 … C3 (main^ is C2), each changing
// src/index.ts; the main tree holds an untracked file, so no copy holds main's content as it is
// committed. Returns the commits.
function historique(): { d: Depot; c: string[] } {
  const d = depot(ESSAIS, fichiersUnique());
  const c = [d.git('rev-parse', 'HEAD').trim()];
  for (let i = 1; i <= 3; i++) {
    c.push(d.commiter({ 'src/index.ts': `export const index = ${i};\n` }));
  }
  d.ecrire('local.txt', 'travail local\n');
  return { d, c };
}

// <copie> moved on <commit>, then a passage there.
function passageA(d: Depot, copie: string, commit: string) {
  d.gitDans(copie, 'checkout', '-q', '--detach', commit);
  vert(d.passage(copie));
}

const present = (d: Depot, empreinte: string) => existsSync(path.join(d.magasin, empreinte));

describe('critère 6 — the store keeps main, main^ and the tickets in progress; any other entry goes', () => {
  it(
    'critère 6: an entry that no live content reaches is gone after the next passage',
    () => {
      const { d, c } = historique();
      const w = d.copie(c[0]);
      vert(d.passage(w));
      const e0 = d.empreinte('', w);
      expect(present(d, e0)).toBe(true);
      passageA(d, w, c[1]);
      expect(present(d, e0)).toBe(false);
      expect(present(d, d.empreinte('', w))).toBe(true);
    },
    LONG
  );
  it(
    "critère 6: the entry of main's content stays, though no copy holds that content",
    () => {
      const { d, c } = historique();
      const w = d.copie(c[3]);
      vert(d.passage(w));
      const e3 = d.empreinte('', w);
      passageA(d, w, c[1]);
      passageA(d, w, c[0]);
      expect(present(d, e3)).toBe(true);
      expect(d.empreinte('', d.repo)).not.toBe(e3);
    },
    LONG
  );
  it(
    "critère 6: the entry of main's previous commit stays; the one before it goes",
    () => {
      const { d, c } = historique();
      const w = d.copie(c[2]);
      vert(d.passage(w));
      const e2 = d.empreinte('', w);
      passageA(d, w, c[1]);
      const e1 = d.empreinte('', w);
      passageA(d, w, c[0]);
      expect(present(d, e2)).toBe(true);
      expect(present(d, e1)).toBe(false);
    },
    LONG
  );
  it(
    'critère 6: in a packages project, the purge works per component: an old build of e goes, the build of a that main still reaches stays',
    () => {
      const d = depot(ESSAIS, fichiersPaquets());
      vert(d.passage());
      const a0 = d.empreinte('packages/a');
      const e0 = d.empreinte('packages/e');
      d.commiter({ 'packages/e/src/index.ts': 'export const e = 6;\n' });
      d.commiter({ 'packages/e/src/index.ts': 'export const e = 7;\n' });
      vert(d.passage());
      expect(present(d, a0)).toBe(true);
      expect(present(d, e0)).toBe(false);
    },
    LONG
  );
  it(
    'critère 6: the traces of the suites follow the same rule: t- and r- of no live content go, those of a live content stay',
    () => {
      const { d } = historique();
      const t = ouvrirTraces(d.repo);
      const vivante = t.statutComposant('src/a').empreinte;
      const racine = t.statutRacine().empreinte;
      const morte = 'f'.repeat(64);
      mkdirSync(d.suites, { recursive: true });
      const trace = JSON.stringify({ code: 0, rouges: [] });
      for (const n of [`t-${vivante}`, `r-${vivante}`, `t-${racine}`, `t-${morte}`, `r-${morte}`]) {
        writeFileSync(path.join(d.suites, `${n}.json`), trace);
      }
      vert(d.passage());
      expect(existsSync(path.join(d.suites, `t-${vivante}.json`))).toBe(true);
      expect(existsSync(path.join(d.suites, `r-${vivante}.json`))).toBe(true);
      expect(existsSync(path.join(d.suites, `t-${racine}.json`))).toBe(true);
      expect(existsSync(path.join(d.suites, `t-${morte}.json`))).toBe(false);
      expect(existsSync(path.join(d.suites, `r-${morte}.json`))).toBe(false);
    },
    LONG
  );
  it(
    'critère 6: there is no size cap: twelve live entries all stay',
    () => {
      const d = depot(ESSAIS, fichiersUnique());
      const copies: string[] = [];
      for (let i = 0; i < 12; i++) {
        const w = d.copie();
        d.ecrire('src/index.ts', `export const index = ${100 + i};\n`, w);
        vert(d.passage(w));
        copies.push(d.empreinte('', w));
      }
      vert(d.passage());
      for (const e of copies) {
        expect(present(d, e)).toBe(true);
      }
    },
    LONG
  );
});

describe('critère 18 — the purge runs at the start of each passage; its live set and its removal', () => {
  it(
    'critère 18: the purge runs even when the passage builds nothing (everything restored)',
    () => {
      const d = depot(ESSAIS, fichiersUnique());
      vert(d.passage());
      const vieille = path.join(d.magasin, 'e'.repeat(64));
      mkdirSync(vieille);
      writeFileSync(path.join(vieille, 'index.js'), 'vieux\n');
      const passe = new Date(Date.now() - 3_600_000);
      utimesSync(vieille, passe, passe);
      expect(d.buildsDe(() => vert(d.passage()))).toEqual([]);
      expect(existsSync(vieille)).toBe(false);
    },
    LONG
  );
  it(
    "critère 18: a ticket's copy with local work keeps its entry; once the copy is removed, the next passage elsewhere removes it",
    () => {
      const d = depot(ESSAIS, fichiersUnique());
      const t = d.copie();
      d.ecrire('src/a/neuf.ts', 'export const neuf = 1;\n', t);
      vert(d.passage(t));
      const et = d.empreinte('', t);
      vert(d.passage());
      expect(present(d, et)).toBe(true);
      d.git('worktree', 'remove', '--force', t);
      vert(d.passage());
      expect(present(d, et)).toBe(false);
    },
    LONG
  );
  it(
    'critère 18: a branch the queue holds, without any copy, keeps the entry of its content read in git; a branch outside the queue does not',
    () => {
      const d = depot(ESSAIS, fichiersUnique());
      const empreinteDeBranche = (branche: string, valeur: number) => {
        const w = d.copie();
        d.gitDans(w, 'checkout', '-q', '-b', branche);
        d.commiter({ 'src/b/autre.ts': `export const autre = ${valeur};\n` }, w);
        vert(d.passage(w));
        const e = d.empreinte('', w);
        d.git('worktree', 'remove', '--force', w);
        return e;
      };
      const enFile = empreinteDeBranche('agent/demo-1', 1);
      inscrireEntree(d.repo, 'agent/demo-1', ['demo-1']);
      const horsFile = empreinteDeBranche('agent/demo-2', 2);
      expect(present(d, horsFile)).toBe(true);
      vert(d.passage());
      expect(present(d, enFile)).toBe(true);
      expect(present(d, horsFile)).toBe(false);
    },
    LONG
  );
  it(
    'critère 18: in a packages project, a branch in the queue keeps the build of each of its components',
    () => {
      const d = depot(ESSAIS, fichiersPaquets());
      const w = d.copie();
      d.gitDans(w, 'checkout', '-q', '-b', 'agent/demo-1');
      d.commiter({ 'packages/b/src/neuf.ts': 'export const neuf = 1;\n' }, w);
      vert(d.passage(w));
      const eb = d.empreinte('packages/b', w);
      const ec = d.empreinte('packages/c', w);
      d.git('worktree', 'remove', '--force', w);
      inscrireEntree(d.repo, 'agent/demo-1', ['demo-1']);
      vert(d.passage());
      expect(present(d, eb)).toBe(true);
      expect(present(d, ec)).toBe(true);
    },
    LONG
  );
  it(
    'critère 18: an entry written after the start of the purge stays (its date is later than that start); an older one of no live content goes',
    () => {
      const d = depot(ESSAIS, fichiersUnique());
      vert(d.passage());
      const tardive = path.join(d.magasin, 'a'.repeat(64));
      const ancienne = path.join(d.magasin, 'b'.repeat(64));
      for (const e of [tardive, ancienne]) {
        mkdirSync(e);
        writeFileSync(path.join(e, 'index.js'), 'x\n');
      }
      const futur = new Date(Date.now() + 3_600_000);
      const passe = new Date(Date.now() - 3_600_000);
      utimesSync(tardive, futur, futur);
      utimesSync(ancienne, passe, passe);
      vert(d.passage());
      expect(existsSync(tardive)).toBe(true);
      expect(existsSync(ancienne)).toBe(false);
    },
    LONG
  );
  it(
    'critère 18: an entry stored while the purge computes the live contents (after its start, before the reading of main is done) stays',
    () => {
      const d = depot(ESSAIS, fichiersUnique());
      vert(d.passage());
      // git, as the passage finds it on its PATH: when the purge resolves main to read its
      // content, another passage stores an entry (its date is now), then git answers.
      const bin = mkdtempSync(path.join(ESSAIS, 'bin-'));
      const vraiGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
      const pendant = path.join(d.magasin, 'f'.repeat(64));
      const fait = path.join(bin, 'fait');
      writeFileSync(
        path.join(bin, 'git'),
        [
          '#!/bin/sh',
          `case " $* " in *" rev-parse "*" main^{commit} "*)`,
          `  if [ ! -e ${fait} ]; then`,
          `    mkdir -p ${pendant} && echo x > ${pendant}/index.js && touch ${fait}`,
          '    sleep 0.2',
          '  fi ;;',
          'esac',
          `exec ${vraiGit} "$@"`,
          '',
        ].join('\n'),
        { mode: 0o755 }
      );
      vert(d.passage(d.repo, { PATH: `${bin}:${process.env.PATH}` }));
      expect(existsSync(fait), 'the purge never resolved main').toBe(true);
      expect(existsSync(pendant)).toBe(true);
    },
    LONG
  );
  it(
    'critère 18: the records of the last full suite (d-…, racine-dernier), which bear no content fingerprint, stay',
    () => {
      const d = depot(ESSAIS, fichiersUnique());
      mkdirSync(d.suites, { recursive: true });
      const dernier = path.join(d.suites, `d-${'c'.repeat(64)}.json`);
      const racine = path.join(d.suites, 'racine-dernier.json');
      writeFileSync(dernier, JSON.stringify({ propre: 'x', racine: 'y', code: 0, durees: {} }));
      writeFileSync(
        racine,
        JSON.stringify({ code: 0, rouges: [], racine: 'y', tests: 'z', composants: {} })
      );
      const passe = new Date(Date.now() - 86_400_000);
      utimesSync(dernier, passe, passe);
      utimesSync(racine, passe, passe);
      vert(d.passage());
      expect(existsSync(dernier)).toBe(true);
      expect(existsSync(racine)).toBe(true);
    },
    LONG
  );
});

describe('critère 20 — the purge removes the temporary folders of the store left for more than an hour by an interrupted process', () => {
  it(
    'critère 20: a folder of the store not named by a fingerprint, older than an hour, goes; a younger one stays, and the entries stay',
    () => {
      const d = depot(ESSAIS, fichiersUnique());
      vert(d.passage());
      const vivante = d.empreinte('');
      const orphelins = [`${'d'.repeat(64)}.4242.tmp`, `${vivante}.4243.ancien`, 'tmp-4244'];
      const recent = path.join(d.magasin, `${'e'.repeat(64)}.4245.tmp`);
      const ilYa = (ms: number) => new Date(Date.now() - ms);
      for (const n of orphelins) {
        const p = path.join(d.magasin, n);
        mkdirSync(path.join(p, 'bin'), { recursive: true });
        writeFileSync(path.join(p, 'bin', 'index.js'), 'à moitié\n');
        utimesSync(path.join(p, 'bin'), ilYa(7_200_000), ilYa(7_200_000));
        utimesSync(p, ilYa(7_200_000), ilYa(7_200_000));
      }
      mkdirSync(recent);
      writeFileSync(path.join(recent, 'index.js'), 'en cours\n');
      utimesSync(recent, ilYa(600_000), ilYa(600_000));
      expect(d.buildsDe(() => vert(d.passage()))).toEqual([]);
      for (const n of orphelins) {
        expect(existsSync(path.join(d.magasin, n)), n).toBe(false);
      }
      expect(existsSync(recent)).toBe(true);
      expect(present(d, vivante)).toBe(true);
    },
    LONG
  );
});

describe('critère 25 — the temporary files of the traces of the suites (an interrupted write of a trace) follow critère 20: the purge removes them past an hour', () => {
  it(
    'critère 25: a temporary file of the traces (<name>.<pid>.tmp, as traces.mjs writes it) older than an hour goes, whatever trace it was writing; a younger one stays, and the traces stay',
    () => {
      const d = depot(ESSAIS, fichiersUnique());
      const t = ouvrirTraces(d.repo);
      const vivante = t.statutComposant('src/a').empreinte;
      const morte = 'f'.repeat(64);
      mkdirSync(d.suites, { recursive: true });
      const trace = JSON.stringify({ code: 0, rouges: [] });
      writeFileSync(path.join(d.suites, `t-${vivante}.json`), trace);
      writeFileSync(
        path.join(d.suites, 'racine-dernier.json'),
        JSON.stringify({ code: 0, rouges: [], racine: 'y', tests: 'z', composants: {} })
      );
      const ilYa = (ms: number) => new Date(Date.now() - ms);
      const orphelins = [
        `t-${vivante}.4242.tmp`,
        `r-${morte}.4243.tmp`,
        `d-${'c'.repeat(64)}.4244.tmp`,
        'racine-dernier.4245.tmp',
      ];
      for (const n of orphelins) {
        const p = path.join(d.suites, n);
        writeFileSync(p, '{"code": 0, "rou');
        utimesSync(p, ilYa(7_200_000), ilYa(7_200_000));
      }
      const recent = path.join(d.suites, `t-${morte}.4246.tmp`);
      writeFileSync(recent, '{"code": 0, "rou');
      utimesSync(recent, ilYa(600_000), ilYa(600_000));
      vert(d.passage());
      for (const n of orphelins) {
        expect(existsSync(path.join(d.suites, n)), n).toBe(false);
      }
      expect(existsSync(recent)).toBe(true);
      expect(existsSync(path.join(d.suites, `t-${vivante}.json`))).toBe(true);
      expect(existsSync(path.join(d.suites, 'racine-dernier.json'))).toBe(true);
    },
    LONG
  );
});

describe('critère 22 — a copy git knows whose folder is gone, and a queue entry whose branch no longer exists, keep nothing; the purge stays green', () => {
  it(
    'critère 22: a copy removed from the disk without git keeps nothing: its entry goes, and the passage is green',
    () => {
      const d = depot(ESSAIS, fichiersUnique());
      const t = d.copie();
      d.ecrire('src/a/neuf.ts', 'export const neuf = 1;\n', t);
      vert(d.passage(t));
      const et = d.empreinte('', t);
      rmSync(t, { recursive: true, force: true });
      expect(d.git('worktree', 'list', '--porcelain')).toContain(t);
      vert(d.passage());
      expect(present(d, et)).toBe(false);
      expect(present(d, d.empreinte(''))).toBe(true);
    },
    LONG
  );
  it(
    'critère 22: a queue entry whose branch never existed, and one whose branch was deleted, keep nothing; the passage is green',
    () => {
      const d = depot(ESSAIS, fichiersUnique());
      const w = d.copie();
      d.gitDans(w, 'checkout', '-q', '-b', 'agent/demo-1');
      d.commiter({ 'src/b/autre.ts': 'export const autre = 1;\n' }, w);
      vert(d.passage(w));
      const e = d.empreinte('', w);
      d.git('worktree', 'remove', '--force', w);
      inscrireEntree(d.repo, 'agent/demo-1', ['demo-1']);
      inscrireEntree(d.repo, 'agent/fantome', ['fantome']);
      d.git('branch', '-q', '-D', 'agent/demo-1');
      vert(d.passage());
      expect(present(d, e)).toBe(false);
      expect(present(d, d.empreinte(''))).toBe(true);
    },
    LONG
  );
});

describe('critère 23 — the content of a branch in the queue without a copy is read in git with its submodules; its fingerprint equals that of a copy', () => {
  // A project without packages whose main holds the submodule vendor/lib at its first commit S1;
  // the submodule's repository also holds S2, which changes its file. Returns the trial and S2.
  function avecSousModule(): { d: Depot; s2: string } {
    const sub = mkdtempSync(path.join(ESSAIS, 'sous-module-'));
    const g = (dir: string, ...a: string[]) =>
      execFileSync(
        'git',
        [
          '-C',
          dir,
          '-c',
          'user.name=t',
          '-c',
          'user.email=t@t',
          '-c',
          'protocol.file.allow=always',
          ...a,
        ],
        { encoding: 'utf8' }
      ).trim();
    g(sub, 'init', '-q', '-b', 'main');
    writeFileSync(path.join(sub, 'lib.txt'), 'S1\n');
    g(sub, 'add', '.');
    g(sub, 'commit', '-q', '-m', 's1');
    const s1 = g(sub, 'rev-parse', 'HEAD');
    writeFileSync(path.join(sub, 'lib.txt'), 'S2\n');
    g(sub, 'commit', '-q', '-am', 's2');
    const s2 = g(sub, 'rev-parse', 'HEAD');
    const d = depot(ESSAIS, fichiersUnique());
    g(d.repo, 'submodule', 'add', '-q', sub, 'vendor/lib');
    g(path.join(d.repo, 'vendor/lib'), 'checkout', '-q', s1);
    g(d.repo, 'add', '.');
    g(d.repo, 'commit', '-q', '-m', 'sous-module');
    return { d, s2 };
  }
  const sm = (dir: string, ...a: string[]) =>
    execFileSync(
      'git',
      [
        '-C',
        dir,
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@t',
        '-c',
        'protocol.file.allow=always',
        ...a,
      ],
      { encoding: 'utf8' }
    ).trim();
  it(
    'critère 23: a branch in the queue that moves its submodule keeps, without any copy, the entry its copy built',
    () => {
      const { d, s2 } = avecSousModule();
      vert(d.passage());
      const w = d.copie();
      sm(w, 'checkout', '-q', '-b', 'agent/demo-1');
      sm(w, 'submodule', 'update', '--init', '-q');
      sm(path.join(w, 'vendor/lib'), 'checkout', '-q', s2);
      sm(w, 'commit', '-q', '-am', 'sous-module à S2');
      vert(d.passage(w));
      const e = d.empreinte('', w);
      expect(e).not.toBe(d.empreinte(''));
      d.git('worktree', 'remove', '--force', w);
      inscrireEntree(d.repo, 'agent/demo-1', ['demo-1']);
      vert(d.passage());
      expect(present(d, e)).toBe(true);
    },
    LONG
  );
  it(
    'critère 23: a branch in the queue whose submodule commit cannot be found lets its entry go, and the passage is green',
    () => {
      const { d } = avecSousModule();
      vert(d.passage());
      const w = d.copie();
      sm(w, 'checkout', '-q', '-b', 'agent/demo-2');
      sm(w, 'submodule', 'update', '--init', '-q');
      const lib = path.join(w, 'vendor/lib');
      writeFileSync(path.join(lib, 'lib.txt'), 'S3, seulement dans cette copie\n');
      sm(lib, 'commit', '-q', '-am', 's3');
      sm(w, 'commit', '-q', '-am', 'sous-module à S3');
      vert(d.passage(w));
      const e = d.empreinte('', w);
      const s3 = sm(lib, 'rev-parse', 'HEAD');
      d.git('worktree', 'remove', '--force', w);
      expect(
        spawnSync('git', ['-C', path.join(d.repo, 'vendor/lib'), 'cat-file', '-e', s3]).status
      ).not.toBe(0);
      inscrireEntree(d.repo, 'agent/demo-2', ['demo-2']);
      vert(d.passage());
      expect(present(d, e)).toBe(false);
      expect(present(d, d.empreinte(''))).toBe(true);
    },
    LONG
  );
});
