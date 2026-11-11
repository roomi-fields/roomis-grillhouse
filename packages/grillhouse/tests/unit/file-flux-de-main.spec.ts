// The queue reads the workflows that run on main only, once a lot has entered it
// (scripts/integration/file.mjs): the CI of the ticket's branch judges before the entry, but a
// workflow such as « Deploy hosted server » runs on a push to main alone, after it. The queue does
// not wait for it: after the push it records a reading due (`inscrireLesFluxDeMain`), and each
// pass of the queue reads the readings due without waiting (`relireLesLecturesDues`), a workflow
// still running staying due up to the bound. Red, it reopens the ticket of the commit (label
// `flux-rouge`) with the address of the run; green or none, it says nothing; not judgeable, it
// says why at the ticket and reopens nothing. The history is a trial repository read by git; the
// GitHub CLI is a stand-in answering `gh run list` and `gh run view`.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  fluxDeMainAbsentsDeLaBranche,
  inscrireLesFluxDeMain,
  lecturesDuesDe,
  relireLesLecturesDues,
} from '../../scripts/integration/file.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'file-flux-de-main-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const MIN = 60_000;
const POUSSEE = Date.parse('2026-11-11T12:00:00Z');
const CI = { rechercheMs: 2 * MIN, attenteMs: 30 * MIN, pasMs: 10_000 };
const BRANCHE = 'agent/demo-1';
const URL = 'https://github.com/demo/demo/actions/runs/9';

type Reponse = { status: number; stdout: string; stderr: string };
const repondre = (stdout = '', status = 0, stderr = ''): Reponse => ({ status, stdout, stderr });

type Passage = { databaseId: number; status: string; conclusion: string; workflowName: string };
const passage = (id: number, workflowName: string, conclusion: string | null): Passage => ({
  databaseId: id,
  workflowName,
  status: conclusion === null ? 'in_progress' : 'completed',
  conclusion: conclusion ?? '',
});

type Monde = { runs: Passage[]; listeEnEchec?: boolean };

function outils(racine: string, monde: Monde) {
  const gh: string[] = [];
  const bd: string[][] = [];
  const comments: { ticket: string; texte: string }[] = [];
  return {
    o: {
      racine,
      principale: 'main',
      bd: (...a: string[]) => {
        bd.push(a);
        if (a[0] === 'comments' && a[1] === 'add') {
          comments.push({ ticket: a[2]!, texte: a[3]! });
        }
        return repondre();
      },
      gh: (args: string[]): Reponse => {
        gh.push(args.join(' '));
        if (args[0] === 'run' && args[1] === 'list') {
          return monde.listeEnEchec
            ? repondre('', 1, 'HTTP 502')
            : repondre(JSON.stringify(monde.runs));
        }
        if (args[1] === 'view' && args.includes('status,conclusion,jobs')) {
          const r = monde.runs.find(x => String(x.databaseId) === args[2]);
          return repondre(
            JSON.stringify({ status: r?.status, conclusion: r?.conclusion, jobs: [] })
          );
        }
        if (args[1] === 'view' && args.includes('--log-failed')) {
          return repondre('boom');
        }
        if (args[1] === 'view') {
          return repondre(`${URL}\n`);
        }
        return repondre('', 1);
      },
      dire: () => {},
      avancement: null,
    },
    gh,
    bd,
    comments,
  };
}

const flux = (nom: string) => `name: ${nom}\non: push\njobs: {}\n`;
const sur = (nom: string, branches: string) =>
  `name: ${nom}\non:\n  push:\n    branches: ${branches}\njobs: {}\n`;
const DEPLOY = 'Deploy hosted server';
const FLUX = {
  'ci.yml': flux('Tests'),
  'deploy.yml': sur(DEPLOY, '[main]'),
};

function depot(fichiers: Record<string, string>) {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  const git = (...a: string[]) =>
    execFileSync('git', ['-C', racine, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], {
      encoding: 'utf8',
    }).trim();
  git('init', '-q', '-b', 'main');
  writeFileSync(path.join(racine, 'package.json'), '{}\n');
  mkdirSync(path.join(racine, '.github', 'workflows'), { recursive: true });
  for (const [nom, texte] of Object.entries(fichiers)) {
    writeFileSync(path.join(racine, '.github', 'workflows', nom), texte);
  }
  git('add', '-A');
  git('commit', '-qm', 'lot');
  return { racine, sha: git('rev-parse', 'HEAD') };
}

