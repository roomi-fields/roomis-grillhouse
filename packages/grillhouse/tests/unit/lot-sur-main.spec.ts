// The one rule that says a ticket's lot is on main (`lotSurMain` of
// scripts/integration/integrer.mjs), which the queue (scripts/integration/file.mjs) and the
// circuit's resumption (scripts/activites.mjs) import as they import `refusArbitrage`: the tip of
// the branch agent/<ticket> is an ancestor of main and names the ticket (a lot entered by
// fast-forward), or a commit of main names the ticket as the lot's commit message writes it (a lot
// the queue rebased or squashed). A fresh branch sitting at a commit of main carries no lot and is
// not taken for one (grillhouse-bf5.2.1). The commit it finds, or null.
//
// The history is a trial repository read by git; Beads is a stand-in in the process (the prefix).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { lire, lotSurMain } from '../../scripts/integration/integrer.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'lot-sur-main-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

type Reponse = { status: number; stdout: string; stderr: string };
// A stand-in for Beads: only the prefix `demo` is read.
const bd = (...a: string[]): Reponse =>
  a[0] === 'config'
    ? { status: 0, stdout: 'demo\n', stderr: '' }
    : { status: 0, stdout: '', stderr: '' };

function depot() {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', racine, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
      encoding: 'utf8',
    }).trim();
  git('init', '-q', '-b', 'main');
  const commit = (fichier: string, message: string) => {
    writeFileSync(path.join(racine, fichier), `${message}\n`);
    git('add', '-A');
    git('commit', '-q', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  commit('base.txt', 'base');
  const o = { racine, principale: 'main', bd };
  return { racine, git, commit, o };
}

describe('le lot d’un ticket est reconnu sur main par une seule fonction', () => {
  it('reconnaît la pointe de la branche du ticket, entrée par avance rapide, que main a dépassée', () => {
    const { git, commit, o } = depot();
    git('checkout', '-q', '-b', 'agent/demo-1');
    const pointe = commit('lot.txt', 'feat: le lot (demo-1)');
    git('checkout', '-q', 'main');
    git('merge', '-q', '--ff-only', 'agent/demo-1');
    commit('apres.txt', 'après');
    expect(lotSurMain(o, 'demo-1')).toBe(pointe);
  });

  // grillhouse-bf5.2.1: lancer.sh creates agent/<ticket> at main's HEAD; before the copy commits,
  // its tip is an ancestor of main, but it carries no lot and names no ticket, so it is not a lot.
  it('ne prend pas une branche neuve, créée sur main sans lot, pour un lot sur main', () => {
    const { git, commit, o } = depot();
    git('branch', 'agent/demo-9');
    expect(lotSurMain(o, 'demo-9')).toBeNull();
    // Even once main has moved on and the tip is a strict ancestor of main.
    commit('autre.txt', 'feat: autre chose (demo-2)');
    expect(git('merge-base', '--is-ancestor', 'agent/demo-9', 'main')).toBe('');
    expect(lotSurMain(o, 'demo-9')).toBeNull();
  });

  it('ne reconnaît pas une branche dont la pointe est devant main, son lot pas encore entré', () => {
    const { git, commit, o } = depot();
    git('checkout', '-q', '-b', 'agent/demo-1');
    commit('lot.txt', 'feat: le lot (demo-1)');
    git('checkout', '-q', 'main');
    commit('apres.txt', 'après');
    expect(lotSurMain(o, 'demo-1')).toBeNull();
  });

  it('reconnaît un lot rebasé ou fusionné en squash : un commit de main nomme le ticket', () => {
    const { git, commit, o } = depot();
    git('checkout', '-q', '-b', 'agent/demo-1');
    commit('lot.txt', 'feat: le lot (demo-1) brouillon');
    git('checkout', '-q', 'main');
    const squash = commit('squash.txt', 'feat(outil): le lot (demo-1)');
    expect(lotSurMain(o, 'demo-1')).toBe(squash);
  });

  it('reconnaît un lot dont la branche a disparu, par le commit de main', () => {
    const { commit, o } = depot();
    const entre = commit('lot.txt', 'fix(outil): un défaut (demo-7)');
    commit('apres.txt', 'après');
    expect(lotSurMain(o, 'demo-7')).toBe(entre);
  });

  it('ne confond pas un ticket avec un autre dont le nom le prolonge', () => {
    const { commit, o } = depot();
    commit('lot.txt', 'feat: un autre lot (demo-10)');
    commit('lot2.txt', 'feat: encore (demo-1.2)');
    expect(lotSurMain(o, 'demo-1')).toBeNull();
  });

  it('rend null quand ni la branche ni un commit de main ne portent le lot', () => {
    const { commit, o } = depot();
    commit('autre.txt', 'feat: autre chose (demo-2)');
    expect(lotSurMain(o, 'demo-1')).toBeNull();
  });
});

describe('the integrator reads a call without a lot as a call to judge, not as a usage error', () => {
  it('a ticket alone passes the reading: lotSurMain then judges it', () => {
    expect(lire(['--ticket', 'p-1'])).toMatchObject({ ticket: 'p-1', tests: null, code: null });
  });

  it('a lot still needs its message, and every call needs its ticket', () => {
    expect(lire(['--ticket', 'p-1', '--code', 'c.patch'])).toEqual({ faute: null });
    expect(lire(['--message', 'm.txt'])).toEqual({ faute: null });
    expect(lire(['--ticket', 'p-1', '--code', 'c.patch', '--message', 'm.txt'])).toMatchObject({
      code: 'c.patch',
      message: 'm.txt',
    });
  });
});
