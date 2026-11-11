// @poste: l'enveloppe bwrap, un serveur Temporal
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { chantier, serveurDeLaFileDIntegration, type Chantier } from './integration-essai.js';
import { LONG } from './file-integration-essai.js';
import { enProcessus } from './cadre.js';

const fluxDeLaBranche = enProcessus<string[]>('scripts/integration/file.mjs', 'fluxDeLaBranche');

// The integration queue (scripts/integration/file.mjs): it pushes the ticket's branch, reads its CI,
// and moves main onto the tree the CI judged.
// The queue's interface is told in file-integration.nuit.spec.ts; the trial harness is
// ./integration-essai.ts, and the matter these files share ./file-integration-essai.ts.

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'file-integration-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
serveurDeLaFileDIntegration(ESSAIS);

// The queue pushes agent/<ticket> and reads the CI of that branch before main moves, as bors and
// Zuul gate a merge on the CI of the tree that enters; a red CI reopens the ticket and main stays
// where it is. The CI is the fake gh of ./integration-essai.ts.
describe('the queue judges the branch by its CI before main moves', () => {
  const ci = (m: Chantier, scenario: Record<string, unknown>) =>
    writeFileSync(path.join(m.bin, 'gh.json'), JSON.stringify(scenario));
  const appelsGh = (m: Chantier) => {
    const f = path.join(m.bin, 'gh-appels');
    return existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n') : [];
  };
  const textes = (m: Chantier, id: string) => m.bd(id).comments.map(c => c.text);
  // A view of a run completed with <conclusion>, its one job of two steps done.
  const fini = (conclusion: string) => ({
    status: 'completed',
    conclusion,
    jobs: [{ status: 'completed', steps: [{ status: 'completed' }, { status: 'completed' }] }],
  });
  const listeDe = (sha: string) =>
    `run list --commit ${sha} --branch agent/demo-1 --json databaseId,status,conclusion`;

  it(
    'green: the branch is pushed, its run read on it, then main moves onto the tree it judged and the branch leaves origin',
    () => {
      const m = chantier(ESSAIS);
      ci(m, {
        runs: [{ databaseId: 41, status: 'queued', conclusion: '' }],
        vues: [fini('success')],
      });
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.livrer('demo-1');
      const candidat = m.sha('agent/demo-1');
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(appelsGh(m)).toEqual([listeDe(candidat), 'run view 41 --json status,conclusion,jobs']);
      expect(r.stdout).toContain('verte (passage 41)');
      expect(m.sha('main')).toBe(candidat);
      expect(m.distantSha('main')).toBe(candidat);
      expect(m.distantSha('agent/demo-1')).toBe('');
      expect(m.bd('demo-1').status).toBe('closed');
      expect(textes(m, 'demo-1').join('\n')).not.toMatch(/CI rouge|CI non lue/);
    },
    LONG
  );

  it(
    'red: main does not move, the ticket reopens with the address of the run and the end of its failed log, the branch stays on origin',
    () => {
      const m = chantier(ESSAIS);
      ci(m, {
        runs: [{ databaseId: 42, status: 'in_progress', conclusion: '' }],
        vues: [fini('failure')],
        url: 'https://github.com/demo/demo/actions/runs/42',
        log: 'test\tUNIT\t✗ rouge sur la CI',
      });
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.livrer('demo-1');
      const avant = m.sha('main');
      const candidat = m.sha('agent/demo-1');
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sha('main')).toBe(avant);
      expect(m.distantSha('main')).toBe(avant);
      expect(m.distantSha('agent/demo-1')).toBe(candidat);
      const t = m.bd('demo-1');
      expect(t.status).toBe('open');
      expect(t.labels).not.toContain('en-file');
      const rouge = textes(m, 'demo-1').at(-1);
      expect(rouge).toContain('CI rouge');
      expect(rouge).toContain('agent/demo-1');
      expect(rouge).toContain('https://github.com/demo/demo/actions/runs/42');
      expect(rouge).toContain('rouge sur la CI');
      expect(appelsGh(m)).toContain('run view 42 --log-failed');
    },
    LONG
  );

  it(
    'main moves while the CI runs: the branch is replaced on it, pushed again, and its CI read again before it enters',
    () => {
      const m = chantier(ESSAIS);
      ci(m, {
        runs: [{ databaseId: 44, status: 'completed', conclusion: 'success' }],
        vues: [fini('success')],
        bouger: m.repo,
      });
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.livrer('demo-1');
      const premier = m.sha('agent/demo-1');
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sujets().slice(0, 2)).toEqual(['feat: lot (demo-1)', 'main bouge']);
      const second = m.sha('main');
      expect(second).not.toBe(premier);
      const listes = appelsGh(m).filter(l => l.startsWith('run list'));
      expect(listes).toEqual([listeDe(premier), listeDe(second)]);
      expect(m.distantSha('main')).toBe(second);
      expect(m.bd('demo-1').status).toBe('closed');
    },
    LONG
  );

  // 2026-10-21 (Romain): the queue of a circuit (5.2) writes the steps of the CI done over planned
  // to the working directory of the ticket (`<ticket>.travail/avancement-ci`,
  // scripts/avancement.mjs `avancementDeLaCI`), which the board reads; it reads the run again
  // until it completes, as `gh run watch` does.
  it(
    'while it waits for the CI, the steps done over planned of the run go to the progress directory',
    () => {
      const m = chantier(ESSAIS);
      const etape = (status: string) => ({ status });
      const travail = path.join(m.repo, '.claude', 'worktrees', 'demo-1.travail');
      mkdirSync(travail, { recursive: true });
      const dossier = path.join(travail, 'avancement-ci');
      ci(m, {
        avancement: dossier,
        runs: [{ databaseId: 43, status: 'queued', conclusion: '' }],
        vues: [
          { status: 'queued', conclusion: '', jobs: [] },
          {
            status: 'in_progress',
            conclusion: '',
            jobs: [
              { status: 'completed', steps: [etape('completed'), etape('completed')] },
              {
                status: 'in_progress',
                steps: [etape('completed'), etape('in_progress'), etape('queued')],
              },
            ],
          },
          {
            status: 'completed',
            conclusion: 'success',
            jobs: [
              { status: 'completed', steps: [etape('completed'), etape('completed')] },
              {
                status: 'completed',
                steps: [etape('completed'), etape('completed'), etape('completed')],
              },
            ],
          },
        ],
      });
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.livrer('demo-1');
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(
        appelsGh(m).filter(a => a === 'run view 43 --json status,conclusion,jobs')
      ).toHaveLength(3);
      // Read again while the run was in progress: 3 steps done of 5.
      const vus = readFileSync(path.join(m.bin, 'gh-avancement'), 'utf8')
        .trim()
        .split('\n')
        .map(l => JSON.parse(l) as { faits: number; prevus: number });
      expect(vus).toContainEqual(expect.objectContaining({ faits: 3, prevus: 5 }));
      // The CI concluded green, the lot entered, the queue is done with the ticket: its working
      // directory leaves, the progress of the CI with it (`retirerLeTravail` of
      // scripts/integration/file.mjs).
      expect(existsSync(travail)).toBe(false);
      const t = m.bd('demo-1') as { status: string; close_reason?: string };
      expect(t.status).toBe('closed');
      expect(t.close_reason).toMatch(/^intégré : [0-9a-f]{7}$/);
      const court = String(t.close_reason).slice('intégré : '.length);
      expect(textes(m, 'demo-1').filter(x => /CI rouge|CI non lue/.test(x))).toEqual([]);
      expect(r.stdout + r.stderr).toContain(`CI de ${court} sur agent/demo-1 verte (passage 43)`);
    },
    LONG
  );

  it(
    'without a run found, the CI is not read: main does not move, the ticket told why, neither closed nor reopened',
    () => {
      const m = chantier(ESSAIS);
      // The CI of the project runs on every push, but no run comes.
      ci(m, { runs: [] });
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.livrer('demo-1');
      const avant = m.sha('main');
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(m.sha('main')).toBe(avant);
      const t = m.bd('demo-1');
      expect(t.status).not.toBe('closed');
      expect(t.status).not.toBe('open');
      expect(t.labels).toContain('en-file');
      const texte = textes(m, 'demo-1').at(-1);
      expect(texte).toContain('CI non lue');
      expect(texte).toContain('aucun passage de la CI');
      expect(appelsGh(m).filter(a => a.includes('status,conclusion,jobs'))).toEqual([]);
    },
    LONG
  );
});

