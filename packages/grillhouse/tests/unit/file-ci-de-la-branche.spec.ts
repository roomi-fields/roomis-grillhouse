// The queue gates main on the CI of the ticket's branch, as bors and Zuul gate a merge on the CI
// of the tree that enters (scripts/integration/file.mjs): the branch `agent/<ticket>` made the
// candidate on top of main and pushed to origin (`preparerLaBranche`), its run read on that branch
// whatever runs it (`lireUneFoisLaCI`), its CI concluded (`conclureLaCI`), then main moved by
// fast-forward onto the tree the CI judged (`avancerMain`), and the entry closed (`fermerLEntree`).
// Nothing is verified on the machine.
//
// The history is a trial repository read by git, its origin a bare repository; Beads and the
// GitHub CLI are stand-ins in the process, with the answers of the queue's fake gh of the night
// tests (packages/grillhouse-essais/tests/integration-essai.ts: `{ runs, vues, url, log }`).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { avancementDeLaCI, avancementDuTravail } from '../../scripts/avancement.mjs';
import {
  INTEGRE,
  avancerMain,
  conclureLaCI,
  fermerLEntree,
  lireUneFoisLaCI,
  preparerLaBranche,
  situerLeLot,
} from '../../scripts/integration/file.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'file-ci-de-la-branche-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

type Commentaire = { author: string; text: string };
type Ticket = {
  id: string;
  status: string;
  close_reason?: string;
  labels: string[];
  comments: Commentaire[];
};
type Reponse = { status: number; stdout: string; stderr: string };
type Scenario = { runs?: object[]; vues?: object[]; url?: string; log?: string };

const repondre = (stdout = '', status = 0): Reponse => ({ status, stdout, stderr: '' });

// A stand-in for Beads over the ticket <t>, each call kept in `appels`: show, comments add, update
// (--status, --remove-label), close (--reason) and `config get issue_prefix` (demo).
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
    if (a[0] === 'comments' && a[1] === 'add') {
      t.comments.push({ author: 'file', text: a[3] });
    }
    if (a[0] === 'update') {
      const statut = a.indexOf('--status');
      if (statut >= 0) {
        t.status = a[statut + 1];
      }
      const retrait = a.indexOf('--remove-label');
      if (retrait >= 0) {
        t.labels = t.labels.filter(l => l !== a[retrait + 1]);
      }
    }
    if (a[0] === 'close') {
      t.status = 'closed';
      t.close_reason = a[a.indexOf('--reason') + 1];
    }
    return repondre();
  };
  return { bd, appels };
}

// A stand-in for the GitHub CLI answering the scenario <s>: the runs `gh run list` gives, the
// successive views of `gh run view <id> --json status,conclusion,jobs` (the last one repeated), the
// address and the failed log.
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

// A repository whose main holds a CI that runs on every push, pushed to its origin, and the branch
// agent/demo-1 one commit ahead of main, which names the ticket.
function depot() {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', racine, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
      encoding: 'utf8',
    }).trim();
  git('init', '-q', '-b', 'main');
  // The identity in the repository's own configuration: the queue commits the replaced branch
  // with its own git calls (and its copies share this configuration), where a CI has no global one.
  git('config', 'user.name', 't');
  git('config', 'user.email', 't@t');
  writeFileSync(path.join(racine, 'package.json'), '{}\n');
  mkdirSync(path.join(racine, '.github', 'workflows'), { recursive: true });
  writeFileSync(path.join(racine, '.github', 'workflows', 'ci.yml'), 'on: push\n');
  git('add', '-A');
  git('commit', '-qm', 'ci');
  const distant = mkdtempSync(path.join(ESSAIS, 'origin-'));
  execFileSync('git', ['init', '-q', '--bare', distant]);
  git('remote', 'add', 'origin', distant);
  git('push', '-q', 'origin', 'main');
  git('checkout', '-qb', 'agent/demo-1');
  writeFileSync(path.join(racine, 'lot.txt'), 'lot\n');
  git('add', '-A');
  git('commit', '-qm', 'feat: lot (demo-1)');
  git('checkout', '-q', 'main');
  const surOrigin = (branche: string) =>
    execFileSync('git', ['-C', distant, 'rev-parse', '--verify', '-q', `refs/heads/${branche}`], {
      encoding: 'utf8',
    }).trim();
  const absenteDOrigin = (branche: string) =>
    execFileSync('git', ['-C', distant, 'branch', '--list', branche], {
      encoding: 'utf8',
    }).trim() === '';
  return { racine, git, distant, surOrigin, absenteDOrigin, tip: git('rev-parse', 'agent/demo-1') };
}

const enFile = (): Ticket => ({
  id: 'demo-1',
  status: 'in_progress',
  labels: ['en-file'],
  comments: [],
});

