import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { configuration } from '../../../../scripts/langages/typescript/frontieres.mjs';
import { SCRIPT, charge, frontieresEssai } from './frontieres-essai.js';

// The boundaries between components (scripts/langages/typescript/frontieres.mjs, tests/unit/frontieres.spec.ts): the
// project's options (grillhouse-3uv.56.1), added to the frame's.
// The repositories of trial: ./frontieres-essai.ts.

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'frontieres-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { repo, verdict } = frontieresEssai(ESSAIS);

// The project's options (grillhouse-3uv.56.1): `.dependency-cruiser.projet.cjs` carries its own
// options next to its rules, and the generated configuration adds them to the frame's when
// dependency-cruiser loads it.
const projet = (options: string, forbidden = '[]') =>
  `module.exports = { forbidden: ${forbidden}, options: ${options} };`;

// The witness, BPScript: a machinery directory it does not follow, a generated directory it
// excludes, and the built files the frame excludes; each holds an import that does not resolve.
const TEMOIN = {
  'src/index.ts': "export { m } from '../.publie/machine';",
  '.publie/machine.ts': "export { z as m } from './absent';",
  'packages/app/package.json': '{"name":"app"}',
  'packages/app/src/index.ts': 'export const a = 1;',
  'packages/app/.svelte-kit/types.ts': "export { z } from './absent';",
  'packages/app/dist/index.ts': "export { z } from './absent';",
};
const OPTIONS_TEMOIN =
  "{ doNotFollow: { path: '(node_modules|(^|/)(\\\\.publie|\\\\.last)/)' }, exclude: { path: '\\\\.svelte-kit' } }";

