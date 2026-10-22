import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { codeMortEssai } from './code-mort-essai.js';
import {
  HORS_CADRE,
  DEP_DEV,
  json,
  T,
  testVitest,
  racine,
  codeMortTestsBancsEssai,
} from './code-mort-tests-bancs-essai.js';

// Ticket grillhouse-3uv.62: the dead-code guard counts the tests and benches of a component as a
// use of its development dependencies (criterion 1); the findings on files, exports and types
// stay those of today (criteria 2 and 4); the project's knip.json keeps the hand (criterion 3);
// a production dependency read only by a test counts as used (criterion 5); a file the project's
// `ignore` targets is not read, even under test/ or tests/ (criterion 6); a test file is known by
// the one rule of the repository (criterion 7); the list of test files follows .gitignore
// (criterion 8).
// Each test runs the real guard (knip) in a repository built for it.
//
// This file: criteria 1 and 2; criteria 3 to 8 are in code-mort-tests-bancs.projet.
// The trial matter: ./code-mort-tests-bancs-essai.ts.

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'code-mort-tests-bancs-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { essai } = codeMortTestsBancsEssai(ESSAIS);

// src/a.ts: `base` is read by the entry, `pourTest` by a test file, `pourAide` and the type
// `Forme` by a test helper alone.
const SOURCE_A = {
  'src/index.ts': "import { base } from './a';\nexport const i = base;\n",
  'src/a.ts':
    'export const base = 1;\nexport const pourTest = 2;\nexport const pourAide = 3;\nexport type Forme = { n: number };\n',
};