// The tools of the queue over the trial <d>, Beads holding <t>, GitHub answering <s>.
function outils(d: ReturnType<typeof depot>, t: Ticket, s: Scenario = {}) {
  const b = beads(t);
  const g = github(s);
  const dites: string[] = [];
  return {
    o: {
      racine: d.racine,
      principale: 'main',
      bd: b.bd,
      gh: g.gh,
      dire: (l: string) => dites.push(l),
      avancement: null,
    },
    bd: b.appels,
    gh: g.appels,
    dites,
  };
}

const ENTREE = { ticket: 'demo-1', branche: 'agent/demo-1' };

describe('la file pousse agent/<ticket> et juge sa CI avant que main avance', () => {
  it('a branch on top of main is the candidate as it is, pushed to origin on its branch', () => {
    const d = depot();
    const { o } = outils(d, enFile());
    expect(preparerLaBranche(o, ENTREE)).toEqual({ candidat: { commit: d.tip } });
    expect(d.surOrigin('agent/demo-1')).toBe(d.tip);
    // Main does not move before the CI judged the candidate.
    expect(d.git('rev-parse', 'main')).not.toBe(d.tip);
  });

  it('main moved: the branch is replaced on main, takes the replaced commit and is pushed again', () => {
    const d = depot();
    // The candidate of before pushed, then main moves.
    const { o } = outils(d, enFile());
    preparerLaBranche(o, ENTREE);
    writeFileSync(path.join(d.racine, 'autre.txt'), 'autre\n');
    d.git('add', '-A');
    d.git('commit', '-qm', 'feat: autre (demo-2)');
    const r = preparerLaBranche(o, ENTREE) as { candidat: { commit: string } };
    const nouveau = r.candidat.commit;
    expect(nouveau).not.toBe(d.tip);
    expect(d.git('merge-base', '--is-ancestor', 'main', nouveau)).toBe('');
    expect(d.git('rev-parse', 'agent/demo-1')).toBe(nouveau);
    expect(d.surOrigin('agent/demo-1')).toBe(nouveau);
  });

  it('the run is the one of the candidate on its branch, read at its current attempt', () => {
    const d = depot();
    const { o, gh } = outils(d, enFile(), {
      runs: [{ databaseId: 41, status: 'completed', conclusion: 'success' }],
      vues: [fini('success')],
    });
    expect(lireUneFoisLaCI(o, { sha: d.tip, branche: 'agent/demo-1' })).toEqual({
      etat: 'finie',
      passage: '41',
      conclusion: 'success',
    });
    expect(gh).toEqual([
      `run list --commit ${d.tip} --branch agent/demo-1 --json databaseId,status,conclusion`,
      'run view 41 --json status,conclusion,jobs',
    ]);
  });

  it('no workflow runs on a push to the branch: no run is looked for', () => {
    const d = depot();
    writeFileSync(
      path.join(d.racine, '.github', 'workflows', 'ci.yml'),
      'on:\n  push:\n    branches: [main]\n'
    );
    d.git('commit', '-qam', 'ci sur main seul');
    d.git('branch', '-f', 'agent/demo-1', 'main');
    const { o, gh } = outils(d, enFile());
    const sha = d.git('rev-parse', 'main');
    expect(lireUneFoisLaCI(o, { sha, branche: 'agent/demo-1' })).toEqual({ etat: 'sans-ci' });
    expect(gh).toEqual([]);
  });

  it('green: main moves by fast-forward onto the tree the CI judged', () => {
    const d = depot();
    const t = enFile();
    const { o } = outils(d, t);
    expect(conclureLaCI(o, { ...ENTREE, sha: d.tip, verdict: 'verte', passage: '41' })).toEqual({
      avancer: true,
    });
    expect(avancerMain(o, { ...ENTREE, commit: d.tip })).toEqual({ entre: { commit: d.tip } });
    expect(d.git('rev-parse', 'main')).toBe(d.tip);
    // Played again after the death of its worker: main is already on the candidate.
    expect(avancerMain(o, { ...ENTREE, commit: d.tip })).toEqual({ entre: { commit: d.tip } });
    expect(t.comments).toEqual([]);
  });

  it('main moved after the CI judged the candidate: main does not move, the candidate is judged again', () => {
    const d = depot();
    writeFileSync(path.join(d.racine, 'autre.txt'), 'autre\n');
    d.git('add', '-A');
    d.git('commit', '-qm', 'feat: autre (demo-2)');
    const avant = d.git('rev-parse', 'main');
    const { o } = outils(d, enFile());
    expect(avancerMain(o, { ...ENTREE, commit: d.tip })).toEqual({ bouge: true });
    expect(d.git('rev-parse', 'main')).toBe(avant);
  });

  it('red: the ticket reopens without en-file, the address of the run and the end of its failed log at it; main does not move', () => {
    const d = depot();
    const t = enFile();
    const avant = d.git('rev-parse', 'main');
    const { o, gh } = outils(d, t, {
      url: 'https://github.com/demo/demo/actions/runs/42',
      log: 'test\tUNIT\t✗ osc_transport_full_roundtrip',
    });
    const r = conclureLaCI(o, { ...ENTREE, sha: d.tip, verdict: 'rouge', passage: '42' }) as {
      issue: { etat: string; raison: string };
    };
    expect(r.issue.etat).toBe('rouvert');
    expect(r.issue.raison).toContain('https://github.com/demo/demo/actions/runs/42');
    expect(t.status).toBe('open');
    expect(t.labels).toEqual([]);
    const mot = t.comments.at(-1)!.text;
    expect(mot).toContain('CI rouge');
    expect(mot).toContain('agent/demo-1');
    expect(mot).toContain('https://github.com/demo/demo/actions/runs/42');
    expect(mot).toContain('osc_transport_full_roundtrip');
    // A flaky test has no path of its own: the rule of the charter, and the rerun of the run.
    expect(mot).toContain('quarantaine');
    expect(mot).toContain('gh run rerun 42 --failed');
    expect(gh).toContain('run view 42 --log-failed');
    expect(d.git('rev-parse', 'main')).toBe(avant);
  });

  it('not read: the branch stays in the queue, the ticket told why, neither reopened nor closed', () => {
    const d = depot();
    const t = enFile();
    const { o } = outils(d, t);
    const r = conclureLaCI(o, {
      ...ENTREE,
      sha: d.tip,
      verdict: 'non-lue',
      raison: 'aucun passage de la CI pour ce commit en 120 s.',
    }) as { issue: { etat: string } };
    expect(r.issue.etat).toBe('en-file');
    expect(t.status).toBe('in_progress');
    expect(t.labels).toEqual(['en-file']);
    expect(t.comments.at(-1)!.text).toContain('aucun passage de la CI');
  });

  it('no CI for the branch: no green, no entry; the branch stays in the queue, the gesture named', () => {
    const d = depot();
    const t = enFile();
    const avant = d.git('rev-parse', 'main');
    const { o } = outils(d, t);
    const r = conclureLaCI(o, { ...ENTREE, sha: d.tip, verdict: 'sans-ci' }) as {
      issue: { etat: string; raison: string };
    };
    expect(r.issue).toEqual({
      etat: 'en-file',
      raison: 'aucune CI ne juge agent/demo-1 : la CI du projet doit écouter agent/**',
    });
    expect(t.labels).toEqual(['en-file']);
    expect(t.comments.at(-1)!.text).toContain('agent/**');
    expect(d.git('rev-parse', 'main')).toBe(avant);
  });
});