// grillhouse-3uv.89 L7 (BPScript 320.3, commit 106c32c): a project without any CI waited 120 s for
// a run that could not come, and the ticket read « CI non lue ». The queue reads, in the candidate
// it pushes, the workflows that run on a push to the ticket's branch, and waits for no run when
// there is none; but main moves only on a green its CI gave: without a workflow on agent/**, the
// branch stays in the queue, and the ticket says that the CI of the project must listen to
// agent/**. A trial project that wants no CI takes its workflow out.
describe("L7 — a project without a CI for the ticket's branch does not wait for a run, and does not enter", () => {
  const appelsGh = (m: Chantier) => {
    const f = path.join(m.bin, 'gh-appels');
    return existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n') : [];
  };
  // Without a green, main does not move: the ticket keeps en-file, neither closed nor reopened, and
  // its last comment names agent/**.
  const resteEnFile = (m: Chantier, avant: string) => {
    expect(appelsGh(m)).toEqual([]);
    expect(m.sha('main')).toBe(avant);
    const t = m.bd('demo-1');
    expect(t.status).not.toBe('closed');
    expect(t.status).not.toBe('open');
    expect(t.labels).toContain('en-file');
    const mot = t.comments.at(-1)!.text;
    expect(mot).toContain('Aucune CI ne juge agent/demo-1');
    expect(mot).toContain('agent/**');
  };

  it(
    'no workflow at all: gh is never called, the branch stays in the queue, main does not move, and the ticket asks for a CI on agent/**',
    () => {
      const m = chantier(ESSAIS, { grillhouse: { poussee: { commit: 'travail' } } });
      m.poser({ '.github/workflows/ci.yml': null }, 'sans ci');
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.livrer('demo-1');
      const avant = m.sha('main');
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      resteEnFile(m, avant);
      expect(r.stdout).toContain('agent/**');
      expect(m.distantSha('travail')).toBe('');
    },
    LONG
  );

  it(
    'workflows that run on other branches only: gh is never called, and the branch stays in the queue',
    () => {
      const m = chantier(ESSAIS, { grillhouse: { poussee: { commit: 'travail' } } });
      m.poser(
        {
          '.github/workflows/ci.yml': 'on:\n  push:\n    branches: [main]\n  pull_request:\n',
          '.github/workflows/sortie.yml': 'on:\n  push:\n    tags: ["v*"]\n',
        },
        'ci'
      );
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.livrer('demo-1');
      const avant = m.sha('main');
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      resteEnFile(m, avant);
    },
    LONG
  );

  it(
    "a workflow that runs on the ticket's branch: the queue looks for its run on that branch, and enters on its green",
    () => {
      const m = chantier(ESSAIS, { grillhouse: { poussee: { commit: 'travail' } } });
      m.poser({ '.github/workflows/ci.yml': 'on:\n  push:\n    branches: ["agent/**"]\n' }, 'ci');
      m.ticket('demo-1', { 'src/a/index.ts': 'export const a = 1;\n' });
      m.livrer('demo-1');
      const r = m.file();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(appelsGh(m)[0]).toMatch(/^run list --commit \S+ --branch agent\/demo-1 /);
      expect(m.bd('demo-1').status).toBe('closed');
      expect(m.distantSha('travail')).toBe(m.sha('main'));
    },
    LONG
  );
});

