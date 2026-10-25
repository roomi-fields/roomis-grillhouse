// The last green is kept per branch (scripts/dernier-vert.mjs): a pass in a ticket's copy measures
// itself against the last green of the copy's branch, or, without one, against main's, as
// `vitest --changed <ref>` and Bazel measure against the last green build of the same branch.
// Witness: BPScript 320.4 (n° 15), the final passes of a copy measured against main's last green
// (28 to 296 files changed): 46 packages played since 000-forms changed; 11 passes, 94 min.
//
// Each case plays the real git in a repository of trial: main (the main tree, three files) and
// the copies (worktrees) of tickets on branches `agent/<ticket>`.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { garderLeVert, mesure } from '../../scripts/dernier-vert.mjs';
import { restreindre } from '../../scripts/vitest-config/changements.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'dernier-vert-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const git = (dossier: string, ...args: string[]) => {
  const r = spawnSync('git', ['-C', dossier, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
  }
  return r.stdout.trim();
};

// The repository of trial, committed on main: a.txt, b.txt, c.txt.
function depot() {
  const r = mkdtempSync(path.join(ESSAIS, 'depot-'));
  git(r, 'init', '-q', '-b', 'main');
  git(r, 'config', 'user.email', 'essai@example.com');
  git(r, 'config', 'user.name', 'essai');
  for (const f of ['a.txt', 'b.txt', 'c.txt']) {
    writeFileSync(path.join(r, f), `${f}\n`);
  }
  git(r, 'add', '-A');
  git(r, 'commit', '-q', '-m', 'essai');
  return r;
}

// A copy of <racine> on the new branch <branche> (null: HEAD detached).
function copie(racine: string, branche: string | null) {
  const c = path.join(mkdtempSync(path.join(ESSAIS, 'copie-')), 'copie');
  if (branche) {
    git(racine, 'worktree', 'add', '-q', '-b', branche, c);
  } else {
    git(racine, 'worktree', 'add', '-q', '--detach', c);
  }
  return c;
}

// What a pass in <dossier> measures itself against: the line it writes and the files changed
// since its last green (null for a complete pass).
function mesurer(dossier: string) {
  const m = mesure(dossier) as { ligne: string; env: Record<string, string>; retirer: () => void };
  const f = m.env.GRILLHOUSE_CHANGEMENTS;
  const changes = f
    ? (JSON.parse(readFileSync(f, 'utf8')) as { fichiers: string[]; supprimes: string[] })
    : null;
  m.retirer();
  return {
    ligne: m.ligne,
    fichiers: changes ? [...changes.fichiers, ...changes.supprimes].sort() : null,
  };
}

// A pass green in <dossier>: its state kept as the last green.
const vert = (dossier: string) => garderLeVert(mesure(dossier).etat);

const modifier = (dossier: string, f: string) =>
  writeFileSync(path.join(dossier, f), `${f} changé ${Math.random()}\n`);

describe('the last green per branch', () => {
  it("a copy without a green of its own measures against main's", () => {
    const r = depot();
    vert(r);
    const c = copie(r, 'agent/t');
    modifier(c, 'a.txt');
    const m = mesurer(c);
    expect(m.fichiers).toEqual(['a.txt']);
    expect(m.ligne).toMatch(/depuis le dernier vert de main /);
  });

  it("after a green of the copy, its next pass measures against the copy's green alone", () => {
    const r = depot();
    vert(r);
    const c = copie(r, 'agent/t');
    modifier(c, 'a.txt');
    modifier(c, 'b.txt');
    vert(c);
    modifier(c, 'c.txt');
    const m = mesurer(c);
    expect(m.fichiers).toEqual(['c.txt']);
    expect(m.ligne).toMatch(/depuis le dernier vert de agent\/t /);
  });

  it("a green of the copy leaves main's green as it was", () => {
    const r = depot();
    vert(r);
    const c = copie(r, 'agent/t');
    modifier(c, 'a.txt');
    vert(c);
    expect(mesurer(r).fichiers).toEqual([]);
  });

  it("a green of another copy leaves the copy's green as it was", () => {
    const r = depot();
    vert(r);
    const t = copie(r, 'agent/t');
    modifier(t, 'a.txt');
    vert(t);
    const u = copie(r, 'agent/u');
    modifier(u, 'b.txt');
    vert(u);
    modifier(t, 'c.txt');
    expect(mesurer(t).fichiers).toEqual(['c.txt']);
  });

  it('a copy without a green, main having none, plays the complete pass', () => {
    const r = depot();
    const c = copie(r, 'agent/t');
    expect(mesurer(c).fichiers).toBeNull();
  });

  it("a detached copy (the queue's replay) measures against main's green and keeps main's", () => {
    const r = depot();
    vert(r);
    const d = copie(r, null);
    modifier(d, 'a.txt');
    expect(mesurer(d).fichiers).toEqual(['a.txt']);
    vert(d);
    expect(mesurer(r).fichiers).toEqual(['a.txt']);
    const c = copie(r, 'agent/t');
    expect(mesurer(c).fichiers).toEqual(['a.txt']);
  });
});

// grillhouse-3uv.93: the file of the changes of a pass lies in the base of that pass, which a
// killed pass leaves to the next one to sweep, never straight in the machine's temp directory.
describe('grillhouse-3uv.93 — the file of the changes lies in the directory the pass names', () => {
  it('critère 9: in <dans>, the base of the pass, and removed by its function', () => {
    const r = depot();
    vert(r);
    writeFileSync(path.join(r, 'a.txt'), 'changé\n');
    const dans = mkdtempSync(path.join(ESSAIS, 'base-'));
    const m = mesure(r, { dans }) as { env: Record<string, string>; retirer: () => void };
    const f = m.env.GRILLHOUSE_CHANGEMENTS ?? '';
    expect(path.dirname(path.dirname(f))).toBe(dans);
    m.retirer();
    expect(readdirSync(dans)).toEqual([]);
  });
});

// grillhouse-5m1.4: main's last green on BPScript held 54 `.rapport-suite.json` that git does not
// track (an old name of report), absent from every new copy; each package of a copy saw « un
// fichier supprimé » and played whole, 264 times in the log of 320.3.2.1. As Nx affected and
// Turborepo's `--filter=[ref]` measure against a commit, a file the green's commit does not track
// is removed only from the working tree that kept it.
describe('grillhouse-5m1.4 — a file git does not track is not removed from a new copy', () => {
  type Changements = { racine: string; fichiers: string[]; supprimes: string[] };
  // What a pass in <dossier> measures: its changes.
  function changements(dossier: string): Changements {
    const m = mesure(dossier) as { env: Record<string, string>; retirer: () => void };
    const c = JSON.parse(readFileSync(m.env.GRILLHOUSE_CHANGEMENTS ?? '', 'utf8')) as Changements;
    m.retirer();
    return c;
  }
  // The line the package at the top of <ch>'s repository writes under the changes <ch>.
  function ligneDuPaquet(ch: Changements) {
    const lignes: string[] = [];
    restreindre({}, ch.racine, ch, [], (l: string) => lignes.push(l));
    return lignes.join('\n');
  }
  // The repository of trial, with a file git does not track kept in main's green.
  function depotAvecRapport() {
    const r = depot();
    writeFileSync(path.join(r, '.rapport-suite.json'), '{}\n');
    vert(r);
    return r;
  }

  it("critère 1: an untracked file of main's green, absent from a new copy, is not removed", () => {
    const c = copie(depotAvecRapport(), 'agent/t');
    writeFileSync(path.join(c, 'module.mjs'), 'export {};\n');
    const ch = changements(c);
    expect(ch.supprimes).toEqual([]);
    expect(ch.fichiers).toEqual(['module.mjs']);
    expect(ligneDuPaquet(ch)).toMatch(/les tests que Vitest relie aux 1 fichier\(s\) changé\(s\)/);
  });

  it("critère 1: so for the queue's detached replay, which reads main's green", () => {
    const d = copie(depotAvecRapport(), null);
    modifier(d, 'a.txt');
    expect(changements(d).supprimes).toEqual([]);
  });

  it('critère 2: a tracked file removed in the copy keeps the whole replay of the package', () => {
    const c = copie(depotAvecRapport(), 'agent/t');
    rmSync(path.join(c, 'b.txt'));
    const ch = changements(c);
    expect(ch.supprimes).toEqual(['b.txt']);
    expect(ligneDuPaquet(ch)).toMatch(/tous ses tests, un fichier supprimé.*\(b\.txt\)/);
  });

  it('an untracked file the copy created, kept in its own green, is removed when it goes', () => {
    const r = depot();
    vert(r);
    const c = copie(r, 'agent/t');
    writeFileSync(path.join(c, 'nouveau.ts'), 'export {};\n');
    vert(c);
    rmSync(path.join(c, 'nouveau.ts'));
    expect(changements(c).supprimes).toEqual(['nouveau.ts']);
  });
});
