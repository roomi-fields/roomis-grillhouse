// The frame's night on GitHub (.github/workflows/nuit.yml): a scheduled workflow that plays the night
// tests but those tagged @poste, no measure of time, on the runner of the variable RUNNER.
//
// Small tests: the text of the workflow, without a process.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const DEPOT = path.resolve(__dirname, '../../../..');
type Etape = { name?: string; if?: string; run?: string; uses?: string };
type Job = { 'runs-on': string; steps: Etape[]; strategy?: { matrix?: Record<string, unknown> } };
const flux = parse(readFileSync(path.join(DEPOT, '.github/workflows/nuit.yml'), 'utf8')) as {
  on: Record<string, unknown>;
  jobs: Record<string, Job>;
};
const jobs = Object.values(flux.jobs);
const etapes = jobs.flatMap(j => j.steps);

describe('the night of the frame on GitHub', () => {
  it('is scheduled', () => {
    expect(flux.on).toHaveProperty('schedule');
  });

  it('runs each job on the runner of the variable RUNNER, GitHub’s ubuntu-latest without it', () => {
    expect(jobs.length).toBeGreaterThan(0);
    for (const j of jobs) {
      expect(j['runs-on']).toBe(`\${{ fromJSON(vars.RUNNER || '"ubuntu-latest"') }}`);
    }
  });

  it('installs its tools on GitHub’s runner alone', () => {
    const installations = etapes.filter(
      e => e.uses?.startsWith('astral-sh/setup-uv') || /npm install -g/.test(e.run ?? '')
    );
    expect(installations.length).toBeGreaterThan(0);
    for (const e of installations) {
      expect(e.if).toBe("runner.environment == 'github-hosted'");
    }
  });

  it('plays the night tests out of the poste in tranches, merges them, and no other pass of tests', () => {
    const passes = etapes.filter(e => /grillhouse|vitest|verifier|npm test/.test(e.run ?? ''));
    expect(passes.map(e => e.run?.trim())).toEqual([
      "npx --no-install grillhouse tests-de-nuit --hors-du-poste ${{ format('--tranche {0}/{1}', matrix.tranche, env.TRANCHES) }}",
      'npx --no-install grillhouse fusion-des-tranches',
    ]);
  });

  it('lists the tranches 1 to TRANCHES, and merges them once they all ran', () => {
    const n = (flux as unknown as { env: { TRANCHES: number } }).env.TRANCHES;
    expect(flux.jobs.tranches?.strategy?.matrix?.tranche).toEqual(
      Array.from({ length: n }, (_, i) => i + 1)
    );
    expect((flux.jobs.fusion as unknown as { needs: string }).needs).toBe('tranches');
  });

  it('plays the versions of Node the nightly CI plays', () => {
    for (const j of jobs) {
      expect(j.strategy?.matrix?.['node-version']).toEqual(['24.x', '26.x']);
    }
  });
});
