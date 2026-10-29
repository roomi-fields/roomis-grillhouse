import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
  KNIP_SRC,
  codeMortTestsBancsEssai,
} from './code-mort-tests-bancs-essai.js';

// Ticket grillhouse-3uv.62 (tests/unit/code-mort-tests-bancs.spec.ts): the project's knip.json
// keeps the hand (criterion 3); the findings on files, exports and types stay those of today
// (criterion 4); a production dependency read only by a test counts as used (criterion 5); a file
// the project's `ignore` targets is not read (criterion 6); a test file is known by the one rule
// of the repository (criterion 7); the list of test files follows .gitignore (criterion 8).
// Each test runs the real guard (knip) in a repository built for it.
// The trial matter: ./code-mort-tests-bancs-essai.ts.

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'code-mort-tests-bancs-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { essai } = codeMortTestsBancsEssai(ESSAIS);

const DEP_PROD = 'dépendance sans usage';

describe("critère 3 — the project's own settings (knip.json) keep the hand", () => {
  it(
    'critère 3 — ignoreDependencies of the project still holds',
    () => {
      const r = essai({
        'knip.json': json({ ...KNIP_SRC, ignoreDependencies: ['dep-ignoree'] }),
        'package.json': racine({ 'dep-ignoree': '*' }),
        'tests/unit/a.test.ts': testVitest(),
      });
      expect(r.sortie).not.toContain('dep-ignoree');
      expect(r.status, r.sortie).toBe(0);
    },
    T
  );
  it(
    "critère 3 — a project whose own project setting covers tests/ keeps today's findings: an orphan helper is « fichier sans appelant »",
    () => {
      const r = essai({
        'knip.json': json({ entry: ['src/index.ts'], project: ['src/**/*.ts', 'tests/**/*.ts'] }),
        'package.json': racine({ 'dep-aide': '*' }),
        'tests/unit/a.test.ts': testVitest(),
        'tests/unit/orpheline.ts': "import 'dep-aide';\nexport const o = 1;\n",
      });
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain('tests/unit/orpheline.ts : fichier sans appelant');
    },
    T
  );
  it(
    "critère 3 — the project's own entry still decides what is alive in src/",
    () => {
      const r = essai({
        'knip.json': json({ entry: ['src/index.ts', 'src/outil.ts'], project: ['src/**/*.ts'] }),
        'package.json': racine({ 'dep-aide': '*' }),
        'src/outil.ts': 'export const outil = 1;\n',
        'src/mort.ts': 'export const mort = 1;\n',
        'tests/unit/a.test.ts': testVitest("import { aide } from './aide';"),
        'tests/unit/aide.ts': "import 'dep-aide';\nexport const aide = 1;\n",
      });
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).not.toContain('src/outil.ts');
      expect(r.sortie).toContain('src/mort.ts : fichier sans appelant');
      expect(r.sortie).not.toContain('dep-aide');
    },
    T
  );
  it(
    "critère 3 — without knip.json, knip's default entry src/main.ts keeps its production dependency alive",
    () => {
      const r = codeMortEssai(ESSAIS, {
        'package.json': json({ name: 'r', private: true, dependencies: { 'dep-main': '*' } }),
        'src/main.ts': "import 'dep-main';\nexport {};\n",
      });
      expect(r.sortie).not.toContain('dep-main');
      expect(r.status, r.sortie).toBe(0);
    },
    T
  );
  it(
    "critère 3 — a knip.json without entry keeps knip's default entries: cli.ts at the root keeps its production dependency alive",
    () => {
      const r = codeMortEssai(ESSAIS, {
        'package.json': json({ name: 'r', private: true, dependencies: { 'dep-cli': '*' } }),
        'knip.json': json({ project: ['*.ts', 'src/**/*.ts'] }),
        'cli.ts': "import 'dep-cli';\nexport {};\n",
      });
      expect(r.sortie).not.toContain('dep-cli');
      expect(r.status, r.sortie).toBe(0);
    },
    T
  );
  it(
    'critère 3 — the project knip.json is left byte for byte',
    () => {
      const r = essai({
        'package.json': racine({ 'dep-aide': '*' }),
        'tests/unit/a.test.ts': testVitest("import { aide } from './aide';"),
        'tests/unit/aide.ts': "import 'dep-aide';\nexport const aide = 1;\n",
      });
      expect(readFileSync(path.join(r.dir, 'knip.json'), 'utf8')).toBe(json(KNIP_SRC));
    },
    T
  );
});