// The workflows that run on a push to a branch, as GitHub reads their `on` and its filters
// (docs.github.com, « Workflow syntax », on.push.branches, and its filter pattern cheat sheet).
describe('L7 — the workflows that run on a push to a branch', () => {
  const un = (texte: string, branche = 'main') =>
    fluxDeLaBranche([{ chemin: '.github/workflows/ci.yml', texte }], branche);

  it('none without a workflow', () => {
    expect(fluxDeLaBranche([], 'main')).toEqual([]);
  });
  it('`on: push`, as a word, a list or a key without filter, runs on every branch', () => {
    expect(un('on: push\n')).toEqual(['.github/workflows/ci.yml']);
    expect(un('on: [pull_request, push]\n')).toEqual(['.github/workflows/ci.yml']);
    expect(un('on:\n  push:\n')).toEqual(['.github/workflows/ci.yml']);
  });
  it('a workflow without push does not run on a push', () => {
    expect(un('on: [pull_request, workflow_dispatch]\n')).toEqual([]);
    expect(un('on:\n  schedule:\n    - cron: "0 3 * * *"\n')).toEqual([]);
  });
  it('`branches`: a name, `*` (no slash), `**`, `?` and `+` of the preceding character, the last match deciding', () => {
    expect(un('on:\n  push:\n    branches: [main, develop]\n', 'develop')).toHaveLength(1);
    expect(un('on:\n  push:\n    branches: [main]\n', 'travail')).toEqual([]);
    expect(un('on:\n  push:\n    branches: ["agent/*"]\n', 'agent/x')).toHaveLength(1);
    expect(un('on:\n  push:\n    branches: ["agent/*"]\n', 'agent/x/y')).toEqual([]);
    expect(un('on:\n  push:\n    branches: ["agent/**"]\n', 'agent/x/y')).toHaveLength(1);
    expect(un('on:\n  push:\n    branches: ["mains?"]\n', 'main')).toHaveLength(1);
    expect(un('on:\n  push:\n    branches: ["v1+"]\n', 'v111')).toHaveLength(1);
    expect(un('on:\n  push:\n    branches: ["v1+"]\n', 'v')).toEqual([]);
    expect(un('on:\n  push:\n    branches: ["**", "!main"]\n', 'main')).toEqual([]);
    expect(un('on:\n  push:\n    branches: ["**", "!ma*", "main"]\n', 'main')).toHaveLength(1);
  });
  it('`branches-ignore` takes a branch out; tags alone run on no branch', () => {
    expect(un('on:\n  push:\n    branches-ignore: [main]\n', 'main')).toEqual([]);
    expect(un('on:\n  push:\n    branches-ignore: [main]\n', 'travail')).toHaveLength(1);
    expect(un('on:\n  push:\n    tags: ["v*"]\n')).toEqual([]);
    expect(un('on:\n  push:\n    tags: ["v*"]\n    branches: [main]\n')).toHaveLength(1);
  });
  it('what the queue cannot judge counts as a CI, which it waits for: paths filters, a file it cannot read', () => {
    expect(un('on:\n  push:\n    paths: ["src/**"]\n')).toHaveLength(1);
    expect(un('on: [push\n')).toHaveLength(1);
  });
});
