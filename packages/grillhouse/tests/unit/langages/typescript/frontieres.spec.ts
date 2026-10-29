import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { configuration } from '../../../../scripts/langages/typescript/frontieres.mjs';
import { SCRIPT, Chargee, charge, frontieresEssai } from './frontieres-essai.js';

// The boundaries between components (scripts/langages/typescript/frontieres.mjs, dependency-cruiser): the generated
// configuration and the rules it holds. The project's options are tested in frontieres.options,
// the development dependencies in frontieres.dependances-de-developpement, the entries of a
// package in frontieres.entrees.
// The repositories of trial: ./frontieres-essai.ts.

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'frontieres-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { repo, verdict } = frontieresEssai(ESSAIS);

describe('configuration', () => {
  it('adds the entry rule only when src has modules', () => {
    const avec = repo({ 'src/a/index.ts': '' });
    const sans = repo({ 'src/index.ts': '' });
    expect(configuration(avec.dir)).toMatch(/un-module-par-son-entree/);
    expect(configuration(sans.dir)).not.toMatch(/un-module-par-son-entree/);
  });
});

describe('the boundaries', () => {
  it('pass a clean repository, an orphan only reported', () => {
    const r = verdict({
      'src/index.ts': "export * from './a';",
      'src/a/index.ts': "export { b } from '../b';",
      'src/b/index.ts': 'export const b = 1;',
      'src/seul.ts': 'export const s = 1;',
    });
    expect(r.status).toBe(0);
    expect(r.sortie).toMatch(/pas-d-orphelin: src\/seul\.ts/);
  });
  // Witness: BPScript. A package of tools declares its commands in `bin`, which nothing imports: a
  // file that `bin` names is an entry, as knip takes it, and no orphan.
  it.each([
    ['an object', { 'bp-outil': './bin/outil.mjs', 'bp-autre': 'bin/autre.mjs' }],
    ['a string', './bin/outil.mjs'],
  ])(
    'report no file that the bin field names (%s), a real orphan beside it reported',
    (_f, bin) => {
      const r = verdict({
        'packages/outils/package.json': JSON.stringify({ name: 'outils', bin }),
        'packages/outils/bin/outil.mjs': 'console.log(1);\n',
        'packages/outils/bin/autre.mjs': 'console.log(2);\n',
        'packages/outils/bin/seul.mjs': 'console.log(3);\n',
      });
      expect(r.status, r.sortie).toBe(0);
      expect(r.sortie).not.toMatch(/pas-d-orphelin: packages\/outils\/bin\/outil\.mjs/);
      expect(r.sortie).toMatch(/pas-d-orphelin: packages\/outils\/bin\/seul\.mjs/);
      if (typeof bin === 'object') {
        expect(r.sortie).not.toMatch(/pas-d-orphelin: packages\/outils\/bin\/autre\.mjs/);
      } else {
        expect(r.sortie).toMatch(/pas-d-orphelin: packages\/outils\/bin\/autre\.mjs/);
      }
    }
  );
  it('refuse a cycle', () => {
    const r = verdict({
      'src/x.ts': "import { y } from './y';\nexport const x = y;",
      'src/y.ts': "import { x } from './x';\nexport const y = x;",
    });
    expect(r.status).not.toBe(0);
    expect(r.sortie).toMatch(/pas-de-cycle/);
  });
  it('refuse a module reached by its inside', () => {
    const r = verdict({
      'src/a/index.ts': "export { b } from '../b/interne';",
      'src/b/index.ts': "export { b } from './interne';",
      'src/b/interne.ts': 'export const b = 1;',
    });
    expect(r.status).not.toBe(0);
    expect(r.sortie).toMatch(/un-module-par-son-entree/);
  });
  it('refuse a package reached by a path into its tree', () => {
    const r = verdict({
      'packages/a/src/index.ts': "export { b } from '../../b/src/index';",
      'packages/b/src/index.ts': 'export const b = 1;',
    });
    expect(r.status).not.toBe(0);
    expect(r.sortie).toMatch(/un-paquet-par-son-nom/);
  });
  it('refuse production code that imports a test', () => {
    const r = verdict({
      'src/index.ts': "export { aide } from '../tests/aide';",
      'tests/aide.ts': 'export const aide = 1;',
    });
    expect(r.status).not.toBe(0);
    expect(r.sortie).toMatch(/pas-de-test-dans-le-code/);
  });
  it('refuse production code that imports a development dependency', () => {
    const r = verdict({
      'package.json': '{"name":"r","devDependencies":{"vitest":"*"}}',
      'src/index.ts': "export { expect } from 'vitest';",
      'tests/a.spec.ts': "import { expect } from 'vitest';\nexport const e = expect;",
    });
    expect(r.status).not.toBe(0);
    expect(r.sortie).toMatch(/pas-d-outil-de-developpement-dans-le-code: src\/index\.ts/);
    expect(r.sortie).not.toMatch(/tests\/a\.spec\.ts → /);
  });
  it('refuse an import that does not resolve', () => {
    const r = verdict({ 'src/index.ts': "export { z } from './absent';" });
    expect(r.status).not.toBe(0);
    expect(r.sortie).toMatch(/tout-import-se-resout/);
  });
  it("adds the project's own rules", () => {
    const r = verdict({
      'src/index.ts': "export { v } from './vieux';",
      'src/vieux.ts': 'export const v = 1;',
      '.dependency-cruiser.projet.cjs':
        "module.exports = { forbidden: [{ name: 'pas-de-vieux', severity: 'error', from: {}, to: { path: 'vieux' } }] };",
    });
    expect(r.status).not.toBe(0);
    expect(r.sortie).toMatch(/pas-de-vieux/);
  });
  it('refuse a configuration out of date with the components', () => {
    const { dir, run } = repo({ 'src/index.ts': '' });
    mkdirSync(path.join(dir, 'src/nouveau'));
    writeFileSync(path.join(dir, 'src/nouveau/index.ts'), '');
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/pas à jour/);
  });
});

