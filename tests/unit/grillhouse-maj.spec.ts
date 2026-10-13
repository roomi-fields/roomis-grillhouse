import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  ecarts,
  fusionnerReglages,
  lireListe,
  mettreAJour,
} from '../../scripts/grillhouse-maj.mjs';
import { CONFIGURATION as CONFIG_DES_FRONTIERES } from '../../scripts/frontieres.mjs';
import { cheminSysteme, claudeSubstitut } from '../claude-substitut.js';

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'grillhouse-maj-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const lire = (racine: string, f: string) => readFileSync(path.join(racine, f), 'utf8');
const json = (racine: string, f: string) => JSON.parse(lire(racine, f)) as Record<string, unknown>;
const crochet = (command: string, matcher?: string) => ({
  ...(matcher ? { matcher } : {}),
  hooks: [{ type: 'command', command }],
});

function source(fichiers: Record<string, string>) {
  const s = mkdtempSync(path.join(ESSAIS, 'cadre-'));
  for (const [f, t] of Object.entries(fichiers)) {
    ecrire(s, f, t);
  }
  return s;
}

describe('the list of the frame', () => {
  it('reads the paths to install and those to remove, without comments', () => {
    expect(lireListe('# x\nMETACADRE.md\nscripts/verrous/\n- tests/unit/a.spec.ts\n')).toEqual({
      garder: ['METACADRE.md', 'scripts/verrous/'],
      retirer: ['tests/unit/a.spec.ts'],
    });
  });
});

describe('the settings of the frame', () => {
  it("adds the frame's hooks and plugins, keeps the project's, removes what the frame dropped", () => {
    const projet = {
      permissions: { allow: ['Bash(ls)'] },
      hooks: { SessionStart: [crochet('mon-crochet'), crochet('vieux-cadre')] },
      enabledPlugins: { 'a@b': true, 'vieux@ancien': true },
      extraKnownMarketplaces: { ancien: { source: {} }, mien: { source: {} } },
    };
    const cadre = {
      hooks: { PreToolUse: [crochet('verrou', 'Agent|Task')] },
      enabledPlugins: { 'g@h': true },
    };
    const avant = {
      crochets: ['SessionStart\u0000\u0000vieux-cadre'],
      plugins: ['vieux@ancien'],
      marches: ['ancien'],
    };
    const { reglages, installes } = fusionnerReglages(projet, cadre, avant) as {
      reglages: object;
      installes: { crochets: string[]; plugins: string[]; marches: string[]; ligneEtat: boolean };
    };
    expect(reglages).toEqual({
      permissions: { allow: ['Bash(ls)'] },
      hooks: {
        SessionStart: [crochet('mon-crochet')],
        PreToolUse: [crochet('verrou', 'Agent|Task')],
      },
      enabledPlugins: { 'a@b': true, 'g@h': true },
      extraKnownMarketplaces: { mien: { source: {} } },
    });
    expect(installes).toEqual({
      crochets: ['PreToolUse\u0000Agent|Task\u0000verrou'],
      plugins: ['g@h'],
      marches: [],
      ligneEtat: false,
    });
    expect(fusionnerReglages(reglages, cadre, installes).reglages).toEqual(reglages);
  });

  it("sets the frame's status line, and removes it once the frame drops it", () => {
    const ligne = { type: 'command', command: 'node ligne-etat.mjs' };
    const pose = fusionnerReglages(
      { statusLine: { type: 'command', command: 'mien' } },
      { statusLine: ligne }
    );
    expect(pose.reglages).toMatchObject({ statusLine: ligne });
    expect(pose.installes).toMatchObject({ ligneEtat: true });
    const retire = fusionnerReglages(pose.reglages, {}, pose.installes);
    expect(retire.reglages).not.toHaveProperty('statusLine');
  });
});

describe('the update of a project', () => {
  const v1 = source({
    '.claude/grillhouse/fichiers.txt':
      'METACADRE.md\nscripts/verrous/\n- tests/unit/vieux.spec.ts\n',
    'METACADRE.md': 'meta 1',
    'scripts/verrous/a.mjs': 'a 1',
    'scripts/verrous/b.mjs': 'b 1',
    '.claude/settings.json': JSON.stringify({ hooks: { SessionStart: [crochet('debut')] } }),
  });
  const projet = mkdtempSync(path.join(ESSAIS, 'projet-'));
  ecrire(projet, 'scripts/verrous/mien.mjs', 'à moi');
  ecrire(projet, 'tests/unit/vieux.spec.ts', 'copie ancienne');
  ecrire(projet, 'package.json', JSON.stringify({ name: 'p', scripts: { test: 'vitest' } }));
  const b1 = mettreAJour(projet, v1, 'v1');

  it("copies the frame's files and removes the paths it retires, the project's own files kept", () => {
    expect(b1.copies.sort()).toEqual([
      'METACADRE.md',
      'scripts/verrous/a.mjs',
      'scripts/verrous/b.mjs',
    ]);
    expect(b1.retires).toEqual(['tests/unit/vieux.spec.ts']);
    expect(lire(projet, 'scripts/verrous/mien.mjs')).toBe('à moi');
    const scripts = json(projet, 'package.json').scripts as Record<string, string>;
    expect(scripts.test).toBe('vitest');
    expect(scripts.tableau).toMatch(/tableau\.mjs/);
    expect(scripts['grillhouse:maj']).toMatch(/grillhouse-maj\.mjs/);
    expect(json(projet, '.claude/settings.json').hooks).toEqual({
      SessionStart: [crochet('debut')],
    });
  });
  it('says nothing while the frame files are as installed, and names a drift', () => {
    expect(ecarts(projet)).toEqual({ version: 'v1', modifies: [], absents: [] });
    ecrire(projet, 'METACADRE.md', 'retouché');
    expect(ecarts(projet)?.modifies).toEqual(['METACADRE.md']);
  });
  it('brings a drifted project back, and removes a file the next version drops', () => {
    const v2 = source({
      '.claude/grillhouse/fichiers.txt': 'METACADRE.md\nscripts/verrous/\n',
      'METACADRE.md': 'meta 2',
      'scripts/verrous/a.mjs': 'a 1',
      '.claude/settings.json': JSON.stringify({ hooks: {} }),
    });
    const b2 = mettreAJour(projet, v2, 'v2');
    expect(b2.copies).toEqual(['METACADRE.md']);
    expect(b2.retires).toEqual(['scripts/verrous/b.mjs']);
    expect(existsSync(path.join(projet, 'scripts/verrous/mien.mjs'))).toBe(true);
    expect(json(projet, '.claude/settings.json').hooks).toEqual({});
    expect(ecarts(projet)).toEqual({ version: 'v2', modifies: [], absents: [] });
  });
});

// grillhouse-3uv.55: the update wires the frame's controls into the tests of the project it
// installs. The frame is this repository: its package.json is the template, whose pretest calls
// `grillhouse:gardes`, the one list of the controls.
const DEPOT = path.resolve(__dirname, '../..');
const GARDES = 'npm run --silent grillhouse:gardes';
// The controls of the frame, in the order of the template's pretest (critère 1).
const CONTROLES: [string, RegExp][] = [
  ['index des interfaces', /^node scripts\/index-interfaces\.mjs --verifier$/],
  ['consommateurs', /^node scripts\/consommateurs\.mjs$/],
  ['frontières', /^node scripts\/frontieres\.mjs$/],
  ['construction', /^npm run .*\bbuild$/],
  ['interfaces contre code', /^node scripts\/interfaces-contre-code\.mjs$/],
  ['code mort', /^node scripts\/code-mort\.mjs$/],
];
const FICHIERS_CONTROLES =
  /index-interfaces\.mjs|consommateurs\.mjs|frontieres\.mjs|interfaces-contre-code\.mjs|code-mort\.mjs/;
// « Calls grillhouse:gardes » (critère 7): an invocation npm run or npm run-script, with or
// without options, of the whole name grillhouse:gardes.
const APPELLE =
  /(?:^|[\s;&|(])npm\s+run(?:-script)?(?:\s+-{1,2}[\w-]+(?:=\S+)?)*\s+grillhouse:gardes(?=$|[\s;&|)])/;

