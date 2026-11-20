// The module c answers the join: the suite of conformity (scripts/conformite.mjs) finds no fault
// in it, on its entries (scripts/langages/c/exemples.mjs), against the fake cmake and ctest first on
// the PATH (./faux-cmake.ts). Each case has a defective entry that finds something, but `matieres`:
// C has no shared test material.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cas, echecs } from '../../../../scripts/conformite.mjs';
import { exemplesC, moduleC } from './module-c.js';
import typescript from '../../../../scripts/langages/typescript/index.mjs';
import { installerFauxCmake } from './faux-cmake.js';

type Langage = Parameters<typeof cas>[0];
const c = moduleC as unknown as Langage;
const exemples = exemplesC as unknown as Parameters<typeof cas>[1];

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'conformite-c-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

let avant: string | undefined;
beforeAll(() => {
  avant = process.env.PATH;
  process.env.PATH = `${installerFauxCmake(ESSAIS)}${path.delimiter}${process.env.PATH ?? ''}`;
});
afterAll(() => {
  process.env.PATH = avant;
});

describe('le module c passe la suite de conformité', () => {
  it('it exports every member of the join, as the module typescript does', () => {
    expect(Object.keys(c).sort()).toEqual(
      Object.keys(typescript)
        .filter(m => !['resumesDuLancement', 'garderLesResumes', 'lireLesResumes'].includes(m))
        .sort()
    );
  });

  it('the suite finds no fault in it', () => {
    expect(echecs(c, exemples, { dans: ESSAIS })).toEqual([]);
  });

  it('each case has a defective entry with faults, but the shared test material', () => {
    const vides = cas(c, exemples, { dans: ESSAIS })
      .filter(x => x.attendu.length === 0)
      .map(x => x.nom);
    expect(vides).toEqual(['matieres']);
  });
});
