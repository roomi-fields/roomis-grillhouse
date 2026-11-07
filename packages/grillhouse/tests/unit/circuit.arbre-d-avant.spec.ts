// grillhouse-3e2.3 — the proof of the red plays HEAD's version of a test file of Rust or of Python
// in a tree of its own, never as a file added to the copy: a test that lists its folder of tests
// sees no file the proof adds (witness: SyntHub SH-b52.2, 2026-11-02, `no_reserved_port.rs` red on
// five `*_circuit_avant.rs`). The mature model: `git bisect run`, the « before » of rustc-perf.
//
// The contract tried here:
// - `avecLesVersionsDAvant(ctx, fichiers, jouer)` builds, for each file of <fichiers> that HEAD
//   holds and whose module answers `arbreDAvant`, a tree under `ctx.tmp`: `jouer(avant, lus,
//   arbres)`, `arbres` the Map file → `{ racine, env }`; the trees are removed after it, red
//   included; the copy gets no file.
// - `vertsDeHead(resultats, copie, f, avant, lus, arbres)` reads HEAD's greens of <f> in the report
//   of the tree, the file there at the same relative path.
// - `jouerAvecLesVersionsDAvant(ctx, groupe, jouer)` gives <jouer> `(fichiers, arbres)`.
// Against the fake cargo (./langages/cargo/faux-cargo.ts).
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as activites from '../../scripts/activites.mjs';
import moduleCargo from '../../scripts/langages/cargo/index.mjs';
import modulePython from '../../scripts/langages/python/index.mjs';
import { cibleDeCompilation } from '../../scripts/langages/cargo/sccache.mjs';
import { avecFauxCargo, installerFauxCargo } from './langages/cargo/faux-cargo.js';

type Arbre = { racine: string; env: Record<string, string> };
type Ctx = { copie: string; tmp: string };
const avecLesVersionsDAvant = activites.avecLesVersionsDAvant as (
  ctx: Ctx,
  fichiers: string[],
  jouer: (
    avant: Map<string, string>,
    lus: Map<string, string[]>,
    arbres: Map<string, Arbre>
  ) => unknown
) => unknown;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'arbre-d-avant-'));
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
const nonSuivis = (racine: string) =>
  spawnSync('git', ['-C', racine, 'ls-files', '--others', '--exclude-standard'], {
    encoding: 'utf8',
  })
    .stdout.split('\n')
    .filter(Boolean)
    .sort();
// Every file under <dossier>, from it, sorted: what a test that walks its folder sees.
const lister = (dossier: string, sous = ''): string[] =>
  readdirSync(path.join(dossier, sous), { withFileTypes: true })
    .flatMap(e =>
      e.isDirectory() ? lister(dossier, path.join(sous, e.name)) : [path.join(sous, e.name)]
    )
    .sort();

const CARGO = {
  'Cargo.toml': '[workspace]\nmembers = ["crates/service"]\nresolver = "2"\n',
  'crates/service/Cargo.toml': '[package]\nname = "service"\nversion = "0.1.0"\nedition = "2021"\n',
  'crates/service/src/lib.rs': 'pub fn un() -> i32 { 1 }\n',
  'crates/service/tests/electra_reimport.rs': '#[test]\nfn ancien() {}\n',
  'crates/service/tests/drivers_budget.rs': '#[test]\nfn vite() {}\n',
  'crates/service/tests/drivers_nuit.rs': '#[test]\nfn long() {}\n',
  'crates/service/tests/parcours.rs':
    '#[test]\nfn aucun_fichier_en_trop() {\n    // lit tous les .rs de tests/\n}\n',
  'crates/service/src/server/tests.rs': '#[test]\nfn ancien() {}\n',
  'crates/service/tests/scenario/main.rs': 'mod aide;\n#[test]\nfn principal() {}\n',
  'crates/service/tests/scenario/aide.rs': '#[test]\nfn aidant() {}\n',
};
const PYTHON = {
  'package.json': JSON.stringify({ name: 'p', private: true }),
  'site/pyproject.toml': '[project]\nname = "site"\nversion = "0.1.0"\n',
  'site/tests/test_pages.py': 'def test_ancien():\n    assert True\n',
  'site/tests/forme_test.py': 'def test_forme():\n    assert True\n',
  'site/tests/site_nuit_test.py': 'def test_tout():\n    assert True\n',
  'site/tests/test_parcours.py': 'def test_dossier():\n    assert True\n',
  'site/src/page.py': 'VALEUR = 1\n',
};
const TYPESCRIPT = {
  'package.json': JSON.stringify({ name: 'p', private: true, workspaces: ['packages/*'] }),
  'packages/a/package.json': JSON.stringify({ name: '@e/a' }),
  'packages/a/src/index.ts': 'export const a = 1;\n',
  'packages/a/test/ancien.test.ts': "import { it } from 'vitest';\nit('ancien', () => {});\n",
};

