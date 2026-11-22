// The CI of the project template installs uv on a hosted runner as soon as a CMakeLists.txt exists
// (the module c's clang tools come through uv), besides the pyproject.toml condition; clang-format
// and clang-tidy come from the step `npx grillhouse binaires` that follows.
//
// @lit .github/workflows/** templates/projet/.github/workflows/**
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const CI = path.resolve(__dirname, '../../../../templates/projet/.github/workflows/ci.yml');

type Etape = { name?: string; if?: string; run?: string; uses?: string };
type Flux = { jobs: Record<string, { steps?: Etape[] }> };

const etapes = (): { job: string; etape: Etape }[] =>
  Object.entries((parse(readFileSync(CI, 'utf8')) as Flux).jobs).flatMap(([job, j]) =>
    (j.steps ?? []).map(etape => ({ job, etape }))
  );

describe('la CI du gabarit installe uv pour un paquet c', () => {
  const uv = etapes().filter(({ etape }) => /uv/i.test(`${etape.name ?? ''} ${etape.uses ?? ''}`));

  it('has an uv installation step in each job that installs it', () => {
    expect(uv.length).toBeGreaterThan(0);
  });

  it.each(uv.map(({ job, etape }) => [job, etape] as const))(
    'the uv step of the job %s runs on a hosted runner for a pyproject.toml or a CMakeLists.txt',
    (_job, etape) => {
      expect(etape.if).toContain("runner.environment == 'github-hosted'");
      expect(etape.if).toContain("hashFiles('**/pyproject.toml') != ''");
      expect(etape.if).toContain("hashFiles('**/CMakeLists.txt') != ''");
    }
  );

  it('the step `npx grillhouse binaires` follows the uv step in each job', () => {
    const parJob = new Map<string, Etape[]>();
    for (const { job, etape } of etapes()) {
      parJob.set(job, [...(parJob.get(job) ?? []), etape]);
    }
    for (const [job, liste] of parJob) {
      const i = liste.findIndex(e => /uv/i.test(`${e.name ?? ''} ${e.uses ?? ''}`));
      if (i < 0) {
        continue;
      }
      expect(
        liste.slice(i + 1).some(e => /grillhouse binaires/.test(e.run ?? '')),
        job
      ).toBe(true);
    }
  });
});
