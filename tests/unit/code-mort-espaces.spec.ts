import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { codeMortEssai } from './code-mort-essai.js';

// Ticket grillhouse-3uv.62.2: in a repository of several packages, the settings of the
// dead-code guard give each package its own test and bench files only, as knip declares the
// entries of each workspace (criterion 1); the findings stay those of today (criterion 2); a
// package that no workspace key holds (a knip.json without workspaces, or no knip.json) receives
// its own files too, the root does not (criterion 4); a pattern key gives each package it holds
// its own files, under the key knip chooses for that package (criterion 5, knip's order
// `byPathDepth`: the deepest key; at equal depth, an exact key before a pattern key, and the
// first declared of two pattern keys).
// Each test runs the real guard (knip) in a repository built for it; criterion 1 reads the
// settings the guard hands to knip for its dependency run (the run restricted by `--include`).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'code-mort-espaces-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const T = 60_000;
const json = (o: object) => JSON.stringify(o, null, 2) + '\n';
const TEST = "import { it } from 'vitest';\nit('x', () => {});\n";
const AIDE = 'export const f = 1;\n';
const SRC = { entry: ['src/index.ts'], project: ['src/**/*.ts'] };
const paquet = (nom: string, devDependencies: Record<string, string> = {}) =>
  json({
    name: `@d/${nom}`,
    main: 'src/index.ts',
    devDependencies: { vitest: '*', ...devDependencies },
  });
const racine = (workspaces: string[], devDependencies: Record<string, string> = {}) =>
  json({
    name: 'r',
    private: true,
    workspaces,
    devDependencies: { vitest: '*', ...devDependencies },
  });

type Essai = ReturnType<typeof codeMortEssai>;

// The test and bench files each place of the dependency run's settings receives as entries,
// relative to the trial repository: '' for the top level, the workspace key otherwise. The
// negated patterns (`!…`) are left out: they are not files. The top level is a place only in
// settings without `workspaces`: with them, knip reads the root's settings from the key that
// names « . » alone, empty without one (`getWorkspaceConfig` of knip's ConfigurationChief).
function places(r: Essai): Record<string, string[]> {
  const appel = r.appels.find(a => a.args.includes('--include'));
  expect(appel, `aucun passage des dépendances :\n${r.sortie}`).toBeDefined();
  const config = (appel?.config ?? {}) as {
    entry?: string | string[];
    workspaces?: Record<string, { entry?: string | string[] }>;
  };
  const dir = realpathSync(r.dir);
  const fichiers = (e: string | string[] | undefined) =>
    [e ?? []]
      .flat()
      .filter(x => !x.startsWith('!'))
      .map(x => (path.isAbsolute(x) ? path.relative(dir, x) : x))
      .sort();
  return {
    ...(config.workspaces ? {} : { '': fichiers(config.entry) }),
    ...Object.fromEntries(
      Object.entries(config.workspaces ?? {}).map(([k, v]) => [k, fichiers(v.entry)])
    ),
  };
}

// The package of <paquets> that holds <fichier>: the deepest one, '.' for none.
const proprietaire = (fichier: string, paquets: string[]) =>
  paquets.filter(p => fichier.startsWith(`${p}/`)).sort((a, b) => b.length - a.length)[0] ?? '.';

// The pattern <cle> as knip reads it (picomatch): `**/` spans zero or more directories, `*` and
// `?` stay within one, `{a,b}` is a choice.
const motifCle = (cle: string) =>
  new RegExp(
    `^${cle
      .replace(/[.+^$()|[\]\\]/g, '\\$&')
      .replace(/\*\*\/|\*\*|\*|\?|\{([^}]*)\}/g, (m: string, choix?: string) =>
        choix !== undefined
          ? `(?:${choix.split(',').join('|')})`
          : (
              { '**/': '(?:.*/)?', '**': '.*', '*': '[^/]*', '?': '[^/]' } as Record<string, string>
            )[m]
      )}$`
  );

