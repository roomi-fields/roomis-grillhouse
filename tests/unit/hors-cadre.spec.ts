import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { composants, matieres, verifier } from '../../scripts/consommateurs.mjs';
import { configuration } from '../../scripts/frontieres.mjs';
import { index, interfaces } from '../../scripts/index-interfaces.mjs';

// Ticket grillhouse-3uv.27: the packages out of the frame are listed once, in
// docs/agents/hors-cadre.txt (« <package> <reason> », one line per package), and every check reads
// that list through composants(): the consumers, the index of the interfaces, the boundaries.
const HORS_CADRE = 'docs/agents/hors-cadre.txt';
const FRONTIERES = path.resolve(__dirname, '../../scripts/frontieres.mjs');
const MODULES = path.resolve(__dirname, '../../node_modules');

function repo(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), 'hors-cadre-'));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}
const noms = (dir: string) =>
  composants(dir)
    .map(c => c.nom)
    .sort();

const INTERFACE = (nom: string, consommateurs = '') =>
  [
    `# ${nom}`,
    '',
    `${nom} rend des durées.`,
    '',
    '## duree',
    '',
    'Rend une durée.',
    '',
    consommateurs,
  ].join('\n');

// Three packages and two modules; v1 is a frozen version of a.
const BASE = {
  'packages/a/package.json': '{"name":"@demo/a"}',
  'packages/a/src/index.ts': 'export const duree = 1;',
  'packages/v1/package.json': '{"name":"@demo/v1"}',
  'packages/v1/src/index.ts': 'export const vieux = 1;',
  'packages/v10/package.json': '{"name":"@demo/v10"}',
  'packages/v10/src/index.ts': 'export const dix = 1;',
  'src/m/index.ts': 'export const m = 1;',
  'src/gele/index.ts': 'export const g = 1;',
};

describe('critère 1 — composants() leaves out a package listed in hors-cadre.txt', () => {
  it('critère 1 — a listed package under packages/ is not a component', () => {
    const dir = repo({ ...BASE, [HORS_CADRE]: 'v1 version gelée\n' });
    expect(noms(dir)).toEqual(['a', 'gele', 'm', 'v10']);
  });
  it('critère 1 — a listed directory under src/ is not a component', () => {
    const dir = repo({ ...BASE, [HORS_CADRE]: 'gele module gelé\n' });
    expect(noms(dir)).toEqual(['a', 'm', 'v1', 'v10']);
  });
  it('critère 1 — several lines leave out several packages', () => {
    const dir = repo({ ...BASE, [HORS_CADRE]: 'v1 version gelée\ngele module gelé\n' });
    expect(noms(dir)).toEqual(['a', 'm', 'v10']);
  });
  it('critère 1 — the first word alone names the package, its reason optional, any blank after it', () => {
    for (const ligne of ['v1', 'v1\tversion gelée', 'v1   version gelée', 'v1 version gelée   ']) {
      const dir = repo({ ...BASE, [HORS_CADRE]: `${ligne}\n` });
      expect(noms(dir), JSON.stringify(ligne)).toEqual(['a', 'gele', 'm', 'v10']);
    }
  });
  it('critère 1 — a listed name is the whole first word: v1 does not leave out v10', () => {
    const dir = repo({ ...BASE, [HORS_CADRE]: 'v1 version gelée\n' });
    expect(noms(dir)).toContain('v10');
  });
  it('critère 1 — a word of the reason names no package', () => {
    const dir = repo({ ...BASE, [HORS_CADRE]: 'v1 remplacée par a\n' });
    expect(noms(dir)).toContain('a');
  });
});