describe('l’entrée fermée : le ticket, la branche, main poussé, le travail retiré', () => {
  const leTravail = (d: ReturnType<typeof depot>) => {
    const travail = path.join(d.racine, '.claude', 'worktrees', 'demo-1.travail');
    mkdirSync(travail, { recursive: true });
    return travail;
  };

  it('the ticket closes « intégré », main is pushed, the branch leaves here and on origin, the working directory goes', () => {
    const d = depot();
    const t = enFile();
    const { o } = outils(d, t);
    preparerLaBranche(o, ENTREE);
    avancerMain(o, { ...ENTREE, commit: d.tip });
    const travail = leTravail(d);
    const f = fermerLEntree(o, { ...ENTREE, commit: d.tip }) as { poussee: string | null };
    expect(f.poussee).toBe('main');
    expect(t.status).toBe('closed');
    expect(t.close_reason).toBe(`${INTEGRE}${d.tip.slice(0, 7)}`);
    expect(d.surOrigin('main')).toBe(d.tip);
    expect(d.absenteDOrigin('agent/demo-1')).toBe(true);
    expect(d.git('branch', '--list', 'agent/demo-1')).toBe('');
    expect(existsSync(travail)).toBe(false);
  });

  it('the push refused: the ticket closed all the same, the queue is done with it', () => {
    const d = depot();
    const travail = leTravail(d);
    d.git('remote', 'set-url', 'origin', path.join(ESSAIS, 'origine-absente'));
    const { o } = outils(d, enFile());
    const f = fermerLEntree(o, { ...ENTREE, commit: d.tip }) as { poussee: string | null };
    expect(f.poussee).toBeNull();
    expect(existsSync(travail)).toBe(false);
  });

  it('where the lot stands is its ticket in Beads: its status and its reason of closure', () => {
    const d = depot();
    const t = { ...enFile(), status: 'closed', close_reason: 'intégré : abc1234' };
    const { o } = outils(d, t);
    expect(situerLeLot(o, 'demo-1')).toEqual({ statut: 'closed', raison: 'intégré : abc1234' });
  });
});

// The readings of the CI of a ticket's candidate, each an act of its own, write the steps of its
// run done over planned in the working directory of the ticket, where the board reads them while
// the circuit waits (scripts/avancement.mjs `avancementDeLaCI`, `avancementDuTravail`).
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
          bd: beads(enFile()).bd,
          gh: g.gh,
          dire: () => {},
          avancement: avancementDeLaCI(travail),
        },
        { sha: d.tip, branche: 'agent/demo-1', passage: '43' }
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
