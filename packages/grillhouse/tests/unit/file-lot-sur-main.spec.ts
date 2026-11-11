// grillhouse-4nr.8, criterion 2: the acts of the queue that the workflow of the queue of a project
// plays (scripts/integration/file.mjs, `preparerLaBranche` and `fermerLEntree`), each played again
// by an attempt after the death of its worker. A lot already on main (a commit of main delivers its
// ticket, the branch left behind at its tip before the replay) is entered, not set aside: main
// does not move again, and the ticket is not told that its branch has nothing ahead, its branch
// gone included. The closure played again on a ticket already closed writes nothing twice and
// never reopens it.
//
// The history is a trial repository read by git; Beads is a stand-in in the process.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { INTEGRE, fermerLEntree, preparerLaBranche } from '../../scripts/integration/file.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'file-lot-sur-main-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

type Ticket = { id: string; status: string; close_reason?: string; labels: string[] };
type Reponse = { status: number; stdout: string; stderr: string };
const repondre = (stdout = '', status = 0): Reponse => ({ status, stdout, stderr: '' });

// A stand-in for Beads over the ticket <t>, each call kept in `appels`.
function beads(t: Ticket) {
  const appels: string[][] = [];
  const bd = (...a: string[]): Reponse => {
    appels.push(a);
    if (a[0] === 'config') {
      return repondre('demo\n');
    }
    if (a[0] === 'show') {
      return repondre(JSON.stringify([t]));
    }
    if (a[0] === 'close') {
      t.status = 'closed';
      t.close_reason = a[a.indexOf('--reason') + 1];
    }
    if (a[0] === 'reopen') {
      t.status = 'open';
    }
    return repondre();
  };
  return { bd, appels };
}

// A repository whose main holds the lot of demo-1 replaced on it (its commit names the ticket),
// and the branch agent/demo-1 left at its tip before the replay, ahead of main.
function depot() {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', racine, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
      encoding: 'utf8',
    }).trim();
  git('init', '-q', '-b', 'main');
  writeFileSync(path.join(racine, 'package.json'), '{}\n');
  git('add', '-A');
  git('commit', '-qm', 'base');
  git('branch', 'agent/demo-1');
  writeFileSync(path.join(racine, 'autre.txt'), 'autre\n');
  git('add', '-A');
  git('commit', '-qm', 'feat: autre (demo-2)');
  git('checkout', '-q', 'agent/demo-1');
  writeFileSync(path.join(racine, 'lot.txt'), 'lot\n');
  git('add', '-A');
  git('commit', '-qm', 'feat: lot (demo-1)', '--date', '2026-11-04T10:00:00Z');
  git('checkout', '-q', 'main');
  // The replay of the branch on main, as the queue's rebase writes it: its author and its date kept.
  git('cherry-pick', 'agent/demo-1');
  const surMain = git('rev-parse', 'HEAD');
  return { racine, git, surMain };
}

const outils = (racine: string, t: Ticket) => {
  const b = beads(t);
  const dites: string[] = [];
  return {
    o: { racine, principale: 'main', bd: b.bd, dire: (l: string) => dites.push(l) },
    appels: b.appels,
    dites,
  };
};

describe('un lot déjà sur main est entré, sans rouvrir son ticket', () => {
  it('the branch prepared again after main moved onto its lot: the lot is entered, main does not move', () => {
    const d = depot();
    const t: Ticket = { id: 'demo-1', status: 'open', labels: ['en-file'] };
    const { o, appels } = outils(d.racine, t);
    const r = preparerLaBranche(o, { ticket: 'demo-1', branche: 'agent/demo-1' });
    expect(r).toEqual({ entre: { commit: d.surMain } });
    expect(d.git('rev-parse', 'main')).toBe(d.surMain);
    expect(
      appels.filter(a => a[0] === 'comments' || a[0] === 'reopen' || a[0] === 'update')
    ).toEqual([]);
  });

  it('a branch with nothing ahead and no commit of main delivering its ticket is set aside', () => {
    const d = depot();
    d.git('branch', '-f', 'agent/demo-3', 'main');
    const t: Ticket = { id: 'demo-3', status: 'open', labels: ['en-file'] };
    const { o } = outils(d.racine, t);
    const r = preparerLaBranche(o, { ticket: 'demo-3', branche: 'agent/demo-3' });
    expect(r).toHaveProperty('ecartee');
  });

  it('a ticket reopened, its lot of before on main, its branch back without anything ahead: set aside', () => {
    const d = depot();
    // The lot of before entered; the ticket reopened, its branch reset on main.
    d.git('branch', '-f', 'agent/demo-1', 'main~1');
    const t: Ticket = { id: 'demo-1', status: 'open', labels: ['en-file'] };
    const { o } = outils(d.racine, t);
    expect(preparerLaBranche(o, { ticket: 'demo-1', branche: 'agent/demo-1' })).toEqual({
      ecartee: true,
    });
  });

  it('main moved by fast-forward onto the branch, then the worker died: the lot is entered', () => {
    const d = depot();
    d.git('branch', '-f', 'agent/demo-1', 'main');
    const t: Ticket = { id: 'demo-1', status: 'open', labels: ['en-file'] };
    const { o } = outils(d.racine, t);
    expect(preparerLaBranche(o, { ticket: 'demo-1', branche: 'agent/demo-1' })).toEqual({
      entre: { commit: d.surMain },
    });
  });

  it('fermerLEntree played twice closes the ticket once and never reopens it', () => {
    const d = depot();
    const t: Ticket = { id: 'demo-1', status: 'open', labels: ['en-file'] };
    const { o, appels } = outils(d.racine, t);
    const entree = { ticket: 'demo-1', branche: 'agent/demo-1', commit: d.surMain };
    fermerLEntree(o, entree);
    fermerLEntree(o, entree);
    expect(t.status).toBe('closed');
    expect(t.close_reason).toBe(`${INTEGRE}${d.surMain.slice(0, 7)}`);
    expect(appels.filter(a => a[0] === 'close')).toHaveLength(1);
    expect(appels.filter(a => a[0] === 'reopen')).toEqual([]);
  });
});

describe('un lot sur main dont la branche est partie', () => {
  it('a lot on main whose branch is gone, its ticket open, is entered', () => {
    const d = depot();
    d.git('branch', '-D', 'agent/demo-1');
    const t: Ticket = { id: 'demo-1', status: 'open', labels: ['en-file'] };
    const { o } = outils(d.racine, t);
    expect(preparerLaBranche(o, { ticket: 'demo-1', branche: 'agent/demo-1' })).toEqual({
      entre: { commit: d.surMain },
    });
  });
});