describe('critère 2 — the consumers check reads nothing in a package out of the frame', () => {
  it('critère 2 — an undeclared use of a package out of the frame, as provider, is not refused', () => {
    const files = {
      ...BASE,
      'packages/a/src/index.ts': "import { vieux } from '@demo/v1';\nexport const duree = vieux;",
      'packages/a/docs/INTERFACE.md': INTERFACE('a'),
      'src/m/index.ts': "export { vieux } from '../../packages/v1/src/index';",
    };
    expect(verifier(repo(files)).refus).toHaveLength(2);
    expect(verifier(repo({ ...files, [HORS_CADRE]: 'v1 version gelée\n' })).refus).toEqual([]);
  });
  it('critère 2 — an undeclared use made by a package out of the frame, as consumer, is not refused', () => {
    const files = {
      ...BASE,
      'packages/a/docs/INTERFACE.md': INTERFACE('a'),
      'packages/v1/src/index.ts': "import { duree } from '@demo/a';\nexport const vieux = duree;",
      'src/gele/index.ts': "export { duree } from '../../packages/a/src/index';",
    };
    expect(verifier(repo(files)).refus).toHaveLength(2);
    const dir = repo({ ...files, [HORS_CADRE]: 'v1 version gelée\ngele module gelé\n' });
    expect(verifier(dir).refus).toEqual([]);
  });
  it('critère 2 — a package out of the frame is not read: its interface yields no report', () => {
    const files = {
      ...BASE,
      'packages/v1/docs/INTERFACE.md': INTERFACE('v1', '## Consommateurs\n\n- `a` : vieux\n'),
    };
    expect(verifier(repo(files)).signaux).toHaveLength(1);
    expect(verifier(repo({ ...files, [HORS_CADRE]: 'v1 version gelée\n' })).signaux).toEqual([]);
  });
  it('critère 2 — the components in the frame are still checked', () => {
    const dir = repo({
      ...BASE,
      [HORS_CADRE]: 'v1 version gelée\n',
      'packages/a/docs/INTERFACE.md': INTERFACE('a'),
      'src/m/index.ts': "import { duree } from '@demo/a';\nexport const m = duree;",
    });
    expect(verifier(dir).refus).toEqual([
      'm utilise « duree » de a, que packages/a/docs/INTERFACE.md ne déclare pas.',
    ]);
  });
});

describe('critère 3 — the index of the interfaces leaves out a package out of the frame', () => {
  const files = {
    ...BASE,
    'packages/a/docs/INTERFACE.md': INTERFACE('a'),
    'packages/v1/docs/INTERFACE.md': INTERFACE('v1'),
    'src/gele/docs/INTERFACE.md': INTERFACE('gele'),
    'src/m/docs/INTERFACE.md': INTERFACE('m'),
    'docs/INTERFACE.md': INTERFACE('racine'),
  };
  it('critère 3 — interfaces() lists no interface of a package or module out of the frame', () => {
    const dir = repo({ ...files, [HORS_CADRE]: 'v1 version gelée\ngele module gelé\n' });
    expect(interfaces(dir)).toEqual([
      'docs/INTERFACE.md',
      'packages/a/docs/INTERFACE.md',
      'src/m/docs/INTERFACE.md',
    ]);
  });
  it('critère 3 — the written index holds no line of a package out of the frame', () => {
    const dir = repo({ ...files, [HORS_CADRE]: 'v1 version gelée\n' });
    const texte = index(dir);
    expect(texte).toContain('## a — a');
    expect(texte).not.toContain('## v1');
    expect(texte).not.toContain('packages/v1/');
  });
  it('critère 3 — interfaces() lists what composants() gives, the root interface beside', () => {
    const dir = repo({ ...files, [HORS_CADRE]: 'v1 version gelée\n' });
    const attendu = composants(dir)
      .map(c => path.relative(dir, path.join(c.dir, 'docs', 'INTERFACE.md')))
      .filter(rel => existsSync(path.join(dir, rel)))
      .concat('docs/INTERFACE.md')
      .sort();
    expect(interfaces(dir)).toEqual(attendu);
  });
});

// A repository with the template's dependencies, its boundaries written, then checked.
function frontieres(files: Record<string, string>) {
  const dir = repo({ 'package.json': '{"name":"r"}', ...files });
  symlinkSync(MODULES, path.join(dir, 'node_modules'));
  const run = (...args: string[]) =>
    spawnSync('node', [FRONTIERES, ...args], { cwd: dir, encoding: 'utf8' });
  run('--ecrire');
  const r = run();
  return { dir, status: r.status, sortie: r.stdout + r.stderr };
}