// A repository whose HEAD holds <fichiers>, then <modifie> changed by the lot, the code of the
// lot changed, a file <neuf> added, and the folders a copy carries that a tree does not
// (`target`, `node_modules`, `.venv`), none of them tracked.
function depot(
  langages: Record<string, string>,
  fichiers: Record<string, string>,
  modifie: string[],
  code: string,
  neuf: string
) {
  const racine = mkdtempSync(path.join(ESSAIS, 'depot-'));
  declarerLesLangages(racine, langages);
  for (const [f, texte] of Object.entries(fichiers)) {
    ecrire(racine, f, texte);
  }
  ecrire(racine, '.gitignore', 'target/\nnode_modules/\n.venv/\n');
  git(racine, 'init', '-q');
  git(racine, 'add', '-A');
  git(racine, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'HEAD');
  for (const f of modifie) {
    ecrire(racine, f, `${fichiers[f]}// le lot\n`);
  }
  ecrire(racine, code, 'LOT_CODE\n');
  ecrire(racine, neuf, 'neuf\n');
  ecrire(racine, 'target/debug/x', 'cible\n');
  ecrire(racine, 'node_modules/m/index.js', 'm\n');
  ecrire(racine, '.venv/bin/python', 'py\n');
  const tmp = mkdtempSync(path.join(ESSAIS, 'ticket-'));
  return { racine, ctx: { copie: racine, tmp } as Ctx };
}

// Each file the lot changes, in a test of each class (day, night, bench), of each language.
const CAS: [string, Record<string, string>, Record<string, string>, string, string, string][] = [
  [
    'cargo, a target',
    { 'crates/service': 'cargo' },
    CARGO,
    'crates/service/tests/electra_reimport.rs',
    'crates/service/src/lib.rs',
    'crates/service/tests/neuf.rs',
  ],
  [
    'cargo, a bench',
    { 'crates/service': 'cargo' },
    CARGO,
    'crates/service/tests/drivers_budget.rs',
    'crates/service/src/lib.rs',
    'crates/service/tests/neuf_budget.rs',
  ],
  [
    'cargo, a night test',
    { 'crates/service': 'cargo' },
    CARGO,
    'crates/service/tests/drivers_nuit.rs',
    'crates/service/src/lib.rs',
    'crates/service/tests/neuf_nuit.rs',
  ],
  [
    'python, test_*.py',
    { site: 'python' },
    PYTHON,
    'site/tests/test_pages.py',
    'site/src/page.py',
    'site/tests/test_neuf.py',
  ],
  [
    'python, *_test.py',
    { site: 'python' },
    PYTHON,
    'site/tests/forme_test.py',
    'site/src/page.py',
    'site/tests/neuf_test.py',
  ],
  [
    'python, a night test',
    { site: 'python' },
    PYTHON,
    'site/tests/site_nuit_test.py',
    'site/src/page.py',
    'site/tests/neuf_nuit_test.py',
  ],
];