describe('critère 1 — the test and bench files of a component count as a use of its development dependencies', () => {
  it(
    'critère 1 — a test helper under tests/, not named *.test.*, keeps its development dependency alive',
    () => {
      const r = essai({
        'package.json': racine({ 'dep-aide': '*' }),
        'tests/unit/a.test.ts': testVitest("import { aide } from './aide';"),
        'tests/unit/aide.ts': "import 'dep-aide';\nexport const aide = 1;\n",
      });
      expect(r.sortie).not.toContain('dep-aide');
      expect(r.status, r.sortie).toBe(0);
    },
    T
  );
  it(
    'critère 1 — a test helper under test/ (BPScript: test/fixtures.ts) keeps its development dependency alive',
    () => {
      const r = essai({
        'package.json': racine({ 'dep-fixtures': '*' }),
        'test/a.test.ts': testVitest("import { f } from './fixtures';"),
        'test/fixtures.ts': "import 'dep-fixtures';\nexport const f = 1;\n",
      });
      expect(r.sortie).not.toContain('dep-fixtures');
      expect(r.status, r.sortie).toBe(0);
    },
    T
  );
  it(
    'critère 1 — a test helper in .mjs under test/ (BPScript: test/*.mjs) keeps its development dependency alive',
    () => {
      const r = essai({
        'package.json': racine({ 'dep-mjs': '*' }),
        'test/a.test.ts': testVitest("import { m } from './outil.mjs';"),
        'test/outil.mjs': "import 'dep-mjs';\nexport const m = 1;\n",
      });
      expect(r.sortie).not.toContain('dep-mjs');
      expect(r.status, r.sortie).toBe(0);
    },
    T
  );
  it(
    'critère 1 — a helper nested deeper (tests/support/outils/) keeps its development dependency alive',
    () => {
      const r = essai({
        'package.json': racine({ 'dep-profond': '*' }),
        'tests/unit/a.test.ts': testVitest("import { o } from '../support/outils/o';"),
        'tests/support/outils/o.ts': "import 'dep-profond';\nexport const o = 1;\n",
      });
      expect(r.sortie).not.toContain('dep-profond');
      expect(r.status, r.sortie).toBe(0);
    },
    T
  );
  it(
    'critère 1 — a helper that no test imports still counts: every file under tests/ is a test file',
    () => {
      const r = essai({
        'package.json': racine({ 'dep-seule': '*' }),
        'tests/unit/a.test.ts': testVitest(),
        'tests/outils/seul.ts': "import 'dep-seule';\nexport const s = 1;\n",
      });
      expect(r.sortie).not.toContain('dep-seule');
      expect(r.status, r.sortie).toBe(0);
    },
    T
  );
  it(
    'critère 1 — files named *.test.*, *.spec.*, *.budget.test.*, *.nuit.test.* keep their dependencies alive',
    () => {
      const r = essai({
        'package.json': racine({
          'dep-test': '*',
          'dep-spec': '*',
          'dep-budget': '*',
          'dep-nuit': '*',
        }),
        'tests/unit/a.test.ts': testVitest("import 'dep-test';"),
        'tests/unit/b.spec.ts': testVitest("import 'dep-spec';"),
        'tests/unit/c.budget.test.ts': testVitest("import 'dep-budget';"),
        'tests/unit/d.nuit.test.ts': testVitest("import 'dep-nuit';"),
      });
      expect(r.sortie).not.toMatch(/dep-(test|spec|budget|nuit)/);
      expect(r.status, r.sortie).toBe(0);
    },
    T
  );
  it(
    'critère 1 — a bench or night file outside tests/ (*.budget.*, *.nuit.*, not *.test.*) keeps its dependency alive',
    () => {
      const r = essai({
        'package.json': racine({ 'dep-banc': '*', 'dep-longue': '*' }),
        'bancs/rendu.budget.ts': "import 'dep-banc';\nexport const b = 1;\n",
        'bancs/longue.nuit.ts': "import 'dep-longue';\nexport const l = 1;\n",
        'tests/unit/a.test.ts': testVitest(),
      });
      expect(r.sortie).not.toMatch(/dep-(banc|longue)/);
      expect(r.status, r.sortie).toBe(0);
    },
    T
  );
  it(
    'critère 1 — a test file next to the code (src/a.spec.ts) keeps its dependency alive',
    () => {
      const r = essai({
        'package.json': racine({ 'dep-voisin': '*' }),
        'src/a.spec.ts': testVitest("import 'dep-voisin';"),
      });
      expect(r.sortie).not.toContain('dep-voisin');
      expect(r.status, r.sortie).toBe(0);
    },
    T
  );
  it(
    'critère 1 — workspaces packages/* (BPScript form): a package helper under test/ keeps its own development dependency alive',
    () => {
      const r = codeMortEssai(ESSAIS, {
        'package.json': json({ name: 'r', private: true, workspaces: ['packages/*'] }),
        'knip.json': json({
          workspaces: {
            '.': { entry: [], project: [] },
            'packages/*': { entry: ['src/index.ts'], project: ['src/**/*.ts'] },
          },
        }),
        'packages/p/package.json': json({
          name: '@demo/p',
          main: 'src/index.ts',
          devDependencies: { vitest: '*', 'dep-paquet': '*' },
        }),
        'packages/p/src/index.ts': 'export const p = 1;\n',
        'packages/p/test/p.test.ts': testVitest("import { f } from './fixtures';"),
        'packages/p/test/fixtures.ts': "import 'dep-paquet';\nexport const f = 1;\n",
      });
      expect(r.sortie).not.toContain('dep-paquet');
      expect(r.status, r.sortie).toBe(0);
    },
    T
  );
  it(
    'critère 1 — without knip.json and without a test runner, a test helper under test/ keeps its development dependency alive',
    () => {
      const r = codeMortEssai(ESSAIS, {
        'package.json': json({ name: 'r', private: true, devDependencies: { 'dep-nu': '*' } }),
        'src/index.ts': 'export const i = 1;\n',
        'test/aide.ts': "import 'dep-nu';\nexport const a = 1;\n",
      });
      expect(r.sortie).not.toContain('dep-nu');
    },
    T
  );
  it(
    'critère 1 — witness: without knip.json, with vitest, knip defaults already count a test helper',
    () => {
      const r = codeMortEssai(ESSAIS, {
        'package.json': racine({ 'dep-defaut': '*' }),
        'src/index.ts': 'export const i = 1;\n',
        'test/a.test.ts': testVitest("import { a } from './aide';"),
        'test/aide.ts': "import 'dep-defaut';\nexport const a = 1;\n",
      });
      expect(r.sortie).not.toContain('dep-defaut');
      expect(r.status, r.sortie).toBe(0);
    },
    T
  );
  it(
    'critère 1 — refusal: a development dependency named only in a comment of a test helper stays « sans usage »',
    () => {
      const r = essai({
        'package.json': racine({ 'dep-commentaire': '*' }),
        'tests/unit/a.test.ts': testVitest("import { aide } from './aide';"),
        'tests/unit/aide.ts': "// dep-commentaire n'est cité qu'ici\nexport const aide = 1;\n",
      });
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain(`package.json : ${DEP_DEV} — dep-commentaire`);
    },
    T
  );
  it(
    'critère 1 — refusal: a development dependency nothing imports stays « sans usage », next to one a helper uses',
    () => {
      const r = essai({
        'package.json': racine({ 'dep-aide': '*', 'dep-morte': '*' }),
        'tests/unit/a.test.ts': testVitest("import { aide } from './aide';"),
        'tests/unit/aide.ts': "import 'dep-aide';\nexport const aide = 1;\n",
      });
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain(`package.json : ${DEP_DEV} — dep-morte`);
      expect(r.sortie).not.toContain('dep-aide');
    },
    T
  );
  it(
    'critère 1 — refusal: a dependency used only by the tests of a package listed out of the frame stays « sans usage » (3uv.32)',
    () => {
      const files = {
        'package.json': json({
          name: 'r',
          private: true,
          workspaces: ['packages/*'],
          devDependencies: { vitest: '*', 'dep-gelee': '*' },
        }),
        'knip.json': json({
          entry: ['src/index.ts'],
          project: ['src/**/*.ts', 'packages/**/src/**/*.ts'],
        }),
        'src/index.ts': 'export const i = 1;\n',
        'tests/unit/r.test.ts': testVitest(),
        'packages/v1/package.json': json({ name: '@demo/v1', main: 'src/index.ts' }),
        'packages/v1/src/index.ts': 'export const v = 1;\n',
        'packages/v1/test/v1.test.ts': testVitest("import { f } from './fixtures';"),
        'packages/v1/test/fixtures.ts': "import 'dep-gelee';\nexport const f = 1;\n",
      };
      const temoin = codeMortEssai(ESSAIS, files);
      expect(temoin.sortie).not.toContain('dep-gelee');
      const r = codeMortEssai(ESSAIS, { ...files, [HORS_CADRE]: 'v1 version gelée\n' });
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain(`package.json : ${DEP_DEV} — dep-gelee`);
      expect(r.sortie).not.toContain('packages/v1');
    },
    T
  );
});

