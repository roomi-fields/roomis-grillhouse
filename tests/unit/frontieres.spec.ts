import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { configuration } from '../../scripts/frontieres.mjs';

const SCRIPT = path.resolve(__dirname, '../../scripts/frontieres.mjs');
const MODULES = path.resolve(__dirname, '../../node_modules');

// A repository with the given files, the template's dependencies, and its generated configuration.
function repo(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), 'frontieres-'));
  for (const [rel, text] of Object.entries({ 'package.json': '{"name":"r"}', ...files })) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  }
  symlinkSync(MODULES, path.join(dir, 'node_modules'));
  const run = (...args: string[]) =>
    spawnSync('node', [SCRIPT, ...args], { cwd: dir, encoding: 'utf8' });
  run('--ecrire');
  return { dir, run };
}
const verdict = (files: Record<string, string>) => {
  const r = repo(files).run();
  return { status: r.status, sortie: r.stdout + r.stderr };
};

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