const gabarit = () =>
  (
    JSON.parse(readFileSync(path.join(DEPOT, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    }
  ).scripts;

// A project with `pkg` as its package.json (none when null), brought to the frame of this
// repository. Returns its directory and its scripts after the update.
function installe(pkg: Record<string, unknown> | null) {
  const projet = mkdtempSync(path.join(ESSAIS, 'installe-'));
  if (pkg) {
    ecrire(projet, 'package.json', `${JSON.stringify(pkg, null, 2)}\n`);
  }
  mettreAJour(projet, DEPOT, 'essai');
  const scripts = () => (json(projet, 'package.json').scripts ?? {}) as Record<string, string>;
  return { projet, scripts };
}

describe('grillhouse-3uv.55 critère 1 — the update writes grillhouse:gardes', () => {
  it('critère 1: grillhouse:gardes plays the controls of the frame, in the order of the template', () => {
    const g = installe({ name: 'p', scripts: { test: 'vitest run' } }).scripts()[
      'grillhouse:gardes'
    ];
    expect(g).toBeTypeOf('string');
    const etapes = g.split('&&').map(x => x.trim());
    expect(etapes, g).toHaveLength(CONTROLES.length);
    CONTROLES.forEach(([nom, motif], i) => expect(etapes[i], nom).toMatch(motif));
  });
  it('critère 1: each control grillhouse:gardes names is a file the update installs', () => {
    const { projet, scripts } = installe({ name: 'p', scripts: {} });
    const g = scripts()['grillhouse:gardes'] ?? '';
    const noms = [...g.matchAll(/node (scripts\/\S+\.mjs)/g)].map(m => m[1]);
    expect(noms, g).toHaveLength(CONTROLES.length - 1);
    for (const f of noms) {
      expect(existsSync(path.join(projet, f)), f).toBe(true);
    }
  });
  it("critère 1: a project's own grillhouse:gardes gives way to the frame's", () => {
    const g = installe({ name: 'p', scripts: { 'grillhouse:gardes': 'echo à moi' } }).scripts();
    expect(g['grillhouse:gardes']).toBe(gabarit()['grillhouse:gardes']);
    expect(g['grillhouse:gardes']).not.toBe('echo à moi');
  });
  it("critère 1: the project's other scripts stay, the frame's tableau and grillhouse:maj with them", () => {
    const s = installe({ name: 'p', scripts: { test: 'vitest run', lint: 'eslint .' } }).scripts();
    expect(s.lint).toBe('eslint .');
    expect(s.tableau).toMatch(/tableau\.mjs/);
    expect(s['grillhouse:maj']).toMatch(/grillhouse-maj\.mjs/);
    expect(s['grillhouse:gardes']).toBeTypeOf('string');
  });
});

describe('grillhouse-3uv.55 critère 2 — a project without pretest receives it', () => {
  it('critère 2: a project whose scripts hold no pretest receives pretest = npm run --silent grillhouse:gardes', () => {
    expect(installe({ name: 'p', scripts: { test: 'vitest run' } }).scripts().pretest).toBe(GARDES);
  });
  it('critère 2: a package.json without scripts receives the same pretest', () => {
    expect(installe({ name: 'p' }).scripts().pretest).toBe(GARDES);
  });
  it('critère 2: a project without package.json gets none from the update', () => {
    const { projet } = installe(null);
    expect(existsSync(path.join(projet, 'package.json'))).toBe(false);
  });
});

describe('grillhouse-3uv.55 critère 3 — a pretest of the project gets the controls ahead', () => {
  it('critère 3: a pretest that does not call grillhouse:gardes receives it at its head', () => {
    const s = installe({ name: 'p', scripts: { pretest: 'node mien.mjs' } }).scripts();
    expect(s.pretest).toBe(`${GARDES} && node mien.mjs`);
  });
  it('critère 3: a pretest of several steps receives it at its head, its steps kept in order', () => {
    const avant = 'node a.mjs && npm run --silent build && node b.mjs --strict';
    const s = installe({ name: 'p', scripts: { pretest: avant } }).scripts();
    expect(s.pretest).toBe(`${GARDES} && ${avant}`);
  });
  it('critère 3: a pretest that already calls npm run --silent grillhouse:gardes stays as it is', () => {
    const s = installe({ name: 'p', scripts: { pretest: GARDES } }).scripts();
    expect(s.pretest).toBe(GARDES);
  });
  it('critère 3: a pretest that calls grillhouse:gardes in another form, mid-chain, stays as it is', () => {
    const avant = 'node a.mjs && npm run grillhouse:gardes && node b.mjs';
    const s = installe({ name: 'p', scripts: { pretest: avant } }).scripts();
    expect(s.pretest).toBe(avant);
  });
});

describe('grillhouse-3uv.55 critère 4 — the template calls grillhouse:gardes: one list', () => {
  it('critère 4: the pretest of the template calls grillhouse:gardes', () => {
    expect(gabarit().pretest).toMatch(APPELLE);
  });
  it('critère 4: the pretest of the template names no control itself', () => {
    expect(gabarit().pretest).not.toMatch(FICHIERS_CONTROLES);
  });
  it('critère 4: grillhouse:gardes of the template plays the controls in the order of critère 1', () => {
    const g = gabarit()['grillhouse:gardes'] ?? '';
    const etapes = g.split('&&').map(x => x.trim());
    expect(etapes, g).toHaveLength(CONTROLES.length);
    CONTROLES.forEach(([nom, motif], i) => expect(etapes[i], nom).toMatch(motif));
  });
  it('critère 4: the update writes grillhouse:gardes exactly as the template holds it', () => {
    const g = gabarit()['grillhouse:gardes'];
    expect(g).toBeTypeOf('string');
    expect(installe({ name: 'p', scripts: {} }).scripts()['grillhouse:gardes']).toBe(g);
  });
});

describe('grillhouse-3uv.55 critère 5 — a replayed update changes nothing', () => {
  const cas: [string, Record<string, unknown>][] = [
    ['without pretest', { name: 'p', scripts: { test: 'vitest run' } }],
    ['without scripts', { name: 'p' }],
    ['with a pretest of its own', { name: 'p', scripts: { pretest: 'node mien.mjs' } }],
    [
      'with a pretest already calling grillhouse:gardes',
      { name: 'p', scripts: { pretest: `node a.mjs && npm run grillhouse:gardes` } },
    ],
  ];
  for (const [nom, pkg] of cas) {
    it(`critère 5: a project ${nom} keeps its package.json byte for byte on a second update`, () => {
      const { projet } = installe(pkg);
      const premier = lire(projet, 'package.json');
      mettreAJour(projet, DEPOT, 'essai');
      expect(lire(projet, 'package.json')).toBe(premier);
      const pretest = (JSON.parse(premier) as { scripts: Record<string, string> }).scripts.pretest;
      expect(pretest.match(/grillhouse:gardes/g), pretest).toHaveLength(1);
    });
  }
});

// A source of the frame of one file, whose package.json is `pkg` (none when null).
function sourceAvec(pkg: Record<string, unknown> | null) {
  return source({
    '.claude/grillhouse/fichiers.txt': 'METACADRE.md\n',
    'METACADRE.md': 'meta',
    ...(pkg ? { 'package.json': JSON.stringify(pkg, null, 2) } : {}),
  });
}
// A project with `pkg` as its package.json, brought to the frame at `src`; its scripts after.
function installeDepuis(src: string, pkg: Record<string, unknown>) {
  const projet = mkdtempSync(path.join(ESSAIS, 'installe-'));
  ecrire(projet, 'package.json', `${JSON.stringify(pkg, null, 2)}\n`);
  mettreAJour(projet, src, 'essai');
  return {
    projet,
    scripts: (json(projet, 'package.json').scripts ?? {}) as Record<string, string>,
  };
}

describe('grillhouse-3uv.55 critère 6 — the update reads grillhouse:gardes in the source', () => {
  it('critère 6: a source whose grillhouse:gardes differs from the template has it written as it is', () => {
    const autre = 'node scripts/x.mjs && node scripts/y.mjs --strict';
    const src = sourceAvec({ name: 'cadre', scripts: { 'grillhouse:gardes': autre } });
    const { scripts } = installeDepuis(src, { name: 'p', scripts: { test: 'vitest run' } });
    expect(scripts['grillhouse:gardes']).toBe(autre);
    expect(scripts.pretest).toBe(GARDES);
  });
  it("critère 6: another source, one control only, has it written as it is over the project's own", () => {
    const src = sourceAvec({ scripts: { 'grillhouse:gardes': 'node seul.mjs' } });
    const { scripts } = installeDepuis(src, {
      name: 'p',
      scripts: { 'grillhouse:gardes': 'echo à moi', pretest: 'node mien.mjs' },
    });
    expect(scripts['grillhouse:gardes']).toBe('node seul.mjs');
    expect(scripts.pretest).toBe(`${GARDES} && node mien.mjs`);
  });
  it('critère 6: a source without package.json writes neither grillhouse:gardes nor pretest', () => {
    const { scripts } = installeDepuis(sourceAvec(null), {
      name: 'p',
      scripts: { test: 'vitest run' },
    });
    expect(scripts).not.toHaveProperty('grillhouse:gardes');
    expect(scripts).not.toHaveProperty('pretest');
    expect(scripts.tableau).toMatch(/tableau\.mjs/);
  });
  it('critère 6: a source whose package.json holds no grillhouse:gardes writes neither', () => {
    const src = sourceAvec({
      name: 'cadre',
      scripts: { test: 'vitest run', pretest: 'node a.mjs' },
    });
    const { scripts } = installeDepuis(src, { name: 'p', scripts: { test: 'vitest run' } });
    expect(scripts).not.toHaveProperty('grillhouse:gardes');
    expect(scripts).not.toHaveProperty('pretest');
  });
  it("critère 6: a source without grillhouse:gardes leaves the project's pretest and grillhouse:gardes as they are", () => {
    const { scripts } = installeDepuis(sourceAvec({ name: 'cadre' }), {
      name: 'p',
      scripts: { pretest: 'node mien.mjs', 'grillhouse:gardes': 'echo à moi' },
    });
    expect(scripts.pretest).toBe('node mien.mjs');
    expect(scripts['grillhouse:gardes']).toBe('echo à moi');
  });
  it('critère 6: a source without package.json adds tableau and grillhouse:maj, nothing else', () => {
    const v = sourceAvec(null);
    const { scripts } = installeDepuis(v, { name: 'p', scripts: { test: 'vitest' } });
    expect(Object.keys(scripts).sort()).toEqual(['grillhouse:maj', 'tableau', 'test']);
  });
});

describe('grillhouse-3uv.55 critère 7 — what calls grillhouse:gardes', () => {
  const garde: [string, string][] = [
    ['npm run -s', 'npm run -s grillhouse:gardes'],
    ['npm run-script', 'npm run-script grillhouse:gardes'],
    [
      'npm run-script --silent, mid-chain',
      'node a.mjs && npm run-script --silent grillhouse:gardes && node b.mjs',
    ],
    [
      'npm run --if-present -s, at the end',
      'node a.mjs && npm run --if-present -s grillhouse:gardes',
    ],
  ];
  for (const [nom, pretest] of garde) {
    it(`critère 7: a pretest that calls it by ${nom} stays as it is`, () => {
      expect(pretest).toMatch(APPELLE);
      const { scripts } = installe({ name: 'p', scripts: { pretest } });
      expect(scripts().pretest).toBe(pretest);
    });
  }
  const voisins: [string, string][] = [
    ['a neighbouring name grillhouse:gardes-x', 'npm run grillhouse:gardes-x'],
    ['a longer name grillhouse:gardes:vite', 'npm run -s grillhouse:gardes:vite'],
    ['a mention outside npm run', 'echo grillhouse:gardes'],
  ];
  for (const [nom, pretest] of voisins) {
    it(`critère 7: a pretest holding ${nom} does not call it, and receives it at its head`, () => {
      expect(pretest).not.toMatch(APPELLE);
      const { scripts } = installe({ name: 'p', scripts: { pretest } });
      expect(scripts().pretest).toBe(`${GARDES} && ${pretest}`);
    });
  }
  for (const [nom, pretest] of [
    ['an empty', ''],
    ['a blank', '  \t '],
  ]) {
    it(`critère 7: ${nom} pretest counts as absent and receives ${GARDES}`, () => {
      const { scripts } = installe({ name: 'p', scripts: { pretest } });
      expect(scripts().pretest).toBe(GARDES);
    });
  }
  it('critère 7 and 5: a pretest calling it by npm run -s, or holding a neighbour, is stable on a second update', () => {
    for (const pretest of ['npm run -s grillhouse:gardes', 'npm run grillhouse:gardes-x', '']) {
      const { projet } = installe({ name: 'p', scripts: { pretest } });
      const premier = lire(projet, 'package.json');
      mettreAJour(projet, DEPOT, 'essai');
      expect(lire(projet, 'package.json'), pretest).toBe(premier);
    }
  });
});

// grillhouse-3uv.60: the update writes in the project the script that writes the API reports and
// the development dependencies of the frame's controls (interfaces-contre-code.mjs: API
// Extractor, its documentation model and the TSDoc configuration loader; frontieres.mjs:
// dependency-cruiser; code-mort.mjs: knip), as the source declares them. grillhouse-3uv.64
// critère 25: each tool the controls import is declared, @microsoft/api-extractor-model and
// @microsoft/tsdoc-config included, at the frame's versions.
const DEPENDANCES = [
  '@microsoft/api-extractor',
  '@microsoft/api-extractor-model',
  '@microsoft/tsdoc-config',
  'dependency-cruiser',
  'knip',
];
type Pkg = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};
const modele = () => JSON.parse(readFileSync(path.join(DEPOT, 'package.json'), 'utf8')) as Pkg;
// The template's package.json, changed by `retouche`, as the package.json of a trial source.
function sourceRetouchee(retouche: (p: Pkg) => void) {
  const p = modele();
  retouche(p);
  return sourceAvec(p as Record<string, unknown>);
}
// The package.json of a project brought to the frame at `src` (this repository by default).
function apresMaj(pkg: Record<string, unknown>, src: string = DEPOT) {
  const projet = mkdtempSync(path.join(ESSAIS, 'deps-'));
  ecrire(projet, 'package.json', `${JSON.stringify(pkg, null, 2)}\n`);
  mettreAJour(projet, src, 'essai');
  return { projet, pkg: json(projet, 'package.json') as Pkg };
}

describe('grillhouse-3uv.60 critère 1 — the update writes api and the dependencies of the controls', () => {
  it('critère 1: the template declares the api script and the three dependencies of the controls', () => {
    const m = modele();
    expect(m.scripts?.api).toBe('node scripts/interfaces-contre-code.mjs --ecrire');
    for (const d of DEPENDANCES) {
      expect(m.devDependencies?.[d], d).toBeTypeOf('string');
    }
  });
  it("critère 1: a project receives the template's api script, and the frame's test in place of its own (3uv.75.1 critère 12)", () => {
    const { pkg } = apresMaj({ name: 'p', scripts: { test: 'vitest run' } });
    expect(pkg.scripts?.api).toBe(modele().scripts?.api);
    expect(pkg.scripts?.test).toBe(modele().scripts?.test);
  });
  it('critère 1: a project without dependencies receives the three, at the versions of the template', () => {
    const { pkg } = apresMaj({ name: 'p' });
    const m = modele();
    expect(pkg.devDependencies).toEqual(
      Object.fromEntries(DEPENDANCES.map(d => [d, m.devDependencies?.[d]]))
    );
  });
  it("critère 1: none of the template's other dependencies is written", () => {
    const { pkg } = apresMaj({ name: 'p', scripts: {} });
    expect(Object.keys(pkg.devDependencies ?? {}).sort()).toEqual(DEPENDANCES);
    expect(pkg).not.toHaveProperty('dependencies');
    expect(pkg).not.toHaveProperty('optionalDependencies');
  });
  it("critère 1: the project's own dependencies stay as they are, the three added beside them", () => {
    const { pkg } = apresMaj({
      name: 'p',
      dependencies: { zod: '^3.0.0' },
      devDependencies: { vitest: '^2.0.0' },
    });
    expect(pkg.dependencies).toEqual({ zod: '^3.0.0' });
    expect(pkg.devDependencies?.vitest).toBe('^2.0.0');
    for (const d of DEPENDANCES) {
      expect(pkg.devDependencies?.[d], d).toBe(modele().devDependencies?.[d]);
    }
  });
  it("critère 1: the versions are read in the source — another source's versions are written", () => {
    const versions: Record<string, string> = {
      '@microsoft/api-extractor': '7.1.0',
      '@microsoft/api-extractor-model': '7.2.0',
      '@microsoft/tsdoc-config': '~0.17.1',
      'dependency-cruiser': '^16.0.0',
      knip: '5.0.1',
    };
    const src = sourceRetouchee(p => {
      p.devDependencies = { ...p.devDependencies, ...versions };
    });
    const { pkg } = apresMaj({ name: 'p' }, src);
    expect(pkg.devDependencies).toEqual(versions);
  });
  it('critère 1: a version the project already declares in devDependencies is not overwritten', () => {
    const { pkg } = apresMaj({ name: 'p', devDependencies: { knip: '^5.0.0' } });
    expect(pkg.devDependencies?.knip).toBe('^5.0.0');
    expect(pkg.devDependencies?.['dependency-cruiser']).toBe(
      modele().devDependencies?.['dependency-cruiser']
    );
  });
  it('critère 1: a project without package.json gets none for the dependencies', () => {
    const projet = mkdtempSync(path.join(ESSAIS, 'deps-'));
    mettreAJour(projet, DEPOT, 'essai');
    expect(existsSync(path.join(projet, 'package.json'))).toBe(false);
  });
});

describe('grillhouse-3uv.60 critère 4 — api is written as the frame’s other scripts', () => {
  it("critère 4: the source's api replaces the project's own", () => {
    const { pkg } = apresMaj({ name: 'p', scripts: { api: 'echo à moi' } });
    expect(pkg.scripts?.api).toBe(modele().scripts?.api);
  });
  it("critère 4: another source's api is written as it is", () => {
    const src = sourceRetouchee(p => {
      p.scripts = { ...p.scripts, api: 'node scripts/autre.mjs --rapports' };
    });
    const { pkg } = apresMaj({ name: 'p', scripts: { api: 'echo à moi' } }, src);
    expect(pkg.scripts?.api).toBe('node scripts/autre.mjs --rapports');
  });
  it('critère 4: a source without api writes none', () => {
    const src = sourceRetouchee(p => {
      delete p.scripts?.api;
    });
    const { pkg } = apresMaj({ name: 'p', scripts: { test: 'vitest' } }, src);
    expect(pkg.scripts).not.toHaveProperty('api');
  });
  it("critère 4: a source without api leaves the project's own api as it is", () => {
    const src = sourceRetouchee(p => {
      delete p.scripts?.api;
    });
    const { pkg } = apresMaj({ name: 'p', scripts: { api: 'echo à moi' } }, src);
    expect(pkg.scripts?.api).toBe('echo à moi');
  });
  it('critère 4: a source without package.json writes neither api nor a dependency', () => {
    const { pkg } = apresMaj({ name: 'p', scripts: { test: 'vitest' } }, sourceAvec(null));
    expect(pkg.scripts).not.toHaveProperty('api');
    expect(pkg).not.toHaveProperty('devDependencies');
  });
  it('critère 4: a dependency the source does not declare is not written', () => {
    const src = sourceRetouchee(p => {
      delete p.devDependencies?.knip;
    });
    const { pkg } = apresMaj({ name: 'p' }, src);
    expect(Object.keys(pkg.devDependencies ?? {}).sort()).toEqual([
      '@microsoft/api-extractor',
      '@microsoft/api-extractor-model',
      '@microsoft/tsdoc-config',
      'dependency-cruiser',
    ]);
  });
  it('critère 4: a source that declares none of the three writes no devDependencies', () => {
    const src = sourceRetouchee(p => {
      for (const d of DEPENDANCES) {
        delete p.devDependencies?.[d];
      }
    });
    const { pkg } = apresMaj({ name: 'p' }, src);
    expect(pkg).not.toHaveProperty('devDependencies');
  });
});

describe('grillhouse-3uv.60 critère 5 — a declared dependency keeps its declaration; devDependencies sorted', () => {
  const champs = ['dependencies', 'devDependencies', 'optionalDependencies'] as const;
  for (const champ of champs) {
    it(`critère 5: a dependency declared in ${champ} keeps its declaration, without a duplicate`, () => {
      const { pkg } = apresMaj({ name: 'p', [champ]: { 'dependency-cruiser': '^15.0.0' } });
      expect(pkg[champ]?.['dependency-cruiser']).toBe('^15.0.0');
      const ailleurs = champs.filter(c => c !== champ);
      for (const c of ailleurs) {
        expect(pkg[c]?.['dependency-cruiser'], c).toBeUndefined();
      }
      expect(pkg.devDependencies?.knip).toBe(modele().devDependencies?.knip);
    });
  }
  it('critère 5: a dependency declared in peerDependencies only receives its development dependency', () => {
    const { pkg } = apresMaj({ name: 'p', peerDependencies: { knip: '>=5' } });
    expect(pkg.peerDependencies).toEqual({ knip: '>=5' });
    expect(pkg.devDependencies?.knip).toBe(modele().devDependencies?.knip);
  });
  it('critère 5: a dependency in peerDependencies and dependencies keeps its declaration only', () => {
    const { pkg } = apresMaj({
      name: 'p',
      peerDependencies: { knip: '>=5' },
      dependencies: { knip: '^5.2.0' },
    });
    expect(pkg.dependencies).toEqual({ knip: '^5.2.0' });
    expect(pkg.devDependencies?.knip).toBeUndefined();
  });
  it('critère 5: devDependencies are written sorted by name, the project’s own among them', () => {
    const { pkg } = apresMaj({
      name: 'p',
      devDependencies: { vitest: '^2.0.0', eslint: '^8.0.0', '@types/node': '^20.0.0' },
    });
    expect(Object.keys(pkg.devDependencies ?? {})).toEqual([
      '@microsoft/api-extractor',
      '@microsoft/api-extractor-model',
      '@microsoft/tsdoc-config',
      '@types/node',
      'dependency-cruiser',
      'eslint',
      'knip',
      'vitest',
    ]);
  });
  it('critère 5: a project already holding the three, unsorted, gets them sorted, versions kept', () => {
    const { pkg } = apresMaj({
      name: 'p',
      devDependencies: {
        knip: '1.0.0',
        'dependency-cruiser': '2.0.0',
        '@microsoft/api-extractor': '3.0.0',
      },
    });
    const m = modele();
    expect(Object.entries(pkg.devDependencies ?? {})).toEqual([
      ['@microsoft/api-extractor', '3.0.0'],
      ['@microsoft/api-extractor-model', m.devDependencies?.['@microsoft/api-extractor-model']],
      ['@microsoft/tsdoc-config', m.devDependencies?.['@microsoft/tsdoc-config']],
      ['dependency-cruiser', '2.0.0'],
      ['knip', '1.0.0'],
    ]);
  });
});

describe('grillhouse-3uv.60 critère 3 — a replayed update changes nothing', () => {
  const cas: [string, Record<string, unknown>][] = [
    ['without dependencies', { name: 'p', scripts: { test: 'vitest run' } }],
    [
      'holding part of the dependencies at other versions',
      { name: 'p', devDependencies: { knip: '^5.0.0', vitest: '^2.0.0' } },
    ],
    [
      'holding all three at other versions, unsorted',
      {
        name: 'p',
        devDependencies: {
          knip: '1.0.0',
          'dependency-cruiser': '2.0.0',
          '@microsoft/api-extractor': '3.0.0',
        },
      },
    ],
    [
      'declaring them in dependencies, optionalDependencies and peerDependencies',
      {
        name: 'p',
        dependencies: { 'dependency-cruiser': '^15.0.0' },
        optionalDependencies: { '@microsoft/api-extractor': '7.0.0' },
        peerDependencies: { knip: '>=5' },
      },
    ],
    ['with an api script of its own', { name: 'p', scripts: { api: 'echo à moi' } }],
    [
      'with all of these at once',
      {
        name: 'p',
        scripts: { api: 'echo à moi', pretest: 'node mien.mjs' },
        dependencies: { zod: '^3.0.0' },
        devDependencies: { vitest: '^2.0.0', knip: '^5.0.0' },
      },
    ],
  ];
  for (const [nom, pkg] of cas) {
    it(`critère 3: a project ${nom} keeps its package.json byte for byte on a second update`, () => {
      const { projet } = apresMaj(pkg);
      const premier = lire(projet, 'package.json');
      mettreAJour(projet, DEPOT, 'essai');
      expect(lire(projet, 'package.json')).toBe(premier);
      const p = JSON.parse(premier) as Pkg;
      expect(p.scripts?.api, 'the first update wrote api').toBe(modele().scripts?.api);
    });
  }
  it('critère 3: a replayed update from another source changes nothing either', () => {
    const src = sourceRetouchee(p => {
      p.devDependencies = { ...p.devDependencies, knip: '5.0.1' };
    });
    const { projet } = apresMaj({ name: 'p', devDependencies: { eslint: '^8.0.0' } }, src);
    const premier = lire(projet, 'package.json');
    mettreAJour(projet, src, 'essai');
    expect(lire(projet, 'package.json')).toBe(premier);
    expect((JSON.parse(premier) as Pkg).devDependencies?.knip).toBe('5.0.1');
  });
});

describe('grillhouse-3uv.60 critère 7 — a dependency a previous version wrote stays when the source drops it', () => {
  it('critère 7: knip, written by a previous update, stays when the new source no longer declares it', () => {
    const { projet } = apresMaj({ name: 'p' });
    const avant = (json(projet, 'package.json') as Pkg).devDependencies?.knip;
    expect(avant, 'the first update wrote knip').toBe(modele().devDependencies?.knip);
    const src = sourceRetouchee(p => {
      delete p.devDependencies?.knip;
    });
    mettreAJour(projet, src, 'essai');
    const pkg = json(projet, 'package.json') as Pkg;
    expect(pkg.devDependencies?.knip).toBe(avant);
    expect(pkg.devDependencies?.['dependency-cruiser']).toBe(
      modele().devDependencies?.['dependency-cruiser']
    );
  });
  it('critère 7: all three stay when the new source declares none of them', () => {
    const { projet } = apresMaj({ name: 'p', devDependencies: { vitest: '^2.0.0' } });
    const premier = (json(projet, 'package.json') as Pkg).devDependencies;
    expect(Object.keys(premier ?? {}).sort(), 'the first update wrote the three').toEqual([
      ...DEPENDANCES,
      'vitest',
    ]);
    const src = sourceRetouchee(p => {
      for (const d of DEPENDANCES) {
        delete p.devDependencies?.[d];
      }
    });
    mettreAJour(projet, src, 'essai');
    expect((json(projet, 'package.json') as Pkg).devDependencies).toEqual(premier);
  });
  it('critère 7: they stay when the new source has no package.json', () => {
    const { projet } = apresMaj({ name: 'p' });
    const premier = (json(projet, 'package.json') as Pkg).devDependencies;
    expect(Object.keys(premier ?? {}).sort(), 'the first update wrote the three').toEqual(
      DEPENDANCES
    );
    mettreAJour(projet, sourceAvec(null), 'essai');
    expect((json(projet, 'package.json') as Pkg).devDependencies).toEqual(premier);
  });
  it('critère 7: a dependency written from another source stays, at its version, when the next drops it', () => {
    const premiere = sourceRetouchee(p => {
      p.devDependencies = { ...p.devDependencies, knip: '5.0.1' };
    });
    const { projet } = apresMaj({ name: 'p' }, premiere);
    expect((json(projet, 'package.json') as Pkg).devDependencies?.knip).toBe('5.0.1');
    const suivante = sourceRetouchee(p => {
      delete p.devDependencies?.knip;
    });
    mettreAJour(projet, suivante, 'essai');
    expect((json(projet, 'package.json') as Pkg).devDependencies?.knip).toBe('5.0.1');
  });
});

describe('grillhouse-3uv.60 critère 8 — only the source’s devDependencies are written', () => {
  const champs = ['dependencies', 'optionalDependencies', 'peerDependencies'] as const;
  for (const champ of champs) {
    it(`critère 8: a control dependency the source declares in ${champ} only is not written`, () => {
      const src = sourceRetouchee(p => {
        const v = p.devDependencies?.knip ?? '^6.0.0';
        delete p.devDependencies?.knip;
        p[champ] = { ...(p[champ] ?? {}), knip: v };
      });
      const { pkg } = apresMaj({ name: 'p' }, src);
      expect(pkg.devDependencies?.knip).toBeUndefined();
      for (const c of champs) {
        expect(pkg[c]?.knip, c).toBeUndefined();
      }
      expect(Object.keys(pkg.devDependencies ?? {}).sort()).toEqual([
        '@microsoft/api-extractor',
        '@microsoft/api-extractor-model',
        '@microsoft/tsdoc-config',
        'dependency-cruiser',
      ]);
    });
  }
  it('critère 8: a source declaring none of the three in devDependencies, all elsewhere, writes no devDependencies', () => {
    const src = sourceRetouchee(p => {
      for (const d of DEPENDANCES) {
        delete p.devDependencies?.[d];
      }
      p.dependencies = { ...(p.dependencies ?? {}), '@microsoft/api-extractor': '7.0.0' };
      p.optionalDependencies = { 'dependency-cruiser': '16.0.0' };
      p.peerDependencies = { knip: '>=5' };
    });
    const { pkg } = apresMaj({ name: 'p' }, src);
    expect(pkg).not.toHaveProperty('devDependencies');
    expect(pkg).not.toHaveProperty('dependencies');
    expect(pkg).not.toHaveProperty('optionalDependencies');
    expect(pkg).not.toHaveProperty('peerDependencies');
  });
  it('critère 8: a dependency the source declares in dependencies and devDependencies is written at its devDependencies version', () => {
    const src = sourceRetouchee(p => {
      p.devDependencies = { ...p.devDependencies, knip: '5.0.1' };
      p.dependencies = { ...(p.dependencies ?? {}), knip: '9.9.9' };
    });
    const { pkg } = apresMaj({ name: 'p' }, src);
    expect(pkg.devDependencies?.knip).toBe('5.0.1');
    expect(pkg).not.toHaveProperty('dependencies');
  });
});

// The update as a project runs it: the script, in the trial project, from the source named.
const SCRIPT_MAJ = path.join(DEPOT, 'scripts/grillhouse-maj.mjs');
const lancerMaj = (projet: string, src: string) =>
  spawnSync('node', [SCRIPT_MAJ, '--source', src], { cwd: projet, encoding: 'utf8' });
// A trial project with `pkg` as its package.json, and a one-file source with the template's
// package.json (its file list names no control's file, so the report names a dependency only
// as a dependency).
function projetEtSource(
  pkg: Record<string, unknown> | null,
  retouche: (p: Pkg) => void = () => {}
) {
  const projet = mkdtempSync(path.join(ESSAIS, 'bilan-'));
  if (pkg) {
    ecrire(
      projet,
      'package.json',
      `${JSON.stringify(pkg, null, 2)}
`
    );
  }
  return { projet, src: sourceRetouchee(retouche) };
}
const NPM_INSTALL = /npm install/;

describe('grillhouse-3uv.60 critère 9 — the report names each added dependency and npm install', () => {
  it('critère 9: a project without dependencies hears the three named, and npm install', () => {
    const { projet, src } = projetEtSource({ name: 'p' });
    const r = lancerMaj(projet, src);
    expect(r.status, r.stderr).toBe(0);
    for (const d of DEPENDANCES) {
      expect(r.stdout, d).toContain(d);
    }
    expect(r.stdout).toMatch(NPM_INSTALL);
  });
  it('critère 9: only the dependencies added are named — one the project declares is not', () => {
    const { projet, src } = projetEtSource({
      name: 'p',
      dependencies: { knip: '^5.0.0' },
      devDependencies: { 'dependency-cruiser': '^15.0.0' },
    });
    const r = lancerMaj(projet, src);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('@microsoft/api-extractor');
    expect(r.stdout).not.toContain('knip');
    expect(r.stdout).not.toContain('dependency-cruiser');
    expect(r.stdout).toMatch(NPM_INSTALL);
  });
  it('critère 9: a dependency declared in peerDependencies only is added, so named', () => {
    const { projet, src } = projetEtSource({
      name: 'p',
      peerDependencies: { knip: '>=5' },
      devDependencies: { '@microsoft/api-extractor': '7.0.0', 'dependency-cruiser': '16.0.0' },
    });
    const r = lancerMaj(projet, src);
    expect(r.stdout).toContain('knip');
    expect(r.stdout).not.toContain('dependency-cruiser');
    expect(r.stdout).toMatch(NPM_INSTALL);
  });
  it('critère 9: an update adding none says nothing of dependencies nor npm install', () => {
    const { projet, src } = projetEtSource({
      name: 'p',
      devDependencies: {
        knip: '1.0.0',
        'dependency-cruiser': '2.0.0',
        '@microsoft/api-extractor': '3.0.0',
        '@microsoft/api-extractor-model': '4.0.0',
        '@microsoft/tsdoc-config': '0.1.0',
      },
    });
    const r = lancerMaj(projet, src);
    expect(r.status, r.stderr).toBe(0);
    for (const d of DEPENDANCES) {
      expect(r.stdout, d).not.toContain(d);
    }
    expect(r.stdout).not.toMatch(NPM_INSTALL);
  });
  it('critère 9: a replayed update says nothing of dependencies nor npm install', () => {
    const { projet, src } = projetEtSource({ name: 'p' });
    const premier = lancerMaj(projet, src);
    expect(premier.stdout, 'the first update named npm install').toMatch(NPM_INSTALL);
    const r = lancerMaj(projet, src);
    expect(r.status, r.stderr).toBe(0);
    for (const d of DEPENDANCES) {
      expect(r.stdout, d).not.toContain(d);
    }
    expect(r.stdout).not.toMatch(NPM_INSTALL);
  });
  it('critère 9: a source declaring none of the three adds none, so says nothing of them', () => {
    const { projet, src } = projetEtSource({ name: 'p' }, p => {
      for (const d of DEPENDANCES) {
        delete p.devDependencies?.[d];
      }
    });
    const r = lancerMaj(projet, src);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).not.toMatch(NPM_INSTALL);
  });
  it('critère 9: a dependency the source declares outside devDependencies is not named', () => {
    const { projet, src } = projetEtSource({ name: 'p' }, p => {
      delete p.devDependencies?.knip;
      p.dependencies = { ...(p.dependencies ?? {}), knip: '^6.0.0' };
    });
    const r = lancerMaj(projet, src);
    expect(r.stdout).not.toContain('knip');
    expect(r.stdout).toContain('dependency-cruiser');
    expect(r.stdout).toMatch(NPM_INSTALL);
  });
  it('critère 9: a project without package.json hears nothing of npm install', () => {
    const { projet, src } = projetEtSource(null);
    const r = lancerMaj(projet, src);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).not.toMatch(NPM_INSTALL);
  });
});

