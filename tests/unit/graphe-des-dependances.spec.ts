// grillhouse-3uv.67.1: the shared test material enters the graph of the dependencies. A link of
// material is born of an import of `<package name>/test-fixtures` in any source file of a
// component, tests and material included; the graph is the production consumptions plus these
// links (the model: Turborepo counts every dependency of a package, all_dependencies). One function
// of scripts/consommateurs.mjs gives it, and the fingerprints (scripts/integration/traces.mjs), the
// scope of the suites (scripts/integration/rejeu.mjs) and the order of the builds
// (scripts/integration/constructions.mjs) read it.
//
// The interface these tests fix: `dependances(racine)` of scripts/consommateurs.mjs, a Map from a
// component's name (its directory name, as `utilise` names it) to the Set of the names of the
// components it depends on; a component that depends on none may be absent or map to an empty Set.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import * as consommateurs from '../../scripts/consommateurs.mjs';
import { imports, verifier } from '../../scripts/consommateurs.mjs';
import { ouvrirTraces } from '../../scripts/integration/traces.mjs';
import { depot } from './constructions-essai.js';
import { chantier } from './integration-essai.js';

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'graphe-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const LONG = 120_000;
const FRAME = path.resolve(__dirname, '../..');

type Graphe = Map<string, Set<string>>;
const dependances = (racine: string): Graphe =>
  (consommateurs as unknown as { dependances: (r: string) => Graphe }).dependances(racine);
// The providers of <nom> in the graph of <racine>, sorted.
const fournisseurs = (g: Graphe, nom: string) => [...(g.get(nom) ?? [])].sort();

function projet(files: Record<string, string>) {
  const dir = mkdtempSync(path.join(ESSAIS, 'projet-'));
  ecrire(dir, files);
  return dir;
}
function ecrire(dir: string, files: Record<string, string>) {
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  }
}

// A package of the trial: its name, its exports (with the material when <matiere>), its build.
const paquet = (nom: string, matiere: boolean, build = false) =>
  JSON.stringify({
    name: nom,
    version: '1.0.0',
    exports: matiere
      ? { '.': './src/index.ts', './test-fixtures': './test/fixture.ts' }
      : { '.': './src/index.ts' },
    ...(build ? { scripts: { build: 'node build.mjs' } } : {}),
  });

// The witness of the ticket: b publishes a material; a test of a imports it, and nothing of a's
// production code reads b.
const TEMOIN = {
  'packages/b/package.json': paquet('@e/b', true),
  'packages/b/src/index.ts': 'export const b = 1;\n',
  'packages/b/test/fixture.ts': 'export const exemple = 1;\n',
  'packages/a/package.json': paquet('@e/a', false),
  'packages/a/src/index.ts': 'export const a = 1;\n',
  'packages/a/test/a.spec.ts': "import { exemple } from '@e/b/test-fixtures';\n",
};

describe('critère 1 — one function of the graph: the production consumptions plus the links of material', () => {
  it('critère 1: a test file importing <package>/test-fixtures of a neighbour links its component to it', () => {
    const g = dependances(projet(TEMOIN));
    expect(fournisseurs(g, 'a')).toEqual(['b']);
    expect(fournisseurs(g, 'b')).toEqual([]);
  });
  it('critère 1: the material itself (a file under test/, not a test file) importing a neighbour’s material links too, beside the production consumptions', () => {
    const dir = projet({
      ...TEMOIN,
      'packages/a/package.json': paquet('@e/a', true),
      'packages/a/test/a.spec.ts': 'export {};\n',
      'packages/a/test/fixture.ts': "export * from '@e/b/test-fixtures';\n",
      'packages/c/package.json': paquet('@e/c', false),
      'packages/c/src/index.ts': "import { a } from '@e/a';\nexport const c = a;\n",
    });
    const g = dependances(dir);
    expect(fournisseurs(g, 'a')).toEqual(['b']);
    expect(fournisseurs(g, 'c')).toEqual(['a']);
  });
  it('critère 1: a package name without scope links as a scoped one does (b/test-fixtures)', () => {
    const dir = projet({
      ...TEMOIN,
      'packages/b/package.json': paquet('b', true),
      'packages/a/test/a.spec.ts': "import { exemple } from 'b/test-fixtures';\n",
    });
    expect(fournisseurs(dependances(dir), 'a')).toEqual(['b']);
  });
  it('critère 1: a package does not link to itself through its own material', () => {
    const dir = projet({
      ...TEMOIN,
      'packages/b/test/b.spec.ts': "import { exemple } from '@e/b/test-fixtures';\n",
    });
    expect(fournisseurs(dependances(dir), 'b')).toEqual([]);
  });
  it('critère 1: a package out of the frame enters the graph neither as provider nor as consumer', () => {
    const dir = projet({
      ...TEMOIN,
      'docs/agents/hors-cadre.txt': 'z vendored\n',
      'packages/z/package.json': paquet('@e/z', true),
      'packages/z/src/index.ts': 'export const z = 1;\n',
      'packages/z/test/fixture.ts': 'export const z = 1;\n',
      'packages/z/test/z.spec.ts': "import { exemple } from '@e/b/test-fixtures';\n",
      'packages/a/test/z.spec.ts': "import { z } from '@e/z/test-fixtures';\n",
    });
    const g = dependances(dir);
    expect(g.has('z')).toBe(false);
    expect(fournisseurs(g, 'a')).toEqual(['b']);
    expect([...g.values()].some(s => s.has('z'))).toBe(false);
  });
});

