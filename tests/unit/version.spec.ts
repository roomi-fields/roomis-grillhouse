// The version of Grillhouse: one version for the frame and its mod, written in
// `.claude/grillhouse/VERSION`, which every project receives with the frame's update; the mod's
// `plugin.json` carries the same, and `CHANGELOG.md` dates its section. A release
// (scripts/sortie.mjs, Grillhouse's own) raises the version, dates the changelog, and later tags
// the release commit, locally: it pushes nothing.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { lireListe } from '../../scripts/grillhouse-maj.mjs';
import { etiqueter, preparerSortie } from '../../scripts/sortie.mjs';
import { configGit } from '../config-git.js';

const DEPOT = path.resolve(__dirname, '../..');
const VERSION = '.claude/grillhouse/VERSION';
const PLUGIN = 'mods/grillhouse/.claude-plugin/plugin.json';
const SCRIPT = path.join(DEPOT, 'scripts/sortie.mjs');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'version-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const lire = (racine: string, f: string) => readFileSync(path.join(racine, f), 'utf8');
const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const versionDuGreffon = (racine: string) =>
  (JSON.parse(lire(racine, PLUGIN)) as { version: string }).version;
const ENV_GIT = {
  ...process.env,
  ...configGit([
    ['user.name', 'Essai'],
    ['user.email', 'essai@example.invalid'],
  ]),
};
const git = (racine: string, ...args: string[]) =>
  execFileSync('git', ['-C', racine, ...args], { encoding: 'utf8', env: ENV_GIT }).trim();

const CHANGELOG = `# Changelog

Intro.

## [Unreleased]

### Added

- **Something new**.

## [0.16.0] - 2026-10-18

### Added

- **The first one**.
`;

// A trial Grillhouse at <version>, with a changelog and the mod's plugin.json.
function grillhouse(version = '0.16.0', changelog = CHANGELOG) {
  const r = mkdtempSync(path.join(ESSAIS, 'grillhouse-'));
  ecrire(r, VERSION, `${version}\n`);
  ecrire(
    r,
    PLUGIN,
    `${JSON.stringify({ name: 'grillhouse', version, author: { name: 'A' } }, null, 2)}\n`
  );
  ecrire(r, 'CHANGELOG.md', changelog);
  return r;
}

describe('the version of Grillhouse', () => {
  it('is one line of semantic versioning in .claude/grillhouse/VERSION', () => {
    expect(lire(DEPOT, VERSION)).toMatch(/^\d+\.\d+\.\d+\n$/);
  });
  it('is the version of the mod: plugin.json holds the same, no gap admitted', () => {
    expect(versionDuGreffon(DEPOT)).toBe(lire(DEPOT, VERSION).trim());
  });
  it('has its section in CHANGELOG.md, dated, under an open « [Unreleased] »', () => {
    const v = lire(DEPOT, VERSION).trim();
    const texte = lire(DEPOT, 'CHANGELOG.md');
    const section = texte.indexOf(`\n## [${v}] - `);
    expect(section).toBeGreaterThan(0);
    expect(texte.slice(section)).toMatch(/^\n## \[[^\]]+\] - \d{4}-\d{2}-\d{2}\n/);
    expect(texte.indexOf('\n## [Unreleased]\n')).toBeGreaterThan(0);
    expect(texte.indexOf('\n## [Unreleased]\n')).toBeLessThan(section);
  });
  it('is never written in the root package.json, whose version is a new project’s', () => {
    const pkg = JSON.parse(lire(DEPOT, 'package.json')) as { version: string };
    expect(pkg.version).toBe('1.0.0');
  });
  it('goes to every project with the frame’s files; the release script never does', () => {
    const { garder, retirer } = lireListe(lire(DEPOT, '.claude/grillhouse/fichiers.txt'));
    expect(garder).toContain('.claude/grillhouse/');
    expect(retirer).toContain('scripts/sortie.mjs');
  });
});

describe('a release of Grillhouse prepares its files (scripts/sortie.mjs)', () => {
  it('raises VERSION and plugin.json together, the other fields of plugin.json kept', () => {
    const r = grillhouse();
    preparerSortie(r, '0.17.0', '2026-11-02');
    expect(lire(r, VERSION)).toBe('0.17.0\n');
    expect(JSON.parse(lire(r, PLUGIN))).toEqual({
      name: 'grillhouse',
      version: '0.17.0',
      author: { name: 'A' },
    });
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
      expect(lire(r, VERSION)).toBe('0.16.0\n');
      expect(lire(r, 'CHANGELOG.md')).toBe(CHANGELOG);
    }
  });
  it('refuses a release whose « [Unreleased] » section holds nothing', () => {
    const r = grillhouse('0.16.0', '# Changelog\n\n## [Unreleased]\n\n## [0.16.0] - 2026-10-18\n');
    expect(() => preparerSortie(r, '0.16.1', '2026-11-02')).toThrow(/Unreleased/);
    expect(lire(r, VERSION)).toBe('0.16.0\n');
  });
  it('refuses a VERSION and a plugin.json that already differ', () => {
    const r = grillhouse();
    ecrire(r, VERSION, '0.15.0\n');
    expect(() => preparerSortie(r, '0.17.0', '2026-11-02')).toThrow(/plugin\.json/);
  });
});

