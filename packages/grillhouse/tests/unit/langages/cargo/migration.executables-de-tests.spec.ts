// The update that brings the guard of the executables of tests in Rust
// (scripts/langages/cargo/executables-de-tests.mjs) inscribes the executables too many a project
// of cargo holds (SyntHub, OSC Bridge: one per file of tests/) in its known debt
// (`grillhouse-dette.json`, scripts/dette.mjs), once, as the migration of the sizes 0.28.4: its
// verification does not change that day, a new executable is refused, and the frame moves no test
// of the project. Replayable without effect.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FICHIER, juger, lire } from '../../../../scripts/dette.mjs';
import {
  DE_TROP,
  GARDE,
  verifier,
} from '../../../../scripts/langages/cargo/executables-de-tests.mjs';
import module from '../../../../scripts/langages/cargo/index.mjs';
import * as migration from '../../../../scripts/langages/cargo/migrations/0.34.0-executables-de-tests.mjs';
import { avecFauxCargo, installerFauxCargo } from './faux-cargo.js';

const { migrer, nom, version } = migration;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-executables-cargo-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
let restaurer = () => {};
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), path.join(ESSAIS, 'journal'));
});
afterAll(() => restaurer());

const TEST = '#[test]\nfn un() {\n    assert_eq!(1, 1);\n}\n';

// A project of cargo of one crate at its root, as OSC Bridge, whose test files are <tests> (from
// `tests/`).
function projet(tests: string[]) {
  const r = mkdtempSync(path.join(ESSAIS, 'projet-'));
  writeFileSync(path.join(r, 'Cargo.toml'), '[package]\nname = "seul"\n');
  mkdirSync(path.join(r, 'src'));
  writeFileSync(path.join(r, 'src/lib.rs'), '');
  for (const f of tests) {
    mkdirSync(path.dirname(path.join(r, 'tests', f)), { recursive: true });
    writeFileSync(path.join(r, 'tests', f), TEST);
  }
  return r;
}

describe('the executables of tests too many inscribed in the project’s debt', () => {
  it('is a migration of the module cargo, « executables de tests », of the version that brings the guard', () => {
    expect(version).toBe('0.34.0');
    expect(nom).toBe('executables de tests');
    expect(module.migrations).toContain(migration);
  });

  it('inscribes each executable too many, and the guard then refuses none of them', () => {
    const r = projet(['un.rs', 'deux.rs', 'bout_nuit.rs']);
    const lignes = migrer(r);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatch(new RegExp(`^${FICHIER} : 2 exécutable`));
    expect(lire(r)).toEqual({
      [GARDE]: {
        'tests/deux.rs': { [DE_TROP]: { count: 1 } },
        'tests/un.rs': { [DE_TROP]: { count: 1 } },
      },
    });
    expect(juger(lire(r), GARDE, verifier(r)).refus).toEqual([]);
  });

  it('keeps the rest of the debt, and moves no test of the project', () => {
    const r = projet(['un.rs', 'deux.rs']);
    const autre = {
      'tailles-des-tests-cargo': { 'tests/un.rs': { 'grand-de-jour': { count: 1 } } },
    };
    writeFileSync(path.join(r, FICHIER), `${JSON.stringify(autre, null, 2)}\n`);
    migrer(r);
    expect(lire(r)).toMatchObject(autre);
    expect(lire(r)).toHaveProperty(GARDE);
    expect(readFileSync(path.join(r, 'tests/un.rs'), 'utf8')).toBe(TEST);
  });

  it('a second pass changes nothing, and an executable added since is refused', () => {
    const r = projet(['un.rs', 'deux.rs']);
    migrer(r);
    const avant = readFileSync(path.join(r, FICHIER), 'utf8');
    writeFileSync(path.join(r, 'tests/trois.rs'), TEST);
    expect(migrer(r)).toEqual([]);
    expect(readFileSync(path.join(r, FICHIER), 'utf8')).toBe(avant);
    const { refus } = juger(lire(r), GARDE, verifier(r)) as { refus: { fichier: string }[] };
    expect(refus.map(c => c.fichier)).toEqual(['tests/trois.rs']);
  });

  it('a project with one executable of each moment gets no file', () => {
    const r = projet(['it/main.rs', 'it/un.rs', 'bout_nuit.rs']);
    expect(migrer(r)).toEqual([]);
    expect(lire(r)).toEqual({});
  });
});