describe('critère 4 — the findings on files, exports and types are unchanged: tests count only for dependencies', () => {
  it(
    'critère 4 — no test or helper file under a project limited to src/ is « fichier sans appelant »; a dead source file still is',
    () => {
      const r = essai({
        'package.json': racine({ 'dep-aide': '*' }),
        'src/mort.ts': 'export const mort = 1;\n',
        'tests/unit/a.test.ts': testVitest("import { aide } from './aide';"),
        'tests/unit/aide.ts': "import 'dep-aide';\nexport const aide = 1;\n",
        'tests/unit/orphelin.ts': 'export const orphelin = 1;\n',
        'test/fixtures.ts': 'export const f = 1;\n',
        'bancs/rendu.budget.ts': 'export const b = 1;\n',
      });
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain('src/mort.ts : fichier sans appelant');
      expect(r.sortie).not.toMatch(/tests?\/|bancs\//);
    },
    T
  );
  it(
    'critère 4 — no export or type of a test helper is « sans appelant »',
    () => {
      const r = essai({
        'package.json': racine({ 'dep-aide': '*' }),
        'tests/unit/a.test.ts': testVitest("import { aide } from './aide';"),
        'tests/unit/aide.ts':
          "import 'dep-aide';\nexport const aide = 1;\nexport const inutile = 2;\nexport type Inutile = number;\n",
      });
      expect(r.sortie).not.toContain('inutile');
      expect(r.sortie).not.toContain('Inutile');
      expect(r.status, r.sortie).toBe(0);
    },
    T
  );
  it(
    'critère 4 — without knip.json and without a test runner, the file findings stay those of today',
    () => {
      const r = codeMortEssai(ESSAIS, {
        'package.json': json({ name: 'r', private: true, devDependencies: { 'dep-nu': '*' } }),
        'src/index.ts': 'export const i = 1;\n',
        'test/a.test.ts': "import { a } from './aide';\nexport const b = a;\n",
        'test/aide.ts': "import 'dep-nu';\nexport const a = 1;\n",
      });
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain('test/a.test.ts : fichier sans appelant');
      expect(r.sortie).toContain('test/aide.ts : fichier sans appelant');
      expect(r.sortie).not.toContain('dep-nu');
    },
    T
  );
});

describe('critère 5 — a production dependency read only by a test or a bench counts as used', () => {
  it(
    'critère 5 — a production dependency read only by a test helper under tests/ is not « sans usage »',
    () => {
      const r = essai({
        'package.json': racine({}, { dependencies: { 'dep-prod-aide': '*' } }),
        'tests/unit/a.test.ts': testVitest("import { aide } from './aide';"),
        'tests/unit/aide.ts': "import 'dep-prod-aide';\nexport const aide = 1;\n",
      });
      expect(r.sortie).not.toContain('dep-prod-aide');
      expect(r.status, r.sortie).toBe(0);
    },
    T
  );
  it(
    'critère 5 — refusal: a production dependency nothing imports stays « sans usage », next to one a helper uses',
    () => {
      const r = essai({
        'package.json': racine(
          {},
          { dependencies: { 'dep-prod-aide': '*', 'dep-prod-morte': '*' } }
        ),
        'tests/unit/a.test.ts': testVitest("import { aide } from './aide';"),
        'tests/unit/aide.ts': "import 'dep-prod-aide';\nexport const aide = 1;\n",
      });
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain(`package.json : ${DEP_PROD} — dep-prod-morte`);
      expect(r.sortie).not.toContain('dep-prod-aide');
    },
    T
  );
});

describe("critère 6 — a file the project's ignore targets is not read, even under test/ or tests/", () => {
  it(
    "critère 6 — a helper under test/ that the project's ignore targets is not read: its dependency stays « sans usage »",
    () => {
      const files = {
        'package.json': racine({ 'dep-ignoree': '*', 'dep-lue': '*' }),
        'test/a.test.ts': testVitest(),
        'test/ancien/vieux.ts': "import 'dep-ignoree';\nexport const v = 1;\n",
        'test/outil.ts': "import 'dep-lue';\nexport const o = 1;\n",
      };
      const r = essai({
        ...files,
        'knip.json': json({ ...KNIP_SRC, ignore: ['test/ancien/**'] }),
      });
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain(`package.json : ${DEP_DEV} — dep-ignoree`);
      expect(r.sortie).not.toContain('dep-lue');
      expect(r.sortie).not.toContain('test/ancien');
    },
    T
  );
  it(
    'critère 6 — workspaces packages/* (BPScript form): a package helper the top-level ignore targets is not read, its dependency stays « sans usage »',
    () => {
      const r = codeMortEssai(ESSAIS, {
        'package.json': json({ name: 'r', private: true, workspaces: ['packages/*'] }),
        'knip.json': json({
          ignore: ['packages/p/test/ancien/**'],
          workspaces: {
            '.': { entry: [], project: [] },
            'packages/*': { entry: ['src/index.ts'], project: ['src/**/*.ts'] },
          },
        }),
        'packages/p/package.json': json({
          name: '@d/p',
          main: 'src/index.ts',
          devDependencies: { 'dep-ignoree': '*', 'dep-lue': '*' },
        }),
        'packages/p/src/index.ts': 'export const p = 1;\n',
        'packages/p/test/outil.ts': "import 'dep-lue';\nexport const o = 1;\n",
        'packages/p/test/ancien/vieux.ts': "import 'dep-ignoree';\nexport const v = 1;\n",
      });
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain(`packages/p/package.json : ${DEP_DEV} — dep-ignoree`);
      expect(r.sortie).not.toContain('test/ancien');
    },
    T
  );
  it(
    'critère 6 — workspaces form: a test of a src/ directory listed out of the frame keeps nothing alive (3uv.32)',
    () => {
      const r = codeMortEssai(ESSAIS, {
        'package.json': json({ name: 'r', private: true, devDependencies: { 'dep-gelee': '*' } }),
        'knip.json': json({ workspaces: { '.': KNIP_SRC } }),
        'src/index.ts': 'export const i = 1;\n',
        'src/v1/a.ts': 'export const a = 1;\n',
        'src/v1/a.spec.ts': "import 'dep-gelee';\n",
        [HORS_CADRE]: 'v1 version gelée\n',
      });
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain(`package.json : ${DEP_DEV} — dep-gelee`);
      expect(r.sortie).not.toContain('src/v1');
    },
    T
  );
  it(
    "critère 6 — workspaces packages/*: a package helper that the workspace's own ignore targets is not read, its dependency stays « sans usage »",
    () => {
      const r = codeMortEssai(ESSAIS, {
        'package.json': json({ name: 'r', private: true, workspaces: ['packages/*'] }),
        'knip.json': json({
          workspaces: {
            '.': { entry: [], project: [] },
            'packages/*': {
              entry: ['src/index.ts'],
              project: ['src/**/*.ts'],
              ignore: ['test/ancien/**'],
            },
          },
        }),
        'packages/p/package.json': json({
          name: '@d/p',
          main: 'src/index.ts',
          devDependencies: { 'dep-ignoree': '*', 'dep-lue': '*' },
        }),
        'packages/p/src/index.ts': 'export const p = 1;\n',
        'packages/p/test/outil.ts': "import 'dep-lue';\nexport const o = 1;\n",
        'packages/p/test/ancien/vieux.ts': "import 'dep-ignoree';\nexport const v = 1;\n",
      });
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain(`packages/p/package.json : ${DEP_DEV} — dep-ignoree`);
      expect(r.sortie).not.toContain('dep-lue');
      expect(r.sortie).not.toContain('test/ancien');
    },
    T
  );
});

describe('critère 7 — a test file is known by the one rule of the repository (isTestFile), plus the benches', () => {
  it(
    'critère 7 — a helper in a test, tests or __tests__ directory at any depth keeps its development dependency alive',
    () => {
      const r = essai({
        'package.json': racine({ 'dep-t': '*', 'dep-niche': '*', 'dep-tt': '*' }),
        'tests/unit/a.test.ts': testVitest(),
        'src/moteur/test/fixture.ts': "import 'dep-t';\nexport const f = 1;\n",
        'src/moteur/tests/aide.ts': "import 'dep-niche';\nexport const a = 1;\n",
        'src/moteur/__tests__/outil.ts': "import 'dep-tt';\nexport const o = 1;\n",
      });
      expect(r.sortie).not.toMatch(/dep-(t|niche|tt)\b/);
    },
    T
  );
  it(
    'critère 7 — a __tests__ directory at the root of a package of packages/* keeps its development dependency alive',
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
          devDependencies: { 'dep-paquet-tt': '*' },
        }),
        'packages/p/src/index.ts': 'export const p = 1;\n',
        'packages/p/__tests__/outil.ts': "import 'dep-paquet-tt';\nexport const o = 1;\n",
      });
      expect(r.sortie).not.toContain('dep-paquet-tt');
      expect(r.status, r.sortie).toBe(0);
    },
    T
  );
});

describe('critère 8 — the list of test and bench files follows .gitignore, as knip does', () => {
  it(
    'critère 8 — a test in a ticket copy under .claude/worktrees/ or a build under dist/, both ignored by git, keeps nothing alive',
    () => {
      const r = codeMortEssai(ESSAIS, {
        'package.json': json({
          name: 'r',
          private: true,
          devDependencies: { 'dep-copie': '*', 'dep-dist': '*' },
        }),
        '.gitignore': '.claude/worktrees/\ndist/\n',
        'knip.json': json({ entry: ['src/index.ts'], project: ['src/**/*.ts', 'tests/**/*.ts'] }),
        'src/index.ts': 'export const i = 1;\n',
        '.claude/worktrees/t1/tests/unit/a.spec.ts': "import 'dep-copie';\n",
        'dist/a.test.js': "import 'dep-dist';\n",
      });
      expect(r.status, r.sortie).toBe(1);
      expect(r.sortie).toContain(`package.json : ${DEP_DEV} — dep-copie`);
      expect(r.sortie).toContain(`package.json : ${DEP_DEV} — dep-dist`);
    },
    T
  );
});