const dus = (d: { racine: string }) => lecturesDuesDe(d.racine) as { ticket: string }[];
const inscrire = (
  d: { racine: string; sha: string },
  m: Monde,
  ticket = 'demo-1',
  extra: { poussee?: number } = {}
) => {
  const t = outils(d.racine, m);
  inscrireLesFluxDeMain(t.o, {
    ticket,
    sha: d.sha,
    branche: 'main',
    brancheDuTicket: BRANCHE,
    poussee: POUSSEE,
    ...extra,
  });
  return t;
};
const relire = (t: ReturnType<typeof outils>, apres: number) =>
  relireLesLecturesDues(t.o, { maintenant: POUSSEE + apres, ci: CI });
const reouvre = (bd: string[][], ticket: string) =>
  bd.some(
    a =>
      a[0] === 'update' &&
      a[1] === ticket &&
      a.join(' ').includes('--status open') &&
      a.join(' ').includes('--add-label flux-rouge')
  );
const ecritAuTicket = (t: ReturnType<typeof outils>) =>
  t.bd.some(a => a[0] === 'update' || (a[0] === 'comments' && a[1] === 'add'));

describe('les flux de main sont ceux de main absents de la branche du ticket', () => {
  it('a workflow that runs on main only is expected, the one already judged on the branch left out', () => {
    const d = depot(FLUX);
    expect(fluxDeMainAbsentsDeLaBranche(d.racine, d.sha, 'main', BRANCHE)).toEqual([
      { chemin: '.github/workflows/deploy.yml', nom: DEPLOY },
    ]);
  });

  it('the one already judged is found by its path, whatever its name', () => {
    const d = depot({
      'ci.yml': flux('Tests'),
      'docs.yml': sur('Docs', "[main, 'agent/**']"),
    });
    expect(fluxDeMainAbsentsDeLaBranche(d.racine, d.sha, 'main', BRANCHE)).toEqual([]);
  });

  it('several workflows of main only come in the order of their files', () => {
    const d = depot({
      'b.yml': sur('Docs', '[main]'),
      'a.yml': sur(DEPLOY, '[main]'),
      'ci.yml': flux('Tests'),
    });
    expect(fluxDeMainAbsentsDeLaBranche(d.racine, d.sha, 'main', BRANCHE).map(f => f.nom)).toEqual([
      DEPLOY,
      'Docs',
    ]);
  });

  it('a workflow that does not run on a push to main is not expected', () => {
    const d = depot({
      'ci.yml': flux('Tests'),
      'manuel.yml': 'name: Manuel\non: workflow_dispatch\njobs: {}\n',
      'autre.yml': sur('Autre', '[release]'),
    });
    expect(fluxDeMainAbsentsDeLaBranche(d.racine, d.sha, 'main', BRANCHE)).toEqual([]);
  });

  it('main under another name is the branch given', () => {
    const d = depot({ 'p.yml': sur('Publie', '[trunk]'), 'ci.yml': flux('Tests') });
    expect(fluxDeMainAbsentsDeLaBranche(d.racine, d.sha, 'trunk', BRANCHE).map(f => f.nom)).toEqual(
      ['Publie']
    );
    expect(fluxDeMainAbsentsDeLaBranche(d.racine, d.sha, 'main', BRANCHE)).toEqual([]);
  });
});

describe('après la poussée, la file inscrit une lecture due sans rien attendre', () => {
  it('records the ticket, the commit, the expected workflows and the time of the push, reading no run', () => {
    const d = depot(FLUX);
    const t = inscrire(d, { runs: [] });
    expect(lecturesDuesDe(d.racine)).toEqual([
      expect.objectContaining({
        ticket: 'demo-1',
        commit: d.sha,
        poussee: POUSSEE,
        flux: [{ chemin: '.github/workflows/deploy.yml', nom: DEPLOY }],
      }),
    ]);
    expect(t.gh).toEqual([]);
    expect(t.bd).toEqual([]);
  });

  it('no workflow of main beyond the one already judged: nothing is due', () => {
    const d = depot({ 'ci.yml': flux('Tests') });
    inscrire(d, { runs: [] });
    expect(dus(d)).toEqual([]);
  });

  it('two entries leave two readings due, each with its own ticket', () => {
    const a = depot(FLUX);
    inscrireLesFluxDeMain(outils(a.racine, { runs: [] }).o, {
      ticket: 'demo-1',
      sha: a.sha,
      branche: 'main',
      brancheDuTicket: BRANCHE,
      poussee: POUSSEE,
    });
    inscrireLesFluxDeMain(outils(a.racine, { runs: [] }).o, {
      ticket: 'demo-2',
      sha: a.sha,
      branche: 'main',
      brancheDuTicket: 'agent/demo-2',
      poussee: POUSSEE + MIN,
    });
    expect(dus(a).map(x => x.ticket)).toEqual(['demo-1', 'demo-2']);
  });
});

