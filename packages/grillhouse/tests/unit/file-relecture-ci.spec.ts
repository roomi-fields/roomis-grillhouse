import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { INTEGRE, relireCI } from '../../scripts/integration/file.mjs';
import { argumentsDeLaFile } from '../../scripts/circuit.mjs';

// grillhouse-906 (OSC Bridge OB-20q.3, 0.25.5, 2026-10-31): 24fc218 entered main and was pushed;
// its CI was red on macOS on a flaky test (run 41181823725) and the queue reopened the ticket. The
// supervisor reran the failed jobs (`gh run rerun 41181823725 --failed`), green, and answered
// `--reprendre`: the queue had nothing in it and the circuit stopped again at « 5.2 File »,
// « aucun commentaire de la file ». As a merge queue judges the last attempt of a commit's checks,
// the queue reads again the CI of the ticket's commit on main (`relireCI`, the queue's own reading
// of the CI, `gh run view` giving the current attempt of the run): green, it closes the ticket as
// an entry does; red, the ticket stays open on the red named.
//
// The history is a trial repository read by git; Beads and the GitHub CLI are stand-ins in the
// process, with the answers of the queue's fake gh of the night tests
// (packages/grillhouse-essais/tests/integration-essai.ts: `{ runs, vues, url, log }`).

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'file-relecture-ci-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

type Commentaire = { author: string; text: string };
type Ticket = { id: string; status: string; close_reason?: string; comments: Commentaire[] };
type Reponse = { status: number; stdout: string; stderr: string };
type Scenario = {
  runs?: object[];
  vues?: object[];
  url?: string;
  log?: string;
};

const repondre = (stdout = '', status = 0): Reponse => ({ status, stdout, stderr: '' });

// A stand-in for Beads over the tickets <etat>, each call kept in `appels`: show, comments (add),
// close (--reason), reopen and `config get issue_prefix` (demo).
function beads(etat: Record<string, Ticket>) {
  const appels: string[][] = [];
  const bd = (...a: string[]): Reponse => {
    appels.push(a);
    const id: string = a[1] === 'add' ? a[2] : a[1];
    const t: Ticket = etat[id];
    if (a[0] === 'config') {
      return repondre('demo\n');
    }
    if (a[0] === 'show') {
      return repondre(JSON.stringify([t]));
    }
    if (a[0] === 'comments' && a[1] === 'add') {
      t.comments.push({ author: 'file', text: a[3] });
      return repondre();
    }
    if (a[0] === 'comments') {
      return repondre(JSON.stringify(t.comments));
    }
    if (a[0] === 'close') {
      t.status = 'closed';
      t.close_reason = a[a.indexOf('--reason') + 1];
      return repondre();
    }
    if (a[0] === 'reopen') {
      t.status = 'open';
      return repondre();
    }
    return repondre();
  };
  return { bd, appels };
}

// A stand-in for the GitHub CLI answering the scenario <s> as the queue's fake gh of the night
// tests does: the runs `gh run list` gives, the successive views of `gh run view <id> --json
// status,conclusion,jobs` (the last one repeated), the address and the failed log.
function github(s: Scenario) {
  const appels: string[] = [];
  const gh = (args: string[]): Reponse => {
    appels.push(args.join(' '));
    if (args[0] === 'run' && args[1] === 'list') {
      return repondre(JSON.stringify(s.runs ?? []));
    }
    if (args[1] === 'view' && args.includes('status,conclusion,jobs')) {
      const n = appels.filter(l => l.includes('status,conclusion,jobs')).length;
      const vues = s.vues ?? [];
      return repondre(JSON.stringify(vues[Math.min(n, vues.length) - 1] ?? {}));
    }
    if (args[1] === 'view' && args.includes('--log-failed')) {
      return repondre(s.log ?? '');
    }
    if (args[1] === 'view') {
      return repondre(`${s.url ?? ''}\n`);
    }
    return repondre('', 1);
  };
  return { gh, appels };
}

// A view of a run completed with <conclusion>, its one job of two steps done.
const fini = (conclusion: string) => ({
  status: 'completed',
  conclusion,
  jobs: [{ status: 'completed', steps: [{ status: 'completed' }, { status: 'completed' }] }],
});

// A repository whose main holds a CI that runs on every push and the commit <sujet>.
function depot(sujet = 'fix: lot (demo-1)') {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', racine, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
      encoding: 'utf8',
    }).trim();
  git('init', '-q', '-b', 'main');
  writeFileSync(path.join(racine, 'package.json'), '{}\n');
  mkdirSync(path.join(racine, '.github', 'workflows'), { recursive: true });
  writeFileSync(path.join(racine, '.github', 'workflows', 'ci.yml'), 'on: push\n');
  git('add', '-A');
  git('commit', '-qm', 'ci');
  writeFileSync(path.join(racine, 'lot.txt'), 'lot\n');
  git('add', '-A');
  git('commit', '-qm', sujet);
  return {
    racine,
    git,
    court: git('rev-parse', '--short=7', 'HEAD'),
    sha: git('rev-parse', 'HEAD'),
  };
}

// The ticket demo-1 the queue reopened on a red CI.
const rouvert = (): Record<string, Ticket> => ({
  'demo-1': {
    id: 'demo-1',
    status: 'open',
    comments: [{ author: 'file', text: '## CI rouge\n\nLa CI de 24fc218 sur main est rouge.' }],
  },
});

