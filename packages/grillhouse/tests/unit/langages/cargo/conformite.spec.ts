// grillhouse-pkl.3, criterion 1 — the module cargo answers the join: the frame's list names it,
// it exports a whole `Langage`, and the suite of conformity (scripts/conformite.mjs) finds no
// fault in it, against the fake cargo first on the PATH (the real one plays at night,
// cargo.nuit.test.ts). Each case has a defective entry that finds something, so that a check
// that never fails is seen. grillhouse-pkl.6, criterion 1: its guards of structure.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cas, echecs } from '../../../../scripts/conformite.mjs';
import { LANGAGES } from '../../../../scripts/langages.mjs';
import module from '../../../../scripts/langages/cargo/index.mjs';
import lesExemples from '../../../../scripts/langages/cargo/exemples.mjs';
import typescript from '../../../../scripts/langages/typescript/index.mjs';
import { avecFauxCargo, installerFauxCargo } from './faux-cargo.js';

type Langage = Parameters<typeof cas>[0];
const cargo = module as unknown as Langage;
const exemples = lesExemples as unknown as Parameters<typeof cas>[1];

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'conformite-cargo-'));
// The frame's package, from which the test names the scripts of the module's guards.
const PAQUET = path.resolve(__dirname, '../../../..');
let restaurer = () => {};
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), path.join(ESSAIS, 'journal'));
});
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
afterAll(() => restaurer());

describe('grillhouse-pkl.3, critère 1 — le module cargo passe la suite de conformité', () => {
  it('the frame’s list names cargo, its module under scripts/langages/cargo/', () => {
    expect(LANGAGES).toHaveProperty('cargo', './langages/cargo/index.mjs');
    expect(cargo.nom).toBe('cargo');
  });

  it('it exports every member of the join, as the module typescript does', () => {
    expect(Object.keys(cargo).sort()).toEqual(Object.keys(typescript).sort());
  });

  it('the suite finds no fault in it', () => {
    expect(echecs(cargo, exemples, { dans: ESSAIS })).toEqual([]);
  });

  it('each case has a defective entry with faults', () => {
    const vides = cas(cargo, exemples, { dans: ESSAIS })
      .filter(c => c.attendu.length === 0)
      .map(c => c.nom);
    expect(vides).toEqual([]);
  });
});

describe('grillhouse-pkl.6, critère 1 — les gardes de structure du module cargo', () => {
  it('it plays clippy, frontieres and index-interfaces, in this order, each script existing', () => {
    const gardes = cargo.gardes(ESSAIS);
    // Each script by its whole path from the package, which the frame reads to replay this test
    // when the script changes (grillhouse-3dr.3.4, the guard chemins-des-tests).
    expect(gardes.map(([s, ...args]) => [path.relative(PAQUET, s), ...args])).toEqual([
      ['scripts/langages/cargo/clippy.mjs'],
      ['scripts/langages/cargo/frontieres.mjs'],
      ['scripts/langages/cargo/index-interfaces.mjs', '--verifier'],
    ]);
    const c = cas(cargo, exemples, { dans: ESSAIS }).find(x => x.nom === 'gardes');
    expect(c?.valide()).toEqual([]);
  });
});
