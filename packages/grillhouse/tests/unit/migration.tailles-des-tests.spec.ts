// grillhouse-3dr.4 critère 6: the update that brings the guard of the sizes of the tests
// (scripts/tailles-des-tests.mjs) inscribes the large tests of the day a project holds in its known
// debt (`grillhouse-dette.json`, scripts/dette.mjs), once: its verification does not change that
// day, and the frame rewrites no test of the project. Replayable without effect.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { FICHIER, juger, lire } from '../../scripts/dette.mjs';
import { MIGRATIONS } from '../../scripts/migrations.mjs';
import { migrer, nom, version } from '../../scripts/migrations/0.25.0-tailles-des-tests.mjs';
import { GARDE, GRAND_DE_JOUR, verifier } from '../../scripts/tailles-des-tests.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-tailles-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// A large test, in a file of its own so that the reading of this file sees none (tests/formes/).
const GRAND = readFileSync(path.join(__dirname, '../formes/tailles/grand.txt'), 'utf8');
const UN_MODULE = "import { a } from '../src/a.js';\nit('a', () => a());\n";

// A project of trial, a git repository whose files are <fichiers>, uncommitted.
function projet(fichiers: Record<string, string>) {
  const r = mkdtempSync(path.join(ESSAIS, 'projet-'));
  spawnSync('git', ['init', '-q', r]);
  for (const [f, t] of Object.entries(fichiers)) {
    mkdirSync(path.dirname(path.join(r, f)), { recursive: true });
    writeFileSync(path.join(r, f), t);
  }
  return r;
}

describe('migration 0.25.0 — the large tests of the day inscribed in the project’s debt', () => {
  it('is the migration of 0.25.0, « tailles des tests », in the list', () => {
    expect(version).toBe('0.25.0');
    expect(nom).toBe('tailles des tests');
    expect(MIGRATIONS.some(m => m.version === version && m.nom === nom)).toBe(true);
  });

  it('critère 6: inscribes the large tests of the day, and the guard then refuses none of them', () => {
    const r = projet({ 'tests/v.test.ts': GRAND, 'tests/a.test.ts': UN_MODULE, 'src/a.ts': '' });
    const lignes = migrer(r);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatch(new RegExp(`^${FICHIER} : 1 grand`));
    expect(lire(r)).toEqual({ [GARDE]: { 'tests/v.test.ts': { [GRAND_DE_JOUR]: { count: 1 } } } });
    expect(juger(lire(r), GARDE, verifier(r)).refus).toEqual([]);
  });

  it('critère 6: keeps the rest of the debt, and rewrites no test of the project', () => {
    const r = projet({ 'tests/v.test.ts': GRAND });
    const autre = { 'code-mort': { 'src/x.ts': { exports: { count: 2 } } } };
    writeFileSync(path.join(r, FICHIER), `${JSON.stringify(autre, null, 2)}\n`);
    migrer(r);
    expect(lire(r)).toMatchObject(autre);
    expect(lire(r)).toHaveProperty(GARDE);
    expect(readFileSync(path.join(r, 'tests/v.test.ts'), 'utf8')).toBe(GRAND);
  });

  it('critère 6: a second pass changes nothing, and inscribes no test added since', () => {
    const r = projet({ 'tests/v.test.ts': GRAND });
    migrer(r);
    const avant = readFileSync(path.join(r, FICHIER), 'utf8');
    writeFileSync(path.join(r, 'tests/w.test.ts'), GRAND);
    expect(migrer(r)).toEqual([]);
    expect(readFileSync(path.join(r, FICHIER), 'utf8')).toBe(avant);
    const { refus } = juger(lire(r), GARDE, verifier(r)) as { refus: { fichier: string }[] };
    expect(refus.map(c => c.fichier)).toEqual(['tests/w.test.ts']);
  });

  it('critère 6: a project without a large test of the day gets no file', () => {
    const r = projet({ 'tests/a.test.ts': UN_MODULE, 'src/a.ts': '' });
    expect(migrer(r)).toEqual([]);
    expect(lire(r)).toEqual({});
  });
});