describe('un flux de main rouge rouvre le ticket du lot', () => {
  it('reopens the ticket with the label flux-rouge, the comment giving the flux, the run address and the commit', () => {
    const d = depot(FLUX);
    inscrire(d, { runs: [] });
    const t = outils(d.racine, { runs: [passage(9, DEPLOY, 'failure')] });
    relire(t, 3 * MIN);
    expect(reouvre(t.bd, 'demo-1')).toBe(true);
    expect(t.comments).toHaveLength(1);
    expect(t.comments[0]!.ticket).toBe('demo-1');
    expect(t.comments[0]!.texte).toContain(DEPLOY);
    expect(t.comments[0]!.texte).toContain(URL);
    expect(t.comments[0]!.texte).toContain(d.sha.slice(0, 7));
    expect(dus(d)).toEqual([]);
  });

  it('reads the runs of the commit on main', () => {
    const d = depot(FLUX);
    inscrire(d, { runs: [] });
    const t = outils(d.racine, { runs: [passage(9, DEPLOY, 'failure')] });
    relire(t, MIN);
    expect(t.gh.find(l => l.startsWith('run list'))).toContain(`--commit ${d.sha}`);
    expect(t.gh.find(l => l.startsWith('run list'))).toContain('--branch main');
  });

  it('any conclusion but success is red', () => {
    for (const conclusion of ['cancelled', 'timed_out', 'startup_failure']) {
      const d = depot(FLUX);
      inscrire(d, { runs: [] });
      const t = outils(d.racine, { runs: [passage(9, DEPLOY, conclusion)] });
      relire(t, MIN);
      expect(reouvre(t.bd, 'demo-1')).toBe(true);
    }
  });

  it('the ticket is the one of the commit pushed, whatever else is known', () => {
    const d = depot(FLUX);
    inscrire(d, { runs: [] }, 'demo-7');
    const t = outils(d.racine, { runs: [passage(9, DEPLOY, 'failure')] });
    relire(t, MIN);
    expect(reouvre(t.bd, 'demo-7')).toBe(true);
    expect(t.bd.some(a => a[0] === 'update' && a[1] !== 'demo-7')).toBe(false);
  });

  it('red while another workflow of main still runs: reopened at once, the other not waited for', () => {
    const d = depot({ ...FLUX, 'docs.yml': sur('Docs', '[main]') });
    inscrire(d, { runs: [] });
    const t = outils(d.racine, {
      runs: [passage(9, DEPLOY, 'failure'), passage(10, 'Docs', null)],
    });
    relire(t, MIN);
    expect(reouvre(t.bd, 'demo-1')).toBe(true);
    expect(dus(d)).toEqual([]);
  });

  it('reads two due readings in one pass, each ticket on its own', () => {
    const a = depot(FLUX);
    for (const [ticket, b] of [
      ['demo-1', BRANCHE],
      ['demo-2', 'agent/demo-2'],
    ] as const) {
      inscrireLesFluxDeMain(outils(a.racine, { runs: [] }).o, {
        ticket,
        sha: a.sha,
        branche: 'main',
        brancheDuTicket: b,
        poussee: POUSSEE,
      });
    }
    const t = outils(a.racine, { runs: [passage(9, DEPLOY, 'failure')] });
    relire(t, MIN);
    expect(reouvre(t.bd, 'demo-1')).toBe(true);
    expect(reouvre(t.bd, 'demo-2')).toBe(true);
  });
});

describe('un flux de main vert ou absent ne dit rien', () => {
  it('green: nothing reopened, nothing commented, the reading closed', () => {
    const d = depot(FLUX);
    inscrire(d, { runs: [] });
    const t = outils(d.racine, { runs: [passage(9, DEPLOY, 'success')] });
    relire(t, 5 * MIN);
    expect(ecritAuTicket(t)).toBe(false);
    expect(dus(d)).toEqual([]);
  });

  it('a red run of another name than the expected workflows’ does not count', () => {
    const d = depot(FLUX);
    inscrire(d, { runs: [] });
    const t = outils(d.racine, {
      runs: [passage(77, 'Pages build and deployment', 'failure'), passage(9, DEPLOY, 'success')],
    });
    relire(t, 5 * MIN);
    expect(ecritAuTicket(t)).toBe(false);
  });

  it('the workflow already judged on the branch is not read on main', () => {
    const d = depot(FLUX);
    inscrire(d, { runs: [] });
    const t = outils(d.racine, {
      runs: [passage(5, 'Tests', 'failure'), passage(9, DEPLOY, 'success')],
    });
    relire(t, 5 * MIN);
    expect(ecritAuTicket(t)).toBe(false);
  });

  it('with no reading due, a pass reads nothing and writes nothing', () => {
    const d = depot({ 'ci.yml': flux('Tests') });
    inscrire(d, { runs: [] });
    const t = outils(d.racine, { runs: [passage(5, 'Tests', 'failure')] });
    relire(t, 5 * MIN);
    expect(t.gh).toEqual([]);
    expect(t.bd).toEqual([]);
  });
});