// grillhouse-3uv.56 critère 16: every line of the generated configuration holds in 100 columns,
// the width of the project (.prettierrc).
describe('grillhouse-3uv.56 critère 16 — the generated configuration holds in 100 columns', () => {
  const longues = (texte: string) =>
    texte
      .split('\n')
      .map((l, i) => ({ n: i + 1, l }))
      .filter(({ l }) => [...l].length > 100)
      .map(({ n, l }) => `${n}: ${[...l].length}`);
  it('critère 16: the configuration of a repository with modules under src and a tsconfig holds in 100 columns', () => {
    const { dir } = repo({ 'src/a/index.ts': '', 'src/b/index.ts': '', 'tsconfig.json': '{}' });
    expect(longues(readFileSync(path.join(dir, '.dependency-cruiser.cjs'), 'utf8'))).toEqual([]);
  });
  it('critère 16: with packages out of the frame whose names make a long exclusion, it still holds in 100 columns, the exclusion unchanged', () => {
    const noms = [
      'interface-graphique',
      'moteur-de-rendu',
      'compilateur-ancien',
      'outils-internes',
    ];
    const fichiers: Record<string, string> = {
      'src/index.ts': '',
      'docs/agents/hors-cadre.txt': `${noms.join('\n')}\n`,
    };
    for (const nom of noms) {
      fichiers[`packages/${nom}/package.json`] = `{"name":"${nom}"}`;
      fichiers[`packages/${nom}/src/index.ts`] = '';
    }
    const { dir } = repo(fichiers);
    expect(longues(readFileSync(path.join(dir, '.dependency-cruiser.cjs'), 'utf8'))).toEqual([]);
    const exclus = charge(dir).options.exclude.path;
    for (const nom of noms) {
      expect(new RegExp(exclus).test(`packages/${nom}/src/index.ts`), nom).toBe(true);
    }
    expect(new RegExp(exclus).test('src/index.ts')).toBe(false);
  });
});