// A place fits a package: the top level and '.' fit the root, a key fits the packages it names.
const convient = (place: string, paquet: string) =>
  place === '' || place === '.' ? paquet === '.' : motifCle(place).test(paquet);

// Each place receives the files of one package only, a package it fits; each file of <recus>
// is received by a place that fits its package.
function seulsSesFichiers(p: Record<string, string[]>, paquets: string[], recus: string[]) {
  for (const [place, fichiers] of Object.entries(p)) {
    const proprios = [...new Set(fichiers.map(f => proprietaire(f, paquets)))];
    expect(proprios.length, `« ${place} » reçoit ${fichiers.join(', ')}`).toBeLessThanOrEqual(1);
    for (const q of proprios) {
      expect(convient(place, q), `« ${place} » reçoit les fichiers de ${q}`).toBe(true);
    }
  }
  for (const f of recus) {
    const ou = Object.entries(p).filter(([, fs]) => fs.includes(f));
    expect(
      ou.some(([place]) => convient(place, proprietaire(f, paquets))),
      `${f} n'est reçu par aucune place de son paquet`
    ).toBe(true);
  }
}

describe('critère 1 — each package receives, in the dependency run, its own test and bench files only', () => {
  it(
    'critère 1 — BPScript form (« . » and one key per package): each package its own files, « . » the files outside packages/',
    () => {
      const r = codeMortEssai(
        ESSAIS,
        {
          'package.json': racine(['packages/*']),
          'knip.json': json({
            workspaces: { '.': { entry: [], project: [] }, 'packages/a': SRC, 'packages/b': SRC },
          }),
          'packages/a/package.json': paquet('a'),
          'packages/a/src/index.ts': 'export const a = 1;\n',
          'packages/a/test/a.test.ts': TEST,
          'packages/a/test/fixtures.ts': AIDE,
          'packages/a/bancs/rendu.budget.ts': AIDE,
          'packages/b/package.json': paquet('b'),
          'packages/b/src/index.ts': 'export const b = 1;\n',
          'packages/b/src/b.spec.ts': TEST,
          'packages/b/__tests__/outil.ts': AIDE,
          'tests/r.test.ts': TEST,
          'scripts/charge.nuit.ts': AIDE,
        },
        { journal: true }
      );
      const p = places(r);
      expect(p['packages/a']).toEqual([
        'packages/a/bancs/rendu.budget.ts',
        'packages/a/test/a.test.ts',
        'packages/a/test/fixtures.ts',
      ]);
      expect(p['packages/b']).toEqual([
        'packages/b/__tests__/outil.ts',
        'packages/b/src/b.spec.ts',
      ]);
      expect(p['.']).toEqual(['scripts/charge.nuit.ts', 'tests/r.test.ts']);
      for (const f of p[''] ?? []) {
        expect(['scripts/charge.nuit.ts', 'tests/r.test.ts']).toContain(f);
      }
    },
    T
  );
  it(
    'critère 1 — a package nested in another (packages/a/sub): each receives its own files, the outer one not those of the inner one',
    () => {
      const r = codeMortEssai(
        ESSAIS,
        {
          'package.json': racine(['packages/a', 'packages/a/sub']),
          'knip.json': json({
            workspaces: {
              '.': { entry: [], project: [] },
              'packages/a': SRC,
              'packages/a/sub': SRC,
            },
          }),
          'packages/a/package.json': paquet('a'),
          'packages/a/src/index.ts': 'export const a = 1;\n',
          'packages/a/test/f.ts': AIDE,
          'packages/a/sub/package.json': paquet('sub'),
          'packages/a/sub/src/index.ts': 'export const s = 1;\n',
          'packages/a/sub/test/f.ts': AIDE,
        },
        { journal: true }
      );
      const p = places(r);
      expect(p['packages/a']).toEqual(['packages/a/test/f.ts']);
      expect(p['packages/a/sub']).toEqual(['packages/a/sub/test/f.ts']);
      expect(p['.']).toEqual([]);
    },
    T
  );
  it(
    'critère 1 — a workspace key with a pattern (packages/*): no place receives the files of two packages',
    () => {
      const r = codeMortEssai(
        ESSAIS,
        {
          'package.json': racine(['packages/*']),
          'knip.json': json({ workspaces: { '.': { entry: [], project: [] }, 'packages/*': SRC } }),
          'packages/a/package.json': paquet('a'),
          'packages/a/src/index.ts': 'export const a = 1;\n',
          'packages/a/test/f.ts': AIDE,
          'packages/b/package.json': paquet('b'),
          'packages/b/src/index.ts': 'export const b = 1;\n',
          'packages/b/test/f.ts': AIDE,
        },
        { journal: true }
      );
      seulsSesFichiers(
        places(r),
        ['packages/a', 'packages/b'],
        ['packages/a/test/f.ts', 'packages/b/test/f.ts']
      );
    },
    T
  );
  it(
    'critère 1 — a package that knip.json does not name (only packages/a named, packages/c listed by package.json) receives its own files, no other place does',
    () => {
      const r = codeMortEssai(
        ESSAIS,
        {
          'package.json': racine(['packages/*']),
          'knip.json': json({ workspaces: { '.': { entry: [], project: [] }, 'packages/a': SRC } }),
          'packages/a/package.json': paquet('a'),
          'packages/a/src/index.ts': 'export const a = 1;\n',
          'packages/a/test/f.ts': AIDE,
          'packages/c/package.json': paquet('c'),
          'packages/c/src/index.ts': 'export const c = 1;\n',
          'packages/c/test/f.ts': AIDE,
          'tests/r.test.ts': TEST,
        },
        { journal: true }
      );
      seulsSesFichiers(
        places(r),
        ['packages/a', 'packages/c'],
        ['packages/a/test/f.ts', 'packages/c/test/f.ts', 'tests/r.test.ts']
      );
    },
    T
  );
  it(
    'critère 1 — a knip.json without workspaces in a repository of packages: the top level, the root, does not receive the files of packages/c',
    () => {
      const r = codeMortEssai(
        ESSAIS,
        {
          'package.json': racine(['packages/*']),
          'knip.json': json(SRC),
          'src/index.ts': 'export const i = 1;\n',
          'packages/c/package.json': paquet('c'),
          'packages/c/src/index.ts': 'export const c = 1;\n',
          'packages/c/test/f.ts': AIDE,
          'tests/r.test.ts': TEST,
        },
        { journal: true }
      );
      seulsSesFichiers(places(r), ['packages/c'], ['tests/r.test.ts', 'packages/c/test/f.ts']);
    },
    T
  );
});