describe('une lecture due ne bloque pas et reste due jusqu’à la borne', () => {
  it('a run still going stays due and says nothing before the bound', () => {
    const d = depot(FLUX);
    inscrire(d, { runs: [] });
    const t = outils(d.racine, { runs: [passage(9, DEPLOY, null)] });
    relire(t, 29 * MIN);
    expect(dus(d).map(x => x.ticket)).toEqual(['demo-1']);
    expect(ecritAuTicket(t)).toBe(false);
  });

  it('a run that has not started yet stays due within the search bound', () => {
    const d = depot(FLUX);
    inscrire(d, { runs: [] });
    const t = outils(d.racine, { runs: [] });
    relire(t, MIN);
    expect(dus(d).map(x => x.ticket)).toEqual(['demo-1']);
    expect(ecritAuTicket(t)).toBe(false);
  });

  it('read again by a later pass, the run now red reopens the ticket', () => {
    const d = depot(FLUX);
    inscrire(d, { runs: [] });
    const monde: Monde = { runs: [passage(9, DEPLOY, null)] };
    const t = outils(d.racine, monde);
    relire(t, 5 * MIN);
    monde.runs = [passage(9, DEPLOY, 'failure')];
    relire(t, 10 * MIN);
    expect(reouvre(t.bd, 'demo-1')).toBe(true);
    expect(dus(d)).toEqual([]);
  });

  it('the bound is counted from the push of main: a reading inscribed long ago is judged at once', () => {
    const d = depot(FLUX);
    inscrire(d, { runs: [] });
    const t = outils(d.racine, { runs: [passage(9, DEPLOY, null)] });
    relire(t, 31 * MIN);
    expect(dus(d)).toEqual([]);
  });
});

describe('un flux que la file ne peut pas juger n’est pas pris pour rouge', () => {
  it('no run by the search bound: a comment names the workflow and why, nothing reopened, the reading closed', () => {
    const d = depot(FLUX);
    inscrire(d, { runs: [] });
    const t = outils(d.racine, { runs: [] });
    relire(t, 3 * MIN);
    expect(t.comments).toHaveLength(1);
    expect(t.comments[0]!.ticket).toBe('demo-1');
    expect(t.comments[0]!.texte).toContain(DEPLOY);
    expect(t.comments[0]!.texte).toMatch(/aucun passage/);
    expect(reouvre(t.bd, 'demo-1')).toBe(false);
    expect(t.bd.some(a => a[0] === 'update')).toBe(false);
    expect(dus(d)).toEqual([]);
  });

  it('a run still going at the bound: a comment names the workflow and the run, nothing reopened', () => {
    const d = depot(FLUX);
    inscrire(d, { runs: [] });
    const t = outils(d.racine, { runs: [passage(9, DEPLOY, null)] });
    relire(t, 31 * MIN);
    expect(t.comments).toHaveLength(1);
    expect(t.comments[0]!.texte).toContain(DEPLOY);
    expect(t.comments[0]!.texte).toContain('9');
    expect(t.comments[0]!.texte).toMatch(/pas fini/);
    expect(t.bd.some(a => a[0] === 'update')).toBe(false);
    expect(dus(d)).toEqual([]);
  });

  it('the GitHub CLI failing: a comment gives the reason, nothing reopened, the reading closed', () => {
    const d = depot(FLUX);
    inscrire(d, { runs: [] });
    const t = outils(d.racine, { runs: [], listeEnEchec: true });
    relire(t, MIN);
    expect(t.comments).toHaveLength(1);
    expect(t.comments[0]!.texte).toContain(DEPLOY);
    expect(t.comments[0]!.texte).toContain('HTTP 502');
    expect(t.bd.some(a => a[0] === 'update')).toBe(false);
    expect(dus(d)).toEqual([]);
  });
});
