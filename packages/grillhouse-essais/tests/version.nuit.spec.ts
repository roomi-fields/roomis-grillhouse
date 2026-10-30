// Ticket grillhouse-3dr.3.7: a release of Grillhouse as its command runs it in a git repository
// with a remote, prepared then tagged: its case moved as it was from
// packages/grillhouse/tests/unit/version.spec.ts, where the preparation and the tagging are tested
// by their interface, by day.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { configGit } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { CADRE } from './cadre.js';

const PAQUET = 'packages/grillhouse/package.json';
const SCRIPT = path.join(CADRE, 'scripts/sortie.mjs');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'version-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const lire = (racine: string, f: string) => readFileSync(path.join(racine, f), 'utf8');
const ecrire = (racine: string, f: string, texte: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), texte);
};
const versionDe = (racine: string, f: string) =>
  (JSON.parse(lire(racine, f)) as { version: string }).version;
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
  it('the command prepares, then tags, and names the push, which publishes the package', () => {
    const { r } = depotDeSortie();
    const env = ENV_GIT;
    const p = spawnSync('node', [SCRIPT, '0.17.0'], { cwd: r, encoding: 'utf8', env });
    expect(p.status, p.stderr).toBe(0);
    expect(versionDe(r, PAQUET)).toBe('0.17.0');
    git(r, 'commit', '-q', '-am', 'chore(release): 0.17.0');
    const e = spawnSync('node', [SCRIPT, '--etiqueter'], { cwd: r, encoding: 'utf8', env });
    expect(e.status, e.stderr).toBe(0);
    expect(e.stdout).toContain('git push origin v0.17.0');
    expect(e.stdout).toContain('npm');
    const u = spawnSync('node', [SCRIPT], { cwd: r, encoding: 'utf8', env });
    expect(u.status).not.toBe(0);
  });
});