describe('critère 4 — a package that knip.json does not name receives its own files too, the root does not', () => {
  it(
    'critère 4 — a knip.json without workspaces and two packages: each package receives its own files, the root its own, none those of another',
    () => {
      const r = codeMortEssai(
        ESSAIS,
        {
          'package.json': racine(['packages/*']),
          'knip.json': json(SRC),
          'src/index.ts': 'export const i = 1;\n',
          'packages/c/package.json': paquet('c'),
          'packages/c/src/index.ts': 'export const c = 1;\n',
          'packages/c/test/f.ts': AIDE,
          'packages/d/package.json': paquet('d'),
          'packages/d/src/index.ts': 'export const d = 1;\n',
          'packages/d/src/d.spec.ts': TEST,
          'tests/r.test.ts': TEST,
        },
        { journal: true }
      );
      seulsSesFichiers(
        places(r),
        ['packages/c', 'packages/d'],
        ['packages/c/test/f.ts', 'packages/d/src/d.spec.ts', 'tests/r.test.ts']
      );
    },
    T
  );
  it(
    'critère 4 — a knip.json without workspaces: the dependency the test helper of packages/c reads is no longer « sans usage », the dependency nothing reads still is',
    () => {
      const r = codeMortEssai(ESSAIS, {
        'package.json': racine(['packages/*'], { 'dep-r': '*' }),
        'knip.json': json(SRC),
        'src/index.ts': 'export const i = 1;\n',
        'tests/r.test.ts': TEST + "import 'dep-r';\n",
        'packages/c/package.json': paquet('c', { 'dep-c': '*', 'dep-morte': '*' }),
        'packages/c/src/index.ts': 'export const c = 1;\n',
        'packages/c/test/c.test.ts': TEST,
        'packages/c/test/f.ts': "import 'dep-c';\nexport const f = 1;\n",
      });
      expect(r.sortie).not.toContain('dep-c');
      expect(r.sortie).not.toContain('dep-r');
      expect(r.sortie).toMatch(
        /packages\/c\/package\.json : dépendance de développement sans usage — dep-morte/
      );
    },
    T
  );
  it(
    'critère 4 — a knip.json whose keys hold no package (libs/*): packages/c receives its own files, its helper keeps its dependency alive',
    () => {
      const r = codeMortEssai(
        ESSAIS,
        {
          'package.json': racine(['packages/*', 'libs/*']),
          'knip.json': json({ workspaces: { '.': { entry: [], project: [] }, 'libs/*': SRC } }),
          'libs/l/package.json': paquet('l'),
          'libs/l/src/index.ts': 'export const l = 1;\n',
          'libs/l/test/f.ts': AIDE,
          'packages/c/package.json': paquet('c', { 'dep-c': '*' }),
          'packages/c/src/index.ts': 'export const c = 1;\n',
          'packages/c/test/f.ts': "import 'dep-c';\nexport const f = 1;\n",
        },
        { journal: true }
      );
      seulsSesFichiers(
        places(r),
        ['libs/l', 'packages/c'],
        ['libs/l/test/f.ts', 'packages/c/test/f.ts']
      );
      expect(r.sortie).not.toContain('dep-c');
    },
    T
  );
  it(
    'critère 4 — a repository of packages without knip.json: each package receives its own files, the root its own, and the dependency the helper of packages/c reads is no longer « sans usage »',
    () => {
      const r = codeMortEssai(
        ESSAIS,
        {
          'package.json': racine(['packages/*']),
          'knip.json': null,
          'index.ts': 'export const i = 1;\n',
          'tests/r.test.ts': TEST,
          'packages/c/package.json': paquet('c', { 'dep-c': '*', 'dep-morte': '*' }),
          'packages/c/index.ts': 'export const c = 1;\n',
          'packages/c/test/c.test.ts': TEST,
          'packages/c/test/f.ts': "import 'dep-c';\nexport const f = 1;\n",
          'packages/d/package.json': paquet('d'),
          'packages/d/index.ts': 'export const d = 1;\n',
          'packages/d/src/d.spec.ts': TEST,
        },
        { journal: true }
      );
      seulsSesFichiers(
        places(r),
        ['packages/c', 'packages/d'],
        [
          'packages/c/test/c.test.ts',
          'packages/c/test/f.ts',
          'packages/d/src/d.spec.ts',
          'tests/r.test.ts',
        ]
      );
      expect(r.sortie).not.toContain('dep-c');
      expect(r.sortie).toMatch(
        /packages\/c\/package\.json : dépendance de développement sans usage — dep-morte/
      );
    },
    T
  );
});

