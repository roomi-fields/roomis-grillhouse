// Ce que le flux de nuit d'un projet joue (scripts/flux-de-la-nuit.mjs), lu de ses commandes, et la
// nuit du poste qui joue le reste : les mesures de temps, sauf quand le flux déclare le job qui les
// joue. Petit test : le code est importé, aucune nuit ne joue.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  fluxDuProjetJoueLesMesures,
  leFluxJoueLesMesures,
} from '../../scripts/flux-de-la-nuit.mjs';
import { runsDeLaNuit } from '../../scripts/langages/typescript/tests-de-nuit.mjs';

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'flux-de-la-nuit-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// A file of the repository, from its root (two levels under packages/grillhouse/tests).
const duDepot = (chemin: string) =>
  readFileSync(new URL(`../../../../${chemin}`, import.meta.url), 'utf8');

function projet(fichiers: Record<string, string>) {
  const r = mkdtempSync(path.join(ESSAIS, 'projet-'));
  for (const [f, t] of Object.entries(fichiers)) {
    mkdirSync(path.dirname(path.join(r, f)), { recursive: true });
    writeFileSync(path.join(r, f), t);
  }
  return r;
}

const GABARIT = duDepot('templates/projet/.github/workflows/nuit.yml');
const FLUX_GRILLHOUSE = duDepot('.github/workflows/nuit.yml');
const SIMPLE = "import { it } from 'vitest';\nit('a', () => {});\n";

describe('ce que le flux de nuit joue', () => {
  it('le flux du gabarit ne joue aucune mesure', () => {
    expect(leFluxJoueLesMesures(GABARIT)).toBe(false);
  });

  it('le flux de Grillhouse, qui a un job de mesures, les joue', () => {
    expect(leFluxJoueLesMesures(FLUX_GRILLHOUSE)).toBe(true);
  });

  it('un commentaire ou un mot du flux ne tient pas lieu de la commande', () => {
    expect(
      leFluxJoueLesMesures('# grillhouse tests-de-nuit --mesures\nname: Nuit pc2 mesures\n')
    ).toBe(false);
  });
});

describe('la nuit du poste et les mesures', () => {
  const fichiers = {
    'tests/a.nuit.spec.ts': SIMPLE,
    'tests/temps.budget.test.ts': SIMPLE,
  };

  it('dans un projet au flux du gabarit sans test @poste, la nuit du poste lance les mesures', () => {
    const r = projet({ ...fichiers, '.github/workflows/nuit.yml': GABARIT });
    expect(fluxDuProjetJoueLesMesures(r)).toBe(false);
    expect(runsDeLaNuit(r, { duPoste: true })).toEqual(['mesures']);
  });

  it('elle joue les tests @poste puis les mesures quand le flux ne les joue pas', () => {
    const r = projet({
      ...fichiers,
      'tests/poste.nuit.spec.ts': `// @poste: la session\n${SIMPLE}`,
      '.github/workflows/nuit.yml': GABARIT,
    });
    expect(runsDeLaNuit(r, { duPoste: true })).toEqual(['du-poste', 'mesures']);
  });

  it('elle laisse les mesures au flux qui déclare le job qui les joue', () => {
    const r = projet({ ...fichiers, '.github/workflows/nuit.yml': FLUX_GRILLHOUSE });
    expect(runsDeLaNuit(r, { duPoste: true })).toEqual([]);
  });
});