describe('grillhouse-3e2.3 — the tree of HEAD’s version, in Rust and in Python', () => {
  it.each(CAS)(
    'criteria 1, 4 and 6 (%s): the copy gets no file; the tree holds the file under its own name, HEAD’s text, the lot’s code',
    (_nom, langages, fichiers, modifie, code, neuf) => {
      const { racine, ctx } = depot(langages, fichiers, [modifie], code, neuf);
      const avantLaPreuve = [...lister(racine)];
      const nonSuivisAvant = nonSuivis(racine);
      let vu = { avant: [] as string[], lus: [] as string[], arbres: [] as string[] };
      let dansLArbre: string[] = [];
      let dansLaCopie: string[] = [];
      let texte = '';
      let codeDeLArbre = '';
      let racineDeLArbre = '';
      avecLesVersionsDAvant(ctx, [modifie, neuf], (avant, lus, arbres) => {
        vu = { avant: [...avant.keys()], lus: [...lus.keys()], arbres: [...arbres.keys()] };
        const arbre = arbres.get(modifie) as Arbre;
        racineDeLArbre = arbre.racine;
        dansLArbre = lister(arbre.racine);
        dansLaCopie = lister(racine);
        texte = readFileSync(path.join(arbre.racine, modifie), 'utf8');
        codeDeLArbre = readFileSync(path.join(arbre.racine, code), 'utf8');
      });
      // A file new to HEAD has no tree; the file HEAD holds has one, no sibling.
      expect(vu).toEqual({ avant: [], lus: [], arbres: [modifie] });
      expect(texte).toBe(fichiers[modifie]);
      expect(codeDeLArbre).toBe('LOT_CODE\n');
      // Criterion 1 and 4: no file `*_circuit_avant*`, in the copy nor in the tree; the copy's
      // files are the files of before the proof.
      expect(dansLaCopie).toEqual(avantLaPreuve);
      expect(nonSuivis(racine)).toEqual(nonSuivisAvant);
      for (const f of [...dansLaCopie, ...dansLArbre]) {
        expect(f).not.toContain('circuit_avant');
      }
      // The tree is the copy's, the file replaced, without `.git`, `target`, `node_modules`, `.venv`.
      expect(dansLArbre).toEqual(
        dansLaCopie.filter(
          f => !/^(\.git|\.venv|node_modules|target)(\/|$)/.test(f) && !f.startsWith('.git/')
        )
      );
      expect(existsSync(path.join(racineDeLArbre, '.git'))).toBe(false);
      // The copy's file is the lot's.
      expect(readFileSync(path.join(racine, modifie), 'utf8')).toBe(
        `${fichiers[modifie]}// le lot\n`
      );
    }
  );

  it.each(CAS)(
    'criterion 5 (%s): the tree is under the ticket’s temporary directory and removed after the run, a red included',
    (_nom, langages, fichiers, modifie, code, neuf) => {
      const { racine, ctx } = depot(langages, fichiers, [modifie], code, neuf);
      let arbre = '';
      avecLesVersionsDAvant(ctx, [modifie], (_a, _l, arbres) => {
        arbre = (arbres.get(modifie) as Arbre).racine;
        expect(path.relative(ctx.tmp, arbre).startsWith('..')).toBe(false);
        expect(existsSync(arbre)).toBe(true);
      });
      expect(existsSync(arbre)).toBe(false);
      expect(() =>
        avecLesVersionsDAvant(ctx, [modifie], (_a, _l, arbres) => {
          arbre = (arbres.get(modifie) as Arbre).racine;
          throw new Error('rouge');
        })
      ).toThrow('rouge');
      expect(existsSync(arbre)).toBe(false);
      expect(lister(ctx.tmp)).toEqual([]);
      expect(existsSync(path.join(racine, modifie))).toBe(true);
    }
  );

  it('criterion 5: the cargo target directory of a tree is the copy’s; Python sets none', () => {
    const c = depot(
      { 'crates/service': 'cargo' },
      CARGO,
      ['crates/service/tests/electra_reimport.rs'],
      'crates/service/src/lib.rs',
      'crates/service/tests/neuf.rs'
    );
    let env: Record<string, string> = { sentinelle: 'x' };
    avecLesVersionsDAvant(c.ctx, ['crates/service/tests/electra_reimport.rs'], (_a, _l, arbres) => {
      env = (arbres.get('crates/service/tests/electra_reimport.rs') as Arbre).env;
    });
    expect(env.CARGO_TARGET_DIR).toBe(
      cibleDeCompilation(c.racine, process.env, { creer: false }).CARGO_TARGET_DIR
    );
    const p = depot(
      { site: 'python' },
      PYTHON,
      ['site/tests/test_pages.py'],
      'site/src/page.py',
      'site/tests/test_neuf.py'
    );
    avecLesVersionsDAvant(p.ctx, ['site/tests/test_pages.py'], (_a, _l, arbres) => {
      env = (arbres.get('site/tests/test_pages.py') as Arbre).env;
    });
    expect(env.CARGO_TARGET_DIR).toBeUndefined();
  });

  it('criterion 4: several files, one tree each, each with its own file replaced alone', () => {
    const a = 'crates/service/tests/electra_reimport.rs';
    const b = 'crates/service/tests/drivers_budget.rs';
    const { ctx } = depot(
      { 'crates/service': 'cargo' },
      CARGO,
      [a, b],
      'crates/service/src/lib.rs',
      'crates/service/tests/neuf.rs'
    );
    avecLesVersionsDAvant(ctx, [a, b], (_a, _l, arbres) => {
      const [ta, tb] = [arbres.get(a), arbres.get(b)] as Arbre[];
      expect(ta.racine).not.toBe(tb.racine);
      expect(readFileSync(path.join(ta.racine, a), 'utf8')).toBe(CARGO[a]);
      expect(readFileSync(path.join(ta.racine, b), 'utf8')).toBe(`${CARGO[b]}// le lot\n`);
      expect(readFileSync(path.join(tb.racine, b), 'utf8')).toBe(CARGO[b]);
      expect(readFileSync(path.join(tb.racine, a), 'utf8')).toBe(`${CARGO[a]}// le lot\n`);
    });
  });

  it('criterion 3: a test that walks its folder of tests is as green during the proof as outside it', () => {
    const f = 'crates/service/tests/electra_reimport.rs';
    const { racine, ctx } = depot(
      { 'crates/service': 'cargo' },
      CARGO,
      [f],
      'crates/service/src/lib.rs',
      'crates/service/tests/neuf.rs'
    );
    // The walk of tests/parcours.rs: every `.rs` of the folder, refused when it is a copy of before.
    const parcours = () =>
      lister(path.join(racine, 'crates/service/tests')).filter(x => /_circuit_avant/.test(x));
    expect(parcours()).toEqual([]);
    avecLesVersionsDAvant(ctx, [f], () => {
      expect(parcours()).toEqual([]);
    });
    expect(parcours()).toEqual([]);
    const p = depot(
      { site: 'python' },
      PYTHON,
      ['site/tests/test_pages.py'],
      'site/src/page.py',
      'site/tests/test_neuf.py'
    );
    avecLesVersionsDAvant(p.ctx, ['site/tests/test_pages.py'], () => {
      expect(
        lister(path.join(p.racine, 'site/tests')).filter(x => /_circuit_avant/.test(x))
      ).toEqual([]);
    });
  });

  it('a Rust or Python file keeps no sibling: its module no longer names one, and answers arbreDAvant', () => {
    const cargo = moduleCargo as unknown as Record<string, unknown>;
    const python = modulePython as unknown as Record<string, unknown>;
    expect(cargo.soeurDAvant).toBeUndefined();
    expect(python.soeurDAvant).toBeUndefined();
    const c = depot(
      { 'crates/service': 'cargo' },
      CARGO,
      [],
      'crates/service/src/lib.rs',
      'crates/service/tests/neuf.rs'
    );
    const arbreC = cargo.arbreDAvant as (f: string, r: string) => boolean;
    expect(arbreC('crates/service/tests/electra_reimport.rs', c.racine)).toBe(true);
    expect(arbreC('crates/service/tests/drivers_budget.rs', c.racine)).toBe(true);
    // A unit test of `src/` and a target `tests/<dossier>/main.rs` are read, not played.
    expect(arbreC('crates/service/src/server/tests.rs', c.racine)).toBe(false);
    expect(arbreC('crates/service/tests/scenario/main.rs', c.racine)).toBe(false);
    expect(arbreC('crates/service/src/lib.rs', c.racine)).toBe(false);
    const p = depot({ site: 'python' }, PYTHON, [], 'site/src/page.py', 'site/tests/test_neuf.py');
    const arbreP = python.arbreDAvant as (f: string, r: string) => boolean;
    expect(arbreP('site/tests/test_pages.py', p.racine)).toBe(true);
    expect(arbreP('site/tests/forme_test.py', p.racine)).toBe(true);
    expect(arbreP('site/src/page.py', p.racine)).toBe(false);
  });

  it('a project of three languages: TypeScript keeps its sibling, Rust and Python each a tree', () => {
    const rs = 'crates/service/tests/electra_reimport.rs';
    const pyf = 'site/tests/test_pages.py';
    const ts = 'packages/a/test/ancien.test.ts';
    const { racine, ctx } = depot(
      { 'crates/service': 'cargo', site: 'python', 'packages/a': 'typescript' },
      { ...CARGO, ...PYTHON, ...TYPESCRIPT, 'package.json': TYPESCRIPT['package.json'] },
      [rs, pyf, ts],
      'crates/service/src/lib.rs',
      'crates/service/tests/neuf.rs'
    );
    let vu: { avant: string[]; arbres: string[] } = { avant: [], arbres: [] };
    avecLesVersionsDAvant(ctx, [rs, pyf, ts], (avant, _l, arbres) => {
      vu = { avant: [...avant.keys()], arbres: [...arbres.keys()].sort() };
      expect(existsSync(path.join(racine, 'packages/a/test/ancien.circuit-avant.test.ts'))).toBe(
        true
      );
      expect(
        existsSync(path.join(racine, 'crates/service/tests/electra_reimport_circuit_avant.rs'))
      ).toBe(false);
    });
    expect(vu).toEqual({ avant: [ts], arbres: [pyf, rs].sort() });
  });

  it('a sweep of the copy has no sibling of Rust or Python to remove: such a file is the lot’s own', () => {
    const f = 'crates/service/tests/electra_reimport.rs';
    const { racine } = depot(
      { 'crates/service': 'cargo' },
      CARGO,
      [f],
      'crates/service/src/lib.rs',
      'crates/service/tests/neuf.rs'
    );
    ecrire(racine, 'crates/service/tests/electra_reimport_circuit_avant.rs', 'du testwriter\n');
    const balayer = activites.balayerLesSoeurs as (c: { copie: string }) => string[];
    expect(balayer({ copie: racine })).toEqual([]);
    expect(
      existsSync(path.join(racine, 'crates/service/tests/electra_reimport_circuit_avant.rs'))
    ).toBe(true);
  });

  // The review of grillhouse-3e2.1: each question to the module read cargo's metadata again.
  it('the trees read the metadata of cargo once, whatever the number of files', () => {
    const journal = path.join(ESSAIS, 'journal');
    const lancements = (n: number) => {
      const extra = Object.fromEntries(
        Array.from({ length: n }, (_, i) => [
          `crates/service/tests/extra_${i}.rs`,
          '#[test]\nfn t() {}\n',
        ])
      );
      const fichiers = Object.keys(extra);
      const { ctx } = depot(
        { 'crates/service': 'cargo' },
        { ...CARGO, ...extra },
        fichiers,
        'crates/service/src/lib.rs',
        'crates/service/tests/neuf.rs'
      );
      const avant = readFileSync(journal, 'utf8').split('\n').length;
      avecLesVersionsDAvant(ctx, fichiers, () => undefined);
      return readFileSync(journal, 'utf8')
        .split('\n')
        .slice(avant - 1)
        .filter(l => l.startsWith('metadata')).length;
    };
    expect(lancements(2)).toBe(1);
    expect(lancements(20)).toBe(1);
  });
});

