// The trees judged by a final pass: the file `<git common dir>/grillhouse/arbres-juges.json`, beside
// the last green, keeps the tree each final pass of the circuit (or each verification of a lot of
// the direct way) judged green. The pre-push hook reads it (`commitEstJuge`) to let a commit go to
// main, as bors and the merge queues enter only a tree already judged.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { arbreEstJuge, commitEstJuge, garderLArbreJuge } from '../../scripts/arbres-juges.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'arbres-juges-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const git = (racine: string, ...a: string[]) =>
  execFileSync('git', ['-C', racine, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
    encoding: 'utf8',
  }).trim();

// A repository of two commits, the second adding b.txt.
function depot() {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  git(racine, 'init', '-q', '-b', 'main');
  writeFileSync(path.join(racine, 'a.txt'), 'a\n');
  git(racine, 'add', '-A');
  git(racine, 'commit', '-qm', 'un');
  const un = git(racine, 'rev-parse', 'HEAD');
  writeFileSync(path.join(racine, 'b.txt'), 'b\n');
  git(racine, 'add', '-A');
  git(racine, 'commit', '-qm', 'deux');
  const deux = git(racine, 'rev-parse', 'HEAD');
  return {
    racine,
    un,
    deux,
    arbreDeUn: git(racine, 'rev-parse', `${un}^{tree}`),
    arbreDeDeux: git(racine, 'rev-parse', `${deux}^{tree}`),
  };
}

describe('the trees a final pass judged green are kept beside the last green', () => {
  it('a tree kept is judged, another is not', () => {
    const d = depot();
    expect(arbreEstJuge(d.racine, d.arbreDeUn)).toBe(false);
    garderLArbreJuge(d.racine, d.arbreDeUn);
    expect(arbreEstJuge(d.racine, d.arbreDeUn)).toBe(true);
    expect(arbreEstJuge(d.racine, d.arbreDeDeux)).toBe(false);
  });

  it('lives in the git common directory, in grillhouse/arbres-juges.json', () => {
    const d = depot();
    garderLArbreJuge(d.racine, d.arbreDeUn);
    const commun = git(d.racine, 'rev-parse', '--path-format=absolute', '--git-common-dir');
    expect(existsSync(path.join(commun, 'grillhouse', 'arbres-juges.json'))).toBe(true);
  });

  it('keeps several trees, and keeping one again changes nothing', () => {
    const d = depot();
    garderLArbreJuge(d.racine, d.arbreDeUn);
    garderLArbreJuge(d.racine, d.arbreDeDeux);
    garderLArbreJuge(d.racine, d.arbreDeUn);
    expect(arbreEstJuge(d.racine, d.arbreDeUn)).toBe(true);
    expect(arbreEstJuge(d.racine, d.arbreDeDeux)).toBe(true);
  });

  it('is shared by the copies of the repository (worktrees), as the common directory is', () => {
    const d = depot();
    const copie = path.join(ESSAIS, 'copie-partagee');
    git(d.racine, 'worktree', 'add', '-q', '-b', 'agent/x-1', copie, 'HEAD');
    garderLArbreJuge(copie, d.arbreDeDeux);
    expect(arbreEstJuge(d.racine, d.arbreDeDeux)).toBe(true);
  });
});

describe('a commit is judged when its tree is', () => {
  it('the commit of a judged tree is judged, whatever the commit: an amended or replayed one too', () => {
    const d = depot();
    garderLArbreJuge(d.racine, d.arbreDeDeux);
    expect(commitEstJuge(d.racine, d.deux)).toBe(true);
    // The same tree under another commit (the message amended).
    git(d.racine, 'commit', '-q', '--amend', '-m', 'deux, repris');
    const autre = git(d.racine, 'rev-parse', 'HEAD');
    expect(autre).not.toBe(d.deux);
    expect(commitEstJuge(d.racine, autre)).toBe(true);
  });

  it('a commit whose tree no pass judged is not judged', () => {
    const d = depot();
    garderLArbreJuge(d.racine, d.arbreDeDeux);
    expect(commitEstJuge(d.racine, d.un)).toBe(false);
  });

  it('an unknown commit, or a path out of git, is not judged and never throws', () => {
    const d = depot();
    expect(commitEstJuge(d.racine, 'f'.repeat(40))).toBe(false);
    const dehors = mkdtempSync(path.join(ESSAIS, 'hors-de-git-'));
    expect(commitEstJuge(dehors, d.deux)).toBe(false);
    expect(() => garderLArbreJuge(dehors, d.arbreDeUn)).not.toThrow();
    expect(arbreEstJuge(dehors, d.arbreDeUn)).toBe(false);
  });
});
