// The CI plays on main by batches, as Google's TAP plays the whole suite after the submit: one run
// an hour at most, on the tip of main, which judges every lot entered since its last pass; a lot
// enters main on its final pass and waits for no CI (scripts/integration/file.mjs). In the CI of
// Grillhouse and the template's, the schedule is hourly, a first job `moved` finds out whether main
// moved since the last pass of the workflow on main and skips every job of the pass when it did not,
// and a start by hand always plays. No push, no pull request and no branch agent/** starts it.
//
// Small tests: the text of the workflows, read.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const DEPOT = path.resolve(__dirname, '../../../..');

type Etape = { id?: string; if?: string; run?: string; env?: Record<string, string> };
type Job = {
  needs?: string | string[];
  if?: string;
  permissions?: Record<string, string>;
  outputs?: Record<string, string>;
  steps?: Etape[];
};
type Flux = { on: Record<string, unknown>; jobs: Record<string, Job> };
const lire = (f: string) => parse(readFileSync(path.join(DEPOT, f), 'utf8')) as Flux;

const FLUX = [
  ['the CI of Grillhouse', '.github/workflows/ci.yml'],
  ['the CI of the project template', 'templates/projet/.github/workflows/ci.yml'],
] as const;

const PAS_BOUGE = "needs.moved.outputs.unchanged != 'true'";

for (const [titre, fichier] of FLUX) {
  const ci = lire(fichier);
  const texte = readFileSync(path.join(DEPOT, fichier), 'utf8');
  const decision = ci.jobs.moved;
  const lecture = (decision?.steps ?? []).filter(e => /gh (run list|api)/.test(e.run ?? ''));

  describe(`${titre} plays on main by batches, on an hourly schedule`, () => {
    it('starts on the schedule, by hand, and by the release’s call, and on nothing else', () => {
      expect(Object.keys(ci.on).sort()).toEqual(
        expect.arrayContaining(['schedule', 'workflow_dispatch'])
      );
      for (const declencheur of Object.keys(ci.on)) {
        expect(['schedule', 'workflow_dispatch', 'workflow_call'], declencheur).toContain(
          declencheur
        );
      }
    });

    it('does not start on a push, nor on a pull request, nor on a branch agent/**', () => {
      expect(ci.on).not.toHaveProperty('push');
      expect(ci.on).not.toHaveProperty('pull_request');
      expect(JSON.stringify(ci.on)).not.toContain('agent/');
    });

    it('has one hourly schedule: a fixed minute, every hour, every day', () => {
      const cron = ci.on.schedule as { cron: string }[];
      expect(cron).toHaveLength(1);
      expect(cron[0]!.cron).toMatch(/^\d{1,2} \* \* \* \*$/);
    });

    it('no longer says that its run judges a lot before main moves onto it', () => {
      expect(texte).not.toMatch(/judges the lot before main moves/);
      expect(texte).not.toMatch(/the queue of the frame[^\n]*pushes/);
    });
  });

  describe(`${titre} skips its pass when main did not move`, () => {
    it('always runs the job that looks for the movement, so that its dependents run otherwise', () => {
      expect(decision).toBeDefined();
      expect(decision.if).toBeUndefined();
      expect(decision.needs).toBeUndefined();
      expect(Object.keys(decision.outputs ?? {})).toContain('unchanged');
      expect(ci.jobs).not.toHaveProperty('judged');
    });

    it('has every other job wait for it and skip when it says main did not move', () => {
      const autres = Object.entries(ci.jobs).filter(([nom]) => nom !== 'moved');
      expect(autres.length).toBeGreaterThan(0);
      const premiers = autres.filter(([, j]) => [j.needs ?? []].flat().includes('moved'));
      expect(premiers.length).toBeGreaterThan(0);
      for (const [nom, j] of premiers) {
        expect(j.if ?? '', nom).toContain(PAS_BOUGE);
      }
    });

    it('reads the last green pass of this workflow on main and compares its commit to the tip', () => {
      expect(lecture.length).toBeGreaterThan(0);
      const run = lecture.map(e => e.run).join('\n');
      expect(run).toMatch(/--workflow ci\.yml/);
      expect(run).toMatch(/--branch main/);
      expect(run).toMatch(/--status success/);
      expect(run).toMatch(/headSha/);
      expect(run).toMatch(/GITHUB_SHA|github\.sha/);
      expect(run).toContain('unchanged=');
    });

    it('reads only on the schedule: a start by hand, or the call of a release, always plays', () => {
      for (const e of lecture) {
        expect(e.if ?? '').toMatch(/github\.event_name\s*==\s*'schedule'/);
      }
    });

    it('plays when the search fails: a failed search judges nothing', () => {
      for (const e of lecture) {
        expect(e.run).toMatch(/\|\|/);
      }
    });

    it('needs only the right to read the runs of the repository', () => {
      expect(decision.permissions).toMatchObject({ actions: 'read', contents: 'read' });
    });
  });
}