// The names of HEAD's greens are read in the report of the tree, its file at the same relative
// path under the root of the tree: the report of a run is the copy's by the change of root alone.
type Rapports = { fichier: string; tests: { nom: string; etat: string }[] }[];
const vertsDeHead = activites.vertsDeHead as (
  resultats: Rapports,
  copie: string,
  f: string,
  avant: Map<string, string>,
  lus?: Map<string, string[]>,
  arbres?: Map<string, { racine: string }>
) => Set<string>;
const cargo = moduleCargo as unknown as { verdict: (d: string) => { rapports: Rapports } };
const python = modulePython as unknown as { verdict: (d: string) => { rapports: Rapports } };
const echec = '<failure message="non"/>';
const nx = (nom: string, suite: string, etat = '') =>
  `<testcase name="${nom}" classname="${suite}"${etat ? `>${etat}</testcase>` : '/>'}`;
const py = (nom: string, classe: string, fichier: string, etat = '') =>
  `<testcase classname="${classe}" name="${nom}" file="${fichier}"${etat ? `>${etat}</testcase>` : '/>'}`;

describe('grillhouse-3e2.3 — the greens HEAD holds, read in the report of the tree', () => {
  it.each([
    ['a target', 'electra_reimport'],
    ['a night test', 'drivers_nuit'],
    ['a bench', 'drivers_budget'],
  ])(
    'criterion 6, Rust (%s): the names are the file’s, HEAD’s greens set aside, the lot’s new green alone left',
    (_c, cible) => {
      const copie = mkdtempSync(path.join(ESSAIS, 'copie-cargo-'));
      const arbre = mkdtempSync(path.join(ESSAIS, 'arbre-cargo-'));
      const f = `crates/service/tests/${cible}.rs`;
      const suite = `service::${cible}`;
      const rapporter = (racine: string, cases: string[]) => {
        const resultats = mkdtempSync(path.join(ESSAIS, 'resultats-'));
        ecrire(
          resultats,
          'cargo/1-1.json',
          JSON.stringify({ taches: [], cibles: { [suite]: path.join(racine, f) } })
        );
        ecrire(
          resultats,
          'nextest/1-1-service.xml',
          [
            '<testsuites>',
            `<testsuite name="${suite}">`,
            ...cases,
            '</testsuite>',
            '</testsuites>',
          ].join('\n')
        );
        return cargo.verdict(resultats).rapports;
      };
      const deLArbre = rapporter(arbre, [
        nx('groupe::interne', suite),
        nx('ancien', suite),
        nx('casse', suite, echec),
      ]);
      const deHead = vertsDeHead(
        deLArbre,
        copie,
        f,
        new Map(),
        new Map(),
        new Map([[f, { racine: arbre }]])
      );
      expect([...deHead].sort()).toEqual(['ancien', 'groupe::interne']);
      // Without its tree, the file is new: nothing set aside (SyntHub SH-cgi.15).
      expect(vertsDeHead(deLArbre, copie, f, new Map()).size).toBe(0);
      // The report of the copy holds the lot's greens, set against HEAD's by name.
      const duLot = rapporter(copie, [
        nx('ancien', suite),
        nx('neuf', suite),
        nx('casse', suite, echec),
      ]);
      const verts = (duLot.find(r => r.fichier === path.join(copie, f))?.tests ?? [])
        .filter(t => t.etat === 'passed')
        .map(t => t.nom);
      expect(verts.filter(n => !deHead.has(n))).toEqual(['neuf']);
    }
  );

  it.each([
    ['test_*.py', 'test_pages', 'tests/test_pages.py'],
    ['*_test.py', 'forme_test', 'tests/forme_test.py'],
    ['a night test', 'site_nuit_test', 'tests/site_nuit_test.py'],
  ])(
    'criterion 6, Python (%s): the names are the file’s, HEAD’s greens set aside',
    (_c, module, rel) => {
      const copie = mkdtempSync(path.join(ESSAIS, 'copie-python-'));
      const arbre = mkdtempSync(path.join(ESSAIS, 'arbre-python-'));
      const f = `site/${rel}`;
      const resultats = mkdtempSync(path.join(ESSAIS, 'resultats-'));
      ecrire(
        resultats,
        'python/1-1.json',
        JSON.stringify({ taches: [], rapports: { '1-1-site.xml': path.join(arbre, 'site') } })
      );
      ecrire(
        resultats,
        'pytest/1-1-site.xml',
        [
          '<testsuites><testsuite name="pytest">',
          py('test_ancien', `tests.${module}`, rel),
          py('test_interne', `tests.${module}.TestGroupe`, rel),
          py('test_rouge', `tests.${module}`, rel, echec),
          '</testsuite></testsuites>',
        ].join('')
      );
      const { rapports } = python.verdict(resultats);
      const deHead = vertsDeHead(
        rapports,
        copie,
        f,
        new Map(),
        new Map(),
        new Map([[f, { racine: arbre }]])
      );
      expect([...deHead].sort()).toEqual(['test_ancien', 'test_interne']);
    }
  );

  it('criterion 6: a TypeScript sibling is still read in the copy’s report', () => {
    const copie = '/copie';
    const rapports: Rapports = [
      { fichier: '/copie/a/x.circuit-avant.test.ts', tests: [{ nom: 'ancien', etat: 'passed' }] },
    ];
    expect([
      ...vertsDeHead(
        rapports,
        copie,
        'a/x.test.ts',
        new Map([['a/x.test.ts', 'a/x.circuit-avant.test.ts']])
      ),
    ]).toEqual(['ancien']);
  });
});

