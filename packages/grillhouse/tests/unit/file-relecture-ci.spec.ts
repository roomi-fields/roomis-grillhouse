import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { avancementDeLaCI, avancementDuTravail } from '../../scripts/avancement.mjs';
import {
  INTEGRE,
  conclureLaCI,
  fermerLEntree,
  lireUneFoisLaCI,
  situerLeLot,
} from '../../scripts/integration/file.mjs';

// grillhouse-906 (OSC Bridge OB-20q.3, 0.25.5, 2026-10-31): 24fc218 entered main and was pushed;
// its CI was red on macOS on a flaky test (run 41181823725) and the queue reopened the ticket. The
// supervisor reran the failed jobs (`gh run rerun 41181823725 --failed`), green, and answered
// `--reprendre`: the queue had nothing in it and the circuit stopped again at « 5.2 File »,
// « aucun commentaire de la file ». As a merge queue judges the last attempt of a commit's checks,
// the circuit at its resumption reads again the CI of the ticket's commit on main, by the gestures
// of the queue its workflow plays (`laFile` of src/temporal/circuit/deroule.ts): where the lot
// stands (`situerLeLot`), a reading of its CI (`lireUneFoisLaCI`, `gh run view` giving the
// current attempt of the run), then its conclusion read again (`conclureLaCI`): green, it closes
// the ticket as an entry does; red, the ticket stays open on the red named. A lot not on main
// (none of its commits there, or its branch ahead) is not read again: it enters the queue.
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
  // origin holds main, as the queue pushed it.
  const distant = mkdtempSync(path.join(ESSAIS, 'origin-'));
  execFileSync('git', ['init', '-q', '--bare', distant]);
  git('remote', 'add', 'origin', distant);
  git('push', '-q', 'origin', 'main');
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

// The circuit reads again the CI of demo-1 in <d> at its resumption, Beads holding <etat>, GitHub
// answering <s>: where its lot stands, then, on main, one reading of its CI (a run completed) and
// its conclusion read again.
function relire(d: ReturnType<typeof depot>, etat: Record<string, Ticket>, s: Scenario) {
  const b = beads(etat);
  const g = github(s);
  const dites: string[] = [];
  const o = {
    racine: d.racine,
    principale: 'main',
    bd: b.bd,
    gh: g.gh,
    dire: (l: string) => dites.push(l),
    avancement: null,
  };
  const lot = situerLeLot(o, 'demo-1') as {
    aEntrer: boolean;
    commit: string | null;
    branche: string | null;
  };
  if (lot.aEntrer || !lot.commit || !lot.branche) {
    return { lot, issue: null, ticket: etat['demo-1'], bd: b.appels, gh: g.appels, dites };
  }
  const l = lireUneFoisLaCI(o, { sha: lot.commit, branche: lot.branche }) as {
    conclusion?: string;
    passage: number | null;
  };
  const issue = conclureLaCI(o, {
    ticket: 'demo-1',
    sha: lot.commit,
    branche: lot.branche,
    verdict: l.conclusion === 'success' ? 'verte' : 'rouge',
    passage: l.passage,
    relue: true,
  });
  return { lot, issue, ticket: etat['demo-1'], bd: b.appels, gh: g.appels, dites };
}

