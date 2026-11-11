// grillhouse-wbk.1: the guard of the sizes of the tests in Rust (scripts/langages/cargo/
// tailles-des-tests.mjs), on the model of the test pyramid of Google and of Bazel's `size`, as the
// guards of the modules typescript and python. It classes each test file of a crate (a test target
// of `tests/`, a unit test file of `src/`) by a static reading of its text, of the modules it
// declares (`mod common;`) and of the crates of the shared test material it names: large, it
// mounts a trial repository and starts something else than git there; medium, it starts a
// process; small otherwise. A large test of the day is refused by its name (critère 1); a night
// test `tests/*_nuit.rs` or a time budget bench `tests/*_budget.rs` never is (critère 2); the debt
// inscribed passes and a new one is refused (critère 3, the update in
// ./migration.tailles-des-tests.spec.ts). The texts of the cases lie in tests/formes/tailles/cargo/,
// so that the module typescript's guard, reading this file, sees none of them.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { juger } from '../../../../scripts/dette.mjs';
import type { Langage } from '../../../../scripts/jointure.js';
import module from '../../../../scripts/langages/cargo/index.mjs';
import {
  classer,
  GARDE,
  GRAND_DE_JOUR,
  rapport,
  tailles,
  verifier,
} from '../../../../scripts/langages/cargo/tailles-des-tests.mjs';
import { avecFauxCargo, installerFauxCargo } from './faux-cargo.js';

const cargo = module as unknown as Langage;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tailles-cargo-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
let restaurer = () => {};
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), path.join(ESSAIS, 'journal'));
});
afterAll(() => restaurer());

const forme = (f: string) =>
  readFileSync(path.join(__dirname, '../../../formes/tailles/cargo', f), 'utf8');
const GRAND = forme('grand.txt');
const GIT_SEUL = forme('git-seul.txt');
const PROCESSUS = forme('processus.txt');
const ASSERT_CMD = forme('assert-cmd.txt');
const XSHELL = forme('xshell.txt');
const COMMUN = forme('commun.txt');
const PETIT = 'use app::f;\n\n#[test]\nfn un() {\n    assert_eq!(f(), 1);\n}\n';
const PAR_COMMUN =
  'mod common;\n\n#[test]\nfn bout() {\n    common::monter(std::path::Path::new("."));\n}\n';

// A crate of files held in memory, each path absolute under /r.
const R = '/r';
const memoire = (fichiers: Record<string, string>) => (f: string) =>
  fichiers[path.relative(R, f)] ?? null;
const tailleDe = (fichiers: Record<string, string>, test: string) =>
  classer(path.join(R, test), memoire(fichiers));

// A workspace of cargo whose crates are <crates> (`{ <nom>: { <fichier>: <texte> } }`, the files
// from the crate's folder), read by the fake cargo: `crates/<nom>`, package `ws-<nom>`.
function espace(crates: Record<string, Record<string, string>>, matiere: string[] = []) {
  const r = mkdtempSync(path.join(ESSAIS, 'espace-'));
  writeFileSync(path.join(r, 'Cargo.toml'), '[workspace]\nmembers = ["crates/*"]\n');
  for (const [nom, fichiers] of Object.entries(crates)) {
    const manifeste = `[package]\nname = "ws-${nom}"\n${matiere.includes(nom) ? '\n[package.metadata.grillhouse]\nmatiere = true\n' : ''}`;
    const tous = { 'Cargo.toml': manifeste, 'src/lib.rs': '', ...fichiers };
    for (const [f, t] of Object.entries(tous)) {
      const abs = path.join(r, 'crates', nom, f);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, t);
    }
  }
  return r;
}

