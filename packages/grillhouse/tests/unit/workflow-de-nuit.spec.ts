// The frame's night on GitHub (.github/workflows/nuit.yml): a scheduled workflow that plays the night
// tests but those tagged @poste, no measure of time, on the runner of the variable RUNNER.
//
// Small tests: the text of the workflow, without a process.
//
// @lit .github/workflows/** templates/projet/.github/workflows/**
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

  it('runs each job on the executors of PC2, by their labels self-hosted and pc2', () => {
    expect(jobs.length).toBeGreaterThan(0);
    for (const j of jobs) {
      expect(j['runs-on']).toEqual(['self-hosted', 'pc2']);
    }
  });

  it('installs no tool by a step that only GitHub’s runner takes', () => {
    for (const e of etapes) {
      expect(e.if ?? '', e.name).not.toContain('github-hosted');
    }
  });

  it('plays the night tests but those tagged @poste in tranches, the tests tagged @equipee included, merges them, and plays the measures alone after the tranches', () => {
    const passes = etapes.filter(e => /grillhouse|vitest|verifier|npm test/.test(e.run ?? ''));
    expect(passes.map(e => e.run?.trim())).toEqual([
      "npx --no-install grillhouse tests-de-nuit --hors-du-poste ${{ format('--tranche {0}/{1}', matrix.tranche, env.TRANCHES) }}",
      'npx --no-install grillhouse fusion-des-tranches',
      'npx --no-install grillhouse tests-de-nuit --mesures',
    ]);
    expect(passes.filter(e => /--sans-equipement/.test(e.run ?? ''))).toEqual([]);
  });

  it('plays the measures of time and of load in a job of its own, after the tranches, red or green', () => {
    const mesures = Object.entries(flux.jobs).find(([, j]) =>
      j.steps.some(e => /tests-de-nuit --mesures/.test(e.run ?? ''))
    );
    expect(mesures).toBeDefined();
    const [nom, job] = mesures as [string, Job & { needs?: string | string[]; if?: string }];
    expect(nom).not.toBe('tranches');
    expect([job.needs].flat()).toEqual(expect.arrayContaining(['tranches']));
    expect(job.if).toContain('!cancelled()');
    expect(job.strategy?.matrix?.tranche).toBeUndefined();
  });

  it('lists the tranches 1 to TRANCHES, and merges them once they all ran', () => {
    const n = (flux as unknown as { env: { TRANCHES: number } }).env.TRANCHES;
    expect(flux.jobs.tranches?.strategy?.matrix?.tranche).toEqual(
      Array.from({ length: n }, (_, i) => i + 1)
    );
    expect((flux.jobs.fusion as unknown as { needs: string }).needs).toBe('tranches');
  });

  it('plays Node 26 alone', () => {
    for (const j of jobs) {
      expect(j.strategy?.matrix?.['node-version']).toEqual(['26.x']);
    }
  });
});
