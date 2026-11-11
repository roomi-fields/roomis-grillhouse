// A crate's one executable of integration tests, `tests/it/main.rs`, holds each test file as a
// module (scripts/langages/cargo/executables-de-tests.mjs). The proof of the red reads each test
// under its own file: the verdict (scripts/langages/cargo/verdict.mjs) gives a test `foo::bar` of
// the executable to the file of its module, `tests/it/foo.rs` or `tests/it/foo/mod.rs`, as it gives
// a unit test to its `tests.rs`; and the names of HEAD's version of a file of the executable
// (`testsDeHead`, scripts/langages/cargo/composants.mjs) are those of that file alone, as the
// verdict gives them.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Langage } from '../../../../scripts/jointure.js';
import module from '../../../../scripts/langages/cargo/index.mjs';
import { verdict } from '../../../../scripts/langages/cargo/verdict.mjs';
import { avecFauxCargo, installerFauxCargo } from './faux-cargo.js';

const cargo = module as unknown as Langage;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'modules-de-tests-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
let restaurer = () => {};
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), path.join(ESSAIS, 'journal'));
});
afterAll(() => restaurer());

// A crate `seul` at the root of a folder, its files <fichiers> (from the root).
function crate(fichiers: Record<string, string>) {
  const r = mkdtempSync(path.join(ESSAIS, 'crate-'));
  const tous = { 'Cargo.toml': '[package]\nname = "seul"\n', 'src/lib.rs': '', ...fichiers };
  for (const [f, t] of Object.entries(tous)) {
    mkdirSync(path.dirname(path.join(r, f)), { recursive: true });
    writeFileSync(path.join(r, f), t);
  }
  return r;
}

type Rapport = { fichier: string; etat: string; tests: { nom: string }[] };

// The verdict of a run whose JUnit report gives the binary `seul::<cible>` of the crate at <r>,
// rooted at its file <racine>, the tests <noms>, the first failed: each report's file from <r>,
// its state and its tests' names.
function verdictDe(r: string, racine: string, cible: string, noms: string[]) {
  const dossier = mkdtempSync(path.join(ESSAIS, 'resultats-'));
  mkdirSync(path.join(dossier, 'cargo'));
  mkdirSync(path.join(dossier, 'nextest'));
  writeFileSync(
    path.join(dossier, 'cargo/run.json'),
    JSON.stringify({ taches: [], cibles: { [`seul::${cible}`]: path.join(r, racine) } })
  );
  const cas = noms.map((n, i) =>
    i === 0
      ? `<testcase name="${n}"><failure message="non"/></testcase>`
      : `<testcase name="${n}"/>`
  );
  writeFileSync(
    path.join(dossier, 'nextest/run-seul.xml'),
    `<testsuites><testsuite name="seul::${cible}">${cas.join('')}</testsuite></testsuites>`
  );
  const { rapports } = verdict(dossier) as { rapports: Rapport[] };
  return rapports.map(x => [path.relative(r, x.fichier), x.etat, x.tests.map(t => t.nom)]);
}

describe('the verdict gives each test of tests/it/main.rs to the file of its module', () => {
  it('a test of a module goes to tests/it/<module>.rs or its mod.rs, a test of the root to main.rs', () => {
    const r = crate({
      'tests/it/main.rs': 'mod foo;\nmod bar;\n#[test]\nfn racine() {}\n',
      'tests/it/foo.rs': '',
      'tests/it/bar/mod.rs': '',
    });
    expect(verdictDe(r, 'tests/it/main.rs', 'it', ['foo::un', 'bar::deux', 'racine'])).toEqual([
      ['tests/it/main.rs', 'passed', ['racine']],
      ['tests/it/foo.rs', 'failed', ['foo::un']],
      ['tests/it/bar/mod.rs', 'passed', ['bar::deux']],
    ]);
  });

  it('a test of a submodule goes to the deepest file that exists, an inline module to its file', () => {
    const r = crate({
      'tests/it/main.rs': 'mod foo;\n',
      'tests/it/foo.rs': 'mod sous;\nmod dedans { }\n',
      'tests/it/foo/sous.rs': '',
    });
    expect(verdictDe(r, 'tests/it/main.rs', 'it', ['foo::sous::a', 'foo::dedans::b'])).toEqual([
      ['tests/it/foo/sous.rs', 'failed', ['foo::sous::a']],
      ['tests/it/foo.rs', 'passed', ['foo::dedans::b']],
    ]);
  });

  it('a target tests/<nom>.rs keeps every test under its own file', () => {
    const r = crate({ 'tests/seul.rs': 'mod foo;\n', 'tests/foo.rs': '' });
    expect(verdictDe(r, 'tests/seul.rs', 'seul', ['foo::un', 'deux'])).toEqual([
      ['tests/seul.rs', 'failed', ['foo::un', 'deux']],
    ]);
  });
});

describe('the names of HEAD’s version of a file of tests/it/main.rs are that file’s alone', () => {
  const r = crate({
    'tests/it/main.rs': 'mod foo;\n',
    'tests/it/foo.rs': '#[test]\nfn un() {}\n',
    'tests/it/foo/sous.rs': '#[test]\nfn deux() {}\n',
    'tests/it/bar/mod.rs': '#[test]\nfn trois() {}\n',
  });
  const head: Record<string, string> = {
    'tests/it/main.rs':
      'mod foo;\nmod bar;\n#[test]\nfn racine() {}\nmod m {\n    #[test]\n    fn dedans() {}\n}\n',
    'tests/it/foo.rs': 'mod sous;\n#[test]\nfn un() {}\n',
    'tests/it/foo/sous.rs': '#[test]\nfn deux() {}\n',
    'tests/it/bar/mod.rs': '#[test]\nfn trois() {}\n',
  };
  const lire = (f: string) => head[f] ?? null;

  it.each([
    ['tests/it/main.rs', ['racine', 'm::dedans']],
    ['tests/it/foo.rs', ['foo::un']],
    ['tests/it/foo/sous.rs', ['foo::sous::deux']],
    ['tests/it/bar/mod.rs', ['bar::trois']],
  ])('%s gives %j', (f, noms) => {
    expect(cargo.testsDeHead(f, r, lire)).toEqual(noms);
  });

  it('a file HEAD does not hold gives none', () => {
    expect(cargo.testsDeHead('tests/it/neuf.rs', r, lire)).toBeNull();
  });
});
