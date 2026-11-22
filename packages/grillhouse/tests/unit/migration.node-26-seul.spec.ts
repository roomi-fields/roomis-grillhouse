// The migration of 0.44.0 (scripts/migrations/0.44.0-node-26-seul.mjs): the frame supports Node 26
// alone. A project's package.json that holds the exact value the template held before (`>=22.0.0`
// or `>=24.0.0`) receives `>=26.0.0`, the rest of its bytes kept; any other value stays, and a line
// tells the project that its workflows play Node 26 alone, with no proof of the version it declares.
// The frame's workflows of the project are written again from the template. Small tests: files
// under a temporary directory.
//
// @lit .github/workflows/** templates/projet/.github/workflows/**
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CADRE } from '../../scripts/cadre.mjs';
import { MIGRATIONS } from '../../scripts/migrations.mjs';

type Migration = {
  version: string;
  nom: string;
  migrer: (projet: string) => unknown[];
};
// Loaded in a hook, so that a module not yet written fails each test instead of the whole file.
const MODULE = '../../scripts/migrations/0.44.0-node-26-seul.mjs';
let migration: Migration = new Proxy({} as Migration, {
  get() {
    throw new Error(`the module ${MODULE} is not written`);
  },
});
beforeAll(async () => {
  try {
    migration = (await import(/* @vite-ignore */ MODULE)) as Migration;
  } catch {
    // Kept as the proxy: each test reads it and fails on its own.
  }
});

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'migration-node-26-seul-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const MARQUE = '# Généré par `npx grillhouse maj`';
const GABARIT = path.join(CADRE, 'templates/projet/.github/workflows');
const modele = (nom: string) => readFileSync(path.join(GABARIT, nom), 'utf8');

// The lines of what the migration changed or leaves, as text (a line `{ aFaire }` counts by its text).
const dites = (l: unknown[]) =>
  l.map(x => (typeof x === 'string' ? x : (x as { aFaire: string }).aFaire));

// A project whose package.json declares the engine <moteur> (none when null), and whose workflows
// are <workflows> (name → text).
function projet(moteur: string | null, workflows: Record<string, string> = {}) {
  const p = mkdtempSync(path.join(ESSAIS, 'projet-'));
  writeFileSync(path.join(p, 'package.json'), paquet(moteur));
  if (Object.keys(workflows).length) {
    mkdirSync(path.join(p, '.github/workflows'), { recursive: true });
    for (const [nom, texte] of Object.entries(workflows)) {
      writeFileSync(path.join(p, '.github/workflows', nom), texte);
    }
  }
  return p;
}
const paquet = (moteur: string | null) => `{
  "name": "demo",
  "scripts": { "start": "node dist/index.js" },${moteur === null ? '' : `\n  "engines": {\n    "node": "${moteur}"\n  },`}
  "devDependencies": { "typescript": "^5.3.3" }
}
`;
const lirePaquet = (p: string) => readFileSync(path.join(p, 'package.json'), 'utf8');
const lireFlux = (p: string, nom: string) =>
  readFileSync(path.join(p, '.github/workflows', nom), 'utf8');

describe('migration 0.44.0 — the frame supports Node 26 alone', () => {
  it('is the migration of 0.44.0, « node 26 seul », in the list', () => {
    expect(migration.version).toBe('0.44.0');
    expect(migration.nom).toBe('node 26 seul');
    expect(MIGRATIONS).toContain(migration);
  });

  for (const avant of ['>=22.0.0', '>=24.0.0']) {
    it(`gives engines.node ${avant}, the former value of the template, ">=26.0.0", every other byte kept`, () => {
      const p = projet(avant);
      const lignes = dites(migration.migrer(p));
      expect(lirePaquet(p)).toBe(paquet('>=26.0.0'));
      expect(lignes.some(l => l.includes('engines.node') && l.includes('>=26.0.0'))).toBe(true);
    });
  }

  for (const choisi of ['>=20', '^24', '>=25.0.0', '24.x', '>=24.12.0', '>=26.1.0']) {
    it(`leaves the value ${choisi} the project chose, and names it in a line about Node 26 alone`, () => {
      const p = projet(choisi);
      const lignes = dites(migration.migrer(p));
      expect(lirePaquet(p)).toBe(paquet(choisi));
      const ligne = lignes.find(l => l.includes(choisi));
      expect(ligne, lignes.join('\n')).toBeDefined();
      expect(ligne).toContain('26');
      expect(ligne).toContain('engines.node');
    });
  }

  it('says nothing about the engine of a project already at >=26.0.0, or without engines.node', () => {
    for (const moteur of ['>=26.0.0', null]) {
      const p = projet(moteur);
      expect(dites(migration.migrer(p))).toEqual([]);
      expect(lirePaquet(p)).toBe(paquet(moteur));
    }
  });

  it('writes again the frame’s workflows from the template, and leaves the project’s own', () => {
    const p = projet('>=24.0.0', {
      'ci.yml': `${MARQUE} depuis le gabarit\nname: CI\njobs: {}\n`,
      'nuit.yml': `${MARQUE}\nname: Nuit\n`,
      'deploy.yml': 'name: Deploy\n',
    });
    const lignes = dites(migration.migrer(p)).join('\n');
    expect(lireFlux(p, 'ci.yml')).toBe(modele('ci.yml'));
    expect(lireFlux(p, 'nuit.yml')).toBe(modele('nuit.yml'));
    expect(lireFlux(p, 'deploy.yml')).toBe('name: Deploy\n');
    expect(lignes).toContain('ci.yml');
    expect(lignes).toContain('nuit.yml');
    expect(lignes).not.toContain('deploy.yml');
  });

  it('writes again the workflows of a project whose engine it leaves, too', () => {
    const p = projet('^24', { 'ci.yml': `${MARQUE}\nname: CI\n` });
    migration.migrer(p);
    expect(lireFlux(p, 'ci.yml')).toBe(modele('ci.yml'));
    expect(lireFlux(p, 'ci.yml')).not.toMatch(/\b(22|24)\.x\b/);
  });

  it('writes no workflow in a project that holds none of the frame’s', () => {
    const p = projet('>=24.0.0', { 'ci.yml': 'name: Mine\n' });
    migration.migrer(p);
    expect(lireFlux(p, 'ci.yml')).toBe('name: Mine\n');
    expect(() => lireFlux(p, 'nuit.yml')).toThrow();
  });

  it('replayed, it changes nothing and says nothing of what it did', () => {
    const p = projet('>=22.0.0', { 'ci.yml': `${MARQUE}\nname: CI\n` });
    migration.migrer(p);
    const paquetApres = lirePaquet(p);
    const fluxApres = lireFlux(p, 'ci.yml');
    expect(dites(migration.migrer(p))).toEqual([]);
    expect(lirePaquet(p)).toBe(paquetApres);
    expect(lireFlux(p, 'ci.yml')).toBe(fluxApres);
  });

  it('leaves an empty project, without package.json, untouched and silent', () => {
    expect(migration.migrer(mkdtempSync(path.join(ESSAIS, 'vide-')))).toEqual([]);
  });
});