// grillhouse-3uv.64 critère 25: the update declares in the project each tool the controls import,
// @microsoft/api-extractor-model and @microsoft/tsdoc-config included, at the frame's versions.
describe('grillhouse-3uv.64 critère 25 — the update declares every tool of the controls', () => {
  const NEUFS = ['@microsoft/api-extractor-model', '@microsoft/tsdoc-config'];
  it.each(NEUFS)('critère 25: a project receives %s at the version of the frame', nom => {
    const { pkg } = apresMaj({ name: 'p', devDependencies: { vitest: '^2.0.0' } });
    const version = modele().devDependencies?.[nom];
    expect(version, `the frame declares ${nom}`).toBeTypeOf('string');
    expect(pkg.devDependencies?.[nom]).toBe(version);
  });
});

// grillhouse-3uv.65 critère 27: the frame's wiring of the integration's guards was
// `npm run --silent pretest`, which builds again; the update replaces it with the frame's command
// (`integration:gardes` of the source), and leaves a wiring of the project's own as it is.
describe('grillhouse-3uv.65 critère 27 — the update replaces the frame’s old wiring of integration:gardes', () => {
  const ANCIEN = 'npm run --silent pretest';
  it('critère 27: integration:gardes left at the frame’s old wiring receives the frame’s command', () => {
    const { scripts } = installe({ name: 'p', scripts: { 'integration:gardes': ANCIEN } });
    expect(scripts()['integration:gardes']).toBe(gabarit()['integration:gardes']);
  });
  it('critère 27: the command written is the one of the source, read there', () => {
    const autre = 'node scripts/integration/autres-gardes.mjs';
    const src = sourceAvec({ name: 'cadre', scripts: { 'integration:gardes': autre } });
    const { scripts } = installeDepuis(src, {
      name: 'p',
      scripts: { 'integration:gardes': ANCIEN },
    });
    expect(scripts['integration:gardes']).toBe(autre);
  });
  it('critère 27: the replacement holds on a second update, byte for byte', () => {
    const projet = mkdtempSync(path.join(ESSAIS, 'installe-'));
    ecrire(
      projet,
      'package.json',
      `${JSON.stringify({ name: 'p', scripts: { 'integration:gardes': ANCIEN } }, null, 2)}\n`
    );
    mettreAJour(projet, DEPOT, 'essai');
    const premier = lire(projet, 'package.json');
    mettreAJour(projet, DEPOT, 'essai');
    expect(lire(projet, 'package.json')).toBe(premier);
    expect(
      (JSON.parse(premier) as { scripts: Record<string, string> }).scripts['integration:gardes']
    ).toBe(gabarit()['integration:gardes']);
  });
  it.each([
    ['a script of its own', 'node scripts/mes-gardes.mjs'],
    ['the old wiring with a step of its own', `${ANCIEN} && node scripts/mien.mjs`],
    ['another npm script', 'npm run --silent verifier'],
  ])('critère 27 (garde): a wiring of the project’s own (%s) stays as it is', (_nom, propre) => {
    const { scripts } = installe({ name: 'p', scripts: { 'integration:gardes': propre } });
    expect(scripts()['integration:gardes']).toBe(propre);
  });
  it('critère 27 (garde): a source without integration:gardes leaves the old wiring as it is', () => {
    const src = sourceAvec({ name: 'cadre', scripts: { 'grillhouse:gardes': 'node seul.mjs' } });
    const { scripts } = installeDepuis(src, {
      name: 'p',
      scripts: { 'integration:gardes': ANCIEN },
    });
    expect(scripts['integration:gardes']).toBe(ANCIEN);
  });
});

