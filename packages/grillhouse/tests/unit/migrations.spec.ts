import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { VERSION } from '../../scripts/cadre.mjs';
import { MIGRATIONS, migrationsAJouer, migrer, restesAuProjet } from '../../scripts/migrations.mjs';
import * as serveursDeLIndex from '../../scripts/migrations/serveurs-de-l-index.mjs';

// grillhouse-3uv.84.4 critère 3: a migration is a versioned module of the package
// (scripts/migrations/<nom>.mjs, the older ones <version>-<nom>.mjs, as the transforms of
// @turbo/codemod), replayable without effect, with its test (tests/unit/migration.<nom>.spec.ts);
// its version is the release's, none before it. Critère 2: the update plays, in the order of the
// versions, each migration newer than the version the project recorded.

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migrations-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const PAQUET = path.resolve(__dirname, '../..');
const DOSSIER = path.join(PAQUET, 'scripts/migrations');
const SEMVER = /^\d+\.\d+\.\d+$/;
const modules = () =>
  readdirSync(DOSSIER)
    .filter(f => f.endsWith('.mjs'))
    .sort();

type Migration = { version: string | null; nom: string; migrer: (projet: string) => string[] };
const fausse = (version: string, lignes: string[] = [version]) => ({
  version,
  nom: `m${version}`,
  migrer: () => lignes,
});

describe('grillhouse-3uv.84.4 critère 3 — a migration is a versioned module of the package, with its test', () => {
  it('each module of scripts/migrations/ is named <nom>.mjs, or <version>-<nom>.mjs, and exports its version, its name and migrer', async () => {
    expect(modules().length).toBeGreaterThan(0);
    for (const f of modules()) {
      const m = (await import(path.join(DOSSIER, f))) as Migration;
      expect(m.nom, f).toBeTypeOf('string');
      if (f !== `${m.nom.replaceAll(' ', '-')}.mjs`) {
        expect(f.startsWith(`${m.version}-`), f).toBe(true);
      }
      if (m.version !== null) {
        expect(m.version, f).toMatch(SEMVER);
      }
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

  it('no migration carries a version above the package’s: before its release it has none', async () => {
    const dossiers = [
      DOSSIER,
      ...readdirSync(path.join(PAQUET, 'scripts/langages'))
        .map(l => path.join(PAQUET, 'scripts/langages', l, 'migrations'))
        .filter(d => existsSync(d)),
    ];
    for (const f of dossiers.flatMap(d => readdirSync(d).map(n => path.join(d, n)))) {
      const { version } = (await import(f)) as Migration;
      const aVenir = version === null ? [] : migrationsAJouer(VERSION, [fausse(version)]);
      expect(aVenir, `${f} : ${version}`).toEqual([]);
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
    expect(r).toEqual([{ version: '0.25.0', nom: 'm0.25.0', lignes: ['0.25.0'], aFaire: [] }]);
  });
});

// grillhouse-3uv.84.6.1 critère 2: a migration that leaves something to the project (a copy it
// modified) returns it as `{ aFaire }`, apart from what it changed.
describe('grillhouse-3uv.84.6.1 critère 2 — what a migration leaves to the project is apart', () => {
  it('migrer splits the lines of what changed from what is left to do', () => {
    const m = { version: '0.25.0', nom: 'm', migrer: () => ['fait', { aFaire: 'à faire' }] };
    expect(migrer('/inexistant', '0.24.0', [m])).toEqual([
      { version: '0.25.0', nom: 'm', lignes: ['fait'], aFaire: ['à faire'] },
    ]);
  });

  it('a migration that only leaves something to do is reported', () => {
    const m = { version: '0.25.0', nom: 'm', migrer: () => [{ aFaire: 'à faire' }] };
    expect(migrer('/inexistant', '0.24.0', [m])).toEqual([
      { version: '0.25.0', nom: 'm', lignes: [], aFaire: ['à faire'] },
    ]);
  });
});

describe('a migration not released yet has no version', () => {
  const neuve = { version: null, nom: 'neuve', migrer: () => ['fait'], restes: () => ['reste'] };
  const liste = [neuve, fausse('0.25.0'), fausse('0.23.0')];
  const noms = (depuis: string | null) => migrationsAJouer(depuis, liste, '0.25.0').map(m => m.nom);

  it('comes after the others for a project that recorded no version or one below the package’s', () => {
    expect(noms(null)).toEqual(['m0.23.0', 'm0.25.0', 'neuve']);
    expect(noms('0.24.0')).toEqual(['m0.25.0', 'neuve']);
  });

  it('is not played again by a project that recorded the package’s version', () => {
    expect(noms('0.25.0')).toEqual([]);
  });

  it('a second update, from the version the first recorded, reports no migration nor anything left', () => {
    // A project without the plugin rtfm, to which the migration of the index leaves a line.
    const projet = mkdtempSync(path.join(ESSAIS, 'seconde-'));
    writeFileSync(
      path.join(projet, '.mcp.json'),
      JSON.stringify({ mcpServers: { rtfm: { command: 'rtfm-serve' } } })
    );
    expect(restesAuProjet(projet, null, [serveursDeLIndex])).toHaveLength(1);
    expect(restesAuProjet(projet, VERSION, MIGRATIONS)).toEqual([]);
    expect(migrer(projet, VERSION, MIGRATIONS)).toEqual([]);
  });
});