describe('critère 4 — the boundaries exclude the files of a package out of the frame', () => {
  // v1 imports a by a path into its tree: refused by « un-paquet-par-son-nom » when v1 is read.
  const parLeChemin = {
    'packages/a/package.json': '{"name":"@demo/a"}',
    'packages/a/src/index.ts': 'export const duree = 1;',
    'packages/v1/package.json': '{"name":"@demo/v1"}',
    'packages/v1/src/index.ts':
      "import { duree } from '../../a/src/index';\nexport const vieux = duree;",
  };
  it('critère 4 — a fault inside a package out of the frame is not refused', () => {
    expect(frontieres(parLeChemin).status).not.toBe(0);
    const r = frontieres({ ...parLeChemin, [HORS_CADRE]: 'v1 version gelée\n' });
    expect(r.status, r.sortie).toBe(0);
  });
  it('critère 4 — a cycle inside a module of src out of the frame is not refused', () => {
    const cycle = {
      'src/index.ts': "export * from './m';",
      'src/m/index.ts': 'export const m = 1;',
      'src/gele/index.ts': "export { b } from './b';\nexport const a = 1;",
      'src/gele/b.ts': "import { a } from './index';\nexport const b = a;",
    };
    expect(frontieres(cycle).status).not.toBe(0);
    const r = frontieres({ ...cycle, [HORS_CADRE]: 'gele module gelé\n' });
    expect(r.status, r.sortie).toBe(0);
  });
  it('critère 4 — the configuration names the package out of the frame in its exclude option', () => {
    const dir = repo({ ...BASE, [HORS_CADRE]: 'v1 version gelée\ngele module gelé\n' });
    writeFileSync(path.join(dir, '.dependency-cruiser.cjs'), configuration(dir));
    const { options } = createRequire(path.join(dir, 'x.js'))('./.dependency-cruiser.cjs') as {
      options: { exclude?: string | string[] | { path?: string | string[] } };
    };
    const ex = options.exclude;
    const chemins = [typeof ex === 'object' && !Array.isArray(ex) ? ex.path : ex]
      .flat()
      .filter((c): c is string => typeof c === 'string');
    const motif = { test: (f: string) => chemins.some((c: string) => new RegExp(c).test(f)) };
    expect(motif.test('packages/v1/src/index.ts')).toBe(true);
    expect(motif.test('src/gele/index.ts')).toBe(true);
    expect(motif.test('packages/v10/src/index.ts')).toBe(false);
    expect(motif.test('packages/a/src/index.ts')).toBe(false);
    expect(motif.test('src/m/index.ts')).toBe(false);
  });
  it('critère 4 — no module rule for a module of src out of the frame', () => {
    const dir = repo({ 'src/index.ts': '', 'src/gele/index.ts': '' });
    expect(configuration(dir)).toMatch(/un-module-par-son-entree/);
    mkdirSync(path.join(dir, 'docs/agents'), { recursive: true });
    writeFileSync(path.join(dir, HORS_CADRE), 'gele module gelé\n');
    expect(configuration(dir)).not.toMatch(/un-module-par-son-entree/);
  });
});

describe('critère 6 — without the list, or with blank and comment lines, all is as before', () => {
  it('critère 6 — without hors-cadre.txt, every directory is a component', () => {
    expect(noms(repo(BASE))).toEqual(['a', 'gele', 'm', 'v1', 'v10']);
  });
  it('critère 6 — an empty hors-cadre.txt leaves out nothing', () => {
    expect(noms(repo({ ...BASE, [HORS_CADRE]: '' }))).toEqual(['a', 'gele', 'm', 'v1', 'v10']);
  });
  it('critère 6 — a blank line or a line starting with # names no package', () => {
    const dir = repo({
      ...BASE,
      [HORS_CADRE]: '# v1 gelée, à réactiver\n\n   \n#gele\nv10 version gelée\n',
    });
    expect(noms(dir)).toEqual(['a', 'gele', 'm', 'v1']);
  });
  it('critère 6 — without the list, the boundaries and the index are those of every component', () => {
    const dir = repo({ ...BASE, 'packages/v1/docs/INTERFACE.md': INTERFACE('v1') });
    expect(interfaces(dir)).toEqual(['packages/v1/docs/INTERFACE.md']);
    const avec = repo({ ...BASE, [HORS_CADRE]: '# rien\n' });
    expect(configuration(avec)).toBe(configuration(repo(BASE)));
  });
});