// The fallback of grillhouse-3e2.2 (a build the tree breaks while the lot alone builds is not a
// red of the lot), kept, adapted: no sibling, the tree played, then the group alone and HEAD's
// names read.
type Jeu = { code: number; resultats: unknown[]; constructions: { nom: string; erreur: string }[] };
const jouerAvecLesVersionsDAvant = activites.jouerAvecLesVersionsDAvant as (
  ctx: Ctx,
  groupe: string[],
  jouer: (fichiers: string[], arbres: Map<string, Arbre>) => Jeu
) => Jeu & { avant: Map<string, string>; lus: Map<string, string[]>; arbres: Map<string, Arbre> };
const cargoDeHead = moduleCargo as unknown as {
  testsDeHead: (
    chemin: string,
    racine: string,
    lire: (f: string) => string | null,
    o?: unknown
  ) => string[] | null;
};

const COMMUN_HEAD = 'pub fn aide() -> i32 { 1 }\n#[test]\nfn commun() {}\n';
const COMMUN_LOT = 'pub fn aide(x: i32) -> i32 { x }\n#[test]\nfn commun() {}\n';
const CIBLE_HEAD =
  'mod common;\n#[test]\nfn ancien() { assert_eq!(common::aide(), 1); }\nmod groupe { #[test] fn interne() {} }\n';
