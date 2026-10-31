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
    expect([...l.lit.get(parNom('ws-outil')!)!].map(c => c.nom).sort()).toEqual([
      'ws-app',
      'ws-core',
    ]);
  });
});

describe('grillhouse-pkl.3, critère 5 — ce que le testwriter écrit, la matière, les crates qui jouent des tests', () => {
  it('one class per path: the test targets of tests/ played, tests/common/ material, the code of src/ never a test', () => {
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
    // A file of code of src/ is judged by its test module (grillhouse-agr, criterion 3).
    expect(cargo.manifestes.horsDesTests('crates/app/src/lib.rs', r, '', '')).toEqual([]);
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

// grillhouse-agr, criterion 1: the unit tests of a crate live in a file of their own near their
// module, under src/, as rustc's tidy check wants them: a file tests.rs, or a file of a folder
// tests/, declared by the code `#[cfg(test)] mod tests;`. The testwriter writes them, and the
// developpeur none of them; any other file of src/ stays the developpeur's.
describe('grillhouse-agr, critère 1 — les tests unitaires dans tests.rs près de leur module', () => {
  it('tests.rs under src/, and a file of a folder tests/ under src/, are test files', () => {
    const classe = (f: string) => cargo.estUnTest(f, d.espace);
    const joue = { joue: true, test: true, matiere: false };
    expect(classe('crates/core/src/tests.rs')).toEqual(joue);
    expect(classe('crates/core/src/server/tests.rs')).toEqual(joue);
    expect(classe('crates/core/src/tests/mod.rs')).toEqual(joue);
    expect(classe('crates/core/src/server/tests/relais.rs')).toEqual(joue);
    expect(classe('crates/core/src/server/tests/donnees/a.json')).toEqual({
      joue: false,
      test: true,
      matiere: false,
    });
    expect(classe('crates/core/src/server.rs')).toBeNull();
    expect(classe('crates/core/src/server/mod.rs')).toBeNull();
    expect(classe('crates/core/src/tests_aide.rs')).toBeNull();
    expect(classe('crates/core/src/tests')).toBeNull();
    // src/bin/tests.rs and src/bin/tests/main.rs are binary targets for cargo, code; a module
    // tests of the binary outil is a unit test.
    expect(classe('crates/core/src/bin/tests.rs')).toBeNull();
    expect(classe('crates/core/src/bin/tests/main.rs')).toBeNull();
    expect(classe('crates/core/src/bin/outil/tests.rs')).toEqual(joue);
  });

  // The verdict ties a unit test to its file by its module path, so that the proof of the red
  // finds the result of a new tests.rs: `server::tests::relais` of the library, whose root is
  // src/lib.rs, lies in src/server/tests.rs; a test of an inline module stays the library's.
  it('the verdict ties a unit test to its tests.rs or its file of a folder tests/', () => {
    const r = mkdtempSync(path.join(ESSAIS, 'verdict-'));
    const ecrire = (rel: string, texte: string) => {
      mkdirSync(path.dirname(path.join(r, rel)), { recursive: true });
      writeFileSync(path.join(r, rel), texte);
    };
    for (const f of [
      'src/lib.rs',
      'src/server.rs',
      'src/server/tests.rs',
      'src/a/b/tests/mod.rs',
      'src/a/b/tests/relais.rs',
      'src/bin/outil/main.rs',
      'src/bin/outil/tests.rs',
    ]) {
      ecrire(`crates/svc/${f}`, '\n');
    }
    const src = (f: string) => path.join(r, 'crates/svc', f);
    ecrire(
      'resultats/cargo/1.json',
      JSON.stringify({
        taches: [],
        cibles: { svc: src('src/lib.rs'), 'svc::bin/outil': src('src/bin/outil/main.rs') },
      })
    );
    const cas = (nom: string, echec = false) =>
      `<testcase name="${nom}">${echec ? '<failure message="rouge"/>' : ''}</testcase>`;
    ecrire(
      'resultats/nextest/1-svc.xml',
      `<?xml version="1.0"?><testsuites><testsuite name="svc">${[
        cas('server::tests::relais', true),
        cas('a::b::tests::direct'),
        cas('a::b::tests::relais::un'),
        cas('server::inline::tests::x'),
        cas('racine'),
      ].join(
        ''
      )}</testsuite><testsuite name="svc::bin/outil">${cas('tests::o')}</testsuite></testsuites>`
    );
    const v = cargo.verdict(path.join(r, 'resultats'));
    const parFichier = Object.fromEntries(
      v.rapports.map(x => [
        path.relative(path.join(r, 'crates/svc'), x.fichier),
        [x.etat, x.tests.map(t => t.nom)],
      ])
    );
    expect(parFichier).toEqual({
      'src/server/tests.rs': ['failed', ['server::tests::relais']],
      'src/a/b/tests/mod.rs': ['passed', ['a::b::tests::direct']],
      'src/a/b/tests/relais.rs': ['passed', ['a::b::tests::relais::un']],
      'src/lib.rs': ['passed', ['server::inline::tests::x', 'racine']],
      'src/bin/outil/tests.rs': ['passed', ['tests::o']],
    });
  });

  // A virtual workspace of one crate without a folder tests/, its unit tests in
  // src/server/tests.rs.
  function espaceUnitaire() {
    const r = mkdtempSync(path.join(ESSAIS, 'unitaire-'));
    const ecrire = (rel: string, texte: string) => {
      mkdirSync(path.dirname(path.join(r, rel)), { recursive: true });
      writeFileSync(path.join(r, rel), texte);
    };
    ecrire('package.json', JSON.stringify({ name: 'u', grillhouse: { langages: ['cargo'] } }));
    ecrire('Cargo.toml', '[workspace]\nresolver = "2"\nmembers = ["crates/service"]\n');
    ecrire('Cargo.lock', 'version = 4\n');
    ecrire('crates/service/Cargo.toml', '[package]\nname = "service"\nversion = "0.1.0"\n');
    ecrire('crates/service/src/lib.rs', 'mod server;\n');
    ecrire('crates/service/src/server.rs', '#[cfg(test)]\nmod tests;\n');
    ecrire('crates/service/src/server/tests.rs', '#[test]\nfn relais() {}\n');
    return r;
  }

  it('a crate whose unit tests live under src/ plays tests', () => {
    const r = espaceUnitaire();
    const service = (cargo.composants(r) as Composant[])[0]!;
    expect(cargo.joueDesTests(r, service)).toBe(true);
  });

  it('the lock lets the testwriter write them, refuses him the code, refuses them to the developpeur', () => {
    const r = espaceUnitaire();
    const ecrire = (fichier: string) => ({
      tool_name: 'Write',
      tool_input: { file_path: path.join(r, fichier), content: '#[test]\nfn relais() {}\n' },
      cwd: r,
    });
    expect(refusal('testwriter', ecrire('crates/service/src/server/tests.rs'), SCRATCH)).toBeNull();
    expect(
      refusal('testwriter', ecrire('crates/service/src/server/tests/relais.rs'), SCRATCH)
    ).toBeNull();
    expect(refusal('testwriter', ecrire('crates/service/src/server.rs'), SCRATCH)).toMatch(
      /seulement des fichiers de test/
    );
    expect(refusal('developpeur', ecrire('crates/service/src/server/tests.rs'), SCRATCH)).toMatch(
      /Les tests appartiennent au testwriter/
    );
  });
});

// grillhouse-agr, criterion 3: of a file of code of src/, the testwriter writes the test module
// alone, as he writes the [dev-dependencies] of a manifest: he adds or removes the declaration
// `#[cfg(test)] mod tests;`, and removes an inline `#[cfg(test)] mod tests { … }` he moves into
// tests.rs; any other change of the file is refused, the part named.
const CODE = ['pub fn hosted_in(x: u8) -> bool {', '    x > 0', '}', ''].join('\n');
const EN_LIGNE = [
  CODE,
  '#[cfg(test)]',
  'mod tests {',
  '    use super::*;',
  '',
  '    #[test]',
  '    fn relais() {',
  '        assert!(hosted_in(1), "{}", \'}\');',
  '    }',
  '}',
  '',
].join('\n');
const DECLARE = `${CODE}\n#[cfg(test)]\nmod tests;\n`;

describe('grillhouse-agr, critère 3 — le testwriter écrit seulement le module de test d’un fichier de code', () => {
  const fichier = 'crates/core/src/server.rs';
  const hors = (avant: string | null, apres: string) =>
    cargo.manifestes.horsDesTests(fichier, d.espace, avant, apres);

  it('the declaration added or removed, an inline test module removed: nothing out of the tests', () => {
    expect(hors(CODE, DECLARE)).toEqual([]);
    expect(hors(DECLARE, CODE)).toEqual([]);
    expect(hors(EN_LIGNE, DECLARE)).toEqual([]);
    expect(hors(EN_LIGNE, CODE)).toEqual([]);
    expect(hors(CODE, `${CODE}\n#[cfg(test)] mod tests;\n`)).toEqual([]);
  });

  it('any other change is named: the code, an inline test module added or changed, a new file', () => {
    const code = hors(CODE, CODE.replace('x > 0', 'x > 1'));
    expect(code).toHaveLength(1);
    expect(code![0]).toMatch(/code hors du module de test/);
    expect(code![0]).toContain('x > 1');
    expect(hors(CODE, EN_LIGNE)![0]).toMatch(/module de test en ligne/);
    expect(hors(EN_LIGNE, EN_LIGNE.replace('hosted_in(1)', 'hosted_in(2)'))![0]).toMatch(
      /module de test en ligne/
    );
    expect(hors(DECLARE, `${DECLARE}pub fn autre() {}\n`)![0]).toContain('pub fn autre() {}');
    expect(hors(null, DECLARE)![0]).toMatch(/code hors du module de test/);
  });

  it('the lines compare as they are: a blank line removed is code', () => {
    const avant = `${CODE}\npub fn b() {}\n`;
    expect(hors(avant, `${CODE}pub fn b() {}\n`)![0]).toMatch(/code hors du module de test/);
    expect(hors(CODE, CODE.replace('    x > 0', '    x > 0 '))![0]).toMatch(/code hors/);
  });

  it('other attributes between #[cfg(test)] and mod tests { are the module’s', () => {
    const avec = EN_LIGNE.replace('mod tests {', '#[allow(dead_code)]\nmod tests {');
    expect(hors(avec, DECLARE)).toEqual([]);
  });

  // An inline test module followed by code: moving it into tests.rs passes, and removing the code
  // that follows with it is refused, whatever the module holds. Each case, a lexeme whose braces
  // or quotes do not count.
  const SUITE = '\npub fn suite() -> u8 {\n    1\n}\n';
  const cas: Record<string, string> = {
    'a raw string': '        let s = r#"a"{"#;',
    'a raw string without hash, its backslash plain': '        let s = r"C:\\";',
    'a raw string of many hashes': '        let s = r##"a"#{"##;',
    'a byte raw string': '        let s = br#"{"#;',
    'a byte string': '        let s = b"{";',
    'a character': "        let c = '{';",
    'a byte': "        let c = b'{';",
    'an escaped quote character': "        let c = '\\'';",
    'a unicode character': "        let c = '\\u{7B}';",
    'a lifetime': "        fn f<'a>(x: &'a str) -> &'a str { x }",
    'a nested comment': '        /* a /* b */ { */',
    'a line comment': '        // {',
    'a string with an escaped quote': '        let s = "\\"{";',
  };
  for (const [nom, ligne] of Object.entries(cas)) {
    it(`an inline test module with ${nom}: moved, and the code after it kept`, () => {
      const module = ['#[cfg(test)]', 'mod tests {', ligne, '}', ''].join('\n');
      const avant = `${CODE}\n${module}${SUITE}`;
      expect(hors(avant, `${CODE}\n#[cfg(test)]\nmod tests;\n${SUITE}`)).toEqual([]);
      expect(hors(avant, DECLARE)![0]).toContain('pub fn suite() -> u8 {');
    });
  }

  it('SyntHub’s pages.rs, reduced to its pattern: the move passes', () => {
    const module = [
      '#[cfg(test)]',
      'mod tests {',
      '    fn stub() {',
      '        std::fs::write(root.join("pages/worker.py"), r#"',
      'for line in sys.stdin:',
      '    print(json.dumps({"version": req["version"]}), flush=True)',
      '"#).unwrap();',
      '    }',
      '    fn catalogue() {',
      '        std::fs::write(path, r#"{"device": {"name": "X"}}"#).unwrap();',
      "        let id = rest.strip_suffix('/').unwrap_or(rest);",
      '    }',
      '}',
      '',
    ].join('\n');
    const avant = `${CODE}\n${module}${SUITE}`;
    expect(hors(avant, `${CODE}\n#[cfg(test)]\nmod tests;\n${SUITE}`)).toEqual([]);
    expect(hors(avant, DECLARE)![0]).toContain('pub fn suite() -> u8 {');
  });

  it('a file that is no code of src/ of a crate is no file the module judges', () => {
    expect(
      cargo.manifestes.horsDesTests('crates/core/build.rs', d.espace, CODE, DECLARE)
    ).toBeNull();
    expect(cargo.manifestes.horsDesTests('src/lib.rs', d.espace, CODE, DECLARE)).toBeNull();
    expect(
      cargo.manifestes.horsDesTests('crates/core/src/notes.md', d.espace, CODE, DECLARE)
    ).toBeNull();
  });

  it('the lock lets the testwriter move an inline test module, refuses him the code, the part named', () => {
    const r = mkdtempSync(path.join(ESSAIS, 'code-'));
    const ecrire = (rel: string, texte: string) => {
      mkdirSync(path.dirname(path.join(r, rel)), { recursive: true });
      writeFileSync(path.join(r, rel), texte);
    };
    ecrire('package.json', JSON.stringify({ name: 'c', grillhouse: { langages: ['cargo'] } }));
    ecrire('Cargo.toml', '[workspace]\nresolver = "2"\nmembers = ["crates/service"]\n');
    ecrire('Cargo.lock', 'version = 4\n');
    ecrire('crates/service/Cargo.toml', '[package]\nname = "service"\nversion = "0.1.0"\n');
    ecrire('crates/service/src/lib.rs', 'mod server;\n');
    ecrire('crates/service/src/server.rs', EN_LIGNE);
    const server = path.join(r, 'crates/service/src/server.rs');
    const edit = (old_string: string, new_string: string) => ({
      tool_name: 'Edit',
      tool_input: { file_path: server, old_string, new_string },
      cwd: r,
    });
    const deplace = edit(EN_LIGNE.slice(CODE.length), '\n#[cfg(test)]\nmod tests;\n');
    expect(refusal('testwriter', deplace, SCRATCH)).toBeNull();
    const code = refusal('testwriter', edit('x > 0', 'x > 1'), SCRATCH);
    expect(code).toContain(server);
    expect(code).toMatch(/code hors du module de test/);
    expect(code).toMatch(/revient au développeur/);
  });
});
