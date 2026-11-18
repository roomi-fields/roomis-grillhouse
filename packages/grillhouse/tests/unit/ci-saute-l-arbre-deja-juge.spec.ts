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

    it('looks for the judgement on a push to main or to a tag v<x.y.z> alone', () => {
      const si = recherche?.if ?? '';
      expect(si).toContain("github.event_name == 'push'");
      expect(si).toContain("github.ref == 'refs/heads/main'");
      expect(si).toMatch(/startsWith\(github\.ref, 'refs\/tags\/v'\)/);
      // No other trigger, no other branch: the pull request, the schedule, a develop or agent/** push.
      for (const autre of ['pull_request', 'schedule', 'workflow_call', 'develop', 'agent/']) {
        expect(si, autre).not.toContain(autre);
      }
    });

    it('judges the exact commit of the push, never a branch nor an ancestor', () => {
      const run = recherche?.run ?? '';
      expect(run).toMatch(/--commit "\$GITHUB_SHA"/);
      expect(run).not.toMatch(
        /--branch|merge-base|rev-list|rev-parse|--contains|--ancestry|HEAD~|\^\{/
      );
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

// Plays the condition of a job as GitHub reads it, for the result <resultat> of the CI it needs:
// `always()` is true, `cancelled()` false, `needs.ci.result` the result; `&&`, `||`, `!`, `==`,
// parentheses and quoted strings are the whole grammar, any other token refuses the test.
function condition(si: string | undefined, resultat: string): boolean {
  expect(si, 'the publication has an explicit condition').toBeTypeOf('string');
  const brut = si!
    .replace(/^\s*\$\{\{([\s\S]*)\}\}\s*$/, '$1')
    .replace(/needs\.ci\.result/g, JSON.stringify(resultat))
    .replace(/\balways\(\)/g, 'true')
    .replace(/\bcancelled\(\)/g, 'false');
  const jetons = brut.match(/"[^"]*"|'[^']*'|&&|\|\||==|!|\(|\)|true|false|\S+/g) ?? [];
  let i = 0;
  const lire = () => jetons[i++];
  const primaire = (): boolean | string => {
    const j = lire();
    if (j === '(') {
      const v = ou();
      expect(lire()).toBe(')');
      return v;
    }
    if (j === '!') {
      return !primaire();
    }
    if (j === 'true' || j === 'false') {
      return j === 'true';
    }
    expect(j, 'a token the condition may hold').toMatch(/^["'].*["']$/);
    return j.slice(1, -1);
  };
  const egal = (): boolean | string => {
    const g = primaire();
    if (jetons[i] === '==') {
      i++;
      return g === primaire();
    }
    return g;
  };
  const et = (): boolean | string => {
    let v = egal();
    while (jetons[i] === '&&') {
      i++;
      const d = egal();
      v = v && d;
    }
    return v;
  };
  const ou = (): boolean | string => {
    let v = et();
    while (jetons[i] === '||') {
      i++;
      const d = et();
      v = v || d;
    }
    return v;
  };
  const valeur = ou();
  expect(i, 'the whole condition is read').toBe(jetons.length);
  return Boolean(valeur);
}

describe('the release of Grillhouse, which calls its CI', () => {
  const sortie = lire('.github/workflows/release.yml');
  const publication = Object.entries(sortie.jobs).find(([nom]) => nom !== 'ci')![1];

  it('grants the job judged the reading of the runs', () => {
    expect(sortie.permissions?.actions).toBe('read');
  });

  it('calls the CI, whose job judged skips the pass of a commit a branch of a ticket judged', () => {
    expect(sortie.jobs.ci).toMatchObject({ uses: './.github/workflows/ci.yml' });
    expect([publication.needs].flat()).toContain('ci');
  });

  it('publishes when the CI it calls succeeded or was skipped', () => {
    expect(condition(publication.if, 'success')).toBe(true);
    expect(condition(publication.if, 'skipped')).toBe(true);
  });

  it('never publishes on a failure or a cancellation of the CI', () => {
    expect(condition(publication.if, 'failure')).toBe(false);
    expect(condition(publication.if, 'cancelled')).toBe(false);
  });
});