describe('a release of Grillhouse tags its commit locally, never pushing', () => {
  // A trial Grillhouse in a git repository, its release commit made, with a remote.
  function depotDeSortie() {
    const r = grillhouse();
    const distant = mkdtempSync(path.join(ESSAIS, 'distant-'));
    git(distant, 'init', '-q', '--bare');
    git(r, 'init', '-q');
    // Its own identity, which `etiqueter`, run in this process, reads: a machine without one, as
    // the CI's, refuses an annotated tag.
    git(r, 'config', 'user.name', 'Essai');
    git(r, 'config', 'user.email', 'essai@example.invalid');
    git(r, 'remote', 'add', 'origin', distant);
    git(r, 'add', '-A');
    git(r, 'commit', '-q', '-m', 'chore(release): 0.16.0');
    git(r, 'push', '-q', 'origin', 'HEAD:main');
    return { r, distant };
  }
  it('creates the annotated tag v<VERSION> on HEAD, and the remote receives nothing', () => {
    const { r, distant } = depotDeSortie();
    expect(etiqueter(r)).toBe('v0.16.0');
    expect(git(r, 'cat-file', '-t', 'v0.16.0')).toBe('tag');
    expect(git(r, 'rev-parse', 'v0.16.0^{commit}')).toBe(git(r, 'rev-parse', 'HEAD'));
    expect(git(distant, 'tag', '--list')).toBe('');
  });
  it('refuses a tag that exists, and a working tree with changes', () => {
    const { r } = depotDeSortie();
    etiqueter(r);
    expect(() => etiqueter(r)).toThrow(/v0\.16\.0/);
    const s = depotDeSortie().r;
    ecrire(s, 'CHANGELOG.md', `${CHANGELOG}\nmore\n`);
    expect(() => etiqueter(s)).toThrow();
    expect(git(s, 'tag', '--list')).toBe('');
  });
  it('the command prepares, then tags, and names the push it leaves to the owner', () => {
    const { r } = depotDeSortie();
    const env = ENV_GIT;
    const p = spawnSync('node', [SCRIPT, '0.17.0'], { cwd: r, encoding: 'utf8', env });
    expect(p.status, p.stderr).toBe(0);
    expect(lire(r, VERSION)).toBe('0.17.0\n');
    git(r, 'commit', '-q', '-am', 'chore(release): 0.17.0');
    const e = spawnSync('node', [SCRIPT, '--etiqueter'], { cwd: r, encoding: 'utf8', env });
    expect(e.status, e.stderr).toBe(0);
    expect(e.stdout).toContain('git push origin v0.17.0');
    const u = spawnSync('node', [SCRIPT], { cwd: r, encoding: 'utf8', env });
    expect(u.status).not.toBe(0);
  });
});