// The queue reads again the CI of demo-1 in <d>, Beads holding <etat>, GitHub answering <s>.
function relire(d: ReturnType<typeof depot>, etat: Record<string, Ticket>, s: Scenario) {
  const b = beads(etat);
  const g = github(s);
  const dites: string[] = [];
  const code = relireCI({
    racine: d.racine,
    principale: 'main',
    ticket: 'demo-1',
    bd: b.bd,
    gh: g.gh,
    dire: (l: string) => dites.push(l),
    avancement: null,
  });
  return { code, ticket: etat['demo-1'], bd: b.appels, gh: g.appels, dites };
}

describe('grillhouse-906 — at the resumption, the queue reads again the CI of the commit on main', () => {
  it('critère 1: the last attempt green, the ticket closes as an entry does, its run as its piece', () => {
    const d = depot();
    const r = relire(d, rouvert(), {
      runs: [{ databaseId: 41181823725, status: 'completed', conclusion: 'success' }],
      vues: [fini('success')],
    });
    expect(r.code).toBe(0);
    // The run of the commit on main, then its view, which gh gives at its current attempt.
    expect(r.gh).toEqual([
      `run list --commit ${d.sha} --json databaseId,status,conclusion`,
      'run view 41181823725 --json status,conclusion,jobs',
    ]);
    expect(r.ticket.status).toBe('closed');
    expect(r.ticket.close_reason).toBe(`${INTEGRE}${d.court}`);
    const mot = r.ticket.comments.at(-1)!.text;
    expect(mot).toContain('CI relue');
    expect(mot).toContain(d.court);
    expect(mot).toContain('41181823725');
    expect(r.dites.join('\n')).toContain(`CI de ${d.court} verte (passage 41181823725)`);
  });

  it('critère 2: still red, the ticket stays open on the red named, the run and its failed log', () => {
    const d = depot();
    const r = relire(d, rouvert(), {
      runs: [{ databaseId: 42, status: 'completed', conclusion: 'failure' }],
      vues: [fini('failure')],
      url: 'https://github.com/demo/demo/actions/runs/42',
      log: 'test\tmacos\t✗ osc_transport_full_roundtrip',
    });
    expect(r.code).toBe(0);
    expect(r.ticket.status).toBe('open');
    expect(r.bd.some(a => a[0] === 'close' || a[0] === 'reopen')).toBe(false);
    const mot = r.ticket.comments.at(-1)!.text;
    expect(mot).toContain('CI rouge');
    expect(mot).toContain('https://github.com/demo/demo/actions/runs/42');
    expect(mot).toContain('osc_transport_full_roundtrip');
    expect(r.gh).toContain('run view 42 --log-failed');
  });

  it('critère 3: a red CI has no path of its own for a flaky test: its comment gives the rule of the charter', () => {
    const d = depot();
    const r = relire(d, rouvert(), {
      runs: [{ databaseId: 42, status: 'completed', conclusion: 'failure' }],
      vues: [fini('failure')],
    });
    const mot = r.ticket.comments.at(-1)!.text;
    expect(mot).toContain('quarantaine');
    expect(mot).toContain('gh run rerun 42 --failed');
  });

  it('no commit of main delivers the ticket: the CI is not read again, the ticket stays open, and says why', () => {
    const d = depot('fix: autre (demo-2)');
    const r = relire(d, rouvert(), { runs: [{ databaseId: 41 }], vues: [fini('success')] });
    expect(r.code).toBe(0);
    expect(r.gh).toEqual([]);
    expect(r.ticket.status).toBe('open');
    const mot = r.ticket.comments.at(-1)!.text;
    expect(mot).toContain('CI non relue');
    expect(mot).toContain('demo-1');
  });

  it("the ticket's branch still ahead of main: its lot is not on main, the CI of an earlier delivery is not read", () => {
    const d = depot();
    d.git('checkout', '-qb', 'agent/demo-1');
    writeFileSync(path.join(d.racine, 'correction.txt'), 'c\n');
    d.git('add', '-A');
    d.git('commit', '-qm', 'fix: correction (demo-1)');
    d.git('checkout', '-q', 'main');
    const r = relire(d, rouvert(), { runs: [{ databaseId: 41 }], vues: [fini('success')] });
    expect(r.gh).toEqual([]);
    expect(r.ticket.status).toBe('open');
    const mot = r.ticket.comments.at(-1)!.text;
    expect(mot).toContain('CI non relue');
    expect(mot).toContain('agent/demo-1');
  });
});

describe('grillhouse-906 — the circuit at 5.2 runs the queue, or its reading of the CI', () => {
  it('the branch in the queue, or the ticket closed: the queue as it is', () => {
    expect(argumentsDeLaFile({ ticket: 'demo-1', enFile: true, statut: 'in_progress' })).toEqual(
      []
    );
    expect(argumentsDeLaFile({ ticket: 'demo-1', enFile: false, statut: 'closed' })).toEqual([]);
  });
  it('out of the queue and open (a red CI reopened it): the reading of its CI again', () => {
    expect(argumentsDeLaFile({ ticket: 'demo-1', enFile: false, statut: 'open' })).toEqual([
      '--ci',
      'demo-1',
    ]);
  });
});
