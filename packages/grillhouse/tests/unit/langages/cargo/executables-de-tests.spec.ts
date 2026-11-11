// The guard of the executables of tests in Rust (scripts/langages/cargo/executables-de-tests.mjs),
// on the model of Cargo's testsuite (`tests/testsuite/main.rs`): a crate has one executable of
// integration tests per moment, `tests/it/main.rs` for the day, `tests/it_nuit/main.rs` for the
// night, `tests/it_budget/main.rs` for the benches, each test file a module. A crate with more than
// one executable of a moment is refused, each executable out of the address named; the debt
// inscribed passes and a new one is refused (the update in
// ./migration.executables-de-tests.spec.ts).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { juger } from '../../../../scripts/dette.mjs';
import {
  DE_TROP,
  GARDE,
  rapport,
  verifier,
} from '../../../../scripts/langages/cargo/executables-de-tests.mjs';
import { avecFauxCargo, installerFauxCargo } from './faux-cargo.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'executables-cargo-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
let restaurer = () => {};
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), path.join(ESSAIS, 'journal'));
});
afterAll(() => restaurer());

const TEST = '#[test]\nfn un() {\n    assert_eq!(1, 1);\n}\n';

// A workspace of cargo whose crates are <crates> (`{ <nom>: [<fichier de tests/>…] }`), read by the
// fake cargo: `crates/<nom>`, package `ws-<nom>`.
function espace(crates: Record<string, string[]>) {
  const r = mkdtempSync(path.join(ESSAIS, 'espace-'));
  writeFileSync(path.join(r, 'Cargo.toml'), '[workspace]\nmembers = ["crates/*"]\n');
  for (const [nom, tests] of Object.entries(crates)) {
    const fichiers = {
      'Cargo.toml': `[package]\nname = "ws-${nom}"\n`,
      'src/lib.rs': '',
      ...Object.fromEntries(tests.map(t => [`tests/${t}`, TEST])),
    };
    for (const [f, t] of Object.entries(fichiers)) {
      const abs = path.join(r, 'crates', nom, f);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, t);
    }
  }
  return r;
}

const fichiers = (r: string) => verifier(r).map(c => c.fichier);

describe('the guard of the executables of tests in Rust — one per crate and per moment', () => {
  it('passes a crate whose tests are modules of tests/it/, tests/it_nuit/ and tests/it_budget/', () => {
    const r = espace({
      a: ['it/main.rs', 'it/un.rs', 'it_nuit/main.rs', 'it_nuit/bout.rs', 'it_budget/main.rs'],
    });
    expect(verifier(r)).toEqual([]);
  });

  it('passes a crate with a single executable of a moment, whatever its name', () => {
    expect(verifier(espace({ a: ['seul.rs', 'bout_nuit.rs', 'mesure_budget.rs'] }))).toEqual([]);
  });

  it('refuses each day executable of a crate that has several, out of tests/it/main.rs', () => {
    const r = espace({ a: ['it/main.rs', 'un.rs', 'deux.rs'], b: ['seul.rs'] });
    expect(fichiers(r)).toEqual(['crates/a/tests/un.rs', 'crates/a/tests/deux.rs'].sort());
    const [c] = verifier(r);
    expect(c.regle).toBe(DE_TROP);
    expect(c.message).toMatch(/ws-a a 3 exécutables de tests de jour.*tests\/it\/main\.rs/);
  });

  it('refuses every day executable when none lies at tests/it/main.rs', () => {
    expect(fichiers(espace({ a: ['un.rs', 'deux.rs'] }))).toEqual([
      'crates/a/tests/deux.rs',
      'crates/a/tests/un.rs',
    ]);
  });

  it('refuses several night executables, and several benches, apart from the day', () => {
    const r = espace({ a: ['it/main.rs', 'a_nuit.rs', 'b_nuit.rs', 'x_budget.rs', 'y_budget.rs'] });
    const constats = verifier(r);
    expect(constats.map(c => c.fichier).sort()).toEqual([
      'crates/a/tests/a_nuit.rs',
      'crates/a/tests/b_nuit.rs',
      'crates/a/tests/x_budget.rs',
      'crates/a/tests/y_budget.rs',
    ]);
    expect(constats.find(c => c.fichier.endsWith('a_nuit.rs'))?.message).toMatch(
      /de nuit.*tests\/it_nuit\/main\.rs/
    );
  });

  it('counts no unit test of src/: it lies in the library’s own executable', () => {
    const r = espace({ a: ['seul.rs'] });
    writeFileSync(path.join(r, 'crates/a/src/tests.rs'), TEST);
    expect(verifier(r)).toEqual([]);
  });

  it('passes the executables inscribed in the debt, and refuses one added since', () => {
    const r = espace({ a: ['un.rs', 'deux.rs'] });
    const dette = { [GARDE]: { 'crates/a/tests/un.rs': { [DE_TROP]: { count: 1 } } } };
    const { refus } = juger(dette, GARDE, verifier(r)) as { refus: { fichier: string }[] };
    expect(refus.map(c => c.fichier)).toEqual(['crates/a/tests/deux.rs']);
  });

  it('reports each refusal and the count of the executables, red on a refusal', () => {
    const r = espace({ a: ['un.rs', 'deux.rs'], b: ['it/main.rs'] });
    const { lignes, code } = rapport(r, {});
    expect(code).toBe(1);
    expect(lignes.filter(l => l.startsWith('⛔'))).toHaveLength(2);
    expect(lignes.at(-1)).toMatch(/2 crate\(s\), 3 exécutable\(s\)/);
    expect(rapport(espace({ a: ['it/main.rs'] }), {}).code).toBe(0);
  });
});
