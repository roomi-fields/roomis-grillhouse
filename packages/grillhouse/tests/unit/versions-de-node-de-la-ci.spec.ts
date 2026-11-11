// The versions of Node the CI plays: Node 26 alone for each batch (push, pull request), Node 24
// and 26 at night (schedule) and at the release, in each job of the verification (the guards, the
// tranches, their merge); the build job plays Node 26.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const DEPOT = path.resolve(__dirname, '../../../..');
const lire = (f: string) => parse(readFileSync(path.join(DEPOT, f), 'utf8')) as Flux;

type Etape = { uses?: string; with?: Record<string, unknown> };
type Flux = {
  on: Record<string, unknown>;
  jobs: Record<
    string,
    {
      uses?: string;
      with?: Record<string, string>;
      needs?: string | string[];
      strategy?: { matrix?: { 'node-version'?: unknown } };
      steps?: Etape[];
    }
  >;
};

const ci = lire('.github/workflows/ci.yml');
const sortie = lire('.github/workflows/release.yml');

type Contexte = { event: string; entree?: string };

// The jobs of the verification, each played on the versions of the matrix.
const VERIFICATION = ['gardes', 'tranches', 'fusion'];

// Plays the matrix of the job <job> as GitHub does: the expression `${{ fromJSON(...) }}` over
// `inputs.node-versions` and `github.event_name`, for one trigger.
function versionsJouees(ctx: Contexte, job = 'tranches'): string[] {
  const matrice = ci.jobs[job]?.strategy?.matrix?.['node-version'];
  expect(typeof matrice, 'the matrix reads an expression, not a fixed list').toBe('string');
  const m = /^\s*\$\{\{\s*fromJSON\(([\s\S]*)\)\s*\}\}\s*$/.exec(matrice as string);
  expect(m, 'the matrix is `${{ fromJSON(...) }}`').not.toBeNull();
  // The one shape the matrix takes: `inputs.node-versions || (github.event_name == '<event>' && '<a>' || '<b>')`.
  const forme =
    /^\s*inputs\.node-versions\s*\|\|\s*\(\s*github\.event_name\s*==\s*'([^']+)'\s*&&\s*'([^']+)'\s*\|\|\s*'([^']+)'\s*\)\s*$/.exec(
      m![1]
    );
  expect(forme, 'the matrix reads the input of the call, then the event').not.toBeNull();
  const [, evenement, siEvenement, sinon] = forme!;
  const json = ctx.entree || (ctx.event === evenement ? siEvenement : sinon);
  return JSON.parse(json) as string[];
}

const nombre = (v: string) => Number.parseInt(v, 10);

describe('the versions of Node the CI plays', () => {
  it('a push plays Node 26 alone', () => {
    expect(versionsJouees({ event: 'push' }).map(nombre)).toEqual([26]);
  });

  it('a pull request plays Node 26 alone', () => {
    expect(versionsJouees({ event: 'pull_request' }).map(nombre)).toEqual([26]);
  });

  it('the push and pull request triggers stay, on main and develop', () => {
    expect(Object.keys(ci.on)).toEqual(expect.arrayContaining(['push', 'pull_request']));
  });

  it('the scheduled run plays Node 24 and 26', () => {
    expect(versionsJouees({ event: 'schedule' }).map(nombre)).toEqual([24, 26]);
  });

  it('the schedule trigger runs once a night, on the default branch (no branch filter)', () => {
    const planifie = ci.on.schedule as { cron: string }[];
    expect(planifie).toHaveLength(1);
    const champs = planifie[0].cron.trim().split(/\s+/);
    expect(champs).toHaveLength(5);
    expect(champs.slice(0, 2).every(c => /^\d+$/.test(c))).toBe(true);
    expect(champs.slice(2)).toEqual(['*', '*', '*']);
  });

  it('the CI declares the input node-versions, default Node 26 alone', () => {
    const entree = (ci.on.workflow_call as { inputs: Record<string, { default?: string }> }).inputs[
      'node-versions'
    ];
    expect(entree).toBeDefined();
    expect(JSON.parse(entree.default ?? 'null')).toEqual(['26.x']);
  });

  it('the matrix reads the versions of the input of the call, with no fixed list of versions', () => {
    expect(versionsJouees({ event: 'workflow_call', entree: '["22.x","24.x"]' })).toEqual([
      '22.x',
      '24.x',
    ]);
    expect(versionsJouees({ event: 'workflow_call', entree: '["24.x"]' })).toEqual(['24.x']);
    const matrice = ci.jobs.tranches.strategy?.matrix?.['node-version'];
    expect(Array.isArray(matrice)).toBe(false);
  });

  it('every job of the verification plays the same versions, whatever the trigger', () => {
    for (const ctx of [
      { event: 'push' },
      { event: 'pull_request' },
      { event: 'schedule' },
      { event: 'workflow_call', entree: '["22.x","24.x"]' },
    ]) {
      for (const job of VERIFICATION) {
        expect(versionsJouees(ctx, job), `${job} sous ${ctx.event}`).toEqual(versionsJouees(ctx));
      }
    }
  });

  it('the build job plays Node 26 whatever the matrix', () => {
    const setup = (ci.jobs.build.steps ?? []).find(e => e.uses?.startsWith('actions/setup-node'));
    expect(String(setup?.with?.['node-version'])).toBe('26');
    expect(ci.jobs.build.strategy).toBeUndefined();
  });

  it('the release plays the CI on Node 24 and 26 before it publishes', () => {
    const appel = sortie.jobs.ci;
    expect(appel.uses).toBe('./.github/workflows/ci.yml');
    const versions = JSON.parse(appel.with?.['node-versions'] ?? 'null') as string[];
    expect(versions.map(nombre)).toEqual([24, 26]);
    const publication = Object.entries(sortie.jobs).find(([nom]) => nom !== 'ci')![1];
    expect([publication.needs].flat()).toContain('ci');
  });
});
