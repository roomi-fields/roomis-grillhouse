// The update that brings the rule « a test of the day does not start the frame's command » to the
// guard of the sizes (scripts/langages/typescript/tailles-des-tests.mjs) inscribes once, in the
// project's known debt (`grillhouse-dette.json`, scripts/dette.mjs), the tests that start it; the
// model is migration 0.30.0. The frame rewrites no test.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { FICHIER, juger, lire } from '../../../../scripts/dette.mjs';
import { migrationsDe } from '../../../../scripts/migrations.mjs';
import {
  BINAIRE_DE_JOUR,
  GARDE,
  GRAND_DE_JOUR,
  verifier,
} from '../../../../scripts/langages/typescript/tailles-des-tests.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-binaire-de-jour-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const MIGRATION = pathToFileURL(
  path.resolve(
    __dirname,
    '../../../../scripts/langages/typescript/migrations/0.33.0-binaire-de-jour.mjs'
  )
).href;
const charger = async () =>
  (await import(/* @vite-ignore */ MIGRATION)) as {
    migrer: (projet: string) => string[];
    nom: string;
    version: string;
  };

const forme = (f: string) =>
  readFileSync(path.join(__dirname, '../../../formes/tailles', f), 'utf8');
const NPX = forme('binaire-npx.txt');
const GRAND = forme('grand.txt');
const UN_MODULE = "import { a } from '../src/a.js';\nit('a', () => a());\n";

function projet(fichiers: Record<string, string>) {
  const r = mkdtempSync(path.join(ESSAIS, 'projet-'));
  spawnSync('git', ['init', '-q', r]);
  for (const [f, t] of Object.entries(fichiers)) {
    mkdirSync(path.dirname(path.join(r, f)), { recursive: true });
    writeFileSync(path.join(r, f), t);
  }
  return r;
}

describe('migration 0.33.0 — the tests that start the frame’s command inscribed in the debt', () => {
  it('is the migration of 0.33.0, « binaire de jour », in the list', async () => {
    const { nom, version } = await charger();
    expect(version).toBe('0.33.0');
    expect(nom).toBe('binaire de jour');
    const depot = path.resolve(__dirname, '../../../../../..');
    expect(migrationsDe(depot).some(m => m.version === version && m.nom === nom)).toBe(true);
  });

  it('inscribes the tests that start it, and the guard then refuses none', async () => {
    const { migrer } = await charger();
    const r = projet({ 'tests/n.test.ts': NPX, 'tests/a.test.ts': UN_MODULE, 'src/a.ts': '' });
    const lignes = migrer(r);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatch(new RegExp(`^${FICHIER} : 1 test`));
    expect(lire(r)).toEqual({
      [GARDE]: { 'tests/n.test.ts': { [BINAIRE_DE_JOUR]: { count: 1 } } },
    });
    expect(juger(lire(r), GARDE, verifier(r)).refus).toEqual([]);
  });

  it('keeps the debt already inscribed, and rewrites no test', async () => {
    const { migrer } = await charger();
    const r = projet({ 'tests/v.test.ts': GRAND, 'tests/n.test.ts': NPX });
    const avant = {
      'code-mort': { 'src/x.ts': { exports: { count: 2 } } },
      [GARDE]: { 'tests/v.test.ts': { [GRAND_DE_JOUR]: { count: 1 } } },
    };
    writeFileSync(path.join(r, FICHIER), `${JSON.stringify(avant, null, 2)}\n`);
    migrer(r);
    expect(lire(r)).toMatchObject({ 'code-mort': avant['code-mort'] });
    expect((lire(r) as Record<string, unknown>)[GARDE]).toEqual({
      'tests/v.test.ts': { [GRAND_DE_JOUR]: { count: 1 } },
      'tests/n.test.ts': { [BINAIRE_DE_JOUR]: { count: 1 } },
    });
    expect(readFileSync(path.join(r, 'tests/n.test.ts'), 'utf8')).toBe(NPX);
  });

  it('a second pass changes nothing', async () => {
    const { migrer } = await charger();
    const r = projet({ 'tests/n.test.ts': NPX });
    migrer(r);
    const avant = readFileSync(path.join(r, FICHIER), 'utf8');
    expect(migrer(r)).toEqual([]);
    expect(readFileSync(path.join(r, FICHIER), 'utf8')).toBe(avant);
  });

  it('a project without such a test gets no file', async () => {
    const { migrer } = await charger();
    const r = projet({ 'tests/a.test.ts': UN_MODULE, 'src/a.ts': '' });
    expect(migrer(r)).toEqual([]);
    expect(lire(r)).toEqual({});
  });
});