// grillhouse-3uv.56 critère 13: the update writes `.claude/settings.json` only when its content
// changes, and keeps the order of the file's keys. Witness: BPScript (322.9), where a rewrite with
// nothing to change moved statusLine after hooks and the integration refused the copy at step 3.
describe('grillhouse-3uv.56 critère 13 — the settings are written only when their content changes', () => {
  const REGLAGES = '.claude/settings.json';
  const ANCIENNE = new Date('2001-01-01T00:00:00Z');
  const cadreDuDepot = () =>
    JSON.parse(readFileSync(path.join(DEPOT, REGLAGES), 'utf8')) as Record<string, unknown>;
  // The settings file of <projet> dated in the past, so that a write shows in its time.
  const dater = (projet: string) => utimesSync(path.join(projet, REGLAGES), ANCIENNE, ANCIENNE);
  const date = (projet: string) => statSync(path.join(projet, REGLAGES)).mtime.getTime();

  it('critère 13: a replayed update leaves .claude/settings.json unwritten, byte for byte', () => {
    const { projet } = installe({ name: 'p' });
    const premier = lire(projet, REGLAGES);
    dater(projet);
    mettreAJour(projet, DEPOT, 'essai');
    expect(lire(projet, REGLAGES)).toBe(premier);
    expect(date(projet)).toBe(ANCIENNE.getTime());
  });

  it('critère 13: settings holding the frame’s, keys in the project’s own order (statusLine first, hooks last), are not written', () => {
    const { statusLine, hooks, ...reste } = cadreDuDepot();
    const projet = mkdtempSync(path.join(ESSAIS, 'ordre-'));
    const texte = `${JSON.stringify({ statusLine, ...reste, hooks }, null, 2)}\n`;
    ecrire(projet, REGLAGES, texte);
    dater(projet);
    mettreAJour(projet, DEPOT, 'essai');
    expect(lire(projet, REGLAGES)).toBe(texte);
    expect(date(projet)).toBe(ANCIENNE.getTime());
  });

  // Arbitrage of the chef (comment « cas relevés par le testeur »): the content is the JSON value;
  // the same value under another layout is not a change.
  it.each([
    ['on one line', (v: unknown) => `${JSON.stringify(v)}\n`],
    ['indented by tabs, without a final newline', (v: unknown) => JSON.stringify(v, null, '\t')],
    [
      'with arrays on one line, as prettier writes them',
      (v: unknown) => `${JSON.stringify(v, null, 2).replace(/\[\s*("[^"\n]*")\s*\]/g, '[$1]')}\n`,
    ],
  ])(
    'critère 13: settings holding the frame’s value %s are not written, byte for byte',
    (_cas, ecrit) => {
      const projet = mkdtempSync(path.join(ESSAIS, 'forme-'));
      const texte = ecrit(cadreDuDepot());
      expect(texte).not.toBe(`${JSON.stringify(cadreDuDepot(), null, 2)}\n`);
      ecrire(projet, REGLAGES, texte);
      dater(projet);
      mettreAJour(projet, DEPOT, 'essai');
      expect(lire(projet, REGLAGES)).toBe(texte);
      expect(date(projet)).toBe(ANCIENNE.getTime());
    }
  );

  it('critère 13: an update that changes the settings keeps the order of their keys, the frame’s new ones after', () => {
    const src = source({
      '.claude/grillhouse/fichiers.txt': 'METACADRE.md\n',
      'METACADRE.md': 'meta',
      [REGLAGES]: JSON.stringify({
        hooks: { SessionStart: [crochet('debut')], Stop: [crochet('fin')] },
        statusLine: { type: 'command', command: 'ligne neuve' },
        enabledPlugins: { 'g@h': true },
        extraKnownMarketplaces: { h: { source: {} } },
      }),
    });
    const projet = mkdtempSync(path.join(ESSAIS, 'ordre-'));
    ecrire(
      projet,
      REGLAGES,
      `${JSON.stringify(
        {
          statusLine: { type: 'command', command: 'ligne ancienne' },
          extraKnownMarketplaces: { mien: { source: {} } },
          permissions: { allow: ['Bash(ls)'] },
          hooks: { Stop: [crochet('mon-arret')], PreToolUse: [crochet('mien', 'Bash')] },
          enabledPlugins: { 'a@b': true },
          model: 'opus',
        },
        null,
        2
      )}\n`
    );
    mettreAJour(projet, src, 'essai');
    const r = json(projet, REGLAGES);
    expect(Object.keys(r)).toEqual([
      'statusLine',
      'extraKnownMarketplaces',
      'permissions',
      'hooks',
      'enabledPlugins',
      'model',
    ]);
    expect(r.statusLine).toEqual({ type: 'command', command: 'ligne neuve' });
    expect(Object.keys(r.hooks as object)).toEqual(['Stop', 'PreToolUse', 'SessionStart']);
    expect(Object.keys(r.enabledPlugins as object)).toEqual(['a@b', 'g@h']);
    expect(Object.keys(r.extraKnownMarketplaces as object)).toEqual(['mien', 'h']);
  });
});