const CIBLE_LOT =
  'mod common;\n#[test]\nfn ancien() { assert_eq!(common::aide(1), 1); }\nmod groupe { #[test] fn interne() {} }\n#[test]\nfn neuf() {}\n';
const CIBLE = 'crates/service/tests/electra_reimport.rs';
const COMMUN = 'crates/service/tests/common/mod.rs';

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
  return { racine, ctx: { copie: racine, tmp: mkdtempSync(path.join(ESSAIS, 'ticket-')) } as Ctx };
}

// The build as cargo makes it: a played file that calls `common::aide()` without argument does
// not compile against a `common` whose `aide` takes one, in the copy or in a tree.
function fauxBuild(racine: string, appels: [string[], string[]][]) {
  return (fichiers: string[], arbres: Map<string, Arbre>): Jeu => {
    appels.push([fichiers, [...arbres.keys()]]);
    const lus = [
      ...fichiers.map(f => [racine, f] as const),
      ...[...arbres.keys()].map(f => [(arbres.get(f) as Arbre).racine, f] as const),
    ];
    const casse = lus.some(
      ([r, f]) =>
        /common::aide\(\)/.test(readFileSync(path.join(r, f), 'utf8')) &&
        /fn aide\(x/.test(readFileSync(path.join(r, COMMUN), 'utf8'))
    );
    return casse
      ? { code: 1, resultats: [], constructions: [{ nom: 'service', erreur: 'E0061' }] }
      : { code: 0, resultats: ['joué'], constructions: [] };
  };
}

describe('grillhouse-3e2.3 — the fallback without the version of before, no sibling', () => {
  it('criterion 7, testsDeHead: the names of HEAD’s tests of a target tests/<nom>.rs, its mod common read, with no option', () => {
    const { racine } = depotCommun();
    const lire = (f: string) => (f === CIBLE ? CIBLE_HEAD : f === COMMUN ? COMMUN_HEAD : null);
    expect(cargoDeHead.testsDeHead(CIBLE, racine, lire)).toEqual([
      'ancien',
      'groupe::interne',
      'common::commun',
    ]);
    expect(cargoDeHead.testsDeHead('crates/service/src/neuf.rs', racine, lire)).toBeNull();
  });

  it('criterion 7: the lot changes tests/common, the tree alone breaks the build: played again without it, HEAD’s names read, no red of build', () => {
    const { racine, ctx } = depotCommun();
    const appels: [string[], string[]][] = [];
    const r = jouerAvecLesVersionsDAvant(ctx, [CIBLE], fauxBuild(racine, appels));
    expect(appels).toEqual([
      [[CIBLE], [CIBLE]],
      [[CIBLE], []],
    ]);
    expect(r.constructions).toEqual([]);
    expect(r.resultats).toEqual(['joué']);
    expect(r.arbres.size).toBe(0);
    expect(r.avant).toEqual(new Map());
    expect(r.lus).toEqual(new Map([[CIBLE, ['ancien', 'groupe::interne', 'common::commun']]]));
    expect(readFileSync(path.join(racine, CIBLE), 'utf8')).toBe(CIBLE_LOT);
    expect(nonSuivis(racine).filter(f => f.includes('circuit_avant'))).toEqual([]);
    expect(lister(ctx.tmp)).toEqual([]);
  });

  it('criterion 7: a build the lot alone breaks stays a red', () => {
    const { racine, ctx } = depotCommun(CIBLE_HEAD);
    const r = jouerAvecLesVersionsDAvant(ctx, [CIBLE], fauxBuild(racine, []));
    expect(r.constructions).toEqual([{ nom: 'service', erreur: 'E0061' }]);
  });

  it('a build that passes with the tree plays once, the tree kept in the result', () => {
    const { racine, ctx } = depotCommun(CIBLE_HEAD);
    ecrire(racine, COMMUN, COMMUN_HEAD);
    const appels: [string[], string[]][] = [];
    const r = jouerAvecLesVersionsDAvant(ctx, [CIBLE], fauxBuild(racine, appels));
    expect(appels).toEqual([[[CIBLE], [CIBLE]]]);
    expect([...r.arbres.keys()]).toEqual([CIBLE]);
    expect(r.constructions).toEqual([]);
  });
});

describe('grillhouse-3e2.3, criterion 8 — what the replaced leaves', () => {
  it('the circuit still asks the module of TypeScript for its sibling, and holds no name of Rust or Python for it', () => {
    const source = readFileSync(path.resolve(__dirname, '../../scripts/activites.mjs'), 'utf8');
    expect(source).toContain('soeurDAvant(');
    expect(source).toContain('arbreDAvant(');
    expect(source).not.toContain('circuit_avant');
    expect(source).not.toContain('sansSoeur');
  });

  it('the sources of the modules of Rust and Python name no sibling', () => {
    for (const f of [
      'cargo/composants.mjs',
      'cargo/index.mjs',
      'python/composants.mjs',
      'python/index.mjs',
    ]) {
      const source = readFileSync(path.resolve(__dirname, '../../scripts/langages', f), 'utf8');
      expect(source, f).not.toContain('soeurDAvant');
      expect(source, f).not.toContain('circuit_avant');
    }
  });
});