// The three forms of a repository of packages whose knip.json has no key naming « . »: knip reads
// the top level as the root's settings only without `workspaces`; once the guard writes them, the
// root's files must reach a place knip reads for the root.
const SANS_POINT: [string, string | null][] = [
  ['a knip.json without workspaces', json(SRC)],
  ['no knip.json', null],
  [
    'a knip.json whose workspaces hold packages/* only, without « . »',
    json({ workspaces: { 'packages/*': SRC } }),
  ],
];

describe("critères 2 et 4 — the root keeps its own files, read where knip reads the root's settings", () => {
  for (const [forme, knipJson] of SANS_POINT) {
    it(
      `critères 2 et 4 — ${forme}: a root bench and a root helper without a test name keep their dependencies alive, the dependency nothing reads stays « sans usage »`,
      () => {
        const r = codeMortEssai(
          ESSAIS,
          {
            'package.json': racine(['packages/*'], {
              'dep-r': '*',
              'dep-h': '*',
              'dep-morte-r': '*',
            }),
            'knip.json': knipJson,
            'src/index.ts': 'export const i = 1;\n',
            'index.ts': 'export const i = 1;\n',
            'scripts/charge.nuit.ts': "import 'dep-r';\nexport const c = 1;\n",
            'tests/fixtures.ts': "import 'dep-h';\nexport const f = 1;\n",
            'packages/c/package.json': paquet('c'),
            'packages/c/src/index.ts': 'export const c = 1;\n',
            'packages/c/test/c.test.ts': TEST,
          },
          { journal: true }
        );
        expect(r.sortie).not.toContain('dep-r');
        expect(r.sortie).not.toContain('dep-h');
        expect(r.sortie).toMatch(
          /(^|\s)package\.json : dépendance de développement sans usage — dep-morte-r/m
        );
        seulsSesFichiers(
          places(r),
          ['packages/c'],
          ['scripts/charge.nuit.ts', 'tests/fixtures.ts', 'packages/c/test/c.test.ts']
        );
      },
      T
    );
  }
});