describe('grillhouse-wbk.1 — the guard classes each Rust test by its size, from its text', () => {
  it('small: it starts no process', () => {
    expect(tailleDe({ 'tests/un.rs': PETIT }, 'tests/un.rs')).toBe('petit');
  });

  it('medium: it starts a process (std::process::Command) without a trial repository', () => {
    expect(tailleDe({ 'tests/aide.rs': PROCESSUS }, 'tests/aide.rs')).toBe('moyen');
  });

  it('medium: it mounts a trial repository with git alone, its worktree included', () => {
    expect(tailleDe({ 'tests/depot.rs': GIT_SEUL }, 'tests/depot.rs')).toBe('moyen');
  });

  it('large: it mounts a trial repository by git and starts a binary of the product there', () => {
    expect(tailleDe({ 'tests/bout.rs': GRAND }, 'tests/bout.rs')).toBe('grand');
  });

  it('large: git2’s Repository::init and assert_cmd’s cargo_bin', () => {
    expect(tailleDe({ 'tests/bout.rs': ASSERT_CMD }, 'tests/bout.rs')).toBe('grand');
  });

  it('large: xshell’s cmd!, a clone by git, then cargo', () => {
    expect(tailleDe({ 'tests/bout.rs': XSHELL }, 'tests/bout.rs')).toBe('grand');
  });

  it('large through the helpers it declares, `mod common;` (tests/common/mod.rs or tests/common.rs)', () => {
    const dossier = { 'tests/bout.rs': PAR_COMMUN, 'tests/common/mod.rs': COMMUN };
    expect(tailleDe(dossier, 'tests/bout.rs')).toBe('grand');
    const fichier = { 'tests/bout.rs': PAR_COMMUN, 'tests/common.rs': COMMUN };
    expect(tailleDe(fichier, 'tests/bout.rs')).toBe('grand');
    expect(tailleDe({ 'tests/bout.rs': PAR_COMMUN }, 'tests/bout.rs')).toBe('petit');
  });
});

