import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { configuration } from '../../scripts/frontieres.mjs';
import {
  SCRIPT,
  charge,
  EXPORTS,
  REGLE,
  erreurs,
  refus,
  paquet,
  frontieresEssai,
} from './frontieres-essai.js';

// The boundaries between components (scripts/frontieres.mjs, tests/unit/frontieres.spec.ts): the
// published code imports no development dependency (grillhouse-3uv.77).
// The repositories of trial: ./frontieres-essai.ts.

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'frontieres-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { espace } = frontieresEssai(ESSAIS);

describe('grillhouse-3uv.77 — the published code imports no development dependency', () => {
  it('critère 1: a file published by an export, out of src, importing a development dependency is refused, naming the file, the dependency and the rule', () => {
    const r = espace({
      'packages/p/package.json': paquet({ '.': './lib/index.ts' }),
      'packages/p/lib/index.ts': "export { expect } from 'vitest';",
    });
    expect(r.status, r.sortie).not.toBe(0);
    expect(r.sortie).toMatch(refus('packages/p/lib/index.ts', 'vitest'));
    expect(erreurs(r.sortie)).toEqual([REGLE]);
  });
  it('critère 1: a file reached indirectly from an exported entry is published too: refused', () => {
    const r = espace({
      'packages/p/package.json': paquet({ '.': './lib/index.ts' }),
      'packages/p/lib/index.ts': "export { e } from './aide';",
      'packages/p/lib/aide.ts': "import { expect } from 'vitest';\nexport const e = expect;",
    });
    expect(r.status, r.sortie).not.toBe(0);
    expect(r.sortie).toMatch(refus('packages/p/lib/aide.ts', 'vitest'));
    expect(erreurs(r.sortie)).toEqual([REGLE]);
  });
  it('critère 1: an exports field written as a single string publishes its file: refused', () => {
    const r = espace({
      'packages/p/package.json': paquet('./lib/index.ts'),
      'packages/p/lib/index.ts': "export { expect } from 'vitest';",
    });
    expect(r.status, r.sortie).not.toBe(0);
    expect(r.sortie).toMatch(refus('packages/p/lib/index.ts', 'vitest'));
  });
  it('critère 1: a conditional export publishes the file of its condition: refused', () => {
    const r = espace({
      'packages/p/package.json': paquet({ '.': { import: './lib/index.ts' } }),
      'packages/p/lib/index.ts': "export { expect } from 'vitest';",
    });
    expect(r.status, r.sortie).not.toBe(0);
    expect(r.sortie).toMatch(refus('packages/p/lib/index.ts', 'vitest'));
  });
  it('critère 2: an import of types only from a development dependency, in an exported entry, is refused', () => {
    const r = espace({
      'packages/p/package.json': paquet(EXPORTS),
      'packages/p/src/index.ts': "import type { Mock } from 'vitest';\nexport type M = Mock;",
      'packages/p/test-fixtures/index.ts': 'export const f = 1;',
    });
    expect(r.status, r.sortie).not.toBe(0);
    expect(r.sortie).toMatch(refus('packages/p/src/index.ts', 'vitest'));
    expect(erreurs(r.sortie)).toEqual([REGLE]);
  });
  it('critère 2: the types of a sibling package declared in devDependencies, in an exported entry, are refused', () => {
    const r = espace({
      'packages/p/package.json': paquet(EXPORTS),
      'packages/p/src/index.ts': "import type { B } from 'b';\nexport type X = B;",
      'packages/p/test-fixtures/index.ts': 'export const f = 1;',
    });
    expect(r.status, r.sortie).not.toBe(0);
    expect(r.sortie).toMatch(refus('packages/p/src/index.ts', 'b'));
  });
  it('critère 3: the exported test material, out of src, importing a development dependency is refused', () => {
    const r = espace({
      'packages/p/package.json': paquet(EXPORTS),
      'packages/p/src/index.ts': 'export const a = 1;',
      'packages/p/test-fixtures/index.ts': "export { expect } from 'vitest';",
    });
    expect(r.status, r.sortie).not.toBe(0);
    expect(r.sortie).toMatch(refus('packages/p/test-fixtures/index.ts', 'vitest'));
    expect(erreurs(r.sortie)).toEqual([REGLE]);
  });
  it('critère 3: the witness — the exported test material importing the types of a sibling declared in devDependencies is refused', () => {
    const r = espace({
      'packages/p/package.json': paquet(EXPORTS),
      'packages/p/src/index.ts': 'export const a = 1;',
      'packages/p/test-fixtures/index.ts': "import type { B } from 'b';\nexport type X = B;",
    });
    expect(r.status, r.sortie).not.toBe(0);
    expect(r.sortie).toMatch(refus('packages/p/test-fixtures/index.ts', 'b'));
    expect(erreurs(r.sortie)).toEqual([REGLE]);
  });
  it('critère 3: the exported test material placed in a tests directory is published too: refused', () => {
    const r = espace({
      'packages/p/package.json': paquet({
        '.': './src/index.ts',
        './test-fixtures': './tests/fixtures/index.ts',
      }),
      'packages/p/src/index.ts': 'export const a = 1;',
      'packages/p/tests/fixtures/index.ts': "export { expect } from 'vitest';",
    });
    expect(r.status, r.sortie).not.toBe(0);
    expect(r.sortie).toMatch(refus('packages/p/tests/fixtures/index.ts', 'vitest'));
  });
  it('critère 4: a test file that no export reaches may import a development dependency, values and types', () => {
    const r = espace({
      'packages/p/package.json': paquet(EXPORTS),
      'packages/p/src/index.ts': 'export const a = 1;',
      'packages/p/test-fixtures/index.ts': 'export const f = 1;',
      'packages/p/tests/a.spec.ts':
        "import { expect } from 'vitest';\nimport type { B } from 'b';\nimport { f } from '../test-fixtures/index';\nexport type X = B;\nexport const e = [expect, f];",
      'packages/p/src/a.test.ts':
        "import type { Mock } from 'vitest';\nimport { a } from './index';\nexport type M = Mock;\nexport const x = a;",
    });
    expect(r.sortie).not.toMatch(new RegExp(REGLE));
    expect(r.status, r.sortie).toBe(0);
  });
  it('critère 5: an import of a declared dependency passes from every published file, types included', () => {
    const r = espace({
      'packages/p/package.json': paquet(EXPORTS),
      'packages/p/src/index.ts':
        "import { config } from 'dotenv';\nimport type { DotenvConfigOptions } from 'dotenv';\nexport type O = DotenvConfigOptions;\nexport const c = config;",
      'packages/p/test-fixtures/index.ts':
        "import type { DotenvConfigOptions } from 'dotenv';\nexport type O = DotenvConfigOptions;",
    });
    expect(r.sortie).not.toMatch(new RegExp(REGLE));
    expect(r.status, r.sortie).toBe(0);
  });
  it('critère 6: the repository without packages (Grillhouse itself) keeps its verdict: it passes', () => {
    const racine = path.resolve(__dirname, '../..');
    const r = spawnSync('node', [SCRIPT], { cwd: racine, encoding: 'utf8' });
    expect(r.stdout + r.stderr).not.toMatch(new RegExp(REGLE));
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });
  it('critère 7: the generated configuration of the repository is rewritten with the rule', () => {
    const racine = path.resolve(__dirname, '../..');
    expect(readFileSync(path.join(racine, '.dependency-cruiser.cjs'), 'utf8')).toBe(
      configuration(racine)
    );
  });
  it('critère 7: one rule alone refuses a development dependency, the existing one extended', () => {
    const { dir } = espace({
      'packages/p/package.json': paquet(EXPORTS),
      'packages/p/src/index.ts': 'export const a = 1;',
      'packages/p/test-fixtures/index.ts': 'export const f = 1;',
    });
    const noms = (charge(dir).forbidden as { name: string }[])
      .filter(r => JSON.stringify(r).includes('npm-dev'))
      .map(r => r.name);
    expect(noms).toEqual([REGLE]);
  });
  it('critère 7: the header of frontieres.mjs says the extended rule — the exports, the types', () => {
    const entete = readFileSync(SCRIPT, 'utf8').split(/\nimport /)[0] ?? '';
    const phrase =
      entete
        .replace(/\n\/\/ ?/g, ' ')
        .split(/[.;]\s/)
        .find(p => /development dependenc/.test(p)) ?? '';
    expect(phrase).toMatch(/`?exports`?/);
    expect(phrase).toMatch(/\btypes?\b/);
  });
});
