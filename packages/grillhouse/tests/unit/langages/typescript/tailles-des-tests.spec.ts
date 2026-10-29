// grillhouse-3dr.4: the pyramid of the tests (Software Engineering at Google, ch. 11 and 14) and the
// sizes of Bazel (`size = small | medium | large`), in the frame and in Grillhouse. The guard of the
// sizes (scripts/langages/typescript/tailles-des-tests.mjs) classes each test file by a static reading of its text and
// of the test material it imports: small, it imports one module of the repository and starts no
// process; medium, several modules or processes; large, it mounts a trial repository and starts
// something else than git there. A large test of the day is refused, the known debt
// (`grillhouse-dette.json`, scripts/dette.mjs) inscribing those that exist; a night test
// (`*.nuit.test.*`) is never refused. The update inscribes a project's debt once
// (./migration.tailles-des-tests.spec.ts).
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { juger, lire as lireDette } from '../../../../scripts/dette.mjs';
import { gardesDuCadre } from '../../../../scripts/gardes-du-cadre.mjs';
import { commandeDe } from '../../../../scripts/sous-commandes.mjs';
import {
  classer,
  GARDE,
  GRAND_DE_JOUR,
  testsDuDepot,
  verifier,
} from '../../../../scripts/langages/typescript/tailles-des-tests.mjs';

