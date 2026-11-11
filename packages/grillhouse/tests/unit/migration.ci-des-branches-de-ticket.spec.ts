// The queue enters a lot on main only once the CI of its branch `agent/<ticket>` judged it green:
// the update adds `agent/**` to the push of the project's CI of the lots, its comments and its
// layout kept; a project already listening is left; one without such a workflow is told the
// gesture. The opening of a session reads the same rule (scripts/ci-des-branches.mjs).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ecouteLesBranchesDeTicket } from '../../scripts/ci-des-branches.mjs';
import { MIGRATIONS } from '../../scripts/migrations.mjs';
import * as migration from '../../scripts/migrations/0.33.0-ci-des-branches-de-ticket.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-ci-des-branches-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const DEPOT = path.resolve(__dirname, '../../../..');
const GABARIT = readFileSync(path.join(DEPOT, 'templates/projet/.github/workflows/ci.yml'), 'utf8');

// A project whose workflows are <flux> (name → text) and whose package.json is <pkg>.
function projet(flux: Record<string, string>, pkg: object = {}) {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  writeFileSync(path.join(racine, 'package.json'), JSON.stringify(pkg));
  if (Object.keys(flux).length) {
    mkdirSync(path.join(racine, '.github', 'workflows'), { recursive: true });
  }
  for (const [nom, texte] of Object.entries(flux)) {
    writeFileSync(path.join(racine, '.github', 'workflows', nom), texte);
  }
  return racine;
}
const lire = (racine: string, nom: string) =>
  readFileSync(path.join(racine, '.github', 'workflows', nom), 'utf8');

const CI_SUR_MAIN = `name: CI

on:
  # the lots and their pull requests
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
`;

describe('la CI du projet se lance sur les branches de ticket', () => {
  it('the CI that runs on a push to main gains agent/**, its comments kept; replayed, nothing changes', () => {
    const racine = projet({ 'ci.yml': CI_SUR_MAIN });
    expect(ecouteLesBranchesDeTicket(racine)).toBe(false);
    expect(migration.migrer(racine)).toEqual([expect.stringContaining('.github/workflows/ci.yml')]);
    const apres = lire(racine, 'ci.yml');
    expect(apres).toContain('# the lots and their pull requests');
    expect(apres).toMatch(/push:\n {4}branches: \[ ?main, develop, agent\/\*\* ?\]/);
    expect(apres).toMatch(/pull_request:\n {4}branches: \[ ?main ?\]/);
    expect(ecouteLesBranchesDeTicket(racine)).toBe(true);
    expect(migration.migrer(racine)).toEqual([]);
    expect(lire(racine, 'ci.yml')).toBe(apres);
  });

  it('a workflow on another branch than the one main is pushed to is left', () => {
    const racine = projet(
      {
        'ci.yml': 'on:\n  push:\n    branches: [trunk]\n',
        'docs.yml': 'on:\n  push:\n    branches: [gh-pages]\n',
      },
      { grillhouse: { poussee: { commit: 'trunk' } } }
    );
    migration.migrer(racine);
    expect(lire(racine, 'ci.yml')).toContain('agent/**');
    expect(lire(racine, 'docs.yml')).not.toContain('agent/**');
  });

  it('a CI that runs on every branch already listens: nothing written', () => {
    const racine = projet({ 'ci.yml': 'on: push\n' });
    expect(ecouteLesBranchesDeTicket(racine)).toBe(true);
    expect(migration.migrer(racine)).toEqual([]);
    expect(lire(racine, 'ci.yml')).toBe('on: push\n');
  });

  it('no workflow to add it to: nothing written, the gesture stays to the project', () => {
    const sans = projet({});
    expect(ecouteLesBranchesDeTicket(sans)).toBe(false);
    expect(migration.migrer(sans)).toEqual([]);
    expect(migration.restes(sans)).toEqual([
      expect.stringContaining("ajoute 'agent/**'") as string,
    ]);
    const tags = projet({ 'release.yml': 'on:\n  push:\n    tags: [v*]\n' });
    expect(migration.migrer(tags)).toEqual([]);
    expect(migration.restes(tags)).toHaveLength(1);
    expect(lire(tags, 'release.yml')).toBe('on:\n  push:\n    tags: [v*]\n');
  });

  it('a CI that listens leaves nothing to the project', () => {
    expect(migration.restes(projet({ 'ci.yml': 'on: push\n' }))).toEqual([]);
  });

  it('the template of a new project already listens to the ticket branches', () => {
    const racine = projet({ 'ci.yml': GABARIT });
    expect(ecouteLesBranchesDeTicket(racine)).toBe(true);
  });

  it('the update plays it', () => {
    expect(MIGRATIONS).toContain(migration);
  });
});
