// grillhouse-3dr.3.5: the tests of the frame's plugin (`claude plugin test mods/grillhouse`) play in
// `npm run verifier` and in the CI. They are the repository's own guards, its root script `gardes`,
// which the verification plays beside the frame's (scripts/langages/typescript/verifier.mjs), as the
// root task `//#gardes` of Turborepo, cached on the root's inputs. The CI installs the command
// claude at a fixed version before the verification.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const DEPOT = path.resolve(__dirname, '../../../..');
const lire = (f: string) => readFileSync(path.join(DEPOT, f), 'utf8');
const COMMANDE = 'claude plugin test mods/grillhouse';

type Etape = { name?: string; run?: string };
type Flux = { jobs: Record<string, { steps?: Etape[] }> };

describe('the tests of the frame plugin play in the verification and the CI', () => {
  it('the root script gardes, which npm run verifier plays, runs the plugin tests', () => {
    const pkg = JSON.parse(lire('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts.gardes).toBe(COMMANDE);
    expect(Object.entries(pkg.scripts).filter(([, s]) => s.includes(COMMANDE))).toEqual([
      ['gardes', COMMANDE],
    ]);
  });

  it('the CI installs the command claude at a fixed version before the verification', () => {
    const etapes = (parse(lire('.github/workflows/ci.yml')) as Flux).jobs.test.steps ?? [];
    const installe = etapes.findIndex(e =>
      /^npm install -g @anthropic-ai\/claude-code@\d+\.\d+\.\d+$/.test(e.run ?? '')
    );
    const verifie = etapes.findIndex(e => e.run === 'npm run verifier');
    expect(installe).toBeGreaterThanOrEqual(0);
    expect(verifie).toBeGreaterThan(installe);
  });
});
