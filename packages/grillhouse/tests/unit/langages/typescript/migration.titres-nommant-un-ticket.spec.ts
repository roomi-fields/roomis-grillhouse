// The update to 0.30.0, which brings the guard of the titles of the tests
// (scripts/langages/typescript/titres-de-tests.mjs), inscribes once, in the project's known debt
// (`grillhouse-dette.json`, scripts/dette.mjs), the titles that already name a ticket or a
// « critère N », as the migration of the large tests of the day does: the guard then refuses none,
// and the count never rises. The frame rewrites no test.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { FICHIER, juger, lire } from '../../../../scripts/dette.mjs';
import { migrationsDe } from '../../../../scripts/migrations.mjs';
import {
  GARDE,
  REGLE,
  verifier,
} from '../../../../scripts/langages/typescript/titres-de-tests.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-titres-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// The migration is loaded by each test, so that its absence is a red test, not a file that does
// not load.
const MIGRATION = pathToFileURL(
  path.resolve(
    __dirname,
    '../../../../scripts/langages/typescript/migrations/0.30.0-titres-nommant-un-ticket.mjs'
  )
).href;
const charger = async () =>
  (await import(/* @vite-ignore */ MIGRATION)) as {
    migrer: (projet: string) => string[];
    nom: string;
    version: string;
  };

// A test file whose two titles name a ticket of the prefix demo, and a « critère N ». Its calls are
// built, so that the guard of this repository does not count them in this file.
const [DESCRIBE, IT] = ['describe', 'it'];
const NOMMANT = `import { describe, it } from 'vitest';
${DESCRIBE}('demo-12 — la mesure', () => {
  ${IT}('critère 2: rend le double', () => {});
});
`;
const PROPRE = "import { it } from 'vitest';\nit('la mesure rend le double', () => {});\n";

// A git repository of trial with the files <fichiers>, its prefix of the tickets demo unless
// <prefixe> is false.
function projet(fichiers: Record<string, string>, prefixe = true) {
  const r = mkdtempSync(path.join(ESSAIS, 'projet-'));
  spawnSync('git', ['init', '-q', r]);
  const tous = prefixe ? { '.beads/config.yaml': 'issue-prefix: "demo"\n', ...fichiers } : fichiers;
  for (const [f, t] of Object.entries(tous)) {
    mkdirSync(path.dirname(path.join(r, f)), { recursive: true });
    writeFileSync(path.join(r, f), t);
  }
  return r;
}

describe('the update inscribes the titles that name a ticket in the project’s debt', () => {
  it('is the migration of 0.30.0, « titres nommant un ticket », in the list, after the prefix', async () => {
    const { nom, version } = await charger();
    expect(version).toBe('0.30.0');
    expect(nom).toBe('titres nommant un ticket');
    const depot = path.resolve(__dirname, '../../../../../..');
    const noms = migrationsDe(depot).map(m => m.nom);
    expect(noms).toContain(nom);
    expect(noms.indexOf('préfixe des tickets')).toBeLessThan(noms.indexOf(nom));
  });

  it('inscribes the titles of each file, and the guard then refuses none', async () => {
    const { migrer } = await charger();
    const r = projet({ 'tests/a.test.ts': NOMMANT, 'tests/b.test.ts': PROPRE });
    const lignes = migrer(r);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatch(new RegExp(`^${FICHIER} : 2 titre`));
    expect(lire(r)).toEqual({ [GARDE]: { 'tests/a.test.ts': { [REGLE]: { count: 2 } } } });
    expect(juger(lire(r), GARDE, verifier(r, 'demo')).refus).toEqual([]);
  });

  it('keeps the debt already inscribed and the rest, and rewrites no test', async () => {
    const { migrer } = await charger();
    const r = projet({ 'tests/a.test.ts': NOMMANT });
    const avant = { 'code-mort': { 'src/x.ts': { exports: { count: 2 } } } };
    writeFileSync(path.join(r, FICHIER), `${JSON.stringify(avant, null, 2)}\n`);
    migrer(r);
    expect(lire(r)).toMatchObject(avant);
    expect(readFileSync(path.join(r, 'tests/a.test.ts'), 'utf8')).toBe(NOMMANT);
  });

  it('a second pass changes nothing', async () => {
    const { migrer } = await charger();
    const r = projet({ 'tests/a.test.ts': NOMMANT });
    migrer(r);
    const avant = readFileSync(path.join(r, FICHIER), 'utf8');
    expect(migrer(r)).toEqual([]);
    expect(readFileSync(path.join(r, FICHIER), 'utf8')).toBe(avant);
  });

  it('a project without such a title, or without its prefix, gets no file', async () => {
    const { migrer } = await charger();
    const propre = projet({ 'tests/b.test.ts': PROPRE });
    expect(migrer(propre)).toEqual([]);
    expect(lire(propre)).toEqual({});
    const sansPrefixe = projet({ 'tests/a.test.ts': NOMMANT }, false);
    expect(migrer(sansPrefixe)).toEqual([]);
    expect(lire(sansPrefixe)).toEqual({});
  });
});
