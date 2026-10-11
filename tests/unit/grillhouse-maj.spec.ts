import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  ecarts,
  fusionnerReglages,
  lireListe,
  mettreAJour,
} from '../../scripts/grillhouse-maj.mjs';

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
    expect(s.test).toBe('vitest run');
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
