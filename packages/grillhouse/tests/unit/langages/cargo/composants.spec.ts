// grillhouse-pkl.3, criteria 2 to 5 — the crates of a workspace of cargo, read from `cargo
// metadata --no-deps --offline` (the fake cargo of ./faux-cargo.ts, first on the PATH): its
// members, a file's crate, the readers of a crate by its manifests, what the testwriter writes,
// the shared test material and the crates that play tests; grillhouse-ool: the part of a crate's
// manifest the testwriter writes, and its lock's judgment.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Langage } from '../../../../scripts/jointure.js';
import module from '../../../../scripts/langages/cargo/index.mjs';
import exemples from '../../../../scripts/langages/cargo/exemples.mjs';
import { refusal } from '../../../../scripts/verrous/verrou.mjs';
import { avecFauxCargo, installerFauxCargo } from './faux-cargo.js';

const cargo = module as unknown as Langage;

type Depots = Record<'espace' | 'seul' | 'imbrique' | 'vide', string>;
type Composant = { dossier: string; nom: string; paquet: string | null };

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'composants-cargo-'));
const JOURNAL = path.join(ESSAIS, 'journal');
let restaurer = () => {};
let d: Depots;
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), JOURNAL);
  d = (exemples.preparer(ESSAIS) as { depots: Depots }).depots;
});
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
afterAll(() => restaurer());

const noms = (l: Composant[]) => l.map(c => c.nom);

describe('grillhouse-pkl.3, critère 2 — les composants, les membres de cargo metadata', () => {
  it('a workspace of crates: each member, its folder the manifest’s, its name and package the crate’s', () => {
    const l = cargo.composants(d.espace) as Composant[];
    expect(l).toEqual(
      ['app', 'core', 'matiere', 'outil'].map(n => ({
        dossier: path.join(d.espace, 'crates', n),
        nom: `ws-${n}`,
        paquet: `ws-${n}`,
      }))
    );
    expect(readFileSync(JOURNAL, 'utf8')).toMatch(
      /^metadata --format-version 1 --no-deps --offline$/m
    );
  });

  it('a crate at the root alone, as OSC Bridge (members = ["."]): the root', () => {
    expect(cargo.composants(d.seul)).toEqual([{ dossier: d.seul, nom: 'seul', paquet: 'seul' }]);
  });

  it('a directory without Cargo.toml: none, cargo not asked', () => {
    const avant = readFileSync(JOURNAL, 'utf8');
    expect(cargo.composants(d.vide)).toEqual([]);
    expect(readFileSync(JOURNAL, 'utf8')).toBe(avant);
  });
});

describe('grillhouse-pkl.3, critère 3 — le crate d’un fichier, le plus long préfixe', () => {
  it('a file of a crate, of a crate inside another, out of every crate', () => {
    const de = (racine: string, f: string) =>
      (cargo.composantDe(racine, f) as Composant | null)?.nom ?? null;
    expect(de(d.espace, 'crates/core/src/lib.rs')).toBe('ws-core');
    expect(de(d.imbrique, 'crates/aide/src/lib.rs')).toBe('aide');
    expect(de(d.imbrique, 'src/lib.rs')).toBe('imbrique');
    // Out of every crate of a virtual workspace: its own manifest and lock, which touch every
    // crate (touches.spec.ts).
    expect(de(d.espace, 'Cargo.toml')).toBeNull();
    expect(de(d.espace, 'Cargo.lock')).toBeNull();
    // The workspace's files of a crate at the root are the root crate's.
    expect(de(d.seul, 'Cargo.lock')).toBe('seul');
  });
});

describe('grillhouse-pkl.3, critère 4 — les lecteurs d’un crate, par ses manifestes', () => {
  it('ws-app reads ws-core (normal), ws-outil reads it for its build (build), a name unknown has no provider', () => {
    const composants = cargo.composants(d.espace) as Composant[];
    const l = cargo.lecteurs(d.espace, {
      composants,
      noms: ['ws-core', 'ws-app', 'ws-absent'],
      texte: '',
      nommes: [],
    });
    const parNom = (n: string) => composants.find(c => c.nom === n);
    expect(l.elements).toEqual([
      {
        nom: 'ws-core',
        fournisseur: parNom('ws-core'),
        lecteurs: [
          { composant: parNom('ws-app'), par: ['normal'] },
          { composant: parNom('ws-outil'), par: ['build'] },
        ],
      },
      {
        nom: 'ws-app',
        fournisseur: parNom('ws-app'),
        lecteurs: [{ composant: parNom('ws-outil'), par: ['dev'] }],
      },
    ]);
    expect(l.sansFournisseur).toEqual(['ws-absent']);
    expect(l.types).toEqual({ etat: 'fait', raison: null, elements: [] });
    expect([...l.lit.get(parNom('ws-outil'))!].map(c => c.nom).sort()).toEqual([
      'ws-app',
      'ws-core',
    ]);
  });
});

