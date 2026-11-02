// grillhouse-3e2 — the proof of the red plays HEAD's version of each test file of the lot beside it,
// in the same run, under the name the module of its language gives (`soeurDAvant`, scripts/
// jointure.d.ts), whatever the language. Witness: SyntHub SH-cgi.15 (2026-11-02), where the proof
// of crates/service/tests/electra_reimport.rs, a file HEAD holds, said « fichier neuf, que HEAD ne
// tient pas » and refused 20 existing greens: the name of HEAD's version was built by an
// expression that knew the names of JavaScript alone.
//
// `avecLesVersionsDAvant(ctx, fichiers, jouer)` writes HEAD's version of each file of <fichiers>
// that HEAD holds beside it, calls <jouer> with the map file → sibling, and removes the siblings
// after it, red included. Against the fake cargo (./langages/cargo/faux-cargo.ts), which reads
// the targets from the manifests as cargo does.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as circuit from '../../scripts/circuit.mjs';
import moduleCargo from '../../scripts/langages/cargo/index.mjs';
import modulePython from '../../scripts/langages/python/index.mjs';
import { avecFauxCargo, installerFauxCargo } from './langages/cargo/faux-cargo.js';

const avecLesVersionsDAvant = circuit.avecLesVersionsDAvant as (
  ctx: { copie: string },
  fichiers: string[],
  jouer: (avant: Map<string, string>, lus: Map<string, string[]>) => unknown
) => unknown;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'versions-d-avant-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

