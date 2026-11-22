// The versions of Node the CI and the night play: Node 26 alone, for every trigger (push, pull
// request, schedule, release), in the repository and in the template of the projects. The matrix of
// each job that plays a version lists « 26.x » and nothing else, and the release passes no version
// to the CI it calls; the build job plays Node 26; `engines.node` is `>=26.0.0` at the root, in the
// published package and in the template.
//
// @lit .github/workflows/** templates/projet/.github/workflows/**
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const DEPOT = path.resolve(__dirname, '../../../..');
const texte = (f: string) => readFileSync(path.join(DEPOT, f), 'utf8');
const lire = (f: string) => parse(texte(f)) as Flux;

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

const FLUX = [
  ['the CI of Grillhouse', '.github/workflows/ci.yml'],
  ['the night of Grillhouse', '.github/workflows/nuit.yml'],
  ['the CI of the project template', 'templates/projet/.github/workflows/ci.yml'],
  ['the night of the project template', 'templates/projet/.github/workflows/nuit.yml'],
] as const;

const MOTEURS = [
  ['the root', 'package.json'],
  ['the published package', 'packages/grillhouse/package.json'],
  ['the template', 'templates/projet/package.json'],
] as const;

for (const [titre, fichier] of FLUX) {
  describe(`${titre} plays Node 26 alone`, () => {
    const flux = lire(fichier);
    const avecMatrice = Object.entries(flux.jobs).filter(
      ([, j]) => j.strategy?.matrix?.['node-version'] !== undefined
    );

    it('lists « 26.x » alone in the matrix of every job that plays a version, whatever the trigger', () => {
      expect(avecMatrice.length).toBeGreaterThan(0);
      for (const [nom, j] of avecMatrice) {
        expect(j.strategy?.matrix?.['node-version'], nom).toEqual(['26.x']);
      }
    });

    it('names no version 22 or 24 of Node anywhere', () => {
      expect(texte(fichier)).not.toMatch(/\b(22|24)\.x\b/);
      expect(texte(fichier)).not.toMatch(/node-version:\s*['"]?(22|24)\b/);
      expect(texte(fichier)).not.toMatch(/\bNode (22|24)\b/);
    });

    it('keeps no input of versions, since the matrix is fixed', () => {
      expect(texte(fichier)).not.toContain('node-versions');
    });
  });
}

describe('the CI plays Node 26 in its build and its jobs of verification', () => {
  it('has the guards, the tranches and their merge play the same matrix, Node 26 alone', () => {
    for (const f of ['.github/workflows/ci.yml', 'templates/projet/.github/workflows/ci.yml']) {
      const ci = lire(f);
      for (const job of ['gardes', 'tranches', 'fusion']) {
        expect(ci.jobs[job]?.strategy?.matrix?.['node-version'], `${f} ${job}`).toEqual(['26.x']);
      }
    }
  });

  it('the build job plays Node 26 whatever the matrix', () => {
    const ci = lire('.github/workflows/ci.yml');
    const setup = (ci.jobs.build.steps ?? []).find(e => e.uses?.startsWith('actions/setup-node'));
    expect(String(setup?.with?.['node-version'])).toBe('26');
    expect(ci.jobs.build.strategy).toBeUndefined();
  });

  it('the call and manual triggers stay, with no schedule, push or pull request trigger', () => {
    const declencheurs = Object.keys(lire('.github/workflows/ci.yml').on);
    expect(declencheurs.sort()).toEqual(['workflow_call', 'workflow_dispatch']);
  });
});

describe('the release calls the CI without naming a version of Node', () => {
  it('passes no input to the CI it calls, and publishes after it', () => {
    const sortie = lire('.github/workflows/release.yml');
    const appel = sortie.jobs.ci;
    expect(appel.uses).toBe('./.github/workflows/ci.yml');
    expect(appel.with).toBeUndefined();
    const publication = Object.entries(sortie.jobs).find(([nom]) => nom !== 'ci')![1];
    expect([publication.needs].flat()).toContain('ci');
  });
});

describe('engines.node declares Node 26 and later', () => {
  for (const [titre, fichier] of MOTEURS) {
    it(`is >=26.0.0 in ${titre}`, () => {
      const pkg = JSON.parse(texte(fichier)) as { engines: { node: string } };
      expect(pkg.engines.node).toBe('>=26.0.0');
    });
  }
});
