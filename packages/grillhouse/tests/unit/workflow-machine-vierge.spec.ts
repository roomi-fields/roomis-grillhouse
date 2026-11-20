// The frame's workflow « machine vierge » (templates/projet/.github/workflows/machine-vierge.yml):
// a clean GitHub machine replays the installation from scratch and the complete verification, once
// a day on main when main moved since its last green pass, and at each release. No push to a branch
// starts it, so a red pass never blocks the queue of the lots.
//
// Small tests: the text of the template, read as the queue reads it, without a process.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { erreursDeBase } from '../../scripts/base-des-workflows.mjs';
import { fluxDeLaBranche } from '../../scripts/integration/file.mjs';
import { estDuCadre, GABARIT_DES_WORKFLOWS } from '../../scripts/workflows-du-cadre.mjs';

const DEPOT = path.resolve(__dirname, '../../../..');
const CHEMIN = `${GABARIT_DES_WORKFLOWS}/machine-vierge.yml`;
const texte = existsSync(path.join(DEPOT, CHEMIN))
  ? readFileSync(path.join(DEPOT, CHEMIN), 'utf8')
  : '';

type Etape = {
  name?: string;
  if?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
};
type Job = {
  'runs-on'?: string;
  if?: string;
  needs?: string | string[];
  outputs?: Record<string, string>;
  strategy?: { matrix?: Record<string, unknown> };
  steps: Etape[];
};
type Push = { tags?: string[]; branches?: string[]; 'branches-ignore'?: string[] };
type Flux = {
  on: Record<string, unknown> & { push: Push; schedule: unknown[] };
  jobs: Record<string, Job>;
};
// Without the template the file still loads, and each test fails on what it lacks.
const flux = (parse(texte) ?? {
  on: { push: {}, schedule: [] },
  jobs: { absent: { steps: [] } },
}) as Flux;
const jobs = Object.entries(flux.jobs);
const premier = jobs[0]![1];
const etapes = (j: Job) => j.steps.map(e => e.run ?? '').join('\n');

describe('the workflow of the clean machine', () => {
  it('is a file of the template of the frame', () => {
    expect(texte).not.toBe('');
  });

  it('bears the mark of the frame, so that the update writes it', () => {
    expect(estDuCadre(texte)).toBe(true);
  });

  it('starts on the schedule, on a release tag v*, and by hand, and on nothing else', () => {
    expect(Object.keys(flux.on).sort()).toEqual(['push', 'schedule', 'workflow_dispatch']);
    expect(flux.on.schedule).toHaveLength(1);
    expect(flux.on.push.tags).toEqual(['v*']);
  });

  it('starts on no push to main, develop or a branch of a ticket, as the queue reads it', () => {
    const fichiers = [{ chemin: CHEMIN, texte }];
    for (const branche of ['main', 'develop', 'agent/essai', 'agent/a/b']) {
      expect(fluxDeLaBranche(fichiers, branche), branche).toEqual([]);
    }
    expect(flux.on.push.branches).toBeUndefined();
    expect(flux.on.push['branches-ignore']).toBeUndefined();
  });

  it('is called by no other workflow and waits for none', () => {
    expect(flux.on).not.toHaveProperty('workflow_call');
    expect(flux.on).not.toHaveProperty('workflow_run');
    expect(texte).not.toMatch(/uses:\s*\.\/\.github\/workflows/);
    for (const [, j] of jobs) {
      for (const n of [j.needs ?? []].flat()) {
        expect(Object.keys(flux.jobs)).toContain(n);
      }
    }
  });

  it('runs every job on GitHub’s ubuntu-latest, never on the variable RUNNER', () => {
    expect(jobs.length).toBeGreaterThan(1);
    for (const [nom, j] of jobs) {
      expect(j['runs-on'], nom).toBe('ubuntu-latest');
    }
    expect(texte).not.toMatch(/vars\.RUNNER/);
    expect(texte).not.toMatch(/^\s*RUNNER\s*:/m);
  });

  it('plays Node 26 alone', () => {
    for (const [nom, j] of jobs) {
      if (j.strategy?.matrix) {
        expect(j.strategy.matrix['node-version'], nom).toEqual(['26.x']);
      }
    }
    expect(texte).not.toMatch(/\bnode-version:\s*['"]?(?!26|\$\{\{)\d/);
  });

  it('has the verification job install from scratch and play the complete verification, with no base', () => {
    const verification = jobs.find(([, j]) => /npm run verifier/.test(etapes(j)));
    expect(verification, 'a job plays npm run verifier').toBeDefined();
    const j = verification![1];
    const [checkout] = j.steps.filter(e => e.uses?.startsWith('actions/checkout'));
    expect(checkout?.with?.['fetch-depth']).toBe(0);
    expect(checkout?.with?.submodules).toBe('recursive');
    const runs = j.steps.map(e => e.run?.trim()).filter(Boolean);
    expect(runs).toContain('npm ci');
    expect(runs).toContain('npx --no-install grillhouse binaires');
    expect(runs.indexOf('npm ci')).toBeLessThan(runs.indexOf('npm run verifier'));
    expect(runs.indexOf('npx --no-install grillhouse binaires')).toBeLessThan(
      runs.indexOf('npm run verifier')
    );
    expect(runs.filter(r => /verifier/.test(r!))).toEqual(['npm run verifier']);
    expect(erreursDeBase(texte)).toEqual([]);
  });
});

describe('the decision of the pass of the clean machine', () => {
  const verification = jobs.find(([, j]) => /npm run verifier/.test(etapes(j)))?.[1] ?? {
    steps: [],
  };

  it('is the first job, which no condition of its own can skip: the schedule always starts', () => {
    expect(premier).not.toBe(verification);
    expect(premier.if).toBeUndefined();
    expect(Object.keys(premier.outputs ?? {})).toHaveLength(1);
  });

  it('has the verification job wait for it and skip when it says to skip', () => {
    const [nomDecision] = jobs[0]!;
    expect([verification.needs ?? []].flat()).toContain(nomDecision);
    const [sortie] = Object.keys(premier.outputs ?? {});
    expect(verification.if).toContain(`needs.${nomDecision}.outputs.${sortie}`);
  });

  it('reads the last green pass of this workflow on the repository, whatever its event', () => {
    const lecture = etapes(premier);
    expect(lecture).toMatch(/gh (run list|api)/);
    expect(lecture).toMatch(/success/);
    expect(lecture).toMatch(/machine-vierge\.yml/);
    expect(lecture).toMatch(/github\.sha|GITHUB_SHA/);
    expect(lecture).not.toMatch(/--event|event=/);
  });

  it('reads nothing outside the schedule: a tag or a manual start always plays', () => {
    const lectures = premier.steps.filter(e => /gh (run list|api)/.test(e.run ?? ''));
    expect(lectures.length).toBeGreaterThan(0);
    for (const e of lectures) {
      expect(e.if ?? '').toMatch(/github\.event_name\s*==\s*'schedule'/);
    }
  });

  it('plays when the search fails: a failed search judges nothing', () => {
    const lectures = premier.steps.filter(e => /gh (run list|api)/.test(e.run ?? ''));
    for (const e of lectures) {
      // The step neither stops the job on a failed search nor leaves its output to say « skip ».
      expect(e.run).toMatch(/\|\|/);
    }
    expect(etapes(premier)).toMatch(/true/);
  });
});