const DEPOT = path.resolve(__dirname, '../../../../../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'tailles-des-tests-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// A repository of files held in memory: the reader the classification takes, each path absolute
// under /r.
const R = '/r';
const memoire = (fichiers: Record<string, string>) => (f: string) =>
  fichiers[path.relative(R, f)] ?? null;
const tailleDe = (fichiers: Record<string, string>, test: string) =>
  classer(path.join(R, test), memoire(fichiers)).taille;

// The texts of the cases; those that start a process lie in files of their own (tests/formes/
// tailles/), so that the reading of this file sees none of them.
const UN_MODULE = "import { a } from '../src/a.js';\nit('a', () => a());\n";
const DEUX_MODULES =
  "import { a } from '../src/a.js';\nimport { b } from '../src/b.js';\nit('ab', () => a(b()));\n";
const forme = (f: string) =>
  readFileSync(path.join(__dirname, '../../../formes/tailles', f), 'utf8');
const GIT_SEUL = forme('git-seul.txt');
const PROCESSUS = forme('processus.txt');
const GRAND = forme('grand.txt');
const MATIERE_GRANDE = forme('matiere-grande.txt');

describe('grillhouse-3dr.4 critère 5 — the guard classes each test by its size, from its text', () => {
  it('critère 5: small, it imports its module alone and starts no process', () => {
    expect(tailleDe({ 'tests/a.test.ts': UN_MODULE, 'src/a.ts': '' }, 'tests/a.test.ts')).toBe(
      'petit'
    );
  });

  it('critère 5: medium, it imports several modules', () => {
    expect(
      tailleDe(
        { 'tests/ab.test.ts': DEUX_MODULES, 'src/a.ts': '', 'src/b.ts': '' },
        'tests/ab.test.ts'
      )
    ).toBe('moyen');
  });

  it('critère 5: medium, it starts a local process without a trial repository', () => {
    expect(tailleDe({ 'tests/cli.test.ts': PROCESSUS }, 'tests/cli.test.ts')).toBe('moyen');
  });

  it('critère 5: medium, it mounts a trial repository with git alone, the module run in its process', () => {
    expect(tailleDe({ 'tests/repo.test.ts': GIT_SEUL }, 'tests/repo.test.ts')).toBe('moyen');
  });

  it('critère 5: large, it mounts a trial repository and starts the product or the frame there', () => {
    expect(tailleDe({ 'tests/v.test.ts': GRAND }, 'tests/v.test.ts')).toBe('grand');
  });

  it('critère 5: large through the test material it imports, followed from file to file', () => {
    const fichiers = {
      'tests/c.spec.ts': "import { essai } from './aide.js';\nit('c', () => essai('x'));\n",
      'tests/aide.ts': "export { essai } from './essai.js';\n",
      'tests/essai.ts': MATIERE_GRANDE,
    };
    expect(tailleDe(fichiers, 'tests/c.spec.ts')).toBe('grand');
  });

  it('critère 5: a module of the product the test imports is not read: what it starts is its own', () => {
    const fichiers = {
      'tests/m.test.ts': "import { m } from '../src/m.js';\nit('m', () => m());\n",
      'src/m.ts': MATIERE_GRANDE,
    };
    expect(tailleDe(fichiers, 'tests/m.test.ts')).toBe('petit');
  });

  it('critère 5: a regular expression that runs `.exec(` starts no process', () => {
    const texte = "import { a } from '../src/a.js';\nit('r', () => /x/.exec(a('init')));\n";
    expect(tailleDe({ 'tests/r.test.ts': texte }, 'tests/r.test.ts')).toBe('petit');
  });
});

// A trial repository whose test files are <fichiers>, committed or not as git lists them.
function depot(fichiers: Record<string, string>) {
  const r = mkdtempSync(path.join(ESSAIS, 'depot-'));
  spawnSync('git', ['init', '-q', r]);
  writeFileSync(path.join(r, '.gitignore'), 'node_modules/\n');
  for (const [f, t] of Object.entries(fichiers)) {
    mkdirSync(path.dirname(path.join(r, f)), { recursive: true });
    writeFileSync(path.join(r, f), t);
  }
  return r;
}

describe('grillhouse-3dr.4 critère 3 — the guard refuses a large test of the day', () => {
  it('critère 3: a large test of the day is a finding, keyed by its file and the rule', () => {
    const r = depot({ 'tests/v.test.ts': GRAND, 'tests/a.test.ts': UN_MODULE, 'src/a.ts': '' });
    const constats = verifier(r) as { fichier: string; regle: string; message: string }[];
    expect(constats.map(c => [c.fichier, c.regle])).toEqual([['tests/v.test.ts', GRAND_DE_JOUR]]);
    expect(constats[0]?.message).toMatch(/nuit\.test/);
  });

  it('critère 3: a large night test, or a time budget bench, is no finding', () => {
    const r = depot({ 'tests/v.nuit.test.ts': GRAND, 'tests/w.budget.test.ts': GRAND });
    expect(verifier(r)).toEqual([]);
  });

  it('critère 3: the test files are those git lists, the ignored ones (node_modules) left out', () => {
    const r = depot({ 'node_modules/x/v.test.ts': GRAND, 'tests/a.test.ts': UN_MODULE });
    expect(testsDuDepot(r)).toEqual(['tests/a.test.ts']);
  });

  it('critère 3: the debt inscribed passes, and a new large test of the day is refused', () => {
    const r = depot({ 'tests/v.test.ts': GRAND });
    const dette = { [GARDE]: { 'tests/v.test.ts': { [GRAND_DE_JOUR]: { count: 1 } } } };
    expect(juger(dette, GARDE, verifier(r)).refus).toEqual([]);
    writeFileSync(path.join(r, 'tests/neuf.test.ts'), GRAND);
    const { refus } = juger(dette, GARDE, verifier(r)) as { refus: { fichier: string }[] };
    expect(refus.map(c => c.fichier)).toEqual(['tests/neuf.test.ts']);
  });
});

describe('grillhouse-3dr.4 critères 3 et 4 — a guard of the frame, in Grillhouse as in each project', () => {
  it('critère 4: the guard is in the one list of the frame’s guards, which every project plays', () => {
    const racine = path.resolve(__dirname, '../../../../../..');
    const scripts = gardesDuCadre(racine).map(([f]) => path.basename(f));
    expect(scripts).toContain('tailles-des-tests.mjs');
    expect(path.basename(commandeDe('tailles-des-tests', racine)?.script ?? '')).toBe(
      'tailles-des-tests.mjs'
    );
  });

  it('critère 4: Grillhouse inscribes its own large tests of the day in its debt, frozen', () => {
    const dette = lireDette(DEPOT) as Record<string, Record<string, unknown>>;
    const inscrits = Object.keys(dette[GARDE] ?? {});
    expect(inscrits.length).toBeGreaterThan(0);
    expect(inscrits.every(f => /\.(test|spec)\.[cm]?[jt]sx?$/.test(f))).toBe(true);
    expect(inscrits.some(f => /\.nuit\.(test|spec)\./.test(f))).toBe(false);
  });
});

// The texts of the frame that carry the rule, read as their reader reads them.
const texte = (f: string) => readFileSync(path.join(DEPOT, f), 'utf8');

describe('grillhouse-3dr.4 critères 1 et 2 — the rule in the charter and the skills', () => {
  it('critère 1: the common charter writes the three sizes, and the large test is a night test', () => {
    const charte = texte('mods/grillhouse/charte.md');
    const regle = charte.slice(charte.indexOf('**La taille d'));
    expect(regle).toMatch(/petit/);
    expect(regle).toMatch(/moyen/);
    expect(regle).toMatch(/grand[^.]*\*\.nuit\.test\.\*/);
  });

  it('critère 2: the testwriter chooses the smallest size that proves the criterion', () => {
    expect(texte('mods/grillhouse/skills/testwriter/SKILL.md')).toMatch(
      /\*\*La plus petite taille qui prouve\*\*/
    );
  });

  it('critère 2: the reviewer sends back a large test where a small one suffices', () => {
    expect(texte('mods/grillhouse/skills/relecteur/SKILL.md')).toMatch(
      /grand là où un petit suffit/
    );
  });
});
