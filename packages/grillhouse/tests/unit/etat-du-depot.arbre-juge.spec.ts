// The tree a verification judges (scripts/etat-du-depot.mjs, `etatDuDepot`): the tree of the
// working tree, except `.beads/interactions.jsonl`, which every bd command writes and which takes
// its version of the commit (removed when the commit does not hold it). A verification green in a
// folder that differs from its commit by this file alone judges the tree of the commit, so the
// push of the commit is not refused. Any other difference keeps the rule: the tree of the folder.
// Each case plays the real git in a repository of trial.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { garderLeVert, mesure } from '../../scripts/dernier-vert.mjs';
import { etatDuDepot } from '../../scripts/etat-du-depot.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'etat-du-depot-juge-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const JOURNAL = '.beads/interactions.jsonl';

const git = (dossier: string, ...args: string[]) => {
  const r = spawnSync('git', ['-C', dossier, ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    throw new Error(`git ${args.join(' ')} : ${r.stderr}`);
  }
  return r.stdout.trim();
};

const ecrire = (r: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(r, f)), { recursive: true });
  writeFileSync(path.join(r, f), texte);
};

// A repository of trial; its commit holds the journal when <avecJournal>.
function depot(avecJournal: boolean) {
  const r = mkdtempSync(path.join(ESSAIS, 'depot-'));
  git(r, 'init', '-q', '-b', 'main');
  git(r, 'config', 'user.email', 'essai@example.com');
  git(r, 'config', 'user.name', 'essai');
  ecrire(r, 'a.txt', 'a\n');
  if (avecJournal) {
    ecrire(r, JOURNAL, 'v1\n');
  }
  git(r, 'add', '-A');
  git(r, 'commit', '-q', '-m', 'premier');
  return r;
}

const arbreJuge = (r: string) => (etatDuDepot(r) as { arbre: string }).arbre;
const arbreDuCommit = (r: string) => git(r, 'rev-parse', 'HEAD^{tree}');

type Mesure = { etat: unknown; env: Record<string, string>; retirer: () => void };
type Changements = { fichiers: string[]; supprimes: string[] };

// The files a pass in <r> measures as changed (nothing when it plays complete).
function changes(r: string, options: Record<string, unknown> = {}) {
  const m = mesure(r, options) as Mesure;
  const f = m.env.GRILLHOUSE_CHANGEMENTS;
  const ch = f ? (JSON.parse(readFileSync(f, 'utf8')) as Changements) : null;
  m.retirer();
  return ch ? [...ch.fichiers, ...ch.supprimes] : null;
}

describe('the tree a verification judges', () => {
  it('is the tree of the commit when the journal of interactions, committed, is modified', () => {
    const r = depot(true);
    ecrire(r, JOURNAL, 'v2 écrit par bd\n');
    expect(arbreJuge(r)).toBe(arbreDuCommit(r));
  });

  it('is the tree of the commit when the journal of interactions is untracked and the commit lacks it', () => {
    const r = depot(false);
    ecrire(r, JOURNAL, 'écrit par bd\n');
    expect(arbreJuge(r)).toBe(arbreDuCommit(r));
  });

  it('is the tree of the commit when the journal of interactions, committed, is removed', () => {
    const r = depot(true);
    rmSync(path.join(r, JOURNAL));
    expect(arbreJuge(r)).toBe(arbreDuCommit(r));
  });

  it('is the tree of the folder when a file of code differs, the journal keeping its version of the commit', () => {
    const r = depot(true);
    ecrire(r, 'a.txt', 'a changé\n');
    ecrire(r, JOURNAL, 'v2 écrit par bd\n');
    const arbre = arbreJuge(r);
    expect(arbre).not.toBe(arbreDuCommit(r));
    expect(git(r, 'show', `${arbre}:a.txt`)).toBe('a changé');
    expect(git(r, 'show', `${arbre}:${JOURNAL}`)).toBe('v1');
  });

  it('is the tree of the folder when a file of configuration is added', () => {
    const r = depot(true);
    ecrire(r, 'config.json', '{}\n');
    expect(arbreJuge(r)).not.toBe(arbreDuCommit(r));
  });

  it('is the tree of the folder when a report of another name differs', () => {
    const r = depot(true);
    ecrire(r, '.rapport-autre.json', '{}\n');
    expect(arbreJuge(r)).not.toBe(arbreDuCommit(r));
  });
});

describe('the last green keeps the tree judged', () => {
  it('sees the journal of interactions changed neither against the green nor against the commit', () => {
    const r = depot(true);
    ecrire(r, JOURNAL, 'v2\n');
    const vert = mesure(r) as Mesure;
    vert.retirer();
    garderLeVert(vert.etat);
    ecrire(r, JOURNAL, 'v3, une autre commande bd\n');

    expect(changes(r)).toEqual([]);
    expect(changes(r, { base: git(r, 'rev-parse', 'HEAD') })).toEqual([]);
  });
});
