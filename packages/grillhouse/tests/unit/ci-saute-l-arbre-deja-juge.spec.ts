// The CI of main plays nothing again on a tree the CI of a ticket's branch judged green, as bors and
// Zuul test once the tree that enters main: the queue moves main by fast-forward onto that commit
// (scripts/integration/file.mjs). In the CI of Grillhouse and the template's, a first job `judged`
// looks, on a push to main alone, for a green run of the workflow on a branch agent/** for the same
// commit; every job of the pass depends on it and is skipped when it finds one. The job itself has
// no condition, so that on every other event its dependents run.
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
type Flux = { permissions?: Record<string, string>; jobs: Record<string, Job> };
const lire = (f: string) => parse(readFileSync(path.join(DEPOT, f), 'utf8')) as Flux;

const FLUX = [
  ['the CI of Grillhouse', '.github/workflows/ci.yml'],
  ['the CI of the project template', 'templates/projet/.github/workflows/ci.yml'],
] as const;

const SUR_PUSH_MAIN = "github.event_name == 'push' && github.ref == 'refs/heads/main'";
const PAS_JUGE = "needs.judged.outputs.judged != 'true'";

for (const [titre, fichier] of FLUX) {
  const ci = lire(fichier);
  const juge = ci.jobs.judged;
  const recherche = (juge?.steps ?? []).find(e => e.id === 'search');

  describe(`${titre} skips a tree already judged by the CI of a ticket's branch`, () => {
    it('always runs the job that looks for the judgement, so that its dependents run otherwise', () => {
      expect(juge).toBeDefined();
      expect(juge.if).toBeUndefined();
      expect(juge.needs).toBeUndefined();
    });

    it('looks for the judgement on a push to main alone', () => {
      expect(recherche?.if).toBe(SUR_PUSH_MAIN);
    });

    it('finds a green run of the workflow on a branch agent/** for the same commit', () => {
      const run = recherche?.run ?? '';
      expect(run).toMatch(/gh run list .*--workflow ci\.yml/);
      expect(run).toMatch(/--commit "\$GITHUB_SHA"/);
      expect(run).toMatch(/--status success/);
      expect(run).toMatch(/\^agent\//);
      expect(run).toMatch(/>> "\$GITHUB_OUTPUT"/);
      expect(recherche?.env?.GH_TOKEN).toBe('${{ github.token }}');
      expect(juge.permissions).toEqual({ actions: 'read', contents: 'read' });
      expect(juge.outputs?.judged).toBe('${{ steps.search.outputs.judged }}');
    });

    it('plays the pass when the search fails', () => {
      expect(recherche?.run ?? '').toMatch(/\|\| branches=''/);
    });

    it('skips every job of the pass when the commit is judged', () => {
      const passe = Object.entries(ci.jobs).filter(([nom]) => nom !== 'judged');
      expect(passe.length).toBeGreaterThan(0);
      for (const [nom, j] of passe) {
        expect([j.needs].flat(), nom).toContain('judged');
        expect(j.if, nom).toContain(PAS_JUGE);
      }
    });

    it('keeps the merge of the tranches after a red tranche, unless the commit is judged', () => {
      expect(ci.jobs.fusion.if).toBe(`\${{ !cancelled() && ${PAS_JUGE} }}`);
    });
  });
}

describe('the release of Grillhouse, which calls its CI', () => {
  it('grants the job judged the reading of the runs', () => {
    expect(lire('.github/workflows/release.yml').permissions?.actions).toBe('read');
  });
});