describe('grillhouse-906 — at the resumption, the queue reads again the CI of the commit on main', () => {
  it('critère 1: the last attempt green, the ticket closes as an entry does, its run as its piece', () => {
    const d = depot();
    const r = relire(d, rouvert(), {
      runs: [{ databaseId: 41181823725, status: 'completed', conclusion: 'success' }],
      vues: [fini('success')],
    });
    // The run of the commit on main, then its view, which gh gives at its current attempt.
    expect(r.gh).toEqual([
      `run list --commit ${d.sha} --json databaseId,status,conclusion`,
      'run view 41181823725 --json status,conclusion,jobs',
    ]);
    expect(r.ticket.status).toBe('closed');
    expect(r.ticket.close_reason).toBe(`${INTEGRE}${d.court}`);
    expect(r.issue).toEqual({ etat: 'ferme', raison: `${INTEGRE}${d.court}` });
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
    expect(r.ticket.status).toBe('open');
    expect(r.issue?.etat).toBe('rouvert');
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

  it('no commit of main delivers the ticket: the CI is not read again, the ticket stays open', () => {
    const d = depot('fix: autre (demo-2)');
    const r = relire(d, rouvert(), { runs: [{ databaseId: 41 }], vues: [fini('success')] });
    expect(r.lot.commit).toBeNull();
    expect(r.gh).toEqual([]);
    expect(r.ticket.status).toBe('open');
  });

  it("the ticket's branch still ahead of main: its lot enters the queue, the CI of an earlier delivery is not read", () => {
    const d = depot();
    d.git('checkout', '-qb', 'agent/demo-1');
    writeFileSync(path.join(d.racine, 'correction.txt'), 'c\n');
    d.git('add', '-A');
    d.git('commit', '-qm', 'fix: correction (demo-1)');
    d.git('checkout', '-q', 'main');
    const r = relire(d, rouvert(), { runs: [{ databaseId: 41 }], vues: [fini('success')] });
    expect(r.lot.aEntrer).toBe(true);
    expect(r.gh).toEqual([]);
    expect(r.ticket.status).toBe('open');
  });
});

// The readings of the CI of a ticket's commit, each an act of its own, write the steps of its run
// done over planned in the working directory of the ticket, where the board reads them while the
// circuit waits (scripts/avancement.mjs `avancementDeLaCI`, `avancementDuTravail`).
describe('the progress of the CI goes to the working directory of the ticket', () => {
  const etape = (status: string) => ({ status });
  const enCours = {
    status: 'in_progress',
    conclusion: '',
    jobs: [
      { status: 'completed', steps: [etape('completed'), etape('completed')] },
      { status: 'in_progress', steps: [etape('completed'), etape('in_progress'), etape('queued')] },
    ],
  };
  const finie = {
    status: 'completed',
    conclusion: 'success',
    jobs: enCours.jobs.map(j => ({
      status: 'completed',
      steps: j.steps.map(() => etape('completed')),
    })),
  };

  it('each reading writes in one directory of the working directory, which the board reads', () => {
    const d = depot();
    const travail = path.join(d.racine, '.claude', 'worktrees', 'demo-1.travail');
    mkdirSync(travail, { recursive: true });
    const g = github({ vues: [enCours, finie] });
    // Each reading is a process of its own: it opens the directory again.
    const lire = () =>
      lireUneFoisLaCI(
        {
          racine: d.racine,
          principale: 'main',
          bd: beads(rouvert()).bd,
          gh: g.gh,
          dire: () => {},
          avancement: avancementDeLaCI(travail),
        },
        { sha: d.sha, branche: 'main', passage: '43' }
      );
    expect(lire()).toMatchObject({ etat: 'en-cours', passage: '43' });
    expect(avancementDuTravail(travail)).toMatchObject({ faits: 3, prevus: 5 });
    expect(lire()).toMatchObject({ etat: 'finie', conclusion: 'success' });
    expect(avancementDuTravail(travail)).toMatchObject({ faits: 5, prevus: 5 });
  });

  it('a reading that looks for its run again empties the records of the run before', () => {
    const travail = path.join(ESSAIS, 'demo-2.travail');
    mkdirSync(travail, { recursive: true });
    const dossier = avancementDeLaCI(travail)!;
    mkdirSync(path.join(dossier, 'taches'), { recursive: true });
    writeFileSync(
      path.join(dossier, 'taches', 'etapes-de-la-ci.json'),
      JSON.stringify({ faits: 5, prevus: 5, a: Date.now() })
    );
    expect(avancementDuTravail(travail)).toMatchObject({ faits: 5, prevus: 5 });
    expect(avancementDeLaCI(travail)).toBe(dossier);
    expect(avancementDuTravail(travail)).toMatchObject({ faits: 5 });
    expect(avancementDeLaCI(travail, { nouvelle: true })).toBe(dossier);
    expect(avancementDuTravail(travail)).toMatchObject({ faits: 0, prevus: 0 });
  });

  it('a circuit without its working directory reads its CI without progress', () => {
    expect(avancementDeLaCI(path.join(ESSAIS, 'sans-travail.travail'))).toBeNull();
  });
});

describe('the working directory of the ticket lives until the queue is done with the ticket closed', () => {
  // It holds the progress of the CI the board reads: the conclusion of the CI removes it, not the
  // closure before the push.
  const leTravail = (d: ReturnType<typeof depot>) => {
    const travail = path.join(d.racine, '.claude', 'worktrees', 'demo-1.travail');
    mkdirSync(travail, { recursive: true });
    return travail;
  };
  const outils = (d: ReturnType<typeof depot>) => ({
    racine: d.racine,
    principale: 'main',
    bd: beads(rouvert()).bd,
    gh: github({}).gh,
    dire: () => {},
    avancement: null,
    rendus: [] as unknown[],
  });
  const fermer = (d: ReturnType<typeof depot>) =>
    fermerLEntree(outils(d), { ticket: 'demo-1', branche: 'agent/demo-1', commit: d.sha }) as {
      poussee: string | null;
    };

  it('the lot pushed: the working directory stays for the reading of its CI', () => {
    const d = depot();
    const travail = leTravail(d);
    expect(fermer(d).poussee).toBe('main');
    expect(existsSync(travail)).toBe(true);
  });

  it('the push refused: the queue is done with the ticket, its working directory is removed', () => {
    const d = depot();
    const travail = leTravail(d);
    d.git('remote', 'set-url', 'origin', path.join(ESSAIS, 'origine-absente'));
    expect(fermer(d).poussee).toBeNull();
    expect(existsSync(travail)).toBe(false);
  });

  it('the key of the push not a branch: no push, its working directory is removed', () => {
    const d = depot();
    writeFileSync(
      path.join(d.racine, 'package.json'),
      JSON.stringify({ grillhouse: { poussee: { commit: 42 } } })
    );
    d.git('commit', '-qam', 'clé fautive');
    const travail = leTravail(d);
    expect(fermer(d).poussee).toBeNull();
    expect(existsSync(travail)).toBe(false);
  });

  it('the first conclusion of the CI: green removes the working directory, red keeps it', () => {
    const conclure = (verdict: string) => {
      const d = depot();
      const travail = leTravail(d);
      const issue = conclureLaCI(outils(d), {
        ticket: 'demo-1',
        sha: d.sha,
        branche: 'main',
        verdict,
        passage: '41',
      }) as { etat: string };
      return { etat: issue.etat, reste: existsSync(travail) };
    };
    expect(conclure('verte')).toEqual({ etat: 'ferme', reste: false });
    expect(conclure('rouge')).toEqual({ etat: 'rouvert', reste: true });
    // A reading that fails concludes the CI not read: the ticket stays closed, the queue is done.
    expect(conclure('non-lue')).toEqual({ etat: 'ferme', reste: false });
  });

  it('the CI concluded green, the ticket closed: its working directory is removed', () => {
    const d = depot();
    const travail = path.join(d.racine, '.claude', 'worktrees', 'demo-1.travail');
    mkdirSync(travail, { recursive: true });
    const r = relire(d, rouvert(), {
      runs: [{ databaseId: 41, status: 'completed', conclusion: 'success' }],
      vues: [fini('success')],
    });
    expect(r.issue).toMatchObject({ etat: 'ferme' });
    expect(existsSync(travail)).toBe(false);
  });

  it('the CI still red, the ticket open: its working directory stays', () => {
    const d = depot();
    const travail = path.join(d.racine, '.claude', 'worktrees', 'demo-1.travail');
    mkdirSync(travail, { recursive: true });
    const r = relire(d, rouvert(), {
      runs: [{ databaseId: 42, status: 'completed', conclusion: 'failure' }],
      vues: [fini('failure')],
    });
    expect(r.issue).toMatchObject({ etat: 'rouvert' });
    expect(existsSync(travail)).toBe(true);
  });
});
