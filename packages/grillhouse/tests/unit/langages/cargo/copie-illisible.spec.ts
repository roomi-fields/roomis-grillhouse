// A copy cargo no longer loads: a session moved a dependency to the workspace in a crate's manifest
// (`jiff.workspace = true`) before the root declares it, and `cargo metadata` refuses the copy
// (osc-bridge OB-ud1.6). The join of the copy (`langageDeLaCopie`) still reads it, in the main tree
// of its repository; the circuit reads its components to open on its ticket. By the module cargo and
// the fake cargo of ./faux-cargo.ts, which refuses such a manifest as cargo does (code 101).
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sansTests, testsDuLot } from '../../../../scripts/activites.mjs';
import exemples from '../../../../scripts/langages/cargo/exemples.mjs';
import { langageDe, langageDeLaCopie } from '../../../../scripts/langages.mjs';
import { composantsDe, composantsLisibles } from '../../../../scripts/ticket-du-circuit.mjs';
import { avecFauxCargo, installerFauxCargo } from './faux-cargo.js';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'copie-illisible-'));
let restaurer = () => {};
let principal = '';
let copie = '';
let saine = '';
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), path.join(ESSAIS, 'journal'));
  principal = (exemples.preparer(ESSAIS) as { depots: { espace: string } }).depots.espace;
  const ajouter = (nom: string) => {
    const dossier = path.join(principal, '.claude', 'worktrees', nom);
    const r = spawnSync(
      'git',
      ['-C', principal, 'worktree', 'add', '-q', dossier, '-b', `agent/${nom}`],
      { encoding: 'utf8' }
    );
    expect(r.status, r.stderr).toBe(0);
    return dossier;
  };
  saine = ajouter('saine');
  copie = ajouter('cassee');
  // The crate inherits a dependency the root does not declare yet: the state between two writes.
  appendFileSync(path.join(copie, 'crates/app/Cargo.toml'), 'jiff.workspace = true\n');
});
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
afterAll(() => restaurer());

const dossiers = (l: { dossier: string }[]) => l.map(c => c.dossier).sort();

describe('the join of a copy cargo no longer loads', () => {
  it('the strict join throws cargo’s refusal, as a guard and the red of a reading read it', () => {
    expect(() => langageDe(copie).composants(copie)).toThrow(/cargo metadata dans .*cassee/);
  });

  it('gives the components of the main tree, each folder under the copy', () => {
    const lus = langageDeLaCopie(copie).composants(copie) as { dossier: string }[];
    expect(dossiers(lus)).toEqual(
      ['app', 'core', 'matiere', 'outil'].map(n => path.join(copie, 'crates', n))
    );
  });

  it('gives the test material and the class of a file as in a copy that loads', () => {
    const [la, ici] = [langageDeLaCopie(saine), langageDeLaCopie(copie)];
    const versLaCopie = (v: unknown) =>
      JSON.parse(JSON.stringify(v).replaceAll(saine, copie)) as unknown;
    expect(ici.matieres(copie)).toEqual(versLaCopie(la.matieres(saine)));
    for (const rel of [
      'crates/app/tests/integ.rs',
      'crates/app/src/lib.rs',
      'crates/app/Cargo.toml',
    ]) {
      expect(ici.estUnTest(path.join(copie, rel), copie), rel).toEqual(
        la.estUnTest(path.join(saine, rel), saine)
      );
    }
  });

  it('throws the error of the main tree itself: it has no other tree to read', () => {
    const seul = mkdtempSync(path.join(ESSAIS, 'seul-'));
    spawnSync('git', ['clone', '-q', principal, seul]);
    appendFileSync(path.join(seul, 'crates/app/Cargo.toml'), 'jiff.workspace = true\n');
    expect(() => langageDeLaCopie(seul).composants(seul)).toThrow(/cargo metadata dans .*seul-/);
  });

  it('throws the error of the copy when its main tree is not given', () => {
    expect(() => langageDeLaCopie(copie, () => null).composants(copie)).toThrow(
      /cargo metadata dans .*cassee/
    );
  });
});

describe('the components an act of the circuit reads to open on its ticket', () => {
  it('are read in a copy cargo no longer loads, where the strict reading throws', () => {
    expect(() => composantsDe(copie)).toThrow(/cargo metadata/);
    expect(composantsLisibles(copie)).toEqual(composantsLisibles(saine));
    expect(composantsLisibles(copie).map(p => p.dossier)).toContain('crates/app');
  });
});

describe('the tests of the lot the launch of a session reads', () => {
  it('are none, without reading the language, for a copy not made yet', () => {
    const absente = path.join(ESSAIS, 'pas-encore-de-copie');
    expect(testsDuLot({ copie: absente }, langageDeLaCopie)).toEqual([]);
    expect(testsDuLot({ copie: absente })).toEqual([]);
  });

  it('are read in a copy cargo no longer loads, where the strict reading throws', () => {
    const neuf = 'crates/app/tests/neuf.rs';
    for (const dans of [saine, copie]) {
      writeFileSync(path.join(dans, neuf), '#[test]\nfn neuf() {}\n');
    }
    expect(() => testsDuLot({ copie })).toThrow(/cargo metadata/);
    expect(testsDuLot({ copie }, langageDeLaCopie)).toEqual(testsDuLot({ copie: saine }));
    expect(testsDuLot({ copie }, langageDeLaCopie)).toContain(neuf);
  });

  it('a plan is said to carry tests before the session of the testwriter, as in a copy that loads', () => {
    const plan = (dans: string, paquets: string[]) =>
      sansTests({ copie: dans, racine: principal, paquets });
    for (const paquets of [['crates/app'], ['crates/outil'], ['.']]) {
      expect(plan(copie, paquets), paquets.join()).toBe(plan(saine, paquets));
    }
    expect(plan(copie, ['crates/app'])).toBe(false);
  });
});
