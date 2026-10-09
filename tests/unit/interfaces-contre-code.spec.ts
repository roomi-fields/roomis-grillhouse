import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { declare, exportsDuRapport } from '../../scripts/interfaces-contre-code.mjs';

const SCRIPT = path.resolve(__dirname, '../../scripts/interfaces-contre-code.mjs');
const MODULES = path.resolve(__dirname, '../../node_modules');

const TSCONFIG = JSON.stringify({ compilerOptions: { strict: true, skipLibCheck: true } });

// A one-package project whose module `a` is built in dist/a, with the given files on top.
function projet(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(tmpdir(), 'icc-'));
  const base = {
    'package.json': '{"name":"p","types":"dist/index.d.ts"}',
    'tsconfig.json': TSCONFIG,
    'src/a/index.ts': 'export function duree(x: number): number { return x; }\n',
    'dist/a/index.d.ts': 'export declare function duree(x: number): number;\n',
    'src/a/docs/INTERFACE.md': '# a\n\nA rend des durées.\n\n## `duree`(x)\n\nRend x.\n',
  };
  for (const [rel, text] of Object.entries({ ...base, ...files })) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  }
  symlinkSync(MODULES, path.join(dir, 'node_modules'));
  const run = (...args: string[]) =>
    spawnSync('node', [SCRIPT, ...args], { cwd: dir, encoding: 'utf8' });
  return { dir, run };
}
const apres = (files: Record<string, string>, change: Record<string, string> = {}) => {
  const p = projet(files);
  p.run('--ecrire');
  for (const [rel, text] of Object.entries(change)) {
    writeFileSync(path.join(p.dir, rel), text);
  }
  return p.run();
};

describe('declare', () => {
  it('reads the element titles and the fault codes, not the titles inside code', () => {
    const d = declare(
      '# a\n\n## `parse`(source)\n\n### `Lu`\n\n## Consommateurs\n\n```md\n## `faux`\n```\n\n## Les fautes\n\n```text\nPARSE_EXPECTED PARSE_LEFTOVER\n```\n'
    );
    expect([...d.elements]).toEqual(['parse', 'Lu']);
    expect([...d.fautes!]).toEqual(['PARSE_EXPECTED', 'PARSE_LEFTOVER']);
  });
  it('has no fault list without the section', () => {
    expect(declare('# a\n').fautes).toBeNull();
  });
});

describe('exportsDuRapport', () => {
  it('names every export of a report', () => {
    const r =
      'export function f(): void;\nexport const c: number;\nexport interface I {}\nexport type T = 1;\nexport class K {}\nexport enum E {}\nexport { x as y, z }\n';
    expect([...exportsDuRapport(r)].sort()).toEqual(['E', 'I', 'K', 'T', 'c', 'f', 'y', 'z']);
  });
});

describe('the check', () => {
  it('passes an interface that describes exactly the API', () => {
    const r = apres({});
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
  it('refuses an export the interface does not describe', () => {
    const r = apres({
      'dist/a/index.d.ts':
        'export declare function duree(x: number): number;\nexport declare const tempo: number;\n',
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/exporte tempo, que docs\/INTERFACE\.md ne décrit pas/);
  });
  it('refuses an element the code does not export', () => {
    const r = apres({
      'src/a/docs/INTERFACE.md': '# a\n\nA.\n\n## `duree`(x)\n\nR.\n\n## `vitesse`()\n\nV.\n',
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/décrit vitesse, que le code n'exporte pas/);
  });
  it('refuses an API changed without its report', () => {
    const r = apres(
      {},
      { 'dist/a/index.d.ts': 'export declare function duree(x: string): number;\n' }
    );
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/l'API a changé sans son rapport/);
  });
  it('refuses a listed fault the code does not raise, and a raised fault not listed', () => {
    const r = apres({
      'src/a/docs/INTERFACE.md':
        '# a\n\nA.\n\n## `duree`(x)\n\nR.\n\n## Les fautes\n\n```text\nDUREE_NEGATIVE DUREE_ABSENTE\n```\n',
      'src/a/index.ts':
        "export function duree(x: number): number { if (x < 0) throw new Error('DUREE_NEGATIVE'); if (x > 9) throw new Error('DUREE_TROP_LONGUE'); return x; }\n",
      'src/a/index.spec.ts': "const t = 'DUREE_DE_TEST';\n",
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/DUREE_ABSENTE est listée, mais le code ne la produit pas/);
    expect(r.stderr).toMatch(/le code produit DUREE_TROP_LONGUE/);
    expect(r.stderr).not.toMatch(/DUREE_DE_TEST/);
  });
  it('reports a component without interface, without refusing', () => {
    const r = apres({ 'src/b/index.ts': 'export const b = 1;\n' });
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/src\/b n'a pas d'interface/);
  });
  it('refuses a component whose build is missing', () => {
    const q = projet({ 'package.json': '{"name":"p","types":"build/index.d.ts"}' });
    expect(q.run().stderr).toMatch(/construis d'abord/);
  });
  it("takes a package's main entry only, not its test material", () => {
    const r = apres({
      'packages/b/package.json': JSON.stringify({
        name: 'b',
        exports: {
          '.': { types: './dist/index.d.ts' },
          './test-fixtures': { types: './dist/fixtures.d.ts' },
        },
      }),
      'packages/b/tsconfig.json': TSCONFIG,
      'packages/b/dist/index.d.ts': 'export declare const b: number;\n',
      'packages/b/dist/fixtures.d.ts': 'export declare const cas: number;\n',
      'packages/b/docs/INTERFACE.md': '# b\n\nB.\n\n## `b`\n\nUn nombre.\n',
    });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });
});