describe('critère 2 — the fingerprints, the scope and the order read this one function', () => {
  it('critère 2: traces.mjs and rejeu.mjs take the graph from dependances, no longer build it from utilise; constructions.mjs builds none', () => {
    const lu = (rel: string) =>
      imports(readFileSync(path.join(FRAME, rel), 'utf8'))
        .filter(i => i.spec === '../consommateurs.mjs')
        .flatMap(i => i.noms);
    for (const rel of ['scripts/integration/traces.mjs', 'scripts/integration/rejeu.mjs']) {
      expect(lu(rel), rel).toContain('dependances');
      expect(lu(rel), rel).not.toContain('utilise');
    }
    expect(lu('scripts/integration/constructions.mjs')).not.toContain('utilise');
  });
});

describe('critère 3 — the check of the interfaces does not change', () => {
  it('critère 3: a link of material is neither refused nor reported by the check of the interfaces', () => {
    const dir = projet({
      ...TEMOIN,
      'packages/a/package.json': paquet('@e/a', true),
      'packages/a/test/fixture.ts': "export * from '@e/b/test-fixtures';\n",
      'packages/b/docs/INTERFACE.md': '# b\n\nB.\n\n## Consommateurs\n',
    });
    expect(verifier(dir)).toEqual({ refus: [], signaux: [] });
  });
});

describe('critère 4 — the witness: the material of b changes', () => {
  it(
    'critère 4: the scope of the suites gives a and b',
    () => {
      // The trial project's src/a and src/b go: a component is named by its directory name.
      const ch = chantier(ESSAIS);
      ch.poser({ 'src/a/index.ts': null, 'src/b/index.ts': null, ...TEMOIN });
      ch.ticket('demo-1', { 'packages/b/test/fixture.ts': 'export const exemple = 2;\n' });
      const r = ch.integrer('demo-1');
      expect(r.stdout + r.stderr).toMatch(/suites de : packages\/a, packages\/b/);
    },
    LONG
  );
  it('critère 4: the stored build of a is no longer valid (its fingerprint changes)', () => {
    const dir = projet(TEMOIN);
    const avant = ouvrirTraces(dir).empreinteConstruction('packages/a');
    ecrire(dir, { 'packages/b/test/fixture.ts': 'export const exemple = 2;\n' });
    expect(ouvrirTraces(dir).empreinteConstruction('packages/a')).not.toBe(avant);
  });
  it(
    'critère 4: b is built before a',
    () => {
      const build =
        "import fs from 'node:fs';\nimport path from 'node:path';\nfs.appendFileSync(process.env.PRINCIPAL + '.builds', path.basename(process.cwd()) + '\\n');\n";
      const d = depot(ESSAIS, {
        ...TEMOIN,
        'package.json': '{"name":"essai","private":true}',
        '.gitignore': 'node_modules\ndist\n.claude/worktrees/\n',
        'packages/a/package.json': paquet('@e/a', false, true),
        'packages/a/build.mjs': build,
        'packages/b/package.json': paquet('@e/b', true, true),
        'packages/b/build.mjs': build,
      });
      const r = d.passage();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(d.builds()).toEqual(['b', 'a']);
    },
    LONG
  );
});

describe('critère 5 — a cycle of links of material ends', () => {
  const CYCLE = {
    ...TEMOIN,
    'packages/a/package.json': paquet('@e/a', true),
    'packages/a/test/fixture.ts': 'export const autre = 1;\n',
    'packages/b/test/b.spec.ts': "import { autre } from '@e/a/test-fixtures';\n",
  };
  it('critère 5: in the fingerprints, each side of the cycle follows the material of the other', () => {
    const dir = projet(CYCLE);
    const avant = ouvrirTraces(dir);
    const a = avant.empreinteConstruction('packages/a');
    const b = avant.empreinteConstruction('packages/b');
    ecrire(dir, { 'packages/b/test/fixture.ts': 'export const exemple = 2;\n' });
    expect(ouvrirTraces(dir).empreinteConstruction('packages/a')).not.toBe(a);
    ecrire(dir, { 'packages/a/test/fixture.ts': 'export const autre = 2;\n' });
    expect(ouvrirTraces(dir).empreinteConstruction('packages/b')).not.toBe(b);
  });
  it(
    'critère 5: in the order of the builds, each is built once and the passage ends green',
    () => {
      const build =
        "import fs from 'node:fs';\nimport path from 'node:path';\nfs.appendFileSync(process.env.PRINCIPAL + '.builds', path.basename(process.cwd()) + '\\n');\n";
      const d = depot(ESSAIS, {
        ...CYCLE,
        'package.json': '{"name":"essai","private":true}',
        '.gitignore': 'node_modules\ndist\n.claude/worktrees/\n',
        'packages/a/package.json': paquet('@e/a', true, true),
        'packages/a/build.mjs': build,
        'packages/b/package.json': paquet('@e/b', true, true),
        'packages/b/build.mjs': build,
      });
      const r = d.passage();
      expect(r.status, r.stdout + r.stderr).toBe(0);
      expect(d.builds().sort()).toEqual(['a', 'b']);
    },
    LONG
  );
});

