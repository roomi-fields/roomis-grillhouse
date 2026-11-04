// grillhouse-44b.5, critères 3 et 10 — la demande `touches` de la jointure, qui doublait le cache de
// Turborepo, n'existe plus : ni dans les modules de langage, ni dans leurs essais, ni dans la
// jointure publiée et composée ; les gardes de conformité ne la lisent plus (les éléments du lot
// restent par `elementsDuLot`).
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { cas } from '../../scripts/conformite.mjs';
import { composer } from '../../scripts/composition-des-langages.mjs';
import cargo from '../../scripts/langages/cargo/index.mjs';
import cargoExemples from '../../scripts/langages/cargo/exemples.mjs';
import * as pythonLot from '../../scripts/langages/python/lot.mjs';
import python from '../../scripts/langages/python/index.mjs';
import pythonExemples from '../../scripts/langages/python/exemples.mjs';
import typescript from '../../scripts/langages/typescript/index.mjs';
import typescriptExemples from '../../scripts/langages/typescript/exemples.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'touches-supprimees-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const SCRIPTS = path.resolve(__dirname, '../../scripts');
const MODULES = { cargo, python, typescript } as Record<string, object>;
const EXEMPLES = {
  cargo: cargoExemples,
  python: pythonExemples,
  typescript: typescriptExemples,
} as Record<string, object>;

describe('grillhouse-44b.5 critère 3 — la demande `touches` est supprimée', () => {
  it('le fichier des crates touchés du module cargo n’existe plus', () => {
    expect(existsSync(path.join(SCRIPTS, 'langages/cargo/touches.mjs'))).toBe(false);
  });

  it('aucun module de langage ne publie `touches`', () => {
    for (const [nom, m] of Object.entries(MODULES)) {
      expect(m, nom).not.toHaveProperty('touches');
    }
  });

  it('la part `touches` de lot.mjs du module python n’existe plus ; ses éléments du lot restent', () => {
    expect(pythonLot).not.toHaveProperty('touches');
    expect(pythonLot).not.toHaveProperty('touchesDesFichiers');
    expect(pythonLot).toHaveProperty('elementsDuLot');
    expect(python).toHaveProperty('elementsDuLot');
  });

  it('la jointure composée de deux modules ne publie pas `touches`', () => {
    const c = composer([cargo as never, python as never]) as object;
    expect(c).not.toHaveProperty('touches');
    expect(c).toHaveProperty('elementsDuLot');
  });

  it('la jointure publiée (jointure.d.ts) ne décrit plus la demande `touches`', () => {
    const texte = readFileSync(path.join(SCRIPTS, 'jointure.d.ts'), 'utf8');
    expect(texte).not.toMatch(/\btouches\s*\(/);
    expect(texte).not.toContain('horsGraphe');
    expect(texte).toMatch(/\belementsDuLot\s*\(/);
  });
});

describe('grillhouse-44b.5 critère 10 — les gardes de conformité ne lisent plus de `touches`', () => {
  it('la suite de conformité d’un module n’a pas de cas `touches`, et garde ceux des éléments du lot', () => {
    for (const [nom, m] of Object.entries(MODULES)) {
      const noms = cas(m as never, EXEMPLES[nom] as never, { dans: ESSAIS }).map(c => c.nom);
      expect(noms, nom).not.toContain('touches');
      expect(noms, nom).toContain('elementsDuLot');
    }
  });
});
