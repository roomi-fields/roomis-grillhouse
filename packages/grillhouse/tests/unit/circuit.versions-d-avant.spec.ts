// grillhouse-3e2 — the proof of the red plays HEAD's version of a test file of TypeScript beside
// it, as a sibling (`soeurDAvant`, scripts/jointure.d.ts); in Rust and in Python it plays in a tree
// of its own (grillhouse-3e2.3, ./circuit.arbre-d-avant.spec.ts). Witness: SyntHub SH-cgi.15
// (2026-11-02), where the proof of crates/service/tests/electra_reimport.rs, a file HEAD holds,
// said « fichier neuf, que HEAD ne tient pas » and refused 20 existing greens.
//
// `avecLesVersionsDAvant(ctx, fichiers, jouer)` writes HEAD's version of each file of <fichiers>
// that HEAD holds beside it when its module names a sibling, calls <jouer> with the map file →
// sibling, and removes the siblings after it, red included. Against the fake cargo
// (./langages/cargo/faux-cargo.ts), which reads the targets from the manifests as cargo does.
//
// It reads the circuit and its facts by their path, beyond what it imports, and declares them.
// @lit packages/grillhouse/scripts/circuit.mjs packages/grillhouse/scripts/faits-du-circuit.mjs
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import * as activites from '../../scripts/activites.mjs';
import moduleCargo from '../../scripts/langages/cargo/index.mjs';
import { avecFauxCargo, installerFauxCargo } from './langages/cargo/faux-cargo.js';

const avecLesVersionsDAvant = activites.avecLesVersionsDAvant as (
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
      'typescript',
      { 'packages/a': 'typescript' },
      TYPESCRIPT,
      'packages/a/test/ancien.test.ts',
      'packages/a/test/ancien.circuit-avant.test.ts',
      'packages/a/test/neuf.test.ts',
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
    const [, langages, fichiers, modifie, , neuf] = LANGAGES[0] as (typeof LANGAGES)[number];
    const racine = depot(langages, fichiers, modifie, neuf);
    expect(avecLesVersionsDAvant({ copie: racine }, [modifie], avant => avant.size)).toBe(1);
  });

  it('the circuit builds no name of a language of its own: it asks the module (soeurDAvant)', () => {
    const source = readFileSync(path.resolve(__dirname, '../../scripts/activites.mjs'), 'utf8');
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
const vertsDeHead = activites.vertsDeHead as (
  resultats: Rapports,
  copie: string,
  f: string,
  avant: Map<string, string>,
  lus?: Map<string, string[]>
) => Set<string>;
const cargo = moduleCargo as unknown as { verdict: (d: string) => { rapports: Rapports } };

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
    // A file of a target tests/<dossier>/main.rs names its own tests: aide.rs names aide::aidant.
    ['crates/service/tests/scenario/main.rs', ['principal']],
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

// grillhouse-3e2.1 — a sibling a killed process left in the copy, between its writing and its
// removal, is swept before the next measure and never enters the lot nor the commit
// (`balayerLesSoeurs`): a file git does not track, the sibling (`soeurDAvant` of the module) of a
// file of its folder that git tracks and that exists. The reviewer of grillhouse-3e2 found it.
const balayerLesSoeurs = activites.balayerLesSoeurs as (ctx: { copie: string }) => string[];
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

  it('criterion 3: a file named as a sibling is kept when git tracks it or when its file is absent', () => {
    const [, langages, fichiers, modifie, , neuf] = LANGAGES[0] as (typeof LANGAGES)[number];
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

  it('each sibling swept is named in the log of the ticket', () => {
    const [, langages, fichiers, modifie, soeur, neuf] = LANGAGES[0] as (typeof LANGAGES)[number];
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
    // The end of the opening of a run (`finirLOuverture`), which the circuit and its workflow
    // under Temporal play before their first step, its plan written, sweeps before it hands the
    // run its start (grillhouse-4nr.6.3: the opening and its plan are steps apart).
    const source = readFileSync(path.resolve(__dirname, '../../scripts/circuit.mjs'), 'utf8');
    const fin = source.slice(source.indexOf('export function finirLOuverture('));
    expect(fin.slice(0, fin.indexOf('return { debut: d }'))).toContain('balayerLesSoeurs(ctx)');
    // The act of the opening ends it so (scripts/faits-du-circuit.mjs, grillhouse-4nr.12).
    const actes = readFileSync(
      path.resolve(__dirname, '../../scripts/faits-du-circuit.mjs'),
      'utf8'
    );
    const ouvrirSur = actes.slice(actes.indexOf('async function ouvrirSur('));
    expect(ouvrirSur.slice(0, ouvrirSur.indexOf('\n}\n'))).toContain(
      'finirLOuverture(ctx, o.debut)'
    );
  });
});
