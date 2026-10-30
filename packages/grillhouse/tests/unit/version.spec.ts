// The version of Grillhouse: one version, the `version` of the package's
// `packages/grillhouse/package.json`, which npm publishes with the frame's plugin it carries
// (grillhouse-3uv.84.7: the plugin takes it when the package is packed), and `CHANGELOG.md` dates
// its section. A release (scripts/sortie.mjs, Grillhouse's own) raises it, dates the changelog, and later tags
// the release commit, locally: it pushes nothing. The push of the tag publishes the package on the
// npm registry, after the green CI of its commit (.github/workflows/release.yml). The command run
// in a git repository is the night's (packages/grillhouse-essais/tests/version.nuit.spec.ts).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { etiqueter, preparerSortie, verifierEtiquette } from '../../scripts/sortie.mjs';

const DEPOT = path.resolve(__dirname, '../../../..');
const PAQUET = 'packages/grillhouse/package.json';
const SCRIPT = path.join(DEPOT, 'packages/grillhouse/scripts/sortie.mjs');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'version-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const lire = (racine: string, f: string) => readFileSync(path.join(racine, f), 'utf8');
const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const versionDe = (racine: string, f: string) =>
  (JSON.parse(lire(racine, f)) as { version: string }).version;

const CHANGELOG = `# Changelog

Intro.

## [Unreleased]

### Added

- **Something new**.

## [0.16.0] - 2026-10-18

### Added

- **The first one**.
`;

// A trial Grillhouse at <version>, with a changelog and the package's package.json.
function grillhouse(version = '0.16.0', changelog = CHANGELOG) {
  const r = mkdtempSync(path.join(ESSAIS, 'grillhouse-'));
  ecrire(
    r,
    PAQUET,
    `${JSON.stringify({ name: '@roomi-fields/grillhouse', version, bin: { grillhouse: 'b.mjs' } }, null, 2)}\n`
  );
  ecrire(r, 'CHANGELOG.md', changelog);
  return r;
}

