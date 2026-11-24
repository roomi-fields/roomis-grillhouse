// The migration of 0.50.0 (scripts/migrations/0.50.0-reglages-hors-de-la-charte.mjs): the charter
// of a project describes no setting; the migration writes nothing and tells a project whose
// CLAUDE.md describes settings to take them out.
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { MIGRATIONS } from '../../scripts/migrations.mjs';
import {
  migrer,
  nom,
  restes,
  version,
} from '../../scripts/migrations/0.50.0-reglages-hors-de-la-charte.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-reglages-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

function projet(charte: string | null) {
  const p = mkdtempSync(path.join(ESSAIS, 'projet-'));
  if (charte !== null) {
    writeFileSync(path.join(p, 'CLAUDE.md'), charte);
  }
  return p;
}

describe('migration 0.50.0 — the settings leave the charter', () => {
  it('is in the list of the migrations', () => {
    expect(MIGRATIONS.some(m => m.version === version && m.nom === nom)).toBe(true);
    expect(version).toBe('0.50.0');
  });

  it('writes no file and returns no line', () => {
    const p = projet('# P\n- `grillhouse.circuits` : entier\n');
    expect(migrer()).toEqual([]);
    expect(readdirSync(p)).toEqual(['CLAUDE.md']);
    expect(readFileSync(path.join(p, 'CLAUDE.md'), 'utf8')).toContain('grillhouse.circuits');
  });

  it('names each setting a charter describes, by its line', () => {
    const p = projet(
      '# P\n\n- `grillhouse.circuits` : entier\n- `GRILLHOUSE_PLACES` : 3\n- script `ci:preparer`\n\n## La machine vierge\n'
    );
    const lignes = restes(p);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toContain('grillhouse.circuits l.3');
    expect(lignes[0]).toContain('GRILLHOUSE_PLACES l.4');
    expect(lignes[0]).toContain('ci:preparer l.5');
    expect(lignes[0]).toContain('La machine vierge l.7');
    expect(lignes[0]).toContain('installation.md');
  });

  it('says nothing of a charter without setting, or without charter', () => {
    expect(
      restes(projet('# P\n\nLes clés `grillhouse.*` sont au document de l’installation.\n'))
    ).toEqual([]);
    expect(restes(projet(null))).toEqual([]);
  });
});
