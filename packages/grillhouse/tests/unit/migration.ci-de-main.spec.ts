// The migration of 0.46.0 (scripts/migrations/0.46.0-ci-de-main.mjs): a lot enters main on its final
// pass and the CI plays on main afterwards, by batches; the migration takes `agent/**` out of the
// push of the workflows of the project, their comments and layout kept, and the update of the
// workflows (scripts/workflows-du-cadre.mjs) writes the frame's new CI, on the hourly schedule. A
// workflow of the frame is the update's, never the migration's. It replays without effect.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { MIGRATIONS } from '../../scripts/migrations.mjs';
import * as migration from '../../scripts/migrations/0.46.0-ci-de-main.mjs';
import { MARQUE } from '../../scripts/workflows-du-cadre.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-ci-de-main-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const { migrer, nom, version } = migration as unknown as {
  migrer: (projet: string) => unknown[];
  nom: string;
  version: string;
};

// A project whose workflows are <flux> (name → text).
function projet(flux: Record<string, string>) {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  writeFileSync(path.join(racine, 'package.json'), '{"name":"p"}\n');
  if (Object.keys(flux).length) {
    mkdirSync(path.join(racine, '.github', 'workflows'), { recursive: true });
  }
  for (const [n, texte] of Object.entries(flux)) {
    writeFileSync(path.join(racine, '.github', 'workflows', n), texte);
  }
  return racine;
}
const lire = (racine: string, n: string) =>
  readFileSync(path.join(racine, '.github', 'workflows', n), 'utf8');

const AVEC_LES_BRANCHES = `name: CI

on:
  # the lots and their pull requests
  push:
    branches: [main, develop, 'agent/**']
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
`;

describe('migration 0.46.0 — la CI de main, après l’entrée des lots', () => {
  it('is in the list of the migrations, at 0.46.0', () => {
    expect(MIGRATIONS.some(m => m.version === version && m.nom === nom)).toBe(true);
    expect(version).toBe('0.46.0');
  });

  it('takes agent/** out of the push of a workflow of the project, its comments and other branches kept', () => {
    const racine = projet({ 'ci.yml': AVEC_LES_BRANCHES });
    const lignes = migrer(racine);
    expect(lignes).toEqual([expect.stringContaining('.github/workflows/ci.yml')]);
    const apres = lire(racine, 'ci.yml');
    expect(apres).not.toContain('agent/');
    expect(apres).toContain('# the lots and their pull requests');
    expect(apres).toMatch(/push:\n {4}branches: \[ ?main, develop ?\]/);
    expect(apres).toMatch(/pull_request:\n {4}branches: \[ ?main ?\]/);
  });

  it('replayed, changes nothing and says nothing', () => {
    const racine = projet({ 'ci.yml': AVEC_LES_BRANCHES });
    migrer(racine);
    const apres = lire(racine, 'ci.yml');
    expect(migrer(racine)).toEqual([]);
    expect(lire(racine, 'ci.yml')).toBe(apres);
  });

  it('treats each workflow of the project that lists agent/**, and none that does not', () => {
    const sans = 'name: Docs\non:\n  push:\n    branches: [main]\njobs: {}\n';
    const racine = projet({
      'ci.yml': AVEC_LES_BRANCHES,
      'docs.yml': sans,
      'nuit.yml': AVEC_LES_BRANCHES,
    });
    expect(migrer(racine)).toHaveLength(2);
    expect(lire(racine, 'docs.yml')).toBe(sans);
  });

  it('leaves a workflow of the frame to the update, which writes its new CI', () => {
    const delaCadre = `${MARQUE} depuis le gabarit du cadre.\n${AVEC_LES_BRANCHES}`;
    const racine = projet({ 'ci.yml': delaCadre });
    expect(migrer(racine)).toEqual([]);
    expect(lire(racine, 'ci.yml')).toBe(delaCadre);
  });

  it('touches nothing in a project without workflows', () => {
    expect(migrer(projet({}))).toEqual([]);
  });
});
