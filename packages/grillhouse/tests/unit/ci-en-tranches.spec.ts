// The CI of Grillhouse plays the verification in jobs side by side, as Vitest shards a run: a job
// of every task but the tests (`npm run verifier -- --sans-tests`), n tranches of the tests
// (`npm run verifier -- --tranche i/n`), each depositing its reports, and a job that merges them
// (`grillhouse fusion-des-tranches`); build waits for all three. Every job runs on the machine the
// variable RUNNER names, GitHub's runner without it, and installs its tools on GitHub's runner
// alone.
//
// Small tests: the text of the workflow, read.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const DEPOT = path.resolve(__dirname, '../../../..');

type Etape = {
  name?: string;
  run?: string;
  uses?: string;
  if?: string;
  with?: Record<string, unknown>;
};
type Job = {
  'runs-on'?: string;
  needs?: string | string[];
  if?: string;
  strategy?: { matrix?: Record<string, unknown> };
  steps?: Etape[];
};
type Flux = {
  name: string;
  env?: Record<string, unknown>;
  on: Record<string, unknown>;
  jobs: Record<string, Job>;
};

const ci = parse(readFileSync(path.join(DEPOT, '.github/workflows/ci.yml'), 'utf8')) as Flux;
const runs = (j: Job) => (j.steps ?? []).flatMap(e => (e.run ? [e.run.trim()] : []));
const TRANCHES = Number(ci.env?.TRANCHES);

describe('the CI of Grillhouse plays the verification in tranches', () => {
  it('has a job of guards, the tranches, their merge and build', () => {
    expect(Object.keys(ci.jobs).sort()).toEqual(['build', 'fusion', 'gardes', 'tranches']);
  });

  it('keeps its name and the input of its call by the release', () => {
    expect(ci.name).toBe('CI');
    const appel = ci.on.workflow_call as { inputs: Record<string, unknown> };
    expect(Object.keys(appel.inputs)).toEqual(['node-versions']);
  });

  it('runs every job on the machine of the variable RUNNER, ubuntu-latest without it', () => {
    for (const [nom, j] of Object.entries(ci.jobs)) {
      expect(j['runs-on'], nom).toBe("${{ vars.RUNNER || 'ubuntu-latest' }}");
    }
  });

  it("installs uv and the command claude on GitHub's runner alone", () => {
    for (const [nom, j] of Object.entries(ci.jobs)) {
      for (const e of j.steps ?? []) {
        if (e.uses?.startsWith('astral-sh/setup-uv') || /npm install -g/.test(e.run ?? '')) {
          expect(e.if, `${nom} : ${e.name}`).toBe("runner.environment == 'github-hosted'");
        }
      }
    }
  });

  it('plays every task but the tests in the job of guards, typing and lint', () => {
    expect(runs(ci.jobs.gardes).filter(r => /verifier/.test(r))).toEqual([
      'npm run verifier -- --sans-tests',
    ]);
  });

  it('plays the tranches 1 to n, n the constant TRANCHES, each the tests of its tranche', () => {
    expect(TRANCHES).toBeGreaterThanOrEqual(2);
    expect(ci.jobs.tranches.strategy?.matrix?.tranche).toEqual(
      Array.from({ length: TRANCHES }, (_, i) => i + 1)
    );
    const verifs = runs(ci.jobs.tranches).filter(r => /verifier/.test(r));
    expect(verifs.length).toBeGreaterThan(0);
    for (const r of verifs) {
      expect(r).toMatch(/--tranche \{0\}\/\{1\}.*matrix\.tranche, env\.TRANCHES/);
      expect(r).not.toMatch(/--gardes|--sans-tests/);
    }
  });

  it('deposits the reports of each tranche, red or green, per version of Node', () => {
    const depot = (ci.jobs.tranches.steps ?? []).find(e =>
      e.uses?.startsWith('actions/upload-artifact')
    );
    expect(depot?.if).toBe('${{ !cancelled() }}');
    expect(depot?.with?.path).toBe('.vitest-reports/');
    expect(String(depot?.with?.name)).toMatch(/matrix\.node-version.*matrix\.tranche/);
  });

  it('merges the reports of the n tranches of one version of Node, after them, even red', () => {
    const fusion = ci.jobs.fusion;
    expect([fusion.needs].flat()).toEqual(['tranches']);
    expect(fusion.if).toBe('${{ !cancelled() }}');
    const recu = (fusion.steps ?? []).find(e => e.uses?.startsWith('actions/download-artifact'));
    expect(String(recu?.with?.pattern)).toMatch(/^tranche-\$\{\{ matrix\.node-version \}\}-\*$/);
    expect(recu?.with?.path).toBe('.vitest-reports');
    expect(recu?.with?.['merge-multiple']).toBe(true);
    expect(runs(fusion).at(-1)).toBe('npx --no-install grillhouse fusion-des-tranches');
  });

  it('builds once the guards, the tranches and their merge are green', () => {
    expect([ci.jobs.build.needs].flat().sort()).toEqual(['fusion', 'gardes', 'tranches']);
  });
});
