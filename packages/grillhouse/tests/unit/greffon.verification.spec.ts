// The tests of the frame's plugin (`claude plugin test .`, the `test:unit` script of the package
// mods/grillhouse) play as a task of the graph, in `npm run verifier` and in the CI. The CI installs
// the command claude at a fixed version before the verification.
//
// @lit .github/workflows/** templates/projet/.github/workflows/**
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const DEPOT = path.resolve(__dirname, '../../../..');
const lire = (f: string) => readFileSync(path.join(DEPOT, f), 'utf8');
const COMMANDE = 'claude plugin test .';

type Etape = { name?: string; run?: string };
type Flux = { jobs: Record<string, { steps?: Etape[] }> };

describe('the tests of the frame plugin play in the verification and the CI', () => {
  it('the package of the plugin plays its tests as the task test:unit, the root script gardes no longer', () => {
    const pkg = JSON.parse(lire('package.json')) as {
      scripts: Record<string, string>;
      workspaces: string[];
    };
    const greffon = JSON.parse(lire('mods/grillhouse/package.json')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.workspaces).toContain('mods/*');
    expect(greffon.scripts['test:unit']).toBe(COMMANDE);
    expect(pkg.scripts.gardes).toBeUndefined();
    expect(Object.values(pkg.scripts).filter(s => s.includes('claude plugin test'))).toEqual([]);
  });

  it('the CI installs the command claude at a fixed version before the verification, in each of its jobs', () => {
    const jobs = (parse(lire('.github/workflows/ci.yml')) as Flux).jobs;
    const avecVerifier = Object.entries(jobs).filter(([, j]) =>
      (j.steps ?? []).some(e => /^npm run verifier( |$)/.test(e.run ?? ''))
    );
    expect(avecVerifier.map(([nom]) => nom)).toContain('gardes');
    for (const [nom, j] of avecVerifier) {
      const etapes = j.steps ?? [];
      const installe = etapes.findIndex(e =>
        /^npm install -g @anthropic-ai\/claude-code@\d+\.\d+\.\d+$/.test(e.run ?? '')
      );
      const verifie = etapes.findIndex(e => /^npm run verifier( |$)/.test(e.run ?? ''));
      expect(installe, nom).toBeGreaterThanOrEqual(0);
      expect(verifie, nom).toBeGreaterThan(installe);
    }
  });
});
