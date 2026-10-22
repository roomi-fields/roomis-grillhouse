// The frame's base configuration of Vitest carries its types: a strict TypeScript file of a package
// that imports `@roomi-fields/grillhouse/vitest-config/mesure` (a test marking a measure of time)
// or `@roomi-fields/grillhouse/vitest-config` (a Vitest configuration written in TypeScript)
// type-checks without error (no TS7016, « could not find a declaration file »). Witness: BPScript, a
// repository of packages, whose strict tests importing `mesurerAuRepos` failed `tsc --noEmit`.
//
// Each case builds a repository of packages in a fresh directory: the frame's package (its
// package.json and its base configuration) under `node_modules/@roomi-fields/grillhouse`, as npm
// installs it, a package `packages/a` that imports it, and the repository's TypeScript and Vitest;
// then `tsc --noEmit` on the package, under each module resolution of a project.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const DEPOT = path.resolve(__dirname, '../../../..');
const MODULES = path.join(DEPOT, 'node_modules');
const TSC = path.join(MODULES, 'typescript/bin/tsc');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'vitest-config-types-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const json = (o: object) => JSON.stringify(o, null, 2) + '\n';

const RESOLUTIONS = [
  { module: 'ESNext', moduleResolution: 'Bundler' },
  { module: 'Node16', moduleResolution: 'Node16' },
];

// `tsc --noEmit` on the package `packages/a` holding <fichiers>, strict, under <resolution>.
function verifier(fichiers: Record<string, string>, resolution: (typeof RESOLUTIONS)[number]) {
  const repo = mkdtempSync(path.join(ESSAIS, 'depot-'));
  const ecrire = (rel: string, texte: string) => {
    mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    writeFileSync(path.join(repo, rel), texte);
  };
  ecrire('package.json', json({ name: 'r', private: true, workspaces: ['packages/*'] }));
  const nm = path.join(repo, 'node_modules');
  const installe = path.join(nm, '@roomi-fields/grillhouse');
  cpSync(
    path.join(DEPOT, 'packages/grillhouse/scripts/vitest-config'),
    path.join(installe, 'scripts/vitest-config'),
    { recursive: true }
  );
  cpSync(path.join(DEPOT, 'packages/grillhouse/package.json'), path.join(installe, 'package.json'));
  for (const p of ['vitest', '@vitest', 'vite', '@types', 'typescript']) {
    symlinkSync(path.join(MODULES, p), path.join(nm, p));
  }
  ecrire(
    'packages/a/package.json',
    json({
      name: '@r/a',
      type: 'module',
      devDependencies: { '@roomi-fields/grillhouse': '*', vitest: '*' },
    })
  );
  ecrire(
    'packages/a/tsconfig.json',
    json({
      compilerOptions: {
        target: 'ES2022',
        lib: ['ES2022'],
        ...resolution,
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: ['node'],
      },
      include: ['**/*.ts'],
    })
  );
  for (const [rel, texte] of Object.entries(fichiers)) {
    ecrire(path.join('packages/a', rel), texte);
  }
  const r = spawnSync(process.execPath, [TSC, '--noEmit', '-p', 'packages/a/tsconfig.json'], {
    cwd: repo,
    encoding: 'utf8',
  });
  return { status: r.status, sortie: (r.stdout ?? '') + (r.stderr ?? '') };
}

const T = 60_000;

describe.each(RESOLUTIONS)(
  '@roomi-fields/grillhouse/vitest-config typed ($moduleResolution)',
  resolution => {
    it(
      'a strict test importing mesurerAuRepos type-checks, its return type kept',
      () => {
        const r = verifier(
          {
            'tests/a.test.ts': [
              "import { expect, it } from 'vitest';",
              "import { mesurerAuRepos } from '@roomi-fields/grillhouse/vitest-config/mesure';",
              "it('mesure', ctx => {",
              '  const n: number = mesurerAuRepos(ctx, () => 42);',
              "  const p: Promise<string> = mesurerAuRepos(ctx, async () => 'x');",
              '  expect(n).toBe(42);',
              '  return p;',
              '});',
              '',
            ].join('\n'),
          },
          resolution
        );
        expect(r.sortie).toBe('');
        expect(r.status).toBe(0);
      },
      T
    );

    it(
      'a wrong use of mesurerAuRepos is refused: the types are read, not any',
      () => {
        const r = verifier(
          {
            'tests/a.test.ts': [
              "import { it } from 'vitest';",
              "import { mesurerAuRepos } from '@roomi-fields/grillhouse/vitest-config/mesure';",
              "it('mesure', ctx => {",
              "  const n: number = mesurerAuRepos(ctx, () => 'x');",
              '  void n;',
              '});',
              '',
            ].join('\n'),
          },
          resolution
        );
        expect(r.status).not.toBe(0);
        expect(r.sortie).toMatch(/TS2322/);
        expect(r.sortie).not.toMatch(/TS7016/);
      },
      T
    );

    it(
      'a Vitest configuration in TypeScript extending the base type-checks',
      () => {
        const r = verifier(
          {
            'vitest.config.ts': [
              "import { defineConfig, mergeConfig } from 'vitest/config';",
              "import base from '@roomi-fields/grillhouse/vitest-config';",
              '',
              "export default mergeConfig(base, defineConfig({ test: { include: ['tests/**/*.test.ts'] } }));",
              '',
            ].join('\n'),
          },
          resolution
        );
        expect(r.sortie).toBe('');
        expect(r.status).toBe(0);
      },
      T
    );
  }
);