// grillhouse-3uv.75.1 critère 12 (Q6): one command launches the tests, `npm test`, through the
// frame's launcher; the update of the frame poses the frame's test in a project that has its own
// (BPScript), and says so in its report.
const TEST_DU_CADRE = 'node scripts/integration/suites-vitest.mjs';
describe('grillhouse-3uv.75.1 critère 12 — the update poses the frame’s test in a project that has its own, and says so', () => {
  it('critère 12: the test script of the template is the launcher', () => {
    expect(gabarit().test).toBe(TEST_DU_CADRE);
  });
  it('critère 12: a project whose test is its own receives the frame’s test', () => {
    const s = installe({ name: 'p', scripts: { test: 'vitest run --project mien' } }).scripts();
    expect(s.test).toBe(gabarit().test);
  });
  it('critère 12: the report of the update says that the frame’s test replaces the project’s', () => {
    const { projet, src } = projetEtSource({
      name: 'p',
      scripts: { test: 'vitest run --project mien' },
    });
    const r = lancerMaj(projet, src);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain(TEST_DU_CADRE);
    expect(r.stdout).toMatch(/\btest\b/);
  });
  // Arbitrage of the supervisor (constat 2 of the review): a project is known to Vitest when vitest
  // is in the dependencies or devDependencies of its root package.json or of one of its
  // workspaces; it then receives the frame's test, whatever the text of its own.
  it('critère 12: a project that declares vitest in a workspace alone (BPScript) receives the frame’s test, whatever the text of its own, and the report says so', () => {
    const propre = 'FORCER=1 bash scripts/suites-des-paquets.sh';
    const { projet, src } = projetEtSource({
      name: 'p',
      private: true,
      workspaces: ['packages/*'],
      scripts: { test: propre },
    });
    ecrire(
      projet,
      'packages/moteur/package.json',
      `${JSON.stringify({ name: 'moteur', devDependencies: { vitest: '^3.0.0' } }, null, 2)}\n`
    );
    const r = lancerMaj(projet, src);
    expect(r.status, r.stderr).toBe(0);
    expect((json(projet, 'package.json').scripts as Record<string, string>).test).toBe(
      TEST_DU_CADRE
    );
    expect(r.stdout).toContain(TEST_DU_CADRE);
  });
  it('critère 12: a project whose test is already the frame’s keeps it, and the report says nothing of it', () => {
    const { projet, src } = projetEtSource({ name: 'p', scripts: { test: TEST_DU_CADRE } });
    const r = lancerMaj(projet, src);
    expect(r.status, r.stderr).toBe(0);
    expect((json(projet, 'package.json').scripts as Record<string, string>).test).toBe(
      TEST_DU_CADRE
    );
    expect(r.stdout).not.toContain(TEST_DU_CADRE);
  });
});

