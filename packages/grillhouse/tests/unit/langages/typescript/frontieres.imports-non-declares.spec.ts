import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { SCRIPT, erreurs, frontieresEssai } from './frontieres-essai.js';

// The boundaries between components (scripts/langages/typescript/frontieres.mjs): an import that
// the `package.json` of the importing package does not declare is refused, and the refusal says
// the two ways on. The repositories of trial: ./frontieres-essai.ts.

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'frontieres-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { espace, chargee } = frontieresEssai(ESSAIS);

// The package.json of `p`, with the given dependencies and development dependencies.
const pkg = (dependencies: Record<string, string>, devDependencies: Record<string, string> = {}) =>
  JSON.stringify({
    name: 'p',
    exports: { '.': './src/index.ts' },
    dependencies,
    devDependencies,
  });
// The package.json of the workspace's root, declaring the given dependencies.
const racine = (dependencies: Record<string, string>) =>
  JSON.stringify({ name: 'r', dependencies });

// The rule names of a refusal are the project's to name: the rule is found by what it judges.
const REFUS_ARCHITECTURE = /question d['’]architecture/i;

describe('an import that the package does not declare is refused', () => {
  it('an external package declared only at the root is refused, naming the file, the package and the two ways on', () => {
    const r = espace({
      'package.json': racine({ typescript: '*' }),
      'packages/p/package.json': pkg({}),
      'packages/p/src/index.ts': "import ts from 'typescript';\nexport const t = ts;",
    });
    expect(r.status, r.sortie).not.toBe(0);
    expect(r.sortie).toMatch(/packages\/p\/src\/index\.ts[^\n]*typescript/);
    expect(r.sortie).toMatch(/package\.json[^]*question d['’]architecture/i);
    expect(erreurs(r.sortie)).toHaveLength(1);
  });
  it('an external package declared nowhere is refused', () => {
    const r = espace({
      'packages/p/package.json': pkg({}),
      'packages/p/src/index.ts': "import ts from 'typescript';\nexport const t = ts;",
    });
    expect(r.status, r.sortie).not.toBe(0);
    expect(r.sortie).toMatch(/packages\/p\/src\/index\.ts[^\n]*typescript/);
  });
  it('the refusal of an external package does not name the Consommateurs section', () => {
    const r = espace({
      'packages/p/package.json': pkg({}),
      'packages/p/src/index.ts': "import ts from 'typescript';\nexport const t = ts;",
    });
    expect(r.status, r.sortie).not.toBe(0);
    expect(r.sortie).toMatch(REFUS_ARCHITECTURE);
    expect(r.sortie).not.toMatch(/Consommateurs/);
  });
  it('another undeclared external package of another file is refused, each file named', () => {
    const r = espace({
      'packages/p/package.json': pkg({ dotenv: '*' }),
      'packages/p/src/index.ts': "export { config } from 'dotenv';\nexport { x } from './aide';",
      'packages/p/src/aide.ts': "import ts from 'typescript';\nexport const x = ts;",
    });
    expect(r.status, r.sortie).not.toBe(0);
    expect(r.sortie).toMatch(/packages\/p\/src\/aide\.ts[^\n]*typescript/);
    expect(r.sortie).not.toMatch(/packages\/p\/src\/index\.ts[^\n]*dotenv[^\n]*package\.json/);
  });
  it('an import of types only of an undeclared external package is refused', () => {
    const r = espace({
      'packages/p/package.json': pkg({}),
      'packages/p/src/index.ts': "import type { Node } from 'typescript';\nexport type N = Node;",
    });
    expect(r.status, r.sortie).not.toBe(0);
    expect(r.sortie).toMatch(/packages\/p\/src\/index\.ts[^\n]*typescript/);
    expect(r.sortie).toMatch(/package\.json[^]*question d['’]architecture/i);
  });
  it('a package of the repository imported without declaration is refused, naming the Consommateurs section of the provider', () => {
    const r = espace({
      'packages/p/package.json': pkg({}),
      'packages/p/src/index.ts': "import { b } from 'b';\nexport const x = b;",
    });
    expect(r.status, r.sortie).not.toBe(0);
    expect(r.sortie).toMatch(/packages\/p\/src\/index\.ts[^\n]*\bb\b/);
    expect(r.sortie).toMatch(
      /package\.json[^]*Consommateurs[^]*INTERFACE\.md|INTERFACE\.md[^]*Consommateurs/
    );
    expect(r.sortie).toMatch(/Consommateurs[^]*question d['’]architecture/i);
  });
  it('the types of a package of the repository imported without declaration are refused with the Consommateurs section', () => {
    const r = espace({
      'packages/p/package.json': pkg({}),
      'packages/p/src/index.ts': "import type { B } from 'b';\nexport type X = B;",
    });
    expect(r.status, r.sortie).not.toBe(0);
    expect(r.sortie).toMatch(/Consommateurs/);
  });
  it('a package of the repository declared only at the root is refused', () => {
    const r = espace({
      'package.json': racine({ b: '*' }),
      'packages/p/package.json': pkg({}),
      'packages/p/src/index.ts': "import { b } from 'b';\nexport const x = b;",
    });
    expect(r.status, r.sortie).not.toBe(0);
    expect(r.sortie).toMatch(/Consommateurs/);
  });
});

describe('what the package declares, or Node provides, is not refused', () => {
  it('an import declared in dependencies passes, types included', () => {
    const r = espace({
      'packages/p/package.json': pkg({ dotenv: '*', b: '*' }),
      'packages/p/src/index.ts':
        "import { config } from 'dotenv';\nimport type { DotenvConfigOptions } from 'dotenv';\nimport { b } from 'b';\nexport type O = DotenvConfigOptions;\nexport const c = [config, b];",
    });
    expect(r.sortie).not.toMatch(REFUS_ARCHITECTURE);
    expect(r.status, r.sortie).toBe(0);
  });
  it('a module of Node passes, with or without its prefix', () => {
    const r = espace({
      'packages/p/package.json': pkg({}),
      'packages/p/src/index.ts':
        "import { readFileSync } from 'node:fs';\nimport path from 'path';\nexport const r = [readFileSync, path];",
    });
    expect(r.sortie).not.toMatch(REFUS_ARCHITECTURE);
    expect(r.status, r.sortie).toBe(0);
  });
  it('a development dependency imported by a test file out of the published code passes', () => {
    const r = espace({
      'packages/p/package.json': pkg({}, { vitest: '*', b: '*' }),
      'packages/p/src/index.ts': 'export const a = 1;',
      'packages/p/tests/a.spec.ts':
        "import { expect } from 'vitest';\nimport type { B } from 'b';\nexport type X = B;\nexport const e = expect;",
    });
    expect(r.sortie).not.toMatch(REFUS_ARCHITECTURE);
    expect(r.status, r.sortie).toBe(0);
  });
  it("Grillhouse's repository keeps its verdict: it passes", () => {
    const dir = path.resolve(__dirname, '../../../../../..');
    const r = spawnSync('node', [SCRIPT], { cwd: dir, encoding: 'utf8' });
    expect(r.stdout + r.stderr).not.toMatch(REFUS_ARCHITECTURE);
    expect(r.status, r.stdout + r.stderr).toBe(0);
  });
});

describe('the generated configuration carries the rule', () => {
  it('one error rule refuses the imports of dependency-cruiser types npm-no-pkg and npm-unknown, and no other', () => {
    const { config } = chargee({
      'packages/p/package.json': pkg({}),
      'packages/p/src/index.ts': 'export const a = 1;',
    });
    const regles = (config.forbidden as { name: string; severity: string; to: unknown }[]).filter(
      r => JSON.stringify(r.to).includes('npm-no-pkg')
    );
    expect(regles).toHaveLength(1);
    const [regle] = regles;
    expect(regle?.severity).toBe('error');
    const types = (regle?.to as { dependencyTypes: string[] }).dependencyTypes;
    expect([...types].sort()).toEqual(['npm-no-pkg', 'npm-unknown']);
  });
  it('the generated configuration of the repository is rewritten with the rule', () => {
    const dir = path.resolve(__dirname, '../../../../../..');
    expect(readFileSync(path.join(dir, '.dependency-cruiser.cjs'), 'utf8')).toContain('npm-no-pkg');
  });
});