describe('critère 6 — a test importing the production code of a neighbour stays out of the graph', () => {
  it('critère 6: a test file and a test helper importing b’s production code create no dependency of a on b', () => {
    const dir = projet({
      ...TEMOIN,
      'packages/a/test/a.spec.ts': "import { b } from '@e/b';\n",
      'packages/a/test/aide.ts': "import { b } from '@e/b/src/index';\n",
    });
    const g = dependances(dir);
    expect(g).toBeInstanceOf(Map);
    expect(fournisseurs(g, 'a')).toEqual([]);
  });
});

describe('critère 9 — a relative import towards a neighbour creates no link of material', () => {
  it('critère 9: a test of a and the material of a importing b by a relative path, its material or its code, link a to nothing', () => {
    const dir = projet({
      ...TEMOIN,
      'packages/a/package.json': paquet('@e/a', true),
      'packages/a/test/a.spec.ts': "import { exemple } from '../../b/test/fixture';\n",
      'packages/a/test/fixture.ts': "export { b } from '../../b/src/index';\n",
    });
    const g = dependances(dir);
    expect(g).toBeInstanceOf(Map);
    expect(fournisseurs(g, 'a')).toEqual([]);
  });
});

describe('critère 10 — a sub-path of the material creates no link', () => {
  it('critère 10: a test of a importing <package>/test-fixtures/<x> links a to nothing', () => {
    const dir = projet({
      ...TEMOIN,
      'packages/a/test/a.spec.ts': "import { exemple } from '@e/b/test-fixtures/exemple';\n",
    });
    const g = dependances(dir);
    expect(g).toBeInstanceOf(Map);
    expect(fournisseurs(g, 'a')).toEqual([]);
  });
});

describe('critère 11 — a dynamic import or a require links as a static import does', () => {
  it('critère 11: import(<package>/test-fixtures) in a test of a and require(<package>/test-fixtures) in a test of c link each to b', () => {
    const dir = projet({
      ...TEMOIN,
      'packages/a/test/a.spec.ts': "const m = await import('@e/b/test-fixtures');\nexport { m };\n",
      'packages/c/package.json': paquet('@e/c', false),
      'packages/c/src/index.ts': 'export const c = 1;\n',
      'packages/c/test/c.spec.cjs': "const { exemple } = require('@e/b/test-fixtures');\n",
    });
    const g = dependances(dir);
    expect(fournisseurs(g, 'a')).toEqual(['b']);
    expect(fournisseurs(g, 'c')).toEqual(['b']);
  });
});

describe('critère 12 — a package that publishes no material is not linked', () => {
  it('critère 12: a test of a importing <package>/test-fixtures of a b whose exports lack ./test-fixtures links a to nothing', () => {
    const dir = projet({ ...TEMOIN, 'packages/b/package.json': paquet('@e/b', false) });
    const g = dependances(dir);
    expect(g).toBeInstanceOf(Map);
    expect(fournisseurs(g, 'a')).toEqual([]);
  });
});

describe('critère 13 — a component without package.json links to the material it imports', () => {
  it('critère 13: a test of src/x, beside its code or under its test/, importing <package>/test-fixtures links x to that package', () => {
    const dir = projet({
      ...TEMOIN,
      'src/x/index.ts': 'export const x = 1;\n',
      'src/x/x.spec.ts': "import { exemple } from '@e/b/test-fixtures';\n",
      'src/y/index.ts': 'export const y = 1;\n',
      'src/y/test/y.spec.ts': "import { exemple } from '@e/b/test-fixtures';\n",
    });
    const g = dependances(dir);
    expect(fournisseurs(g, 'x')).toEqual(['b']);
    expect(fournisseurs(g, 'y')).toEqual(['b']);
  });
});

describe('critère 14 — an import of type alone links as any import does', () => {
  it('critère 14: import type from <package>/test-fixtures in a test of a, and export type from it in the material of c, link each to b', () => {
    const dir = projet({
      ...TEMOIN,
      'packages/a/test/a.spec.ts': "import type { Exemple } from '@e/b/test-fixtures';\n",
      'packages/c/package.json': paquet('@e/c', true),
      'packages/c/src/index.ts': 'export const c = 1;\n',
      'packages/c/test/fixture.ts': "export type { Exemple } from '@e/b/test-fixtures';\n",
    });
    const g = dependances(dir);
    expect(fournisseurs(g, 'a')).toEqual(['b']);
    expect(fournisseurs(g, 'c')).toEqual(['b']);
  });
});