describe("the project's options", () => {
  it('the witness without its options is refused (the trial bites)', () => {
    const r = verdict(TEMOIN);
    expect(r.status).not.toBe(0);
    expect(r.sortie).toMatch(/tout-import-se-resout: \.publie\/machine\.ts/);
    expect(r.sortie).toMatch(/tout-import-se-resout: packages\/app\/\.svelte-kit\/types\.ts/);
    expect(r.sortie).not.toMatch(/dist\/index/);
  });
  it('1 — the options of the project file add to the frame’s: the witness passes', () => {
    const r = verdict({ ...TEMOIN, '.dependency-cruiser.projet.cjs': projet(OPTIONS_TEMOIN) });
    expect(r.sortie).not.toMatch(/tout-import-se-resout/);
    expect(r.status).toBe(0);
  });
  it('1 — a project option the frame does not set applies (includeOnly)', () => {
    const r = verdict({
      'src/index.ts': 'export const a = 1;',
      'packages/b/src/index.ts': "export { z } from './absent';",
      '.dependency-cruiser.projet.cjs': projet("{ includeOnly: '^src/' }"),
    });
    expect(r.sortie).not.toMatch(/tout-import-se-resout/);
    expect(r.status).toBe(0);
  });
  it('1 — the frame’s own options stay in the loaded configuration', () => {
    const { dir } = repo({
      'src/index.ts': '',
      'tsconfig.json': '{}',
      '.dependency-cruiser.projet.cjs': projet('{ maxDepth: 4 }'),
    });
    const options = charge(dir).options;
    expect(options.maxDepth).toBe(4);
    expect(options.tsPreCompilationDeps).toBe(true);
    expect(options.preserveSymlinks).toBe(true);
    expect(options.tsConfig).toEqual({ fileName: 'tsconfig.json' });
    expect(options.enhancedResolveOptions).toEqual({
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'default', 'types'],
    });
  });
  it('1 — options and rules of the project file both apply', () => {
    const r = verdict({
      ...TEMOIN,
      'src/vieux.ts': 'export const v = 1;',
      'src/index.ts': "export { m } from '../.publie/machine';\nexport { v } from './vieux';",
      '.dependency-cruiser.projet.cjs': projet(
        OPTIONS_TEMOIN,
        "[{ name: 'pas-de-vieux', severity: 'error', from: {}, to: { path: 'vieux' } }]"
      ),
    });
    expect(r.status).not.toBe(0);
    expect(r.sortie).toMatch(/pas-de-vieux/);
    expect(r.sortie).not.toMatch(/tout-import-se-resout/);
  });
  it('1 — options the project changes after generation apply without regenerating', () => {
    const { dir, run } = repo({
      ...TEMOIN,
      '.dependency-cruiser.projet.cjs': projet('{}'),
    });
    writeFileSync(path.join(dir, '.dependency-cruiser.projet.cjs'), projet(OPTIONS_TEMOIN));
    const r = run();
    expect(r.stderr).not.toMatch(/pas à jour/);
    expect(r.stdout + r.stderr).not.toMatch(/tout-import-se-resout/);
    expect(r.status).toBe(0);
  });
  it('2 — a project exclusion adds to the frame’s built files: both apply', () => {
    const r = verdict({
      'src/index.ts': 'export const a = 1;',
      'packages/app/package.json': '{"name":"app"}',
      'packages/app/src/index.ts': 'export const a = 1;',
      'packages/app/.svelte-kit/types.ts': "export { z } from './absent';",
      'packages/app/dist/index.ts': "export { z } from './absent';",
      '.dependency-cruiser.projet.cjs': projet("{ exclude: { path: '\\\\.svelte-kit' } }"),
    });
    expect(r.sortie).not.toMatch(/\.svelte-kit|dist\/index/);
    expect(r.status).toBe(0);
  });
  it('2 — a project exclusion adds to the packages out of the frame: both apply', () => {
    const r = verdict({
      'src/index.ts': 'export const a = 1;',
      'packages/vieux/package.json': '{"name":"vieux"}',
      'packages/vieux/src/index.ts': "export { z } from './absent';",
      'docs/agents/hors-cadre.txt': 'vieux\n',
      'packages/app/package.json': '{"name":"app"}',
      'packages/app/src/index.ts': 'export const a = 1;',
      'packages/app/gen/types.ts': "export { z } from './absent';",
      '.dependency-cruiser.projet.cjs': projet("{ exclude: { path: '^packages/app/gen/' } }"),
    });
    expect(r.sortie).not.toMatch(/packages\/vieux|packages\/app\/gen/);
    expect(r.status).toBe(0);
  });
  it('2 — the project exclusion does not replace the frame’s pattern in the loaded options', () => {
    const { dir } = repo({
      'src/index.ts': '',
      '.dependency-cruiser.projet.cjs': projet("{ exclude: { path: '\\\\.svelte-kit' } }"),
    });
    const motif = new RegExp(charge(dir).options.exclude.path);
    expect(motif.test('packages/app/.svelte-kit/types.ts')).toBe(true);
    expect(motif.test('packages/app/dist/index.js')).toBe(true);
    expect(motif.test('dist/index.js')).toBe(true);
    expect(motif.test('packages/app/src/index.ts')).toBe(false);
  });
  it('3 — without options, or without a project file, the configuration is unchanged', () => {
    const fichiers = { 'src/index.ts': '', 'tsconfig.json': '{}' };
    const sans = repo(fichiers);
    const regles = repo({
      ...fichiers,
      '.dependency-cruiser.projet.cjs': 'module.exports = { forbidden: [] };',
    });
    const vides = repo({ ...fichiers, '.dependency-cruiser.projet.cjs': projet('{}') });
    const reference = charge(sans.dir);
    expect(charge(regles.dir)).toEqual(reference);
    expect(charge(vides.dir)).toEqual(reference);
    expect(configuration(regles.dir)).toBe(configuration(sans.dir));
    expect(configuration(vides.dir)).toBe(configuration(sans.dir));
    expect(reference.options.doNotFollow).toEqual({ path: 'node_modules' });
    expect(reference.options.exclude).toEqual({
      path: '^(dist|build|coverage)/|^packages/[^/]+/(dist|build|coverage)/',
    });
  });
  it('4 — the header of frontieres.mjs says the project options are read there too', () => {
    const entete = readFileSync(SCRIPT, 'utf8').split(/\nimport /)[0];
    expect(entete).toMatch(/\.dependency-cruiser\.projet\.cjs/);
    expect(entete).toMatch(/options/);
  });
  it('4 — the line of the generated configuration says the project options are read there too', () => {
    const { dir } = repo({ 'src/index.ts': '' });
    const entete = configuration(dir)
      .split('\n')
      .filter(l => l.startsWith('//'))
      .join('\n');
    expect(entete).toMatch(/\.dependency-cruiser\.projet\.cjs/);
    expect(entete).toMatch(/options/);
  });
});

