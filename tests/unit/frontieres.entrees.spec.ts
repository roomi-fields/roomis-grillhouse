import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { EXPORTS, REGLE, erreurs, refus, paquet, frontieresEssai } from './frontieres-essai.js';

// The boundaries between components (scripts/frontieres.mjs, tests/unit/frontieres.spec.ts): the
// entries of a package and their sources, and the packages out of the frame (grillhouse-3uv.77).
// The repositories of trial: ./frontieres-essai.ts.

// The trial directories of this run live in one root, removed at its end (grillhouse-3uv.34).
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'frontieres-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { verdict, espace } = frontieresEssai(ESSAIS);

// grillhouse-3uv.77, critères 9 to 17: what an export publishes (both targets of types and
// default), what stays judged without an export (src, a repository without packages), and the
// entries that point to built files and come back to their sources by the TypeScript configuration
// that builds them.
//
// The BPScript witness of critère 14, packages/040-checker: every export points to dist/; the
// sources are built by tsconfig.build.json (src/) and tsconfig.fixtures.json (test/banc.ts), whose
// emit options come from a configuration at the root of the repository (`${configDir}`).
const CONSTRUCTION = `{
  // The emit options of every package, relative to the configuration of the package.
  "compilerOptions": {
    "noEmit": false,
    "declaration": true,
    "rewriteRelativeImportExtensions": true,
    "rootDir": "\${configDir}",
    "outDir": "\${configDir}/dist",
    "incremental": true,
    "tsBuildInfoFile": "\${configDir}/dist/.tsbuildinfo"
  }
}
`;
// The configurations of a BPScript package: tsconfig.json, tsconfig.build.json (src/) and
// tsconfig.fixtures.json, which builds the given bench into dist/test/.
const configurations = (banc: string) => ({
  'tsconfig.construction.json': CONSTRUCTION,
  'packages/p/tsconfig.json': `{
  // The sources and the benches typed, nothing emitted.
  "compilerOptions": {
    "noEmit": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "strict": true
  }
}
`,
  'packages/p/tsconfig.build.json': `{
  // src/ built into dist/src/, with the options of the root.
  "extends": ["./tsconfig.json", "../../tsconfig.construction.json"],
  "include": ["src"]
}
`,
  'packages/p/tsconfig.fixtures.json': `{
  // ${banc} built into dist/test/.
  "extends": "./tsconfig.build.json",
  "compilerOptions": {
    "types": ["node"],
    "tsBuildInfoFile": "\${configDir}/dist/.tsbuildinfo-test-fixtures"
  },
  "include": [],
  "files": ["${banc}"]
}
`,
});
const CHECKER = {
  ...configurations('test/banc.ts'),
  'packages/p/package.json': JSON.stringify({
    name: 'p',
    exports: {
      '.': { types: './dist/src/index.d.ts', default: './dist/src/index.js' },
      './test-fixtures': { types: './dist/test/banc.d.ts', default: './dist/test/banc.js' },
    },
    dependencies: { dotenv: '*' },
    devDependencies: { vitest: '*', b: '*' },
  }),
  'packages/p/src/index.ts': 'export const a = 1;',
};
// The BPScript witness of critère 14, packages/990-corpus: no src/, a single export,
// ./test-fixtures, built from test/fixtures.ts into dist/test/.
const CORPUS = {
  ...configurations('test/fixtures.ts'),
  'packages/p/package.json': JSON.stringify({
    name: 'p',
    exports: {
      './test-fixtures': {
        types: './dist/test/fixtures.d.ts',
        default: './dist/test/fixtures.js',
      },
    },
    dependencies: { dotenv: '*' },
    devDependencies: { vitest: '*', b: '*' },
  }),
};