let restaurer: () => void = () => {};
beforeAll(() => {
  restaurer = avecFauxCargo(installerFauxCargo(ESSAIS), path.join(ESSAIS, 'journal'));
});
afterAll(() => restaurer());

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const git = (racine: string, ...args: string[]) => {
  const r = spawnSync('git', ['-C', racine, ...args], { encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(0);
};

// A repository of one language whose files <fichiers> HEAD holds, then the test file <modifie>
// changed by the lot and the test file <neuf> added by it.
function depot(
  langages: Record<string, string>,
  fichiers: Record<string, string>,
  modifie: string,
  neuf: string
) {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  declarerLesLangages(racine, langages);
  for (const [f, texte] of Object.entries(fichiers)) {
    ecrire(racine, f, texte);
  }
  git(racine, 'init', '-q');
  git(racine, 'add', '-A');
  git(racine, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'HEAD');
  ecrire(racine, modifie, `${fichiers[modifie]}// le lot\n`);
  ecrire(racine, neuf, 'neuf\n');
  return racine;
}

const CARGO = {
  'Cargo.toml': '[workspace]\nmembers = ["crates/service"]\nresolver = "2"\n',
  'crates/service/Cargo.toml': '[package]\nname = "service"\nversion = "0.1.0"\nedition = "2021"\n',
  'crates/service/src/lib.rs': 'pub fn un() -> i32 { 1 }\n',
  'crates/service/tests/electra_reimport.rs': '#[test]\nfn ancien() {}\n',
  'crates/service/tests/drivers_budget.rs': '#[test]\nfn vite() {}\n',
  'crates/service/src/server/tests.rs':
    '#[test]\nfn ancien() {}\nmod groupe {\n    #[test]\n    fn interne() {}\n}\n',
  'crates/service/tests/scenario/main.rs': 'mod aide;\n#[test]\nfn principal() {}\n',
  'crates/service/tests/scenario/aide.rs': '#[test]\nfn aidant() {}\n',
};
const PYTHON = {
  'package.json': JSON.stringify({ name: 'p', private: true }),
  'site/pyproject.toml': '[project]\nname = "site"\nversion = "0.1.0"\n',
  'site/tests/test_pages.py': 'def test_ancien():\n    assert True\n',
  'site/tests/forme_test.py': 'def test_forme():\n    assert True\n',
  'site/tests/site_nuit_test.py': 'def test_tout():\n    assert True\n',
};
const TYPESCRIPT = {
  'package.json': JSON.stringify({ name: 'p', private: true, workspaces: ['packages/*'] }),
  'packages/a/package.json': JSON.stringify({ name: '@e/a' }),
  'packages/a/src/index.ts': 'export const a = 1;\n',
  'packages/a/test/ancien.test.ts': "import { it } from 'vitest';\nit('ancien', () => {});\n",
  'packages/a/test/vitesse.budget.test.ts': "import { it } from 'vitest';\nit('vite', () => {});\n",
};

// Each language: its declaration, the files HEAD holds, the file the lot changes and its expected
// sibling, the file the lot adds.
const LANGAGES: [string, Record<string, string>, Record<string, string>, string, string, string][] =
  [
    [
      'cargo',
      { 'crates/service': 'cargo' },
      CARGO,
      'crates/service/tests/electra_reimport.rs',
      'crates/service/tests/electra_reimport_circuit_avant.rs',
      'crates/service/tests/neuf.rs',
    ],
    [
      'python, test_*.py',
      { site: 'python' },
      PYTHON,
      'site/tests/test_pages.py',
      'site/tests/test_pages_circuit_avant.py',
      'site/tests/test_neuf.py',
    ],
    [
      'python, *_test.py',
      { site: 'python' },
      PYTHON,
      'site/tests/forme_test.py',
      'site/tests/forme_circuit_avant_test.py',
      'site/tests/neuf_test.py',
    ],
    [
      'typescript',
      { 'packages/a': 'typescript' },
      TYPESCRIPT,
      'packages/a/test/ancien.test.ts',
      'packages/a/test/ancien.circuit-avant.test.ts',
      'packages/a/test/neuf.test.ts',
    ],
    // The reviewer of grillhouse-3e2: a bench or a night test keeps its class in its sibling, so
    // that the sibling plays as its file (a bench alone, on one thread; a night test out of the day).
    [
      'cargo, a bench',
      { 'crates/service': 'cargo' },
      CARGO,
      'crates/service/tests/drivers_budget.rs',
      'crates/service/tests/drivers_circuit_avant_budget.rs',
      'crates/service/tests/neuf_budget.rs',
    ],
    [
      'python, a night test',
      { site: 'python' },
      PYTHON,
      'site/tests/site_nuit_test.py',
      'site/tests/site_circuit_avant_nuit_test.py',
      'site/tests/neuf_nuit_test.py',
    ],
    [
      'typescript, a bench',
      { 'packages/a': 'typescript' },
      TYPESCRIPT,
      'packages/a/test/vitesse.budget.test.ts',
      'packages/a/test/vitesse.circuit-avant.budget.test.ts',
      'packages/a/test/neuf.budget.test.ts',
    ],
  ];

describe('grillhouse-3e2 — HEAD’s version of a test file plays beside it, in every language', () => {
  it.each(LANGAGES)(
    'criteria 1 to 3 (%s): a test file HEAD holds has its sibling, HEAD’s text, a new file none',
    (_nom, langages, fichiers, modifie, soeur, neuf) => {
      const racine = depot(langages, fichiers, modifie, neuf);
      let vu: [string, string][] = [];
      let texte = '';
      avecLesVersionsDAvant({ copie: racine }, [modifie, neuf], avant => {
        vu = [...avant];
        texte = readFileSync(path.join(racine, soeur), 'utf8');
      });
      expect(vu).toEqual([[modifie, soeur]]);
      expect(texte).toBe(fichiers[modifie]);
    }
  );

  it.each(LANGAGES)(
    'criterion 4 (%s): the sibling is removed after the run, a red included',
    (_nom, langages, fichiers, modifie, soeur, neuf) => {
      const racine = depot(langages, fichiers, modifie, neuf);
      avecLesVersionsDAvant({ copie: racine }, [modifie], () => 'vert');
      expect(existsSync(path.join(racine, soeur))).toBe(false);
      expect(() =>
        avecLesVersionsDAvant({ copie: racine }, [modifie], () => {
          expect(existsSync(path.join(racine, soeur))).toBe(true);
          throw new Error('rouge');
        })
      ).toThrow('rouge');
      expect(existsSync(path.join(racine, soeur))).toBe(false);
      // The lot's own files are left as they are.
      expect(readFileSync(path.join(racine, modifie), 'utf8')).toBe(
        `${fichiers[modifie]}// le lot\n`
      );
    }
  );

  it('returns what the run returns', () => {
    const [, langages, fichiers, modifie, , neuf] = LANGAGES[3] as (typeof LANGAGES)[number];
    const racine = depot(langages, fichiers, modifie, neuf);
    expect(avecLesVersionsDAvant({ copie: racine }, [modifie], avant => avant.size)).toBe(1);
  });

  it('the circuit builds no name of a language of its own: it asks the module (soeurDAvant)', () => {
    const source = readFileSync(path.resolve(__dirname, '../../scripts/circuit.mjs'), 'utf8');
    expect(source).not.toContain('circuit-avant');
    expect(source).toContain('soeurDAvant(');
  });
});

// The proof sets aside a green of the lot whose full name HEAD's version holds green
// (`vertsDeHead`), read in the verdict of the run of each language. The reports are the ones
// nextest and pytest wrote for a file and its sibling played in one run (tried by hand on
// 2026-11-02, cargo-nextest and pytest): nextest names a test without its target
// (`ancien`, `groupe::interne`), pytest by its function, so both versions name it alike.
type Rapports = { fichier: string; tests: { nom: string; etat: string }[] }[];
const vertsDeHead = circuit.vertsDeHead as (
  resultats: Rapports,
  copie: string,
  f: string,
  avant: Map<string, string>,
  lus?: Map<string, string[]>
) => Set<string>;
const cargo = moduleCargo as unknown as { verdict: (d: string) => { rapports: Rapports } };
const python = modulePython as unknown as { verdict: (d: string) => { rapports: Rapports } };

// The greens of the lot file <f> that HEAD holds, and the others, in the verdict <resultats>.
function partage(
  resultats: Rapports,
  copie: string,
  f: string,
  avant: Map<string, string>,
  lus = new Map<string, string[]>()
) {
  const deHead = vertsDeHead(resultats, copie, f, avant, lus);
  const verts = (resultats.find(r => r.fichier === path.join(copie, f))?.tests ?? []).filter(
    t => t.etat === 'passed'
  );
  return {
    deCote: verts.filter(t => deHead.has(t.nom)).map(t => t.nom),
    neufs: verts.filter(t => !deHead.has(t.nom)).map(t => t.nom),
  };
}

const echec = '<failure message="non"/>';
const nx = (nom: string, suite: string, etat = '') =>
  `<testcase name="${nom}" classname="${suite}"${etat ? `>${etat}</testcase>` : '/>'}`;
const py = (nom: string, classe: string, fichier: string, etat = '') =>
  `<testcase classname="${classe}" name="${nom}" file="${fichier}"${etat ? `>${etat}</testcase>` : '/>'}`;

describe('grillhouse-3e2 — the greens HEAD holds are set aside, in Rust and in Python', () => {
  it('criterion 1: a test file of Rust HEAD holds, changed by the lot: its greens of HEAD are set aside, its new green alone left', () => {
    const copie = mkdtempSync(path.join(ESSAIS, 'copie-cargo-'));
    const f = 'crates/service/tests/electra_reimport.rs';
    const soeur = 'crates/service/tests/electra_reimport_circuit_avant.rs';
    const resultats = mkdtempSync(path.join(ESSAIS, 'resultats-'));
    ecrire(
      resultats,
      'cargo/1-1.json',
      JSON.stringify({
        taches: [],
        cibles: {
          'service::electra_reimport': path.join(copie, f),
          'service::electra_reimport_circuit_avant': path.join(copie, soeur),
        },
      })
    );
    const avant = 'service::electra_reimport_circuit_avant';
    const lot = 'service::electra_reimport';
    ecrire(
      resultats,
      'nextest/1-1-service.xml',
      [
        '<testsuites>',
        `<testsuite name="${avant}">`,
        nx('groupe::interne', avant),
        nx('ancien', avant),
        '</testsuite>',
        `<testsuite name="${lot}">`,
        nx('ancien', lot),
        nx('groupe::interne', lot),
        nx('neuf', lot),
        nx('rouge', lot, echec),
        '</testsuite>',
        '</testsuites>',
      ].join('\n')
    );
    const { rapports } = cargo.verdict(resultats);
    expect(partage(rapports, copie, f, new Map([[f, soeur]]))).toEqual({
      deCote: ['ancien', 'groupe::interne'],
      neufs: ['neuf'],
    });
    // Without its sibling, the file is new: nothing set aside, as SyntHub SH-cgi.15 saw.
    expect(partage(rapports, copie, f, new Map()).deCote).toEqual([]);
  });

  it('criterion 2: a test file of Python HEAD holds, changed by the lot: its greens of HEAD are set aside, its new green alone left', () => {
    const copie = mkdtempSync(path.join(ESSAIS, 'copie-python-'));
    const f = 'site/tests/test_pages.py';
    const soeur = 'site/tests/test_pages_circuit_avant.py';
    const resultats = mkdtempSync(path.join(ESSAIS, 'resultats-'));
    ecrire(
      resultats,
      'python/1-1.json',
      JSON.stringify({ taches: [], rapports: { '1-1-site.xml': path.join(copie, 'site') } })
    );
    const lot = 'tests/test_pages.py';
    const avant = 'tests/test_pages_circuit_avant.py';
    ecrire(
      resultats,
      'pytest/1-1-site.xml',
      [
        '<testsuites><testsuite name="pytest">',
        py('test_ancien', 'tests.test_pages', lot),
        py('test_neuf', 'tests.test_pages', lot),
        py('test_interne', 'tests.test_pages.TestGroupe', lot),
        py('test_rouge', 'tests.test_pages', lot, echec),
        py('test_ancien', 'tests.test_pages_circuit_avant', avant),
        py('test_interne', 'tests.test_pages_circuit_avant.TestGroupe', avant),
        '</testsuite></testsuites>',
      ].join('')
    );
    const { rapports } = python.verdict(resultats);
    expect(partage(rapports, copie, f, new Map([[f, soeur]]))).toEqual({
      deCote: ['test_ancien', 'test_interne'],
      neufs: ['test_neuf'],
    });
  });
});

// The owner's decision on grillhouse-3e2: a test file cargo cannot play in two versions in one run
// (a unit test of `src/`, compiled as a module of its crate; a target `tests/<dossier>/main.rs`)
// has no sibling; the module reads the names of its tests in HEAD's version, without playing
// them, and the proof holds each for a green HEAD holds. A name is the verdict's: the module path
// nextest reports (tried on 2026-11-02: `access::engines::tests::groupe::interne`, `m::dedans`,
// `aide::aidant` for a `mod aide;` of main.rs).
describe('grillhouse-3e2, criterion 5 — the names of HEAD’s tests of a file cargo cannot play twice', () => {
  it.each([
    [
      'crates/service/src/server/tests.rs',
      ['server::tests::ancien', 'server::tests::groupe::interne'],
    ],
    ['crates/service/tests/scenario/main.rs', ['principal', 'aide::aidant']],
  ])('%s: no sibling, the names of HEAD’s tests read', (modifie, noms) => {
    const racine = depot(
      { 'crates/service': 'cargo' },
      CARGO,
      modifie,
      'crates/service/src/neuf/tests.rs'
    );
    let vu: { avant: [string, string][]; lus: [string, string[]][] } = { avant: [], lus: [] };
    avecLesVersionsDAvant(
      { copie: racine },
      [modifie, 'crates/service/src/neuf/tests.rs'],
      (avant, lus) => {
        vu = { avant: [...avant], lus: [...lus] };
      }
    );
    expect(vu).toEqual({ avant: [], lus: [[modifie, noms]] });
  });

  it('a unit test of Rust HEAD holds, changed by the lot: its tests of HEAD are set aside, its new test alone left', () => {
    const copie = mkdtempSync(path.join(ESSAIS, 'copie-unitaire-'));
    const f = 'crates/service/src/server/tests.rs';
    ecrire(copie, 'crates/service/src/lib.rs', 'mod server;\n');
    ecrire(copie, f, '');
    const resultats = mkdtempSync(path.join(ESSAIS, 'resultats-'));
    ecrire(
      resultats,
      'cargo/1-1.json',
      JSON.stringify({
        taches: [],
        cibles: { service: path.join(copie, 'crates/service/src/lib.rs') },
      })
    );
    // The library's binary, as nextest reports it: each test under its module path.
    ecrire(
      resultats,
      'nextest/1-1-service.xml',
      [
        '<testsuites>',
        '<testsuite name="service">',
        nx('server::tests::groupe::interne', 'service'),
        nx('server::tests::ancien', 'service'),
        nx('server::tests::neuf', 'service'),
        nx('server::tests::rouge', 'service', echec),
        '</testsuite>',
        '</testsuites>',
      ].join('\n')
    );
    const { rapports } = cargo.verdict(resultats);
    const lus = new Map([[f, ['server::tests::ancien', 'server::tests::groupe::interne']]]);
    expect(partage(rapports, copie, f, new Map(), lus)).toEqual({
      deCote: ['server::tests::groupe::interne', 'server::tests::ancien'],
      neufs: ['server::tests::neuf'],
    });
  });
});

// grillhouse-3e2.2 — the owner's decision of 2026-11-02: a sibling that does not compile is not a
// red of the lot. When the lot changes the shared matter of a crate's tests (`tests/common/mod.rs`),
// HEAD's version of a test target, played beside it as a sibling, may no longer compile, and
// cargo's build of the crate's test targets (`cargo test --no-run --test <f> --test <sibling>`) is
// red for the whole crate. Tried by hand on 2026-11-02 with cargo and cargo-nextest: the build
// with the sibling fails (E0061 in `electra_circuit_avant`, code 101), the build of the lot alone
// passes, and nextest names the tests of `tests/electra.rs` and its `mod common;` `ancien`,
// `groupe::interne`, `common::commun`. The proof then plays the package again without its
// siblings, and reads the names of HEAD's tests of those files without playing them
// (`testsDeHead`, its option `sansSoeur`); a build that the lot alone breaks stays a red.
type Jeu = { code: number; resultats: unknown[]; constructions: { nom: string; erreur: string }[] };
const jouerAvecLesVersionsDAvant = circuit.jouerAvecLesVersionsDAvant as (
  ctx: { copie: string },
  groupe: string[],
  jouer: (fichiers: string[]) => Jeu
) => Jeu & { avant: Map<string, string>; lus: Map<string, string[]> };
const cargoDeHead = moduleCargo as unknown as {
  testsDeHead: (
    chemin: string,
    racine: string,
    lire: (f: string) => string | null,
    o?: { sansSoeur?: boolean }
  ) => string[] | null;
};

const COMMUN_HEAD = 'pub fn aide() -> i32 { 1 }\n#[test]\nfn commun() {}\n';
const COMMUN_LOT = 'pub fn aide(x: i32) -> i32 { x }\n#[test]\nfn commun() {}\n';
const CIBLE_HEAD =
  'mod common;\n#[test]\nfn ancien() { assert_eq!(common::aide(), 1); }\nmod groupe { #[test] fn interne() {} }\n';
const CIBLE_LOT =
  'mod common;\n#[test]\nfn ancien() { assert_eq!(common::aide(1), 1); }\nmod groupe { #[test] fn interne() {} }\n#[test]\nfn neuf() {}\n';
const CIBLE = 'crates/service/tests/electra_reimport.rs';
const SOEUR = 'crates/service/tests/electra_reimport_circuit_avant.rs';
const COMMUN = 'crates/service/tests/common/mod.rs';

// A crate whose HEAD holds the target <CIBLE> and its shared matter <COMMUN>, both changed by the
// lot: the signature of `common::aide` takes an argument, the target <cible> of the lot.
function depotCommun(cible = CIBLE_LOT) {
  const racine = mkdtempSync(path.join(ESSAIS, 'commun-'));
  declarerLesLangages(racine, { 'crates/service': 'cargo' });
  const fichiers = { ...CARGO, [CIBLE]: CIBLE_HEAD, [COMMUN]: COMMUN_HEAD };
  for (const [f, texte] of Object.entries(fichiers)) {
    ecrire(racine, f, texte);
  }
  git(racine, 'init', '-q');
  git(racine, 'add', '-A');
  git(racine, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'HEAD');
  ecrire(racine, COMMUN, COMMUN_LOT);
  ecrire(racine, CIBLE, cible);
  return racine;
}

// The build of the crate's test targets as cargo makes it: a played file that calls
// `common::aide()` without argument does not compile against a `common` whose `aide` takes one;
// red, the build is a red of the crate, and no test plays.
function fauxBuild(racine: string, appels: string[][]) {
  return (fichiers: string[]): Jeu => {
    appels.push(fichiers);
    const commun = readFileSync(path.join(racine, COMMUN), 'utf8');
    const casse = fichiers.some(
      f =>
        /common::aide\(\)/.test(readFileSync(path.join(racine, f), 'utf8')) &&
        /fn aide\(x/.test(commun)
    );
    return casse
      ? { code: 1, resultats: [], constructions: [{ nom: 'service', erreur: 'E0061' }] }
      : { code: 0, resultats: ['joué'], constructions: [] };
  };
}

describe('grillhouse-3e2.2 — a Rust sibling that no longer compiles is not a red of the lot', () => {
  it('testsDeHead, option sansSoeur: the names of HEAD’s tests of a target tests/<nom>.rs, its mod common read', () => {
    const racine = depotCommun();
    const lire = (f: string) => (f === CIBLE ? CIBLE_HEAD : f === COMMUN ? COMMUN_HEAD : null);
    expect(cargoDeHead.testsDeHead(CIBLE, racine, lire, { sansSoeur: true })).toEqual([
      'ancien',
      'groupe::interne',
      'common::commun',
    ]);
    // Without the option, a file that has its sibling has no names read (criterion of 3e2).
    expect(cargoDeHead.testsDeHead(CIBLE, racine, lire)).toBeNull();
  });

  it('criteria 1 and 3: the lot changes tests/common, the sibling alone breaks the build: played again without it, HEAD’s names read, no red of build', () => {
    const racine = depotCommun();
    const appels: string[][] = [];
    const r = jouerAvecLesVersionsDAvant({ copie: racine }, [CIBLE], fauxBuild(racine, appels));
    expect(appels).toEqual([[CIBLE, SOEUR], [CIBLE]]);
    expect(r.constructions).toEqual([]);
    expect(r.resultats).toEqual(['joué']);
    expect(r.avant).toEqual(new Map());
    expect(r.lus).toEqual(new Map([[CIBLE, ['ancien', 'groupe::interne', 'common::commun']]]));
    // The sibling is removed, the lot's files left as they are.
    expect(existsSync(path.join(racine, SOEUR))).toBe(false);
    expect(readFileSync(path.join(racine, CIBLE), 'utf8')).toBe(CIBLE_LOT);
  });

  it('criterion 2: a build the lot alone breaks stays a red', () => {
    const racine = depotCommun(CIBLE_HEAD);
    const appels: string[][] = [];
    const r = jouerAvecLesVersionsDAvant({ copie: racine }, [CIBLE], fauxBuild(racine, appels));
    expect(r.constructions).toEqual([{ nom: 'service', erreur: 'E0061' }]);
  });

  it('a build that passes with the siblings plays once, the siblings kept', () => {
    const racine = depotCommun(CIBLE_HEAD);
    ecrire(racine, COMMUN, COMMUN_HEAD);
    const appels: string[][] = [];
    const r = jouerAvecLesVersionsDAvant({ copie: racine }, [CIBLE], fauxBuild(racine, appels));
    expect(appels).toEqual([[CIBLE, SOEUR]]);
    expect(r.avant).toEqual(new Map([[CIBLE, SOEUR]]));
    expect(r.constructions).toEqual([]);
  });
});

// grillhouse-3e2.1 — a sibling a killed process left in the copy, between its writing and its
// removal, is swept before the next measure and never enters the lot nor the commit
// (`balayerLesSoeurs`): a file git does not track, the sibling (`soeurDAvant` of the module) of a
// file of its folder that git tracks and that exists. The reviewer of grillhouse-3e2 found it.
const balayerLesSoeurs = circuit.balayerLesSoeurs as (ctx: { copie: string }) => string[];
const nonSuivis = (racine: string) =>
  spawnSync('git', ['-C', racine, 'ls-files', '--others', '--exclude-standard'], {
    encoding: 'utf8',
  })
    .stdout.split('\n')
    .filter(Boolean)
    .sort();

describe('grillhouse-3e2.1 — a sibling of HEAD’s version left in the copy is swept', () => {
  it.each(LANGAGES)(
    'criteria 1 and 2 (%s): the sibling left is removed, by the name its module gives; the lot is left as it is',
    (_nom, langages, fichiers, modifie, soeur, neuf) => {
      const racine = depot(langages, fichiers, modifie, neuf);
      ecrire(racine, soeur, fichiers[modifie] as string);
      expect(balayerLesSoeurs({ copie: racine })).toEqual([soeur]);
      expect(existsSync(path.join(racine, soeur))).toBe(false);
      expect(nonSuivis(racine)).toEqual([neuf]);
      expect(readFileSync(path.join(racine, modifie), 'utf8')).toBe(
        `${fichiers[modifie]}// le lot\n`
      );
    }
  );

  it('criterion 1: the next measure starts without the siblings left, and writes its own', () => {
    const [, langages, fichiers, modifie, soeur, neuf] = LANGAGES[0] as (typeof LANGAGES)[number];
    const racine = depot(langages, fichiers, modifie, neuf);
    const autre = 'crates/service/tests/drivers_circuit_avant_budget.rs';
    ecrire(racine, autre, 'oubliée\n');
    ecrire(racine, soeur, 'oubliée\n');
    let present: string[] = [];
    avecLesVersionsDAvant({ copie: racine }, [modifie], () => {
      present = nonSuivis(racine);
    });
    expect(present).toEqual([soeur, neuf].sort());
    expect(nonSuivis(racine)).toEqual([neuf]);
  });

  it('criterion 3: a file named as a sibling is kept when git tracks it or when its file is absent', () => {
    const [, langages, fichiers, modifie, , neuf] = LANGAGES[3] as (typeof LANGAGES)[number];
    const suivie = 'packages/a/test/ancien.circuit-avant.test.ts';
    const racine = depot(langages, { ...fichiers, [suivie]: 'suivie\n' }, modifie, neuf);
    // The sibling of a file the lot removes, and of a file that never was.
    git(racine, 'rm', '-q', 'packages/a/test/vitesse.budget.test.ts');
    const orphelines = [
      'packages/a/test/vitesse.circuit-avant.budget.test.ts',
      'packages/a/test/jamais.circuit-avant.test.ts',
    ];
    for (const f of orphelines) {
      ecrire(racine, f, 'du testwriter\n');
    }
    expect(balayerLesSoeurs({ copie: racine })).toEqual([]);
    for (const f of [suivie, ...orphelines]) {
      expect(existsSync(path.join(racine, f))).toBe(true);
    }
  });

  // The review of the lot: on SyntHub, each question to the module read cargo's metadata again,
  // 400 launches of cargo for 37 files, 11.4 s a sweep. A sweep reads them once, whatever the
  // number of files its folders hold.
  it('a sweep reads the metadata of cargo once, whatever the number of files of the folder', () => {
    const journal = path.join(ESSAIS, 'journal');
    const lancements = (n: number) => {
      const extra = Object.fromEntries(
        Array.from({ length: n }, (_, i) => [
          `crates/service/tests/extra_${i}.rs`,
          '#[test]\nfn t() {}\n',
        ])
      );
      const racine = depot(
        { 'crates/service': 'cargo', 'packages/a': 'typescript' },
        { ...CARGO, ...TYPESCRIPT, ...extra },
        'crates/service/tests/electra_reimport.rs',
        'crates/service/tests/neuf.rs'
      );
      ecrire(racine, 'crates/service/tests/electra_reimport_circuit_avant.rs', 'oubliée\n');
      const avant = readFileSync(journal, 'utf8').split('\n').length;
      expect(balayerLesSoeurs({ copie: racine })).toEqual([
        'crates/service/tests/electra_reimport_circuit_avant.rs',
      ]);
      return readFileSync(journal, 'utf8')
        .split('\n')
        .slice(avant - 1)
        .filter(l => l.startsWith('metadata')).length;
    };
    expect(lancements(2)).toBe(1);
    expect(lancements(20)).toBe(1);
  });

  it('each sibling swept is named in the log of the ticket', () => {
    const [, langages, fichiers, modifie, soeur, neuf] = LANGAGES[3] as (typeof LANGAGES)[number];
    const racine = depot(langages, fichiers, modifie, neuf);
    ecrire(racine, soeur, 'oubliée\n');
    const journal = path.join(racine, '..', `${path.basename(racine)}.log`);
    writeFileSync(journal, '');
    balayerLesSoeurs({ copie: racine, journal } as { copie: string });
    expect(readFileSync(journal, 'utf8')).toContain(soeur);
  });

  // derouler is the circuit's loop, reached only through a whole run (a ticket, its state, its
  // sessions): a test of its behaviour would be a large test. The sweep's behaviour is proved
  // above; this test holds only its place, before the loop's first reading of the lot.
  it('the circuit sweeps at its start, before any reading of the lot', () => {
    const source = readFileSync(path.resolve(__dirname, '../../scripts/circuit.mjs'), 'utf8');
    const derouler = source.slice(source.indexOf('async function derouler('));
    expect(derouler.slice(0, derouler.indexOf('for (;;)'))).toContain('balayerLesSoeurs(ctx)');
  });
});