describe('critère 9 — a package out of the frame is never a package of the shared test material', () => {
  const FIXTURES = (nom: string) =>
    JSON.stringify({
      name: `@demo/${nom}`,
      exports: { '.': './src/index.ts', './test-fixtures': './src/f.ts' },
    });
  const files = {
    ...BASE,
    'packages/v1/package.json': FIXTURES('v1'),
    'packages/v10/package.json': FIXTURES('v10'),
    'src/gele/package.json': FIXTURES('gele'),
  };
  const nomsMatieres = (dir: string) =>
    matieres(dir)
      .map(c => c.nom)
      .sort();
  it('critère 9 — a listed package exporting ./test-fixtures is not a package of the material', () => {
    expect(nomsMatieres(repo(files))).toEqual(['gele', 'v1', 'v10']);
    expect(nomsMatieres(repo({ ...files, [HORS_CADRE]: 'v1 version gelée\n' }))).toEqual([
      'gele',
      'v10',
    ]);
  });
  it('critère 9 — a listed module of src exporting ./test-fixtures is not a package of the material', () => {
    const dir = repo({ ...files, [HORS_CADRE]: 'v1 version gelée\ngele module gelé\n' });
    expect(nomsMatieres(dir)).toEqual(['v10']);
  });
  it('critère 9 — every listed package out, the material is empty', () => {
    const dir = repo({ ...files, [HORS_CADRE]: 'v1\nv10\ngele\n' });
    expect(matieres(dir)).toEqual([]);
  });
});

describe('critère 10 — a consumer out of the frame, declared by a provider in it, is passed over', () => {
  it('critère 10 — the declared line for a consumer out of the frame yields no report', () => {
    const files = {
      ...BASE,
      'packages/a/docs/INTERFACE.md': INTERFACE('a', '## Consommateurs\n\n- `v1` : duree\n'),
    };
    expect(verifier(repo(files)).signaux).toHaveLength(1);
    expect(verifier(repo({ ...files, [HORS_CADRE]: 'v1 version gelée\n' }))).toEqual({
      refus: [],
      signaux: [],
    });
  });
  it('critère 10 — a module of src out of the frame, declared as consumer, yields no report', () => {
    const files = {
      ...BASE,
      'packages/a/docs/INTERFACE.md': INTERFACE('a', '## Consommateurs\n\n- `gele` : duree\n'),
    };
    expect(verifier(repo(files)).signaux).toHaveLength(1);
    expect(verifier(repo({ ...files, [HORS_CADRE]: 'gele module gelé\n' }))).toEqual({
      refus: [],
      signaux: [],
    });
  });
  it('critère 10 — the other lines of the same section are still checked', () => {
    const dir = repo({
      ...BASE,
      [HORS_CADRE]: 'v1 version gelée\n',
      'packages/a/docs/INTERFACE.md': INTERFACE(
        'a',
        '## Consommateurs\n\n- `v1` : duree\n- `m` : duree\n'
      ),
    });
    expect(verifier(dir)).toEqual({
      refus: [],
      signaux: [
        "packages/a/docs/INTERFACE.md déclare « duree » pour m, qu'aucun code de m n'utilise.",
      ],
    });
  });
});

describe('critère 8 — the texts say the list holds for every check', () => {
  it('critère 8 — STRUCTURE.md, where it names hors-cadre.txt, says it holds for all the checks', () => {
    const lignes = readFileSync(path.resolve(__dirname, '../../STRUCTURE.md'), 'utf8').split('\n');
    const i = lignes.findIndex(l => l.includes('hors-cadre.txt'));
    expect(i).toBeGreaterThanOrEqual(0);
    const autour = lignes.slice(Math.max(0, i - 2), i + 3).join(' ');
    expect(autour).toMatch(/tous les contrôles|every check|all (the )?checks/i);
  });
});