// A filter of dependency-cruiser (`exclude`, `doNotFollow`) in any form it accepts: a string, a
// list of strings, or an object whose `path` is one of them. True when one of its patterns
// matches <chemin>.
const couvre = (filtre: unknown, chemin: string): boolean => {
  const motifs = (v: unknown): string[] =>
    typeof v === 'string'
      ? [v]
      : Array.isArray(v)
        ? (v as string[])
        : v && typeof v === 'object' && 'path' in v
          ? motifs((v as { path: unknown }).path)
          : [];
  return motifs(filtre).some(m => new RegExp(m).test(chemin));
};
const options = (files: Record<string, string>) => charge(repo(files).dir).options;
// The witness's files, with the frame's built files: what the project excludes or does not follow.
const SVELTE = {
  'src/index.ts': 'export const a = 1;',
  'packages/app/package.json': '{"name":"app"}',
  'packages/app/src/index.ts': 'export const a = 1;',
  'packages/app/.svelte-kit/types.ts': "export { z } from './absent';",
  'packages/app/gen/types.ts': "export { z } from './absent';",
  'packages/app/dist/index.ts': "export { z } from './absent';",
};

describe("the project's options — criteria 5 to 8", () => {
  it('5 — a project doNotFollow adds to the frame’s: the witness passes without naming node_modules', () => {
    const r = verdict({
      ...TEMOIN,
      '.dependency-cruiser.projet.cjs': projet(
        "{ doNotFollow: { path: '(^|/)\\\\.publie/' }, exclude: { path: '\\\\.svelte-kit' } }"
      ),
    });
    expect(r.sortie).not.toMatch(/tout-import-se-resout/);
    expect(r.status).toBe(0);
  });
  it('5 — the project doNotFollow does not replace the frame’s node_modules in the loaded options', () => {
    const o = options({
      'src/index.ts': '',
      '.dependency-cruiser.projet.cjs': projet("{ doNotFollow: { path: '(^|/)\\\\.publie/' } }"),
    });
    expect(couvre(o.doNotFollow, '.publie/machine.ts')).toBe(true);
    expect(couvre(o.doNotFollow, 'node_modules/vitest/index.js')).toBe(true);
    expect(couvre(o.doNotFollow, 'src/index.ts')).toBe(false);
  });
  it('6 — an exclusion written as a string adds to the frame’s', () => {
    const r = verdict({
      ...SVELTE,
      '.dependency-cruiser.projet.cjs': projet("{ exclude: '\\\\.svelte-kit|^packages/app/gen/' }"),
    });
    expect(r.sortie).not.toMatch(/svelte-kit|app\/gen|dist\/index/);
    expect(r.status).toBe(0);
  });
  it('6 — an exclusion written as a list of strings adds to the frame’s', () => {
    const r = verdict({
      ...SVELTE,
      '.dependency-cruiser.projet.cjs': projet(
        "{ exclude: ['\\\\.svelte-kit', '^packages/app/gen/'] }"
      ),
    });
    expect(r.sortie).not.toMatch(/svelte-kit|app\/gen|dist\/index/);
    expect(r.status).toBe(0);
  });
  it('6 — an exclusion whose path is a list adds to the frame’s', () => {
    const r = verdict({
      ...SVELTE,
      '.dependency-cruiser.projet.cjs': projet(
        "{ exclude: { path: ['\\\\.svelte-kit', '^packages/app/gen/'] } }"
      ),
    });
    expect(r.sortie).not.toMatch(/svelte-kit|app\/gen|dist\/index/);
    expect(r.status).toBe(0);
  });
  it('6 — a doNotFollow written as a string or a list adds to the frame’s', () => {
    for (const forme of ["'(^|/)\\\\.publie/'", "['(^|/)\\\\.publie/', '(^|/)\\\\.last/']"]) {
      const o = options({
        'src/index.ts': '',
        '.dependency-cruiser.projet.cjs': projet(`{ doNotFollow: ${forme} }`),
      });
      expect(couvre(o.doNotFollow, '.publie/machine.ts'), forme).toBe(true);
      expect(couvre(o.doNotFollow, 'node_modules/vitest/index.js'), forme).toBe(true);
    }
  });
  it('6 — a doNotFollow written as a string lets the witness pass', () => {
    const r = verdict({
      ...TEMOIN,
      '.dependency-cruiser.projet.cjs': projet(
        "{ doNotFollow: '(^|/)\\\\.publie/', exclude: '\\\\.svelte-kit' }"
      ),
    });
    expect(r.sortie).not.toMatch(/tout-import-se-resout/);
    expect(r.status).toBe(0);
  });
  it('6 — the other keys of exclude (dynamic) come from the project', () => {
    const o = options({
      'src/index.ts': '',
      '.dependency-cruiser.projet.cjs': projet(
        "{ exclude: { path: '\\\\.svelte-kit', dynamic: true } }"
      ),
    });
    expect((o.exclude as { dynamic?: boolean }).dynamic).toBe(true);
    expect(couvre(o.exclude, 'packages/app/.svelte-kit/types.ts')).toBe(true);
    expect(couvre(o.exclude, 'packages/app/dist/index.js')).toBe(true);
  });
  it('6 — the other keys of doNotFollow (dependencyTypes) come from the project, with the frame’s path', () => {
    const o = options({
      'src/index.ts': '',
      '.dependency-cruiser.projet.cjs': projet("{ doNotFollow: { dependencyTypes: ['npm-dev'] } }"),
    });
    expect((o.doNotFollow as { dependencyTypes?: string[] }).dependencyTypes).toEqual(['npm-dev']);
    expect(couvre(o.doNotFollow, 'node_modules/vitest/index.js')).toBe(true);
  });
  it('7 — a scalar option the frame sets too takes the project’s value', () => {
    const o = options({
      'src/index.ts': '',
      '.dependency-cruiser.projet.cjs': projet(
        '{ tsPreCompilationDeps: false, preserveSymlinks: false }'
      ),
    });
    expect(o.tsPreCompilationDeps).toBe(false);
    expect(o.preserveSymlinks).toBe(false);
  });
  it('7 — tsConfig set by the project replaces the frame’s', () => {
    const o = options({
      'src/index.ts': '',
      'tsconfig.json': '{}',
      'tsconfig.build.json': '{}',
      '.dependency-cruiser.projet.cjs': projet("{ tsConfig: { fileName: 'tsconfig.build.json' } }"),
    });
    expect(o.tsConfig).toEqual({ fileName: 'tsconfig.build.json' });
  });
  it('7 — an object option set on both sides is replaced at its first level, not merged deeply', () => {
    const o = options({
      'src/index.ts': '',
      '.dependency-cruiser.projet.cjs': projet(
        "{ enhancedResolveOptions: { conditionNames: ['node'] } }"
      ),
    });
    expect(o.enhancedResolveOptions).toEqual({ conditionNames: ['node'] });
  });
  it('8 — a project file with options only loads, its rules an empty list', () => {
    const fichiers = { 'src/index.ts': '' };
    const reference = charge(repo(fichiers).dir);
    const { dir } = repo({
      ...fichiers,
      '.dependency-cruiser.projet.cjs': 'module.exports = { options: { maxDepth: 4 } };',
    });
    const chargee = charge(dir);
    expect(chargee.forbidden).toEqual(reference.forbidden);
    expect(chargee.options.maxDepth).toBe(4);
  });
  it('8 — a project file with options only applies them: the witness passes', () => {
    const r = verdict({
      ...TEMOIN,
      '.dependency-cruiser.projet.cjs': `module.exports = { options: ${OPTIONS_TEMOIN} };`,
    });
    expect(r.sortie).not.toMatch(/tout-import-se-resout/);
    expect(r.status).toBe(0);
  });
  it('8 — an empty project file loads, the configuration that of the frame', () => {
    const fichiers = { 'src/index.ts': '' };
    const reference = charge(repo(fichiers).dir);
    const { dir } = repo({ ...fichiers, '.dependency-cruiser.projet.cjs': 'module.exports = {};' });
    expect(charge(dir)).toEqual(reference);
  });
});