// The two forms of a repository of packages whose knip.json carries the settings of its top level
// alone (`$schema`, `rules`) and no key naming « . »: knip reads them at the top level and refuses
// them in a workspace key (`workspaceConfigurationSchema`, a strict object); the guard measures
// all the same and gives today's findings.
const HAUT = { $schema: 'https://unpkg.com/knip@6/schema.json', rules: { dependencies: 'error' } };
// Each form with the findings of today: those of the guard before this ticket, less, without
// workspaces, the dependency the helper of packages/c reads (criterion 4).
const HAUT_SANS_POINT: [string, object, string[]][] = [
  [
    'a knip.json without workspaces',
    { ...HAUT, ...SRC },
    [
      'package.json : dépendance de développement sans usage — dep-morte-r',
      'package.json : dépendance de développement sans usage — vitest',
      'packages/c/package.json : dépendance de développement sans usage — dep-morte-c',
      'packages/c/test/f.ts : fichier sans appelant',
    ],
  ],
  [
    'a knip.json whose workspaces hold packages/* only, without « . »',
    { ...HAUT, workspaces: { 'packages/*': SRC } },
    [
      'package.json : dépendance de développement sans usage — dep-morte-r',
      'package.json : dépendance de développement sans usage — vitest',
      'packages/c/package.json : dépendance de développement sans usage — dep-morte-c',
      'scripts/charge.nuit.ts : fichier sans appelant',
      'tests/fixtures.ts : fichier sans appelant',
    ],
  ],
];

