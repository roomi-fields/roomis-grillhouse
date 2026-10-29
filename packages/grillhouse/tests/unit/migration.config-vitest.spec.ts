import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { migrer, version } from '../../scripts/migrations/0.23.0-config-vitest.mjs';

// grillhouse-3uv.84.4 critères 5 and 7: the frame's base configuration of Vitest is the
// package's, `@roomi-fields/grillhouse/vitest-config`; the migration brings a project that imported
// the former workspace package `@grillhouse/vitest-config` (BPScript) to it. Critère 3: replayable
// without effect.

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-config-vitest-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const VERSION = (
  JSON.parse(readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8')) as {
    version: string;
  }
).version;

const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;
const lire = (racine: string, f: string) => readFileSync(path.join(racine, f), 'utf8');
const lireJson = (racine: string, f: string) =>
  JSON.parse(lire(racine, f)) as Record<string, Record<string, string> & string[]>;
// Every file of <racine>, with its text.
const contenu = (racine: string): Record<string, string> => {
  const out: Record<string, string> = {};
  const parcourir = (rel: string) => {
    for (const e of readdirSync(path.join(racine, rel), { withFileTypes: true })) {
      const r = path.join(rel, e.name);
      if (e.isDirectory()) {
        parcourir(r);
      } else {
        out[r] = lire(racine, r);
      }
    }
  };
  parcourir('.');
  return out;
};

// A project of packages in the former form, as BPScript holds it: the configuration package a
// workspace, a package that declares and imports it, a test that imports its mark of time.
function ancien(racine: Record<string, unknown> = {}) {
  const p = mkdtempSync(path.join(ESSAIS, 'projet-'));
  ecrire(
    p,
    'package.json',
    json({
      name: 'r',
      private: true,
      workspaces: ['packages/*', 'scripts/vitest-config'],
      ...racine,
    })
  );
  ecrire(p, 'scripts/vitest-config/package.json', json({ name: '@grillhouse/vitest-config' }));
  ecrire(
    p,
    'packages/a/package.json',
    json({ name: 'a', devDependencies: { vitest: '^2.0.0', '@grillhouse/vitest-config': '*' } })
  );
  ecrire(
    p,
    'packages/a/vitest.config.ts',
    "import { mergeConfig } from 'vitest/config';\nimport base from '@grillhouse/vitest-config';\nexport default mergeConfig(base, {});\n"
  );
  ecrire(
    p,
    'packages/a/tests/temps.spec.ts',
    'import { mesurerAuRepos } from "@grillhouse/vitest-config/mesure";\n'
  );
  ecrire(p, 'node_modules/x/index.js', "require('@grillhouse/vitest-config');\n");
  return p;
}

describe('migration 0.23.0 — the base configuration of Vitest is the frame’s package’s', () => {
  it('is the migration of 0.23.0', () => {
    expect(version).toBe('0.23.0');
  });

  it('each import of the former package names the package’s, its quotes kept; node_modules untouched', () => {
    const p = ancien();
    migrer(p);
    expect(lire(p, 'packages/a/vitest.config.ts')).toContain(
      "import base from '@roomi-fields/grillhouse/vitest-config';"
    );
    expect(lire(p, 'packages/a/tests/temps.spec.ts')).toBe(
      'import { mesurerAuRepos } from "@roomi-fields/grillhouse/vitest-config/mesure";\n'
    );
    expect(lire(p, 'node_modules/x/index.js')).toContain("'@grillhouse/vitest-config'");
  });

  it('a package declares the frame’s package in place of the former one, at the root’s range', () => {
    const p = ancien({ devDependencies: { '@roomi-fields/grillhouse': '^0.23.0' } });
    migrer(p);
    expect(lireJson(p, 'packages/a/package.json').devDependencies).toEqual({
      '@roomi-fields/grillhouse': '^0.23.0',
      vitest: '^2.0.0',
    });
  });

  it('without a declaration at the root, the range is the package’s version', () => {
    const p = ancien();
    migrer(p);
    expect(lireJson(p, 'packages/a/package.json').devDependencies['@roomi-fields/grillhouse']).toBe(
      `^${VERSION}`
    );
  });

  it('the former directory leaves the workspaces, array or packages key', () => {
    const p = ancien();
    migrer(p);
    expect(lireJson(p, 'package.json').workspaces).toEqual(['packages/*']);
    const q = ancien({
      workspaces: {
        packages: ['packages/*', 'packages/grillhouse/scripts/vitest-config'],
      },
    });
    migrer(q);
    expect(lireJson(q, 'package.json').workspaces).toEqual({ packages: ['packages/*'] });
  });

  it('a root configuration that imported the base by its path imports it by its name', () => {
    for (const chemin of [
      './scripts/vitest-config/base.mjs',
      './packages/grillhouse/scripts/vitest-config/base.mjs',
    ]) {
      const p = mkdtempSync(path.join(ESSAIS, 'racine-'));
      ecrire(p, 'package.json', json({ name: 'r' }));
      ecrire(p, 'vitest.config.ts', `import base from '${chemin}';\n`);
      migrer(p);
      expect(lire(p, 'vitest.config.ts'), chemin).toBe(
        "import base from '@roomi-fields/grillhouse/vitest-config';\n"
      );
    }
  });

  it('reports what it changed, and a second pass changes no byte and reports nothing', () => {
    const p = ancien();
    expect(migrer(p).length).toBeGreaterThan(0);
    const premier = contenu(p);
    expect(migrer(p)).toEqual([]);
    expect(contenu(p)).toEqual(premier);
  });
});
