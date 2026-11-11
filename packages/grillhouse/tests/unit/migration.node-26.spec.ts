// The migration of 0.33.0 (scripts/migrations/0.33.0-node-26.mjs): a project's package.json that
// holds the template's former `engines.node` and `packageManager` receives the template's, the rest
// of its bytes kept; a value the project chose stays. Small tests: files under a temporary
// directory.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { MIGRATIONS } from '../../scripts/migrations.mjs';
import * as migration from '../../scripts/migrations/0.33.0-node-26.mjs';

const DEPOT = path.resolve(__dirname, '../../../..');
const GABARIT = JSON.parse(
  readFileSync(path.join(DEPOT, 'templates/projet/package.json'), 'utf8')
) as { engines: { node: string }; packageManager: string };
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-node-26-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// A project whose package.json is <texte>.
const projet = (texte: string) => {
  const p = mkdtempSync(path.join(ESSAIS, 'projet-'));
  writeFileSync(path.join(p, 'package.json'), texte);
  return p;
};
const lire = (p: string) => readFileSync(path.join(p, 'package.json'), 'utf8');

// The package.json of a project made from the template before, its own fields around.
const AVANT = `{
  "name": "demo",
  "scripts": { "start": "node dist/index.js" },
  "engines": {
    "node": ">=22.0.0"
  },
  "devDependencies": { "typescript": "^5.3.3" },
  "packageManager": "npm@10.9.8"
}
`;

describe('migration 0.33.0 — the frame runs on Node 24 and 26', () => {
  it('is the migration of 0.33.0, « node 26 », in the list', () => {
    expect(migration.version).toBe('0.33.0');
    expect(migration.nom).toBe('node 26');
    expect(MIGRATIONS).toContain(migration);
  });

  it('the template declares Node 24 and later, and the npm of Node 26', () => {
    expect(GABARIT.engines.node).toBe('>=24.0.0');
    expect(GABARIT.packageManager).toMatch(/^npm@11\./);
  });

  it('the former values of the template give way to the template’s, every other byte kept', () => {
    const p = projet(AVANT);
    const lignes = migration.migrer(p);
    expect(lire(p)).toBe(
      AVANT.replace('">=22.0.0"', JSON.stringify(GABARIT.engines.node)).replace(
        '"npm@10.9.8"',
        JSON.stringify(GABARIT.packageManager)
      )
    );
    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toContain('engines.node');
    expect(lignes[1]).toContain('packageManager');
  });

  it('values the project chose stay, unsaid', () => {
    const choisi = AVANT.replace('>=22.0.0', '>=22.12.0').replace('npm@10.9.8', 'pnpm@9.0.0');
    const p = projet(choisi);
    expect(migration.migrer(p)).toEqual([]);
    expect(lire(p)).toBe(choisi);
  });

  it('replayed, it changes nothing', () => {
    const p = projet(AVANT);
    migration.migrer(p);
    const premiere = lire(p);
    expect(migration.migrer(p)).toEqual([]);
    expect(lire(p)).toBe(premiere);
  });

  it('a project without package.json is left, nothing said', () => {
    expect(migration.migrer(mkdtempSync(path.join(ESSAIS, 'vide-')))).toEqual([]);
  });
});