describe('critères 2 et 4 — a knip.json with top-level settings ($schema, rules) and no « . »: the guard measures, the findings are those of today', () => {
  for (const [forme, knipJson, constats] of HAUT_SANS_POINT) {
    it(
      `critères 2 et 4 — ${forme}, with $schema and rules: knip measures and gives the findings of today, each package its own files`,
      () => {
        const r = codeMortEssai(
          ESSAIS,
          {
            'package.json': racine(['packages/*'], {
              'dep-r': '*',
              'dep-h': '*',
              'dep-morte-r': '*',
            }),
            'knip.json': json(knipJson),
            'src/index.ts': 'export const i = 1;\n',
            'index.ts': 'export const i = 1;\n',
            'scripts/charge.nuit.ts': "import 'dep-r';\nexport const c = 1;\n",
            'tests/fixtures.ts': "import 'dep-h';\nexport const f = 1;\n",
            'packages/c/package.json': paquet('c', { 'dep-c': '*', 'dep-morte-c': '*' }),
            'packages/c/src/index.ts': 'export const c = 1;\n',
            'packages/c/test/c.test.ts': TEST,
            'packages/c/test/f.ts': "import 'dep-c';\nexport const f = 1;\n",
          },
          { journal: true }
        );
        expect(r.sortie).not.toContain("knip n'a rien mesuré");
        expect(r.status, r.sortie).toBe(1);
        const lus = r.sortie
          .split('\n')
          .filter(l => /^\s+\S.* : /.test(l))
          .map(l => l.trim())
          .sort();
        expect(lus).toEqual(constats);
        seulsSesFichiers(
          places(r),
          ['packages/c'],
          [
            'scripts/charge.nuit.ts',
            'tests/fixtures.ts',
            'packages/c/test/c.test.ts',
            'packages/c/test/f.ts',
          ]
        );
      },
      T
    );
  }
});

// A repository whose packages/a and packages/b are held by the workspace keys <cles>, in their
// order; the test helper of packages/a, under test/vieux/, alone reads dep-a. The key whose
// `ignore` targets test/vieux/** decides: under it, the helper is not read and dep-a stays
// « sans usage »; under another, the helper keeps dep-a alive.
const AVEC_VIEUX = { ...SRC, ignore: ['test/vieux/**'] };
function essaiCles(cles: [string, object][], dossiers = ['packages/*']) {
  return codeMortEssai(
    ESSAIS,
    {
      'package.json': racine(dossiers),
      'knip.json': json({
        workspaces: { '.': { entry: [], project: [] }, ...Object.fromEntries(cles) },
      }),
      'packages/a/package.json': paquet('a', { 'dep-a': '*' }),
      'packages/a/src/index.ts': 'export const a = 1;\n',
      'packages/a/test/vieux/f.ts': "import 'dep-a';\nexport const f = 1;\n",
      'packages/b/package.json': paquet('b', { 'dep-b': '*' }),
      'packages/b/src/index.ts': 'export const b = 1;\n',
      'packages/b/test/f.ts': "import 'dep-b';\nexport const f = 1;\n",
    },
    { journal: true }
  );
}
const DEP_A = /packages\/a\/package\.json : dépendance de développement sans usage — dep-a/;