describe('grillhouse-3uv.77 — critères 9 to 17: the entries of a package and their sources', () => {
  it('critère 9: both targets of an export { types, default } are published: each one importing a development dependency is refused', () => {
    const r = espace({
      'packages/p/package.json': paquet({
        '.': { types: './lib/types.ts', default: './lib/index.ts' },
      }),
      'packages/p/lib/types.ts': "import type { Mock } from 'vitest';\nexport type M = Mock;",
      'packages/p/lib/index.ts': "export { expect } from 'vitest';",
    });
    expect(r.status, r.sortie).not.toBe(0);
    expect(r.sortie).toMatch(refus('packages/p/lib/types.ts', 'vitest'));
    expect(r.sortie).toMatch(refus('packages/p/lib/index.ts', 'vitest'));
    expect(erreurs(r.sortie)).toEqual([REGLE]);
  });
  it('critère 10: a file of src, out of the test files, that no export reaches stays under the rule', () => {
    const r = espace({
      'packages/p/package.json': paquet({ '.': './lib/index.ts' }),
      'packages/p/lib/index.ts': 'export const a = 1;',
      'packages/p/src/seul.ts': "export { expect } from 'vitest';",
    });
    expect(r.status, r.sortie).not.toBe(0);
    expect(r.sortie).toMatch(refus('packages/p/src/seul.ts', 'vitest'));
  });
  it('critère 11: an import of types only from a development dependency, from src, is refused in a repository without packages', () => {
    const r = verdict({
      'package.json': '{"name":"r","devDependencies":{"vitest":"*"}}',
      'src/index.ts': "import type { Mock } from 'vitest';\nexport type M = Mock;",
    });
    expect(r.status, r.sortie).not.toBe(0);
    expect(r.sortie).toMatch(refus('src/index.ts', 'vitest'));
  });
  it('critère 12: a file neither published, nor under src, nor a test may import a development dependency', () => {
    const r = espace({
      'packages/p/package.json': paquet(EXPORTS),
      'packages/p/src/index.ts': 'export const a = 1;',
      'packages/p/test-fixtures/index.ts': 'export const f = 1;',
      'packages/p/scripts/build.ts':
        "import { expect } from 'vitest';\nimport type { B } from 'b';\nexport type X = B;\nexport const e = expect;",
    });
    expect(r.sortie).not.toMatch(new RegExp(REGLE));
    expect(r.status, r.sortie).toBe(0);
  });
  it('critère 14: the BPScript case 040-checker — test/banc.ts, built by tsconfig.fixtures.json into the exported dist/test/banc.js, importing a development dependency is refused', () => {
    const r = espace({
      ...CHECKER,
      'packages/p/test/banc.ts': "import type { B } from 'b';\nexport type X = B;",
    });
    expect(r.status, r.sortie).not.toBe(0);
    expect(r.sortie).toMatch(refus('packages/p/test/banc.ts', 'b'));
    expect(erreurs(r.sortie)).toEqual([REGLE]);
  });
  it('critère 14: the BPScript case 040-checker with clean sources passes, its built entries coming back to their sources', () => {
    const r = espace({
      ...CHECKER,
      'packages/p/test/banc.ts':
        "import type { DotenvConfigOptions } from 'dotenv';\nexport type O = DotenvConfigOptions;",
    });
    expect(r.status, r.sortie).toBe(0);
  });
  it('critère 14: the BPScript case 990-corpus — no src, a single export ./test-fixtures into dist, test/fixtures.ts importing the types of a sibling declared in devDependencies is refused', () => {
    const r = espace({
      ...CORPUS,
      'packages/p/test/fixtures.ts': "import type { B } from 'b';\nexport type X = B;",
    });
    expect(r.status, r.sortie).not.toBe(0);
    expect(r.sortie).toMatch(refus('packages/p/test/fixtures.ts', 'b'));
    expect(erreurs(r.sortie)).toEqual([REGLE]);
  });
  it('critère 17: a built entry that no TypeScript configuration brings back to a source is refused, the check naming the entry', () => {
    const r = espace({
      'packages/p/package.json': paquet({ '.': './dist/index.js' }),
      'packages/p/lib/index.ts': 'export const a = 1;',
    });
    expect(r.status, r.sortie).not.toBe(0);
    expect(r.sortie).toMatch(/packages\/p\/dist\/index\.js|dist\/index\.js/);
  });
});

// grillhouse-3uv.77, critère 23: the packages out of the frame.
describe('grillhouse-3uv.77 — critère 23: the packages out of the frame', () => {
  it('critère 23: a package out of the frame stays excluded, its exports included, while a package in the frame is judged', () => {
    const r = espace({
      'docs/agents/hors-cadre.txt': 'p\n',
      'packages/p/package.json': paquet({ '.': './lib/index.ts' }),
      'packages/p/lib/index.ts': "export { expect } from 'vitest';",
      'packages/q/package.json': JSON.stringify({
        name: 'q',
        exports: { '.': './lib/index.ts' },
        devDependencies: { vitest: '*' },
      }),
      'packages/q/lib/index.ts': "export { expect } from 'vitest';",
    });
    expect(r.status, r.sortie).not.toBe(0);
    expect(r.sortie).toMatch(refus('packages/q/lib/index.ts', 'vitest'));
    expect(r.sortie).not.toMatch(/packages\/p\//);
  });
});