describe('critère 2 — an export used only by a test stays an export without a production caller, as today', () => {
  it(
    'critère 2 — an export and a type read only by a test helper stay « sans appelant », the helper dependency counted',
    () => {
      const r = essai({
        ...SOURCE_A,
        'package.json': racine({ 'dep-aide': '*' }),
        'tests/unit/a.test.ts': testVitest("import { aide } from './aide';"),
        'tests/unit/aide.ts':
          "import 'dep-aide';\nimport { pourAide } from '../../src/a';\nimport type { Forme } from '../../src/a';\nexport const aide: Forme = { n: pourAide };\n",
      });
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain('src/a.ts : export sans appelant — pourAide');
      expect(r.sortie).toContain('src/a.ts : type exporté sans appelant — Forme');
      expect(r.sortie).not.toContain('dep-aide');
    },
    T
  );
  it(
    'critère 2 — an export read by a *.test.* file stays as today: not reported',
    () => {
      const r = essai({
        ...SOURCE_A,
        'package.json': racine({}),
        'tests/unit/a.test.ts': testVitest(
          "import { pourTest } from '../../src/a';",
          'void pourTest;'
        ),
      });
      expect(r.sortie).not.toContain('pourTest');
    },
    T
  );
  it(
    'critère 2 — in a package of packages/*, an export read only by its test helper stays « sans appelant »',
    () => {
      const r = codeMortEssai(ESSAIS, {
        'package.json': json({ name: 'r', private: true, workspaces: ['packages/*'] }),
        'knip.json': json({
          workspaces: {
            '.': { entry: [], project: [] },
            'packages/*': { entry: ['src/index.ts'], project: ['src/**/*.ts'] },
          },
        }),
        'packages/p/package.json': json({
          name: '@demo/p',
          main: 'src/index.ts',
          devDependencies: { vitest: '*', 'dep-paquet': '*' },
        }),
        'packages/p/src/index.ts': "import { base } from './outil';\nexport const p = base;\n",
        'packages/p/src/outil.ts': 'export const base = 1;\nexport const pourAide = 2;\n',
        'packages/p/test/p.test.ts': testVitest("import { f } from './fixtures';"),
        'packages/p/test/fixtures.ts':
          "import 'dep-paquet';\nimport { pourAide } from '../src/outil';\nexport const f = pourAide;\n",
      });
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain('packages/p/src/outil.ts : export sans appelant — pourAide');
      expect(r.sortie).not.toContain('dep-paquet');
    },
    T
  );
});