// The empty forms of a pattern dependency-cruiser accepts: a string, a list, an object whose path
// is an empty string or an empty list. Each excludes or leaves unfollowed nothing.
// Arbitrage du regulator (forme { path: '' }) : la lettre du critère 9 la couvre, une chaîne
// vide sous path étant le même motif vide que la chaîne vide seule.
const VIDES = ["''", '[]', "{ path: '' }", '{ path: [] }'];

describe("the project's options — criterion 9", () => {
  for (const vide of VIDES) {
    it(`9 — an empty exclusion of the project (${vide}) adds nothing: the frame’s pattern alone`, () => {
      const o = options({
        'src/index.ts': '',
        '.dependency-cruiser.projet.cjs': projet(`{ exclude: ${vide} }`),
      });
      expect(couvre(o.exclude, 'src/index.ts')).toBe(false);
      expect(couvre(o.exclude, 'packages/app/src/index.ts')).toBe(false);
      expect(couvre(o.exclude, 'dist/index.js')).toBe(true);
      expect(couvre(o.exclude, 'packages/app/build/index.js')).toBe(true);
    });
    it(`9 — an empty exclusion of the project (${vide}) still cruises the code: a broken import is refused`, () => {
      const r = verdict({
        'src/index.ts': "export { z } from './absent';",
        'packages/app/package.json': '{"name":"app"}',
        'packages/app/src/index.ts': 'export const a = 1;',
        'packages/app/dist/index.ts': "export { z } from './absent';",
        '.dependency-cruiser.projet.cjs': projet(`{ exclude: ${vide} }`),
      });
      expect(r.status).not.toBe(0);
      expect(r.sortie).toMatch(/tout-import-se-resout: src\/index\.ts/);
      expect(r.sortie).not.toMatch(/dist\/index/);
    });
    it(`9 — an empty doNotFollow of the project (${vide}) adds nothing: node_modules alone`, () => {
      const o = options({
        'src/index.ts': '',
        '.dependency-cruiser.projet.cjs': projet(`{ doNotFollow: ${vide} }`),
      });
      expect(couvre(o.doNotFollow, 'node_modules/vitest/index.js')).toBe(true);
      expect(couvre(o.doNotFollow, 'src/index.ts')).toBe(false);
      expect(couvre(o.doNotFollow, '.publie/machine.ts')).toBe(false);
    });
    it(`9 — an empty doNotFollow of the project (${vide}) still follows the code: a broken import behind it is refused`, () => {
      const r = verdict({
        ...TEMOIN,
        '.dependency-cruiser.projet.cjs': projet(
          `{ doNotFollow: ${vide}, exclude: { path: '\\\\.svelte-kit' } }`
        ),
      });
      expect(r.status).not.toBe(0);
      expect(r.sortie).toMatch(/tout-import-se-resout: \.publie\/machine\.ts/);
    });
  }
});