// grillhouse-3uv.76: the update as a project runs it, `claude` stood in (tests/claude-substitut.ts),
// git and node from the system: no test reaches the real claude nor the network.
const lancerMajAvec = (projet: string, args: string[], bin: string, source?: string) =>
  spawnSync(process.execPath, [SCRIPT_MAJ, ...args], {
    cwd: projet,
    encoding: 'utf8',
    env: {
      PATH: cheminSysteme(bin),
      HOME: mkdtempSync(path.join(ESSAIS, 'maison-')),
      ...(source ? { GRILLHOUSE_SOURCE: source } : {}),
    },
    timeout: 120_000,
  });

// Every file under <racine> with its content: what an update may have changed.
function contenu(racine: string): Record<string, string> {
  const out: Record<string, string> = {};
  const parcourir = (rel: string) => {
    for (const e of readdirSync(path.join(racine, rel), { withFileTypes: true })) {
      const f = path.join(rel, e.name);
      if (e.isDirectory()) {
        parcourir(f);
      } else {
        out[f] = readFileSync(path.join(racine, f), 'utf8');
      }
    }
  };
  parcourir('.');
  return out;
}

// Witness: BPScript (322.10), whose settings hold enabledPlugins before statusLine; the install of
// the plugins (`claude plugin install … --scope project`) rewrote them in Claude Code's own order.
describe('grillhouse-3uv.76 critère 1 — the update keeps the order of the settings’ keys after the plugins’ install', () => {
  it('critère 1: after the install of the plugins, the settings keep the project’s key order, and a replayed update leaves them byte for byte', () => {
    const PLUGIN = 'p@m';
    const REGLAGES = '.claude/settings.json';
    const src = source({
      '.claude/grillhouse/fichiers.txt': 'METACADRE.md\n',
      'METACADRE.md': 'meta',
      [REGLAGES]: JSON.stringify({
        hooks: { SessionStart: [crochet('debut')], Stop: [crochet('fin')] },
        statusLine: { type: 'command', command: 'ligne' },
        enabledPlugins: { [PLUGIN]: true },
        extraKnownMarketplaces: { m: { source: { source: 'github', repo: 'x/m' } } },
      }),
    });
    const projet = mkdtempSync(path.join(ESSAIS, 'greffons-ordre-'));
    // The project's own order, not Claude Code's: enabledPlugins first, statusLine after.
    const ordre = [
      'enabledPlugins',
      'hooks',
      'extraKnownMarketplaces',
      'permissions',
      'statusLine',
      'model',
    ];
    ecrire(
      projet,
      REGLAGES,
      `${JSON.stringify(
        {
          enabledPlugins: { [PLUGIN]: true },
          hooks: { SessionStart: [crochet('debut')] },
          extraKnownMarketplaces: { m: { source: { source: 'github', repo: 'x/m' } } },
          permissions: { allow: ['Bash(ls)'] },
          statusLine: { type: 'command', command: 'ligne' },
          model: 'opus',
        },
        null,
        2
      )}\n`
    );
    const installs = (c: ReturnType<typeof claudeSubstitut>) =>
      c.appels().filter(a => a.argv[0] === 'plugin' && a.argv[1] === 'install');

    // The update adds the frame's Stop hook (the content changes): the order stays the project's.
    const premier = claudeSubstitut(mkdtempSync(path.join(ESSAIS, 'claude-')), { marches: ['m'] });
    const r1 = lancerMajAvec(projet, ['--source', src], premier.bin);
    expect(r1.status, r1.stderr).toBe(0);
    expect(installs(premier).length, 'the plugin is installed').toBe(1);
    const apres = lire(projet, REGLAGES);
    expect(Object.keys(JSON.parse(apres) as object)).toEqual(ordre);
    expect((JSON.parse(apres) as { hooks: object }).hooks).toHaveProperty('Stop');

    // Replayed (the content does not change), the plugin installed again: the file stays as it is.
    const second = claudeSubstitut(mkdtempSync(path.join(ESSAIS, 'claude-')), { marches: ['m'] });
    const r2 = lancerMajAvec(projet, ['--source', src], second.bin);
    expect(r2.status, r2.stderr).toBe(0);
    expect(installs(second).length, 'the plugin is installed').toBe(1);
    expect(lire(projet, REGLAGES)).toBe(apres);
  });
});