describe('grillhouse-pkl.3, critère 5 — ce que le testwriter écrit, la matière, les crates qui jouent des tests', () => {
  it('one class per path: the test targets of tests/ played, tests/common/ material, src/ never a test', () => {
    const classe = (f: string) => cargo.estUnTest(f, d.espace);
    expect(classe('crates/core/tests/t.rs')).toEqual({ joue: true, test: true, matiere: false });
    expect(classe('crates/core/tests/common/mod.rs')).toEqual({
      joue: false,
      test: true,
      matiere: true,
    });
    expect(classe('crates/core/src/lib.rs')).toBeNull();
    // Cargo plays tests/<nom>.rs and tests/<dossier>/main.rs alone: the data of OSC Bridge's
    // tests/fixtures/devices/ is a test file it never plays.
    expect(classe('crates/core/tests/fixtures/devices/a.toml')).toEqual({
      joue: false,
      test: true,
      matiere: false,
    });
    expect(classe('crates/core/tests/fixtures/aide.rs')).toEqual({
      joue: false,
      test: true,
      matiere: false,
    });
    expect(classe('crates/core/tests/bout/main.rs')).toEqual({
      joue: true,
      test: true,
      matiere: false,
    });
    expect(classe(path.join(d.espace, 'crates/app/src/lib.rs'))).toBeNull();
    expect(classe('crates/matiere/src/lib.rs')).toEqual({
      joue: false,
      test: false,
      matiere: true,
    });
    expect(classe('README.md')).toBeNull();
    expect(cargo.estUnTest('tests/bout.rs', d.seul)).toEqual({
      joue: true,
      test: true,
      matiere: false,
    });
  });

  it('the shared material: the crates whose manifest says matiere = true', () => {
    expect(noms(cargo.matieres(d.espace) as Composant[])).toEqual(['ws-matiere']);
    expect(cargo.matieres(d.seul)).toEqual([]);
  });

  it('a crate plays tests when it has a folder tests/', () => {
    const joueurs = (r: string) =>
      noms((cargo.composants(r) as Composant[]).filter(c => cargo.joueDesTests(r, c)));
    expect(joueurs(d.espace)).toEqual(['ws-app', 'ws-core']);
    expect(joueurs(d.seul)).toEqual(['seul']);
    expect(joueurs(d.imbrique)).toEqual([]);
  });
});

// grillhouse-ool, criterion 1: the testwriter declares what his tests depend on, as the author of
// a test of Bazel the deps of its target: the tables [dev-dependencies] (and
// [target.*.dev-dependencies]) of the Cargo.toml of a crate, and Cargo.lock; any other table of
// the manifest stays the developpeur's, named in the refusal.
const MANIFESTE = [
  '[package]',
  'name = "ws-app"',
  'version = "0.1.0"',
  '',
  '[dependencies]',
  'ws-core = { path = "../core" }',
  '',
  '[dev-dependencies]',
  'ws-outil = { path = "../outil" }',
  '',
].join('\n');

// A virtual workspace of one crate, `crates/app`, that declares the language cargo.
function espaceDeManifeste() {
  const r = mkdtempSync(path.join(ESSAIS, 'manifeste-'));
  const ecrire = (rel: string, texte: string) => {
    mkdirSync(path.dirname(path.join(r, rel)), { recursive: true });
    writeFileSync(path.join(r, rel), texte);
  };
  ecrire('package.json', JSON.stringify({ name: 'm', grillhouse: { langages: ['cargo'] } }));
  ecrire('Cargo.toml', '[workspace]\nresolver = "2"\nmembers = ["crates/app"]\n');
  ecrire('Cargo.lock', 'version = 4\n');
  ecrire('crates/app/Cargo.toml', MANIFESTE);
  ecrire('crates/app/src/lib.rs', 'pub fn app() {}\n');
  return r;
}