describe('grillhouse-wbk.1 critères 1 et 2 — a large Rust test of the day is refused by its name, never a night test nor a bench', () => {
  it('critère 1: a large test target of the day, and a large unit test file, are findings by their name', () => {
    const r = espace({
      app: {
        'tests/bout.rs': GRAND,
        'tests/un.rs': PETIT,
        'src/lecture/tests.rs': GRAND,
      },
    });
    const constats = verifier(r) as { fichier: string; regle: string; message: string }[];
    expect(constats.map(c => [c.fichier, c.regle])).toEqual([
      ['crates/app/src/lecture/tests.rs', GRAND_DE_JOUR],
      ['crates/app/tests/bout.rs', GRAND_DE_JOUR],
    ]);
    expect(constats[1]?.message).toMatch(/^crates\/app\/tests\/bout\.rs : un grand test/);
    expect(constats[1]?.message).toMatch(/tests\/it_nuit\//);
  });

  it('critère 2: a large night test tests/*_nuit.rs, or a time budget bench tests/*_budget.rs, is no finding', () => {
    const r = espace({
      app: { 'tests/bout_nuit.rs': GRAND, 'tests/recherche_budget.rs': GRAND },
    });
    expect(verifier(r)).toEqual([]);
    const t = tailles(r) as { fichier: string; taille: string; nuit: boolean }[];
    expect(t.map(x => [x.fichier, x.taille, x.nuit])).toEqual([
      ['crates/app/tests/bout_nuit.rs', 'grand', true],
      ['crates/app/tests/recherche_budget.rs', 'grand', true],
    ]);
  });

  it('critère 1: large through a crate of the shared test material it names', () => {
    const r = espace(
      {
        app: { 'tests/bout.rs': 'use ws_essai::monter;\n\n#[test]\nfn bout() {}\n' },
        essai: { 'src/lib.rs': COMMUN },
      },
      ['essai']
    );
    const constats = verifier(r) as { fichier: string }[];
    expect(constats.map(c => c.fichier)).toEqual(['crates/app/tests/bout.rs']);
  });

  it('the command `grillhouse tailles-des-tests` of the module cargo refuses it, and counts each size', () => {
    const r = espace({
      app: {
        'tests/bout.rs': GRAND,
        'tests/bout_nuit.rs': GRAND,
        'tests/aide.rs': PROCESSUS,
        'tests/un.rs': PETIT,
      },
    });
    // The module cargo's script, by its whole path (the modules typescript and python have one of
    // the same name).
    const script = path.resolve(
      __dirname,
      '../../../../scripts/langages/cargo/tailles-des-tests.mjs'
    );
    expect(cargo.commandes(r)['tailles-des-tests']).toEqual({ script, args: [] });
    expect(cargo.gardes(r).map(([s]) => s)).toContain(script);
    const { lignes, code } = rapport(r, {});
    const texte = lignes.join('\n');
    expect(code).toBe(1);
    expect(texte).toMatch(/crates\/app\/tests\/bout\.rs : un grand test/);
    expect(texte).not.toMatch(/bout_nuit\.rs : un grand test/);
    expect(texte).toMatch(
      /4 fichier\(s\) de tests, 1 petit\(s\), 1 moyen\(s\), 2 grand\(s\) ; 1 de nuit ou de banc/
    );
  });
});

describe('grillhouse-wbk.1 critère 3 — the debt inscribed passes, a new large test of the day is refused', () => {
  it('critère 3: under its own section of the debt, apart from the module typescript’s', () => {
    expect(GARDE).toBe('tailles-des-tests-cargo');
    const r = espace({ app: { 'tests/bout.rs': GRAND } });
    const dette = { [GARDE]: { 'crates/app/tests/bout.rs': { [GRAND_DE_JOUR]: { count: 1 } } } };
    expect(juger(dette, GARDE, verifier(r)).refus).toEqual([]);
    writeFileSync(path.join(r, 'crates/app/tests/neuf.rs'), GRAND);
    const { refus } = juger(dette, GARDE, verifier(r)) as { refus: { fichier: string }[] };
    expect(refus.map(c => c.fichier)).toEqual(['crates/app/tests/neuf.rs']);
  });
});

describe('each module of tests of tests/it/main.rs is classed apart, never the whole executable', () => {
  const MAIN = 'mod un;\nmod bout;\nmod par_commun;\n#[path = "../common/mod.rs"]\nmod common;\n';
  const PAR_CRATE =
    '#[test]\nfn bout() {\n    crate::common::monter(std::path::Path::new("."));\n}\n';
  const fichiersRefuses = (r: string) => (verifier(r) as { fichier: string }[]).map(c => c.fichier);
  const tailleParFichier = (r: string) =>
    (tailles(r) as { fichier: string; taille: string; nuit: boolean }[]).map(x => [
      x.fichier,
      x.taille,
      x.nuit,
    ]);

  it('a large module is a finding by its name; a small module, and the root without a test, are not', () => {
    const r = espace({
      app: {
        'tests/it/main.rs': MAIN,
        'tests/it/un.rs': PETIT,
        'tests/it/bout.rs': GRAND,
        'tests/it/par_commun.rs': PETIT,
        'tests/common/mod.rs': COMMUN,
      },
    });
    expect(fichiersRefuses(r)).toEqual(['crates/app/tests/it/bout.rs']);
    expect(tailleParFichier(r)).toEqual([
      ['crates/app/tests/it/bout.rs', 'grand', false],
      ['crates/app/tests/it/par_commun.rs', 'petit', false],
      ['crates/app/tests/it/un.rs', 'petit', false],
    ]);
  });

  it('a module reads a helper of the root only when it names it', () => {
    const r = espace({
      app: {
        'tests/it/main.rs': MAIN,
        'tests/it/un.rs': PETIT,
        'tests/it/bout.rs': PETIT,
        'tests/it/par_commun.rs': PAR_CRATE,
        'tests/common/mod.rs': COMMUN,
      },
    });
    expect(fichiersRefuses(r)).toEqual(['crates/app/tests/it/par_commun.rs']);
  });

  it('a module of a submodule is read with it, and the root’s own test is classed alone', () => {
    const r = espace({
      app: {
        'tests/it/main.rs': `mod un;\n${PETIT}`,
        'tests/it/un.rs': 'mod sous;\n',
        'tests/it/un/sous.rs': GRAND,
      },
    });
    expect(tailleParFichier(r)).toEqual([
      ['crates/app/tests/it/main.rs', 'petit', false],
      ['crates/app/tests/it/un.rs', 'grand', false],
    ]);
  });

  it('the modules of tests/it_nuit/main.rs are night tests, never a finding', () => {
    const r = espace({
      app: { 'tests/it_nuit/main.rs': 'mod bout;\n', 'tests/it_nuit/bout.rs': GRAND },
    });
    expect(verifier(r)).toEqual([]);
    expect(tailleParFichier(r)).toEqual([['crates/app/tests/it_nuit/bout.rs', 'grand', true]]);
  });
});
