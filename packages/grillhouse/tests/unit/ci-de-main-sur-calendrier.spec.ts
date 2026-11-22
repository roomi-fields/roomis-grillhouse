// The CI plays on main by batches, as Google's TAP plays the whole suite after the submit: the queue
// of the project starts it after a lot entered, one pass an hour at most (scripts/ci-de-main.mjs),
// so the workflow keeps no clock of its own. In the CI of Grillhouse and the template's, a start by
// hand (`workflow_dispatch`, which the queue's `gh workflow run` uses) and the release's call
// (`workflow_call`) are the only triggers; no schedule, no job that skips the pass.
//
// Small tests: the text of the workflows, read.
//
// @lit .github/workflows/** templates/projet/.github/workflows/**
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const DEPOT = path.resolve(__dirname, '../../../..');

type Job = { needs?: string | string[]; if?: string; outputs?: Record<string, string> };
type Flux = { on: Record<string, unknown>; jobs: Record<string, Job> };
const lire = (f: string) => parse(readFileSync(path.join(DEPOT, f), 'utf8')) as Flux;

const FLUX = [
  ['the CI of Grillhouse', '.github/workflows/ci.yml'],
  ['the CI of the project template', 'templates/projet/.github/workflows/ci.yml'],
] as const;

for (const [titre, fichier] of FLUX) {
  const ci = lire(fichier);
  const texte = readFileSync(path.join(DEPOT, fichier), 'utf8');

  describe(`${titre} starts when the queue starts it`, () => {
    it('starts by hand and by the release’s call, and on nothing else', () => {
      expect(Object.keys(ci.on).sort()).toEqual(['workflow_call', 'workflow_dispatch']);
    });

    it('has no schedule', () => {
      expect(ci.on).not.toHaveProperty('schedule');
      expect(texte).not.toMatch(/^\s*cron:/m);
      expect(texte).not.toMatch(/github\.event_name\s*==\s*'schedule'/);
    });

    it('does not start on a push, nor on a pull request, nor on a branch agent/**', () => {
      expect(ci.on).not.toHaveProperty('push');
      expect(ci.on).not.toHaveProperty('pull_request');
      expect(JSON.stringify(ci.on)).not.toContain('agent/');
    });
  });

  describe(`${titre} no longer skips its pass when main did not move`, () => {
    it('has no job `moved` and no output `unchanged`', () => {
      expect(ci.jobs).not.toHaveProperty('moved');
      for (const j of Object.values(ci.jobs)) {
        expect(Object.keys(j.outputs ?? {})).not.toContain('unchanged');
      }
      expect(texte).not.toMatch(/needs\.moved/);
    });

    it('has no job wait for `moved` nor skip on its output', () => {
      expect(Object.keys(ci.jobs).length).toBeGreaterThan(0);
      for (const [nom, j] of Object.entries(ci.jobs)) {
        expect([j.needs ?? []].flat(), nom).not.toContain('moved');
        expect(j.if ?? '', nom).not.toContain('unchanged');
      }
    });

    it('no longer searches the last green pass of the workflow to compare it to the tip', () => {
      expect(texte).not.toMatch(/gh run list/);
    });
  });
}