// grillhouse-3uv.56 critère 17: the project file brings every key of dependency-cruiser's
// configuration: `allowed` and `required` add to the frame's, as `forbidden` does;
// `allowedSeverity` and `extends` pass as they are. The reference is dependency-cruiser's own
// `extends`, which merges these keys.
describe('grillhouse-3uv.56 critère 17 — the project file brings every key of the configuration', () => {
  type Complete = Chargee & {
    allowed?: unknown[];
    required?: unknown[];
    allowedSeverity?: string;
    extends?: unknown;
  };
  const chargeComplete = (files: Record<string, string>) => charge(repo(files).dir) as Complete;
  const ALLOWED = "[{ from: {}, to: { path: '^src/(index|a)[.]ts$' } }]";
  const REQUIRED =
    "[{ name: 'doit-importer-a', severity: 'error', module: { path: '^src/index[.]ts$' }, to: { path: '^src/a[.]ts$' } }]";
  it('critère 17: allowed of the project file is in the loaded configuration', () => {
    const c = chargeComplete({
      'src/index.ts': '',
      '.dependency-cruiser.projet.cjs': `module.exports = { allowed: ${ALLOWED} };`,
    });
    expect(c.allowed).toEqual([{ from: {}, to: { path: '^src/(index|a)[.]ts$' } }]);
  });
  it('critère 17: required of the project file is in the loaded configuration', () => {
    const c = chargeComplete({
      'src/index.ts': '',
      '.dependency-cruiser.projet.cjs': `module.exports = { required: ${REQUIRED} };`,
    });
    expect(c.required).toEqual([
      {
        name: 'doit-importer-a',
        severity: 'error',
        module: { path: '^src/index[.]ts$' },
        to: { path: '^src/a[.]ts$' },
      },
    ]);
  });
  it('critère 17: allowedSeverity and extends of the project file pass as they are', () => {
    const c = chargeComplete({
      'src/index.ts': '',
      'regles.cjs': 'module.exports = { forbidden: [] };',
      '.dependency-cruiser.projet.cjs':
        "module.exports = { allowedSeverity: 'error', extends: './regles.cjs' };",
    });
    expect(c.allowedSeverity).toBe('error');
    expect(c.extends).toBe('./regles.cjs');
  });
  it('critère 17: an import outside the allowed of the project file is refused at allowedSeverity error', () => {
    const r = verdict({
      'src/index.ts': "export { a } from './a';\nexport { b } from './b';",
      'src/a.ts': 'export const a = 1;',
      'src/b.ts': 'export const b = 1;',
      '.dependency-cruiser.projet.cjs': `module.exports = { allowed: ${ALLOWED}, allowedSeverity: 'error' };`,
    });
    expect(r.status, r.sortie).not.toBe(0);
    expect(r.sortie).toMatch(/not-in-allowed/);
    expect(r.sortie).toMatch(/src\/b\.ts/);
  });
  it('critère 17: a required rule of the project file is refused when the module lacks its import', () => {
    const r = verdict({
      'src/index.ts': "export { b } from './b';",
      'src/a.ts': 'export const a = 1;',
      'src/b.ts': 'export const b = 1;',
      '.dependency-cruiser.projet.cjs': `module.exports = { required: ${REQUIRED} };`,
    });
    expect(r.status, r.sortie).not.toBe(0);
    expect(r.sortie).toMatch(/doit-importer-a/);
  });
  it('critère 17: the rules of a configuration the project file extends apply', () => {
    const r = verdict({
      'src/index.ts': "export { v } from './vieux';",
      'src/vieux.ts': 'export const v = 1;',
      'regles.cjs':
        "module.exports = { forbidden: [{ name: 'pas-de-vieux-partage', severity: 'error', from: {}, to: { path: 'vieux' } }] };",
      '.dependency-cruiser.projet.cjs': "module.exports = { extends: './regles.cjs' };",
    });
    expect(r.status, r.sortie).not.toBe(0);
    expect(r.sortie).toMatch(/pas-de-vieux-partage/);
  });
  it('critère 17: the header of frontieres.mjs names allowed, required, allowedSeverity and extends', () => {
    const entete = readFileSync(SCRIPT, 'utf8').split(/\nimport /)[0] ?? '';
    for (const cle of ['allowed', 'required', 'allowedSeverity', 'extends']) {
      expect(entete, cle).toMatch(new RegExp(`\\b${cle}\\b`));
    }
  });
});
