// The migration « cache des outils » of the module typescript: in a project's `lint` and
// `format:check` scripts, the former cache path (`node_modules/.cache/`) gives way to the new one
// (`.cache-outils/`), every other byte kept, one line per rewrite; a script without the former
// path is left; a second pass changes nothing. Small tests: files under a temporary directory.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { migrationsAJouer, migrationsDe } from '../../../../scripts/migrations.mjs';

const MIGRATION = path.resolve(
  __dirname,
  '../../../../scripts/langages/typescript/migrations/0.34.1-cache-des-outils.mjs'
);
const DEPOT = path.resolve(__dirname, '../../../../../..');
const charger = async () =>
  (await import(/* @vite-ignore */ MIGRATION)) as {
    migrer: (projet: string) => string[];
    nom: string;
    version: string;
  };

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-cache-des-outils-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const projet = (texte?: string) => {
  const p = mkdtempSync(path.join(ESSAIS, 'projet-'));
  if (texte !== undefined) {
    writeFileSync(path.join(p, 'package.json'), texte);
  }
  return p;
};
const lire = (p: string) => readFileSync(path.join(p, 'package.json'), 'utf8');

const ESLINT = 'node_modules/.cache/eslint/.eslintcache';
const PRETTIER = 'node_modules/.cache/prettier/.prettiercache';
const AVANT = `{
  "name": "demo",
  "scripts": {
    "build": "tsc",
    "lint": "eslint src tests --cache --cache-location ${ESLINT} --ext .ts,.js,.mjs",
    "format:check": "prettier --check --cache --cache-location ${PRETTIER} \\"src/**/*.ts\\""
  },
  "devDependencies": { "typescript": "^5.3.3" }
}
`;
const APRES = AVANT.replaceAll('node_modules/.cache/', '.cache-outils/');

describe('migration « cache des outils » — the cache of the lint and the format check moves', () => {
  it('is a migration of the module typescript, « cache des outils », in the list', async () => {
    const { nom, version } = await charger();
    expect(nom).toBe('cache des outils');
    expect(migrationsDe(DEPOT).some(m => m.version === version && m.nom === nom)).toBe(true);
  });

  it('is played for a project recorded at the published version 0.34.0, not for one at 0.34.1', async () => {
    const { nom } = await charger();
    const jouees = (depuis: string) =>
      migrationsAJouer(depuis, migrationsDe(DEPOT)).map(m => m.nom);
    expect(jouees('0.34.0')).toContain(nom);
    expect(jouees('0.33.1')).toContain(nom);
    expect(jouees('0.34.1')).not.toContain(nom);
  });

  it('replaces the former cache path of lint and format:check, every other byte kept', async () => {
    const { migrer } = await charger();
    const p = projet(AVANT);
    const lignes = migrer(p);
    expect(lire(p)).toBe(APRES);
    expect(lignes).toHaveLength(2);
    expect(lignes.some(l => l.includes('lint'))).toBe(true);
    expect(lignes.some(l => l.includes('format:check'))).toBe(true);
  });

  it('replaces the path wherever it falls in the script', async () => {
    const { migrer } = await charger();
    const texte = `{
  "scripts": {
    "lint": "eslint --cache-location ${ESLINT} --cache src --ext .ts",
    "format:check": "prettier --check \\"src/**/*.ts\\" --cache --cache-location ${PRETTIER}"
  }
}
`;
    const p = projet(texte);
    expect(migrer(p)).toHaveLength(2);
    expect(lire(p)).toBe(texte.replaceAll('node_modules/.cache/', '.cache-outils/'));
  });

  it('rewrites a script alone when the other has no former path, one line', async () => {
    const { migrer } = await charger();
    const texte = AVANT.replace(PRETTIER, '.cache-outils/prettier/.prettiercache');
    const p = projet(texte);
    const lignes = migrer(p);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toContain('lint');
    expect(lire(p)).toBe(APRES);
  });

  it('leaves a script that does not hold the former path, and other scripts that do', async () => {
    const { migrer } = await charger();
    const texte = AVANT.replace(
      '"build": "tsc"',
      `"build": "tsc --tsBuildInfoFile node_modules/.cache/x"`
    ).replace(ESLINT, 'node_modules/.eslintcache');
    const p = projet(texte);
    migrer(p);
    expect(lire(p)).toContain('"build": "tsc --tsBuildInfoFile node_modules/.cache/x"');
    expect(lire(p)).toContain('--cache-location node_modules/.eslintcache');
  });

  it('leaves a project whose scripts lack the former path, nothing said', async () => {
    const { migrer } = await charger();
    const choisi = AVANT.replaceAll('node_modules/.cache/', 'tmp/cache/');
    const p = projet(choisi);
    expect(migrer(p)).toEqual([]);
    expect(lire(p)).toBe(choisi);
  });

  it('replayed, it changes nothing', async () => {
    const { migrer } = await charger();
    const p = projet(AVANT);
    migrer(p);
    const premiere = lire(p);
    expect(migrer(p)).toEqual([]);
    expect(lire(p)).toBe(premiere);
  });

  it('a project without package.json is left, nothing said', async () => {
    const { migrer } = await charger();
    expect(migrer(projet())).toEqual([]);
  });
});
