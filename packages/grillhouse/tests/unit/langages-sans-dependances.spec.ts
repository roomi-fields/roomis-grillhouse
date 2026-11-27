// The lot is judged, and a write out of an envelope refused, where the dependencies of the frame's
// package are not installed: the join of the languages and each module of language load from a
// version of the frame, and none of them loads a dependency of the package while it loads (a
// dependency of one command is required when that command runs). A medium test: the scripts of the
// package, copied in a temporary directory without its dependencies, are imported there and asked.
// @lit packages/grillhouse/scripts/**
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PAQUET = path.resolve(__dirname, '../..');
const ESSAIS = mkdtempSync(path.join(tmpdir(), 'langages-sans-dependances-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const requis = createRequire(import.meta.url);

interface Langages {
  LANGAGES: Record<string, string>;
  langage: (nom: string) => { estUnTest: unknown };
}

// The names of the frame's languages, read in the package itself: the copy holds the same list.
const NOMS = Object.keys((requis(path.join(PAQUET, 'scripts/langages.mjs')) as Langages).LANGAGES);

// The package as a version installed without its dependencies: its package.json and its scripts.
const COPIE = path.join(ESSAIS, 'installee/node_modules/@roomi-fields/grillhouse');
beforeAll(() => {
  mkdirSync(COPIE, { recursive: true });
  cpSync(path.join(PAQUET, 'package.json'), path.join(COPIE, 'package.json'));
  cpSync(path.join(PAQUET, 'scripts'), path.join(COPIE, 'scripts'), { recursive: true });
});

describe('les langages se chargent sans les dépendances du paquet', () => {
  it('la copie d’essai ne résout aucune dépendance du paquet : semver y est introuvable', () => {
    const deLaCopie = createRequire(path.join(COPIE, 'scripts/langages.mjs'));
    expect(() => deLaCopie.resolve('semver')).toThrow(/Cannot find module 'semver'/);
  });

  it.each(NOMS)('le module de langage %s se charge sans les dépendances du paquet', nom => {
    const { langage } = requis(path.join(COPIE, 'scripts/langages.mjs')) as Langages;
    expect(typeof langage(nom).estUnTest).toBe('function');
  });
});