// Witness: BPScript (322.10), brought to fc9fe55, whose .dependency-cruiser.cjs, written by the
// previous scripts/frontieres.mjs, was refused as stale by the boundaries check. The generators the
// update can run on the sources alone (arbitrage of the ticket): scripts/frontieres.mjs --ecrire
// and scripts/index-interfaces.mjs, whose outputs grillhouse:gardes refuses when stale.
describe('grillhouse-3uv.76 critère 2 — the update regenerates what a frame generator it replaces produces', () => {
  it('critère 2: after the update, .dependency-cruiser.cjs and docs/agents/index-des-interfaces.md are what the installed generators write, and their checks accept them', () => {
    const projet = mkdtempSync(path.join(ESSAIS, 'generateur-'));
    ecrire(projet, 'package.json', `${JSON.stringify({ name: 'p' }, null, 2)}\n`);
    ecrire(projet, 'packages/moteur/package.json', `${JSON.stringify({ name: 'moteur' })}\n`);
    ecrire(projet, 'packages/moteur/src/index.ts', 'export const x = 1;\n');
    ecrire(
      projet,
      'packages/moteur/docs/INTERFACE.md',
      '# moteur\n\nLe moteur rend le son.\n\n## Consommateurs\n\n- aucun\n'
    );
    // What previous generators wrote.
    const generes = {
      [CONFIG_DES_FRONTIERES]: {
        generateur: 'scripts/frontieres.mjs',
        ecrire: ['--ecrire'],
        verifier: [] as string[],
        perime: '// Généré par une version précédente.\nmodule.exports = { forbidden: [] };\n',
      },
      'docs/agents/index-des-interfaces.md': {
        generateur: 'scripts/index-interfaces.mjs',
        ecrire: [] as string[],
        verifier: ['--verifier'],
        perime: '# Index des interfaces\n\nGénéré par une version précédente.\n',
      },
    };
    for (const [fichier, g] of Object.entries(generes)) {
      ecrire(projet, fichier, g.perime);
    }
    const claude = claudeSubstitut(mkdtempSync(path.join(ESSAIS, 'claude-')), {
      plugins: [],
      marches: [],
      echecsInstall: [],
    });
    lancerMajAvec(projet, ['--source', DEPOT], claude.bin);
    // The project's tools are its installed devDependencies (the update declares dependency-cruiser
    // there): the frame's node_modules stands for them. The checks run with node and npx alone on
    // the PATH and an empty global prefix (npx --no-install also takes the global packages), so no
    // tool installed on the machine stands in for the project's.
    symlinkSync(path.join(DEPOT, 'node_modules'), path.join(projet, 'node_modules'), 'dir');
    const noeudSeul = mkdtempSync(path.join(ESSAIS, 'noeud-'));
    symlinkSync(process.execPath, path.join(noeudSeul, 'node'));
    symlinkSync(path.join(path.dirname(process.execPath), 'npx'), path.join(noeudSeul, 'npx'));
    const noeud = (args: string[]) =>
      spawnSync(process.execPath, args, {
        cwd: projet,
        encoding: 'utf8',
        env: {
          PATH: cheminSysteme(noeudSeul),
          HOME: mkdtempSync(path.join(ESSAIS, 'maison-')),
          npm_config_prefix: mkdtempSync(path.join(ESSAIS, 'global-')),
        },
      });
    for (const [fichier, g] of Object.entries(generes)) {
      expect(lire(projet, g.generateur), g.generateur).toBe(lire(DEPOT, g.generateur));
      const ecrite = lire(projet, fichier);
      expect(ecrite, fichier).not.toBe(g.perime);
      // The guard of grillhouse:gardes accepts what the update left.
      const v = noeud([g.generateur, ...g.verifier]);
      expect(v.status, `${fichier}: ${v.stdout}${v.stderr}`).toBe(0);
      // The installed generator, run in the project, writes the same text.
      const e = noeud([g.generateur, ...g.ecrire]);
      expect(e.status, e.stderr).toBe(0);
      expect(ecrite, fichier).toBe(lire(projet, fichier));
    }
  });
});

