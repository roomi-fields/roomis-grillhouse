// The update (`grillhouse maj`) poses the workflow « machine vierge » in a project that holds a
// workflow of the frame, and declares its entry in `grillhouse.flux` with every package of the
// project's graph, the entries already declared left as they are; a project without a workflow of
// the frame, and a workflow without the frame's mark, stay untouched.
//
// Small tests: a project of files, the update called by its interface, without a process.
//
// @lit .github/workflows/** templates/projet/.github/workflows/**
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { declarerLesLangages } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { afterAll, describe, expect, it } from 'vitest';
import { constats } from '../../scripts/flux-des-paquets.mjs';
import { mettreAJour, rapport } from '../../scripts/grillhouse-maj.mjs';
import { MARQUE } from '../../scripts/workflows-du-cadre.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'grillhouse-maj-machine-vierge-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

const DEPOT = path.resolve(__dirname, '../../../..');
const CI = '.github/workflows/ci.yml';
const NUIT = '.github/workflows/nuit.yml';
const VIERGE = '.github/workflows/machine-vierge.yml';
const NOMS = ['@p/a', '@p/b', '@p/c'];
const DU_CADRE = `${MARQUE} depuis le gabarit du cadre.\nname: CI\non: push\njobs: {}\n`;
const DU_PROJET =
  'name: Vierge\non: workflow_dispatch\njobs:\n  v:\n    runs-on: macos-latest\n    steps: []\n';

const ecrire = (racine: string, f: string, contenu: string) => {
  mkdirSync(path.dirname(path.join(racine, f)), { recursive: true });
  writeFileSync(path.join(racine, f), contenu);
};
const lire = (racine: string, f: string) => readFileSync(path.join(racine, f), 'utf8');
const flux = (racine: string) =>
  (
    JSON.parse(lire(racine, 'package.json')) as {
      grillhouse?: { flux?: Record<string, string[]> };
    }
  ).grillhouse?.flux;

// A project of three packages of TypeScript, declaring <declare> in grillhouse.flux (absent when
// undefined), holding the workflows <ymls> by path.
function projet(declare: Record<string, string[]> | undefined, ymls: Record<string, string>) {
  const racine = mkdtempSync(path.join(ESSAIS, 'projet-'));
  ecrire(
    racine,
    'package.json',
    `${JSON.stringify({
      name: 'p',
      private: true,
      workspaces: ['packages/*'],
      ...(declare === undefined ? {} : { grillhouse: { flux: declare } }),
    })}\n`
  );
  declarerLesLangages(racine, {
    'packages/a': 'typescript',
    'packages/b': 'typescript',
    'packages/c': 'typescript',
  });
  NOMS.forEach((nom, i) => {
    ecrire(racine, `packages/${'abc'[i]}/package.json`, `${JSON.stringify({ name: nom })}\n`);
  });
  for (const [f, contenu] of Object.entries(ymls)) {
    ecrire(racine, f, contenu);
  }
  return racine;
}

describe('the update declares the workflow of the clean machine', () => {
  it('poses the workflow and declares it with every package of the graph', () => {
    const racine = projet(
      { [CI]: ['@p/a'], [NUIT]: ['@p/b'] },
      { [CI]: DU_CADRE, [NUIT]: DU_CADRE }
    );
    mettreAJour(racine, DEPOT);
    expect(lire(racine, VIERGE)).toContain(MARQUE);
    expect(flux(racine)?.[VIERGE]).toEqual(NOMS);
  });

  it('declares it in a project with no key grillhouse.flux yet', () => {
    const racine = projet(undefined, { [CI]: DU_CADRE });
    mettreAJour(racine, DEPOT);
    expect(flux(racine)?.[VIERGE]).toEqual(NOMS);
  });

  it('leaves the entries already declared as they are, the ones of the other workflows too', () => {
    const racine = projet({ [CI]: ['@p/a'], [NUIT]: ['@p/c', '@p/b'] }, { [CI]: DU_CADRE });
    mettreAJour(racine, DEPOT);
    expect(flux(racine)?.[CI]).toEqual(['@p/a']);
    expect(flux(racine)?.[NUIT]).toEqual(['@p/c', '@p/b']);
  });

  it('keeps the entry of the clean machine that the project already declared', () => {
    const racine = projet(
      { [CI]: ['@p/a'], [NUIT]: ['@p/a'], [VIERGE]: ['@p/b'] },
      { [CI]: DU_CADRE }
    );
    mettreAJour(racine, DEPOT);
    expect(flux(racine)?.[VIERGE]).toEqual(['@p/b']);
  });

  it('leaves the guard of the flows green on the updated project', () => {
    const racine = projet(
      { [CI]: ['@p/a'], [NUIT]: ['@p/b'] },
      { [CI]: DU_CADRE, [NUIT]: DU_CADRE }
    );
    mettreAJour(racine, DEPOT);
    expect(constats(racine)).toEqual([]);
  });

  it('replayed, changes nothing', () => {
    const racine = projet(
      { [CI]: ['@p/a'], [NUIT]: ['@p/b'] },
      { [CI]: DU_CADRE, [NUIT]: DU_CADRE }
    );
    mettreAJour(racine, DEPOT);
    const avant = lire(racine, 'package.json');
    mettreAJour(racine, DEPOT);
    expect(lire(racine, 'package.json')).toBe(avant);
  });

  it('writes the entry with the real packages in the command it still gives for the other flows', () => {
    const racine = projet(undefined, { [CI]: DU_CADRE });
    const texte = rapport(mettreAJour(racine, DEPOT));
    expect(texte).toContain(`"${VIERGE}":["@p/a","@p/b","@p/c"]`);
    expect(texte).toContain(`"${CI}":["<paquet>"]`);
  });
});

describe('the update leaves alone what the clean machine does not concern', () => {
  it('poses nothing and declares nothing in a project that holds no workflow of the frame', () => {
    const racine = projet(undefined, { [CI]: DU_PROJET });
    mettreAJour(racine, DEPOT);
    expect(() => lire(racine, VIERGE)).toThrow();
    expect(flux(racine)).toBeUndefined();
  });

  it('leaves a clean-machine workflow the project took for itself, without the mark, as it is', () => {
    const racine = projet(undefined, { [CI]: DU_CADRE, [VIERGE]: DU_PROJET });
    mettreAJour(racine, DEPOT);
    expect(lire(racine, VIERGE)).toBe(DU_PROJET);
    expect(flux(racine)?.[VIERGE]).toBeUndefined();
  });
});