describe('the version of Grillhouse', () => {
  it('is the semantic version of the package @roomi-fields/grillhouse', () => {
    const p = JSON.parse(lire(DEPOT, PAQUET)) as { name: string; version: string };
    expect(p.name).toBe('@roomi-fields/grillhouse');
    expect(p.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
  it('lives in no other file: .claude/grillhouse/VERSION is gone', () => {
    expect(existsSync(path.join(DEPOT, '.claude/grillhouse/VERSION'))).toBe(false);
  });
  it('has its section in CHANGELOG.md, dated, under an open « [Unreleased] »', () => {
    const v = versionDe(DEPOT, PAQUET);
    const texte = lire(DEPOT, 'CHANGELOG.md');
    const section = texte.indexOf(`\n## [${v}] - `);
    expect(section).toBeGreaterThan(0);
    expect(texte.slice(section)).toMatch(/^\n## \[[^\]]+\] - \d{4}-\d{2}-\d{2}\n/);
    expect(texte.indexOf('\n## [Unreleased]\n')).toBeGreaterThan(0);
    expect(texte.indexOf('\n## [Unreleased]\n')).toBeLessThan(section);
  });
  it('is never written in the package.json of the template, whose version is a new project’s', () => {
    const pkg = JSON.parse(lire(DEPOT, 'templates/projet/package.json')) as { version: string };
    expect(pkg.version).toBe('1.0.0');
  });
  it('the release script goes to no project: grillhouse init installs the template of a project, which holds no script of the frame', () => {
    expect(existsSync(path.join(DEPOT, 'templates/projet/packages'))).toBe(false);
    expect(existsSync(path.join(DEPOT, 'templates/projet/scripts'))).toBe(false);
  });
});

describe('a release of Grillhouse prepares its files (scripts/sortie.mjs)', () => {
  it('raises the package.json of the package, its other fields kept', () => {
    const r = grillhouse();
    preparerSortie(r, '0.17.0', '2026-11-02');
    expect(JSON.parse(lire(r, PAQUET))).toEqual({
      name: '@roomi-fields/grillhouse',
      version: '0.17.0',
      bin: { grillhouse: 'b.mjs' },
    });
    expect(existsSync(path.join(r, '.claude/grillhouse/VERSION'))).toBe(false);
  });
  it('dates the « [Unreleased] » section and opens an empty one above it', () => {
    const r = grillhouse();
    preparerSortie(r, '0.16.1', '2026-11-02');
    expect(lire(r, 'CHANGELOG.md')).toBe(
      CHANGELOG.replace('## [Unreleased]\n', '## [Unreleased]\n\n## [0.16.1] - 2026-11-02\n')
    );
  });
  it('refuses a version that is not above the current one, and changes nothing', () => {
    for (const v of ['0.16.0', '0.15.9', '0.16', 'v0.17.0', '0.17.0-rc.1']) {
      const r = grillhouse();
      expect(() => preparerSortie(r, v, '2026-11-02')).toThrow();
      expect(versionDe(r, PAQUET)).toBe('0.16.0');
      expect(lire(r, 'CHANGELOG.md')).toBe(CHANGELOG);
    }
  });
  it('refuses a release whose « [Unreleased] » section holds nothing', () => {
    const r = grillhouse('0.16.0', '# Changelog\n\n## [Unreleased]\n\n## [0.16.0] - 2026-10-18\n');
    expect(() => preparerSortie(r, '0.16.1', '2026-11-02')).toThrow(/Unreleased/);
    expect(versionDe(r, PAQUET)).toBe('0.16.0');
  });
});

// The tagging by its interface, the git it runs passed in: a stand-in that records each call and
// answers `status --porcelain` and `tag --list` as git does. The command run in a git repository,
// prepared then tagged, is the night's (packages/grillhouse-essais/tests/version.nuit.spec.ts).
describe('a release of Grillhouse tags its commit locally, never pushing', () => {
  // A git whose working tree holds <changements> and whose tags are <etiquettes>.
  function faux(changements = '', etiquettes: string[] = []) {
    const appels: string[][] = [];
    const git = (...args: string[]) => {
      appels.push(args);
      if (args[0] === 'status') {
        return changements;
      }
      if (args[0] === 'tag' && args[1] === '--list') {
        return etiquettes.includes(args[2] ?? '') ? `${args[2]}\n` : '';
      }
      return '';
    };
    return { git, appels };
  }

  it('creates the annotated tag v<version> on HEAD, and pushes nothing', () => {
    const { git, appels } = faux();
    expect(etiqueter(grillhouse(), git)).toBe('v0.16.0');
    expect(appels).toContainEqual(['tag', '-a', 'v0.16.0', '-m', "Roomi's Grillhouse 0.16.0"]);
    expect(appels.filter(a => a[0] === 'tag' && a[1] !== '--list')).toHaveLength(1);
    expect(appels.filter(a => a.includes('push'))).toEqual([]);
  });
  it('refuses a tag that exists, and a working tree with changes', () => {
    const existe = faux('', ['v0.16.0']);
    expect(() => etiqueter(grillhouse(), existe.git)).toThrow(/v0\.16\.0/);
    const change = faux(' M CHANGELOG.md\n');
    expect(() => etiqueter(grillhouse(), change.git)).toThrow();
    for (const { appels } of [existe, change]) {
      expect(appels.filter(a => a[0] === 'tag' && a[1] === '-a')).toEqual([]);
    }
  });
});

describe('the tag of a release names the version it publishes (sortie --verifier-etiquette)', () => {
  it('accepts v<version> of the package', () => {
    expect(() => verifierEtiquette(grillhouse(), 'v0.16.0')).not.toThrow();
  });
  it('refuses a tag of another version', () => {
    expect(() => verifierEtiquette(grillhouse(), 'v0.16.1')).toThrow(/0\.16\.0/);
    expect(() => verifierEtiquette(grillhouse(), '0.16.0')).toThrow();
  });
  it('the command exits 0 on the right tag, 1 on another', () => {
    const r = grillhouse();
    const ok = spawnSync('node', [SCRIPT, '--verifier-etiquette', 'v0.16.0'], {
      cwd: r,
      encoding: 'utf8',
    });
    expect(ok.status, ok.stderr).toBe(0);
    const ko = spawnSync('node', [SCRIPT, '--verifier-etiquette', 'v0.17.0'], {
      cwd: r,
      encoding: 'utf8',
    });
    expect(ko.status).toBe(1);
  });
});

// The publication: the push of a tag v<x> publishes the package on the npm registry, with the
// trusted publishing (OIDC, no token stored), once the CI of its commit is green; as Changesets and the tools'
// repositories, the publishing job of the workflow waits for the CI's jobs, played on the tagged
// commit (a reusable workflow).
interface Etape {
  name?: string;
  run?: string;
  uses?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
}
interface Travail {
  uses?: string;
  needs?: string | string[];
  steps?: Etape[];
}
interface Flux {
  on: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs: Record<string, Travail>;
}
const flux = (f: string) => parse(lire(DEPOT, `.github/workflows/${f}`)) as Flux;

describe('the push of a tag v<x> publishes the package on npm, after the green CI of its commit', () => {
  const sortie = flux('release.yml');
  const travaux = Object.entries(sortie.jobs);
  const publie = (t: Travail) => (t.steps ?? []).some(e => /\bnpm publish\b/.test(e.run ?? ''));
  const [nomPublication, publication] = travaux.find(([, t]) => publie(t)) ?? [];

  it('runs on the push of a tag v<x.y.z>', () => {
    expect(sortie.on.push).toEqual({ tags: ['v*.*.*'] });
  });
  it('plays the CI as a job of its own, on the tagged commit, and the CI accepts that call', () => {
    expect(flux('ci.yml').on).toHaveProperty('workflow_call');
    expect(travaux.filter(([, t]) => t.uses === './.github/workflows/ci.yml')).toHaveLength(1);
  });
  it('publishes in a job that waits for the CI', () => {
    expect(nomPublication).toBeDefined();
    const [nomCi] = travaux.find(([, t]) => t.uses === './.github/workflows/ci.yml') ?? [];
    expect([publication?.needs].flat()).toContain(nomCi);
  });
  it('publishes the package @roomi-fields/grillhouse by trusted publishing, without a token', () => {
    const etape = (publication?.steps ?? []).find(e => /\bnpm publish\b/.test(e.run ?? ''));
    expect(etape?.run).toMatch(/--workspace[ =]@roomi-fields\/grillhouse\b/);
    expect(etape?.env?.NODE_AUTH_TOKEN).toBeUndefined();
    expect(sortie.permissions?.['id-token']).toBe('write');
    const node = (publication?.steps ?? []).find(e => e.uses?.startsWith('actions/setup-node'));
    expect(node?.with?.['registry-url']).toBe('https://registry.npmjs.org');
    expect(Number(String(node?.with?.['node-version']).split('.')[0])).toBeGreaterThanOrEqual(24);
  });
  it('checks, before publishing, that the tag names the version of the package', () => {
    const etapes = publication?.steps ?? [];
    const verif = etapes.findIndex(e =>
      /grillhouse sortie --verifier-etiquette|sortie\.mjs --verifier-etiquette/.test(e.run ?? '')
    );
    const pub = etapes.findIndex(e => /\bnpm publish\b/.test(e.run ?? ''));
    expect(verif).toBeGreaterThanOrEqual(0);
    expect(verif).toBeLessThan(pub);
  });
});

describe('the package is publishable', () => {
  const p = JSON.parse(lire(DEPOT, PAQUET)) as {
    private?: boolean;
    publishConfig?: { access?: string };
    files?: string[];
  };
  it('is not private, and publishes public under its scope', () => {
    expect(p.private).toBeUndefined();
    expect(p.publishConfig?.access).toBe('public');
  });
  it('packs its command and its scripts, without its tests (npm pack --dry-run)', () => {
    const r = spawnSync(
      'npm',
      [
        'pack',
        '--dry-run',
        '--json',
        '--ignore-scripts',
        '--workspace',
        '@roomi-fields/grillhouse',
      ],
      { cwd: DEPOT, encoding: 'utf8' }
    );
    expect(r.status, r.stderr).toBe(0);
    const [paquet] = JSON.parse(r.stdout) as { name: string; files: { path: string }[] }[];
    expect(paquet.name).toBe('@roomi-fields/grillhouse');
    const chemins = paquet.files.map(f => f.path);
    expect(chemins).toContain('bin/grillhouse.mjs');
    expect(chemins).toContain('scripts/circuit.mjs');
    expect(chemins).toContain('package.json');
    expect(chemins.filter(c => c.startsWith('tests/'))).toEqual([]);
  });
});
