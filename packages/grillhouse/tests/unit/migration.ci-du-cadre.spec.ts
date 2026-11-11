// The migration of 0.33.0 (scripts/migrations/0.33.0-ci-du-cadre.mjs): the frame carries the CI
// of a project; the migration changes no file, and tells a project that holds none of the frame's
// workflows how to adopt them.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { MIGRATIONS } from '../../scripts/migrations.mjs';
import { migrer, nom, restes, version } from '../../scripts/migrations/0.33.0-ci-du-cadre.mjs';
import { GABARIT_DES_WORKFLOWS, WORKFLOWS } from '../../scripts/workflows-du-cadre.mjs';

const DEPOT = path.resolve(__dirname, '../../../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-ci-du-cadre-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

function projet(ci: string | null) {
  const p = mkdtempSync(path.join(ESSAIS, 'projet-'));
  writeFileSync(path.join(p, 'package.json'), '{"name":"p","scripts":{}}\n');
  if (ci !== null) {
    mkdirSync(path.join(p, WORKFLOWS), { recursive: true });
    writeFileSync(path.join(p, WORKFLOWS, 'ci.yml'), ci);
  }
  return p;
}
const DU_PROJET = 'name: CI\non: push\njobs: {}\n';

describe('migration 0.33.0 — the CI of the frame', () => {
  it('is in the list of the migrations', () => {
    expect(MIGRATIONS.some(m => m.version === version && m.nom === nom)).toBe(true);
    expect(version).toBe('0.33.0');
  });

  it('changes no file of the project', () => {
    const p = projet(DU_PROJET);
    expect(migrer(p)).toEqual([]);
    expect(readFileSync(path.join(p, WORKFLOWS, 'ci.yml'), 'utf8')).toBe(DU_PROJET);
  });

  it('tells a project without the CI of the frame how to adopt it, and that RUNNER is optional', () => {
    for (const p of [projet(DU_PROJET), projet(null)]) {
      const lignes = restes(p);
      expect(lignes).toHaveLength(1);
      expect(lignes[0]).toContain(`${GABARIT_DES_WORKFLOWS}/ci.yml`);
      expect(lignes[0]).toContain('npx grillhouse maj');
      expect(lignes[0]).toContain('RUNNER');
    }
  });

  it('leaves nothing to a project that holds the CI of the frame', () => {
    const p = projet(readFileSync(path.join(DEPOT, GABARIT_DES_WORKFLOWS, 'ci.yml'), 'utf8'));
    expect(restes(p)).toEqual([]);
  });
});