describe('grillhouse-3uv.76 critère 3 — the update refuses an unknown option, --help included', () => {
  it('critère 3: --help and another unknown option are refused, the usage shown, nothing updated', () => {
    const src = source({
      '.claude/grillhouse/fichiers.txt': 'METACADRE.md\n',
      'METACADRE.md': 'meta',
      '.claude/settings.json': JSON.stringify({ hooks: { SessionStart: [crochet('debut')] } }),
    });
    for (const option of ['--help', '--forcer']) {
      const projet = mkdtempSync(path.join(ESSAIS, 'option-'));
      ecrire(projet, 'package.json', `${JSON.stringify({ name: 'p' }, null, 2)}\n`);
      ecrire(projet, '.claude/settings.json', `${JSON.stringify({ model: 'opus' }, null, 2)}\n`);
      const avant = contenu(projet);
      const claude = claudeSubstitut(mkdtempSync(path.join(ESSAIS, 'claude-')));
      // The source is named by the environment: an update that runs takes it, never the network.
      const r = lancerMajAvec(projet, [option], claude.bin, src);
      expect(r.status, `${option}: ${r.stdout}${r.stderr}`).not.toBe(0);
      expect(`${r.stdout}${r.stderr}`, option).toContain('--source');
      expect(contenu(projet), option).toEqual(avant);
      expect(claude.appels(), option).toEqual([]);
    }
  });
});
