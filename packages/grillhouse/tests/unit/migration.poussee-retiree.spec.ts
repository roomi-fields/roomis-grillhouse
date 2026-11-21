// The migration of 0.48.0 (scripts/migrations/0.48.0-poussee-retiree.mjs): the key
// `grillhouse.poussee` is retired from the frame. A project's package.json that carries it, with
// any value, loses it, the rest of its keys kept; a line says the key is retired and that the
// remote branches of the project (the former commit branch, the night branch) are not touched. A
// second pass changes no byte and says nothing. Small tests: files under a temporary directory.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS } from '../../scripts/migrations.mjs';

type Migration = {
  version: string;
  nom: string;
  migrer: (projet: string) => unknown[];
};
const MODULE = '../../scripts/migrations/0.48.0-poussee-retiree.mjs';
let migration: Migration = new Proxy({} as Migration, {
  get() {
    throw new Error(`the module ${MODULE} is not written`);
  },
});
beforeAll(async () => {
  try {
    migration = (await import(/* @vite-ignore */ MODULE)) as Migration;
  } catch {
    // Kept as the proxy: each test reads it and fails on its own.
  }
});

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-poussee-retiree-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const dites = (l: unknown[]) =>
  l.map(x => (typeof x === 'string' ? x : (x as { aFaire: string }).aFaire));

function projet(contenu: string | null) {
  const p = mkdtempSync(path.join(ESSAIS, 'projet-'));
  if (contenu !== null) {
    writeFileSync(path.join(p, 'package.json'), contenu);
  }
  return p;
}
const paquet = (grillhouse: unknown) =>
  `${JSON.stringify({ name: 'demo', scripts: { test: 'vitest' }, grillhouse }, null, 2)}\n`;
const lire = (p: string) => readFileSync(path.join(p, 'package.json'), 'utf8');
const json = (p: string) => JSON.parse(lire(p)) as { grillhouse?: Record<string, unknown> };

describe('migration 0.48.0 — the key grillhouse.poussee is retired', () => {
  it('is the migration of 0.48.0, in the list', () => {
    expect(migration.version).toBe('0.48.0');
    expect(MIGRATIONS.map(m => m.nom)).toContain(migration.nom);
  });

  it.each([
    ['two branches', { commit: 'travail', nuit: 'main' }],
    ['null', null],
    ['an empty object', {}],
    ['a string', 'main'],
  ])('removes the key whose value is %s, the other keys kept', (_nom, valeur) => {
    const p = projet(paquet({ poussee: valeur, circuits: 2 }));
    migration.migrer(p);
    const lu = json(p);
    expect(lu.grillhouse).toEqual({ circuits: 2 });
    expect((JSON.parse(lire(p)) as { scripts: unknown }).scripts).toEqual({ test: 'vitest' });
  });

  it('says the key is retired and that the remote branches are not touched', () => {
    const p = projet(paquet({ poussee: { commit: 'travail', nuit: 'main' }, circuits: 2 }));
    const lignes = dites(migration.migrer(p)).join('\n');
    expect(lignes).toContain('grillhouse.poussee');
    expect(lignes).toMatch(/retirée/);
    expect(lignes).toMatch(/branches distantes/);
    expect(lignes).toMatch(/pas touchées/);
  });

  it('a second pass changes no byte and says nothing', () => {
    const p = projet(paquet({ poussee: { nuit: 'main' }, circuits: 2 }));
    migration.migrer(p);
    const apres = lire(p);
    expect(migration.migrer(p)).toEqual([]);
    expect(lire(p)).toBe(apres);
  });

  it('leaves a project without the key, without grillhouse or without package.json as it is', () => {
    const sans = projet(paquet({ circuits: 2 }));
    const avant = lire(sans);
    expect(migration.migrer(sans)).toEqual([]);
    expect(lire(sans)).toBe(avant);
    const nu = projet(`${JSON.stringify({ name: 'demo' }, null, 2)}\n`);
    expect(migration.migrer(nu)).toEqual([]);
    const vide = projet(null);
    mkdirSync(path.join(vide, 'src'));
    expect(migration.migrer(vide)).toEqual([]);
  });
});
