// The migration of 0.48.0 (scripts/migrations/0.48.0-ci-declenchee-par-la-file.mjs): the queue starts
// the CI of main after a lot entered, so the frame's ci.yml loses its hourly schedule and its job
// `moved`. The migration writes the frame's new ci.yml in a project that holds the frame's one
// (recognised by its mark), leaves every other workflow as it is, and a second pass changes nothing.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { MIGRATIONS } from '../../scripts/migrations.mjs';
import { GABARIT_DES_WORKFLOWS, MARQUE, WORKFLOWS } from '../../scripts/workflows-du-cadre.mjs';

const DEPOT = path.resolve(__dirname, '../../../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-ci-declenchee-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// The migration is found in the list by its name and its version, as the update plays it.
const NOM = 'ci declenchee par la file';
const VERSION = '0.48.0';
const trouvee = (
  MIGRATIONS as { version: string; nom: string; migrer: (p: string) => unknown[] }[]
).find(m => m.nom === NOM && m.version === VERSION);
const migrer = (projet: string): unknown[] => {
  if (!trouvee) {
    throw new Error(`la migration « ${NOM} » de ${VERSION} manque à la liste des migrations`);
  }
  return trouvee.migrer(projet);
};

const GABARIT = readFileSync(path.join(DEPOT, GABARIT_DES_WORKFLOWS, 'ci.yml'), 'utf8');

// The frame's ci.yml before the migration: its mark, an hourly schedule and the job `moved`.
const ANCIEN_DU_CADRE = `${MARQUE} depuis le gabarit du cadre ; ne pas éditer.
name: CI

on:
  schedule:
    - cron: '17 * * * *'
  workflow_dispatch:
  workflow_call:

jobs:
  moved:
    runs-on: ubuntu-latest
    outputs:
      unchanged: \${{ steps.search.outputs.unchanged }}
    steps:
      - id: search
        run: echo unchanged=false >> "$GITHUB_OUTPUT"
  gardes:
    needs: moved
    if: needs.moved.outputs.unchanged != 'true'
    runs-on: ubuntu-latest
    steps:
      - run: npm run verifier
`;
const DU_PROJET = `name: CI du projet
on:
  schedule:
    - cron: '5 * * * *'
jobs:
  essai:
    runs-on: ubuntu-latest
    steps:
      - run: echo bonjour
`;

function projet(flux: Record<string, string>) {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  writeFileSync(path.join(racine, 'package.json'), '{"name":"p"}\n');
  mkdirSync(path.join(racine, WORKFLOWS), { recursive: true });
  for (const [n, texte] of Object.entries(flux)) {
    writeFileSync(path.join(racine, WORKFLOWS, n), texte);
  }
  return racine;
}
const lire = (racine: string, n: string) => readFileSync(path.join(racine, WORKFLOWS, n), 'utf8');

describe('migration 0.48.0 — la CI est déclenchée par la file', () => {
  it('is in the list of the migrations, at 0.48.0', () => {
    expect(trouvee).toBeDefined();
  });

  it('writes the frame’s new ci.yml in a project that holds the frame’s one', () => {
    const racine = projet({ 'ci.yml': ANCIEN_DU_CADRE });
    const lignes = migrer(racine);
    expect(lignes.some(l => typeof l === 'string' && l.includes('ci.yml'))).toBe(true);
    expect(lire(racine, 'ci.yml')).toBe(GABARIT);
    expect(lire(racine, 'ci.yml')).not.toMatch(/cron:/);
    expect(lire(racine, 'ci.yml')).not.toMatch(/^\s*moved:/m);
  });

  it('leaves a ci.yml without the frame’s mark and every other workflow as it is', () => {
    const racine = projet({ 'ci.yml': DU_PROJET, 'autre.yml': DU_PROJET });
    expect(migrer(racine)).toEqual([]);
    expect(lire(racine, 'ci.yml')).toBe(DU_PROJET);
    expect(lire(racine, 'autre.yml')).toBe(DU_PROJET);
  });

  it('writes the frame’s ci.yml and leaves the project’s other workflows beside it', () => {
    const racine = projet({ 'ci.yml': ANCIEN_DU_CADRE, 'livraison.yml': DU_PROJET });
    migrer(racine);
    expect(lire(racine, 'ci.yml')).toBe(GABARIT);
    expect(lire(racine, 'livraison.yml')).toBe(DU_PROJET);
  });

  it('changes nothing and says nothing at a second pass', () => {
    const racine = projet({ 'ci.yml': ANCIEN_DU_CADRE, 'livraison.yml': DU_PROJET });
    migrer(racine);
    const apres = lire(racine, 'ci.yml');
    expect(migrer(racine)).toEqual([]);
    expect(lire(racine, 'ci.yml')).toBe(apres);
    expect(lire(racine, 'livraison.yml')).toBe(DU_PROJET);
  });

  it('changes nothing in a project without workflows', () => {
    const racine = mkdtempSync(path.join(ESSAIS, 'sans-'));
    writeFileSync(path.join(racine, 'package.json'), '{"name":"p"}\n');
    expect(migrer(racine)).toEqual([]);
  });
});