describe('critère 5 — a pattern key gives each package it holds its own files, under the settings knip chooses for it', () => {
  it(
    'critère 5 — one key packages/*: packages/a and packages/b each receive their own files, each helper keeps its dependency alive',
    () => {
      const r = essaiCles([['packages/*', SRC]]);
      seulsSesFichiers(
        places(r),
        ['packages/a', 'packages/b'],
        ['packages/a/test/vieux/f.ts', 'packages/b/test/f.ts']
      );
      expect(r.sortie).not.toMatch(/dep-[ab]/);
    },
    T
  );
  it(
    'critère 5 — one key packages/* whose ignore targets test/vieux/**: the ignore holds in each package it holds, dep-a stays « sans usage », dep-b is used',
    () => {
      const r = essaiCles([['packages/*', AVEC_VIEUX]]);
      expect(r.sortie).toMatch(DEP_A);
      expect(r.sortie).not.toContain('dep-b');
    },
    T
  );
  it(
    'critère 5 — the deepest key decides: packages/** (with the ignore) and packages/g/* (without), packages/g/x keeps its dependency alive',
    () => {
      const r = codeMortEssai(
        ESSAIS,
        {
          'package.json': racine(['packages/*', 'packages/g/*']),
          'knip.json': json({
            workspaces: {
              '.': { entry: [], project: [] },
              'packages/g/*': SRC,
              'packages/**': AVEC_VIEUX,
            },
          }),
          'packages/a/package.json': paquet('a', { 'dep-a': '*' }),
          'packages/a/src/index.ts': 'export const a = 1;\n',
          'packages/a/test/vieux/f.ts': "import 'dep-a';\nexport const f = 1;\n",
          'packages/g/x/package.json': paquet('x', { 'dep-x': '*' }),
          'packages/g/x/src/index.ts': 'export const x = 1;\n',
          'packages/g/x/test/vieux/f.ts': "import 'dep-x';\nexport const f = 1;\n",
        },
        { journal: true }
      );
      expect(r.sortie).not.toContain('dep-x');
      expect(r.sortie).toMatch(DEP_A);
    },
    T
  );
  it(
    'critère 5 — the deepest key decides: packages/** (without) and packages/g/* (with the ignore), dep-x stays « sans usage », dep-a is used',
    () => {
      const r = codeMortEssai(ESSAIS, {
        'package.json': racine(['packages/*', 'packages/g/*']),
        'knip.json': json({
          workspaces: {
            '.': { entry: [], project: [] },
            'packages/g/*': AVEC_VIEUX,
            'packages/**': SRC,
          },
        }),
        'packages/a/package.json': paquet('a', { 'dep-a': '*' }),
        'packages/a/src/index.ts': 'export const a = 1;\n',
        'packages/a/test/vieux/f.ts': "import 'dep-a';\nexport const f = 1;\n",
        'packages/g/x/package.json': paquet('x', { 'dep-x': '*' }),
        'packages/g/x/src/index.ts': 'export const x = 1;\n',
        'packages/g/x/test/vieux/f.ts': "import 'dep-x';\nexport const f = 1;\n",
      });
      expect(r.sortie).toMatch(
        /packages\/g\/x\/package\.json : dépendance de développement sans usage — dep-x/
      );
      expect(r.sortie).not.toContain('dep-a');
    },
    T
  );
  it(
    'critère 5 — two pattern keys of equal depth, the first declared decides (the order of knip, byPathDepth): packages/* (with the ignore) then packages/** (without), dep-a stays « sans usage »',
    () => {
      const r = essaiCles([
        ['packages/*', AVEC_VIEUX],
        ['packages/**', SRC],
      ]);
      expect(r.sortie).toMatch(DEP_A);
      expect(r.sortie).not.toContain('dep-b');
    },
    T
  );
  it(
    'critère 5 — two pattern keys of equal depth, the first declared decides (the order of knip, byPathDepth): packages/** (without) then packages/* (with the ignore), dep-a is used',
    () => {
      const r = essaiCles([
        ['packages/**', SRC],
        ['packages/*', AVEC_VIEUX],
      ]);
      expect(r.sortie).not.toMatch(/dep-[ab]/);
    },
    T
  );
  it(
    'critère 5 — a pattern key and an exact key of equal depth, the exact key decides (the order of knip, byPathDepth), declared last: packages/* (with the ignore) then packages/a (without), dep-a is used',
    () => {
      const r = essaiCles([
        ['packages/*', AVEC_VIEUX],
        ['packages/a', SRC],
      ]);
      expect(r.sortie).not.toMatch(/dep-[ab]/);
      seulsSesFichiers(
        places(r),
        ['packages/a', 'packages/b'],
        ['packages/a/test/vieux/f.ts', 'packages/b/test/f.ts']
      );
    },
    T
  );
  it(
    'critère 5 — a pattern key and an exact key of equal depth, the exact key decides (the order of knip, byPathDepth), declared first: packages/a (without) then packages/* (with the ignore), dep-a is used',
    () => {
      const r = essaiCles([
        ['packages/a', SRC],
        ['packages/*', AVEC_VIEUX],
      ]);
      expect(r.sortie).not.toMatch(/dep-[ab]/);
    },
    T
  );
  it(
    'critère 5 — a pattern key (libs/*) holds packages that the workspaces of package.json do not list: libs/l receives its own files, its helper keeps its dependency alive',
    () => {
      const r = codeMortEssai(
        ESSAIS,
        {
          'package.json': racine(['packages/*']),
          'knip.json': json({
            workspaces: { '.': { entry: [], project: [] }, 'packages/*': SRC, 'libs/*': SRC },
          }),
          'packages/a/package.json': paquet('a'),
          'packages/a/src/index.ts': 'export const a = 1;\n',
          'packages/a/test/f.ts': AIDE,
          'libs/l/package.json': paquet('l', { 'dep-l': '*', 'dep-morte-l': '*' }),
          'libs/l/src/index.ts': 'export const l = 1;\n',
          'libs/l/test/f.ts': "import 'dep-l';\nexport const f = 1;\n",
          'libs/m/package.json': paquet('m'),
          'libs/m/src/index.ts': 'export const m = 1;\n',
          'libs/m/test/f.ts': AIDE,
        },
        { journal: true }
      );
      expect(r.sortie).not.toMatch(/— dep-l$/m);
      expect(r.sortie).toMatch(
        /libs\/l\/package\.json : dépendance de développement sans usage — dep-morte-l/
      );
      seulsSesFichiers(
        places(r),
        ['packages/a', 'libs/l', 'libs/m'],
        ['packages/a/test/f.ts', 'libs/l/test/f.ts', 'libs/m/test/f.ts']
      );
    },
    T
  );
  it(
    'critère 5 — a key read as knip reads it, with a choice (packages/{a,b}, with the ignore): it holds packages/a, dep-a stays « sans usage »',
    () => {
      const r = essaiCles([['packages/{a,b}', AVEC_VIEUX]]);
      expect(r.sortie).toMatch(DEP_A);
      expect(r.sortie).not.toContain('dep-b');
    },
    T
  );
  it(
    'critère 5 — a key read as knip reads it, ** spanning zero directories: packages/**/a (without) is deeper than packages/* (with the ignore) and decides for packages/a, dep-a is used',
    () => {
      const r = essaiCles([
        ['packages/**/a', SRC],
        ['packages/*', AVEC_VIEUX],
      ]);
      expect(r.sortie).not.toContain('dep-a');
      expect(r.sortie).not.toContain('dep-b');
    },
    T
  );
});

