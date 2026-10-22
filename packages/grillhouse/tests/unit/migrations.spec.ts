import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS, migrationsAJouer, migrer } from '../../scripts/migrations.mjs';

// grillhouse-3uv.84.4 critère 3: a migration is a versioned module of the package
// (scripts/migrations/<version>-<nom>.mjs, as the transforms of @turbo/codemod), replayable without
// effect, with its test (tests/unit/migration.<nom>.spec.ts). Critère 2: the update plays, in the
// order of the versions, each migration newer than the version the project recorded.

const PAQUET = path.resolve(__dirname, '../..');
const DOSSIER = path.join(PAQUET, 'scripts/migrations');
const SEMVER = /^\d+\.\d+\.\d+$/;
const modules = () =>
  readdirSync(DOSSIER)
    .filter(f => f.endsWith('.mjs'))
    .sort();

type Migration = { version: string; nom: string; migrer: (projet: string) => string[] };
const fausse = (version: string, lignes: string[] = [version]): Migration => ({
  version,
  nom: `m${version}`,
  migrer: () => lignes,
});

describe('grillhouse-3uv.84.4 critère 3 — a migration is a versioned module of the package, with its test', () => {
  it('each module of scripts/migrations/ is named <version>-<nom>.mjs and exports its version, its name and migrer', async () => {
    expect(modules().length).toBeGreaterThan(0);
    for (const f of modules()) {
      const m = (await import(path.join(DOSSIER, f))) as Migration;
      expect(m.version, f).toMatch(SEMVER);
      expect(f.startsWith(`${m.version}-`), f).toBe(true);
      expect(m.nom, f).toBeTypeOf('string');
      expect(m.migrer, f).toBeTypeOf('function');
    }
  });

  it('MIGRATIONS lists every module, once', async () => {
    const tous = await Promise.all(modules().map(f => import(path.join(DOSSIER, f))));
    expect(MIGRATIONS).toHaveLength(tous.length);
    for (const m of tous) {
      expect(MIGRATIONS).toContain(m);
    }
  });

  it('each migration has its test file, tests/unit/migration.<nom>.spec.ts', () => {
    for (const f of modules()) {
      const nom = f.replace(/^\d+\.\d+\.\d+-/, '').replace(/\.mjs$/, '');
      expect(existsSync(path.join(PAQUET, 'tests/unit', `migration.${nom}.spec.ts`)), f).toBe(true);
    }
  });

  it('the package is published with its migrations', () => {
    const p = JSON.parse(readFileSync(path.join(PAQUET, 'package.json'), 'utf8')) as {
      files: string[];
    };
    expect(p.files).toContain('scripts');
  });
});

describe('grillhouse-3uv.84.4 critère 2 — the migrations newer than the project’s version, in the order of the versions', () => {
  const liste = [fausse('0.25.0'), fausse('0.23.0'), fausse('0.24.1'), fausse('0.23.0', ['bis'])];

  it('a project that recorded 0.23.0 plays those after it, in the order of their versions', () => {
    expect(migrationsAJouer('0.23.0', liste).map(m => m.version)).toEqual(['0.24.1', '0.25.0']);
  });

  it('a project that recorded no version plays them all; two of one version keep their order', () => {
    expect(migrationsAJouer(null, liste).map(m => m.nom)).toEqual([
      'm0.23.0',
      'm0.23.0',
      'm0.24.1',
      'm0.25.0',
    ]);
    expect(migrationsAJouer(null, liste)[0]).toBe(liste[1]);
  });

  it('a project at the newest version plays none', () => {
    expect(migrationsAJouer('0.25.0', liste)).toEqual([]);
  });

  it('migrer reports each migration that changed something, with its lines; one without lines is silent', () => {
    const r = migrer('/inexistant', '0.24.0', [fausse('0.25.0'), fausse('0.26.0', [])]);
    expect(r).toEqual([{ version: '0.25.0', nom: 'm0.25.0', lignes: ['0.25.0'] }]);
  });
});