const SCRATCH = { tmp: '/scratch' };

describe('grillhouse-ool, critère 1 — le testwriter écrit les [dev-dependencies] d’un crate', () => {
  it('the module names the tables of a crate’s manifest a change touches out of its tests', () => {
    const r = espaceDeManifeste();
    const hors = (apres: string) =>
      cargo.manifestes.horsDesTests('crates/app/Cargo.toml', r, MANIFESTE, apres);
    expect(hors(MANIFESTE.replace('"../outil" }', '"../outil" }\ntempfile = "3"'))).toEqual([]);
    expect(hors(`${MANIFESTE}\n[target.'cfg(unix)'.dev-dependencies]\nlibc = "0.2"\n`)).toEqual([]);
    expect(hors(MANIFESTE.replace('"../core" }', '"../core" }\ntempfile = "3"'))).toEqual([
      '[dependencies]',
    ]);
    expect(hors(MANIFESTE.replace('version = "0.1.0"', 'version = "0.2.0"'))).toEqual([
      '[package]',
    ]);
    expect(hors(`${MANIFESTE}\n[features]\nx = []\n`)).toEqual(['[features]']);
    expect(hors(`${MANIFESTE}\n[target.'cfg(unix)'.dependencies]\nlibc = "0.2"\n`)).toEqual([
      '[target.cfg(unix).dependencies]',
    ]);
  });

  it('the workspace’s Cargo.toml, of no crate, is no manifest of a component', () => {
    const r = espaceDeManifeste();
    expect(cargo.manifestes.horsDesTests('Cargo.toml', r, '', '[workspace]\n')).toBeNull();
    expect(cargo.manifestes.horsDesTests('crates/app/src/lib.rs', r, '', '')).toBeNull();
  });

  it('the lock file of the versions is Cargo.lock, at the root', () => {
    expect(cargo.manifestes.verrous).toEqual(['Cargo.lock']);
  });

  it('the lock lets the testwriter edit [dev-dependencies] and write Cargo.lock', () => {
    const r = espaceDeManifeste();
    const edit = {
      tool_name: 'Edit',
      tool_input: {
        file_path: path.join(r, 'crates/app/Cargo.toml'),
        old_string: 'ws-outil = { path = "../outil" }',
        new_string: 'ws-outil = { path = "../outil" }\ntempfile = "3"',
      },
      cwd: r,
    };
    expect(refusal('testwriter', edit, SCRATCH)).toBeNull();
    const verrou = {
      tool_name: 'Write',
      tool_input: { file_path: path.join(r, 'Cargo.lock'), content: 'version = 4\n# x\n' },
      cwd: r,
    };
    expect(refusal('testwriter', verrou, SCRATCH)).toBeNull();
  });

  it('the lock refuses the testwriter any other table, the path and the table named', () => {
    const r = espaceDeManifeste();
    const fichier = path.join(r, 'crates/app/Cargo.toml');
    const edit = (old_string: string, new_string: string) => ({
      tool_name: 'Edit',
      tool_input: { file_path: fichier, old_string, new_string },
      cwd: r,
    });
    const dependances = refusal(
      'testwriter',
      edit('ws-core = { path = "../core" }', 'ws-core = { path = "../core" }\ntempfile = "3"'),
      SCRATCH
    );
    expect(dependances).toContain(fichier);
    expect(dependances).toContain('[dependencies]');
    expect(
      refusal('testwriter', edit('version = "0.1.0"', 'version = "0.2.0"'), SCRATCH)
    ).toContain('[package]');
    const ecrit = {
      tool_name: 'Write',
      tool_input: { file_path: fichier, content: `${MANIFESTE}\n[features]\nx = []\n` },
      cwd: r,
    };
    expect(refusal('testwriter', ecrit, SCRATCH)).toContain('[features]');
  });

  it('the lock keeps refusing the testwriter the workspace’s Cargo.toml', () => {
    const r = espaceDeManifeste();
    const ecrit = {
      tool_name: 'Write',
      tool_input: { file_path: path.join(r, 'Cargo.toml'), content: '[workspace]\n' },
      cwd: r,
    };
    expect(refusal('testwriter', ecrit, SCRATCH)).toMatch(/seulement des fichiers de test/);
  });
});
