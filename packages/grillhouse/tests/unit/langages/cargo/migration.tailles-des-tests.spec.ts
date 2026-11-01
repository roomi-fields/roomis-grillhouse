// grillhouse-wbk.1 critère 3: the update that brings the guard of the sizes of the tests in Rust
// (scripts/langages/cargo/tailles-des-tests.mjs) inscribes the large tests of the day a project of
// cargo holds (SyntHub, OSC Bridge) in its known debt (`grillhouse-dette.json`, scripts/dette.mjs),
// once, as the module typescript's migration 0.25.0: its verification does not change that day, a
// new large test of the day is refused, and the frame rewrites no test of the project. Replayable
// without effect.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FICHIER, juger, lire } from '../../../../scripts/dette.mjs';
import module from '../../../../scripts/langages/cargo/index.mjs';
import * as migration from '../../../../scripts/langages/cargo/migrations/0.28.4-tailles-des-tests.mjs';
import {
  GARDE,
  GRAND_DE_JOUR,
  verifier,
} from '../../../../scripts/langages/cargo/tailles-des-tests.mjs';
import { avecFauxCargo, installerFauxCargo } from './faux-cargo.js';

const { migrer, nom, version } = migration;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-tailles-cargo-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
let restaurer = () => {};
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), path.join(ESSAIS, 'journal'));
});
afterAll(() => restaurer());

// A large test, in a file of its own so that the reading of this file sees none (tests/formes/).
const GRAND = readFileSync(path.join(__dirname, '../../../formes/tailles/cargo/grand.txt'), 'utf8');
const PETIT = '#[test]\nfn un() {\n    assert_eq!(1, 1);\n}\n';

// A project of cargo of one crate at its root, as OSC Bridge, whose tests are <tests> (from
// `tests/`).
function projet(tests: Record<string, string>) {
  const r = mkdtempSync(path.join(ESSAIS, 'projet-'));
  writeFileSync(path.join(r, 'Cargo.toml'), '[package]\nname = "seul"\n');
  mkdirSync(path.join(r, 'src'));
  writeFileSync(path.join(r, 'src/lib.rs'), '');
  mkdirSync(path.join(r, 'tests'));
  for (const [f, t] of Object.entries(tests)) {
    writeFileSync(path.join(r, 'tests', f), t);
  }
  return r;
}

describe('grillhouse-wbk.1 critère 3 — the large Rust tests of the day inscribed in the project’s debt', () => {
  it('is a migration of the module cargo, « tailles des tests », of the version that brings the guard', () => {
    expect(version).toBe('0.28.4');
    expect(nom).toBe('tailles des tests');
    expect(module.migrations).toContain(migration);
  });

  it('critère 3: inscribes the large tests of the day, and the guard then refuses none of them', () => {
    const r = projet({ 'bout.rs': GRAND, 'un.rs': PETIT, 'bout_nuit.rs': GRAND });
    const lignes = migrer(r);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatch(new RegExp(`^${FICHIER} : 1 grand`));
    expect(lire(r)).toEqual({ [GARDE]: { 'tests/bout.rs': { [GRAND_DE_JOUR]: { count: 1 } } } });
    expect(juger(lire(r), GARDE, verifier(r)).refus).toEqual([]);
  });

  it('critère 3: keeps the rest of the debt, and rewrites no test of the project', () => {
    const r = projet({ 'bout.rs': GRAND });
    const autre = { 'tailles-des-tests': { 'site/x.test.ts': { [GRAND_DE_JOUR]: { count: 1 } } } };
    writeFileSync(path.join(r, FICHIER), `${JSON.stringify(autre, null, 2)}\n`);
    migrer(r);
    expect(lire(r)).toMatchObject(autre);
    expect(lire(r)).toHaveProperty(GARDE);
    expect(readFileSync(path.join(r, 'tests/bout.rs'), 'utf8')).toBe(GRAND);
  });

  it('critère 3: a second pass changes nothing, and a large test of the day added since is refused', () => {
    const r = projet({ 'bout.rs': GRAND });
    migrer(r);
    const avant = readFileSync(path.join(r, FICHIER), 'utf8');
    writeFileSync(path.join(r, 'tests/neuf.rs'), GRAND);
    expect(migrer(r)).toEqual([]);
    expect(readFileSync(path.join(r, FICHIER), 'utf8')).toBe(avant);
    const { refus } = juger(lire(r), GARDE, verifier(r)) as { refus: { fichier: string }[] };
    expect(refus.map(c => c.fichier)).toEqual(['tests/neuf.rs']);
  });

  it('critère 3: a project without a large test of the day gets no file', () => {
    const r = projet({ 'un.rs': PETIT, 'bout_nuit.rs': GRAND });
    expect(migrer(r)).toEqual([]);
    expect(lire(r)).toEqual({});
  });
});