describe('critère 2 — the findings are those of today', () => {
  it(
    'critère 2 — a package that knip.json does not name keeps its development dependency alive by its test helper, as today',
    () => {
      const r = codeMortEssai(ESSAIS, {
        'package.json': racine(['packages/*']),
        'knip.json': json({ workspaces: { '.': { entry: [], project: [] }, 'packages/a': SRC } }),
        'packages/a/package.json': paquet('a', { 'dep-a': '*' }),
        'packages/a/src/index.ts': 'export const a = 1;\n',
        'packages/a/test/a.test.ts': TEST,
        'packages/a/test/f.ts': "import 'dep-a';\nexport const f = 1;\n",
        'packages/c/package.json': paquet('c', { 'dep-c': '*' }),
        'packages/c/src/index.ts': 'export const c = 1;\n',
        'packages/c/test/c.test.ts': TEST,
        'packages/c/test/f.ts': "import 'dep-c';\nexport const f = 1;\n",
      });
      expect(r.sortie).not.toMatch(/dep-[ac]/);
    },
    T
  );
  it(
    'critère 2 — a dependency declared at the root and read only by the test of a package stays used, as today',
    () => {
      const r = codeMortEssai(ESSAIS, {
        'package.json': json({
          name: 'r',
          private: true,
          workspaces: ['packages/*'],
          devDependencies: { 'dep-racine': '*' },
        }),
        'knip.json': json({ workspaces: { '.': { entry: [], project: [] }, 'packages/b': SRC } }),
        'packages/b/package.json': paquet('b'),
        'packages/b/src/index.ts': 'export const b = 1;\n',
        'packages/b/test/b.test.ts': TEST + "import 'dep-racine';\n",
      });
      expect(r.sortie).not.toContain('dep-racine');
      expect(r.status, r.sortie).toBe(0);
    },
    T
  );
});
