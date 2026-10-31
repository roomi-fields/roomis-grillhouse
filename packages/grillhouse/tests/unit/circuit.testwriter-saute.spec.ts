// A finding of a RENDU addressed to the testwriter, when the plan skips the testwriter (no package
// of the plan plays tests), stops the circuit at that verdict (grillhouse-26x), as a CI fails fast
// on a step it cannot run rather than playing it again: a new pass cannot treat that finding.
// Witness: OSC Bridge, SyntHub SH-13y.1 under 0.25.5 (2026-10-31): the package site holds its tests
// in Python, played by the CI alone, `grillhouse.langages` being ["cargo"]; the reviewer sent the
// lot back three times with findings « Agent : testwriter », each time the circuit skipped the
// testwriter again, relaunched the developpeur (empty diff) and the checks, then stopped at
// relecture-arret: 72 min, 30 of them lost, 2,18 $.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as circuit from '../../scripts/circuit.mjs';

interface Constat {
  titre: string;
  regle: string;
  role: string;
  corps: string;
  piece?: string;
}
interface Ctx {
  copie: string;
  racine: string;
  paquets: string[];
  constats: Constat[];
}
interface Arret {
  nom: string;
  rapport: string;
  piece: string | null;
  question: string | null;
}
const arretDuTestwriterSaute = circuit.arretDuTestwriterSaute as (
  ctx: Ctx,
  texte: string
) => Arret | null;

const ESSAIS = mkdtempSync(path.join(tmpdir(), 'circuit-testwriter-saute-'));
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));

// A project of TypeScript whose package `site` plays no test (no script `test:unit`) and whose
// package `outil` plays its tests.
const PROJET = path.join(ESSAIS, 'projet');
for (const [rel, texte] of Object.entries({
  'package.json': JSON.stringify({
    name: 'essai',
    workspaces: ['packages/*'],
    grillhouse: { langages: ['typescript'] },
  }),
  'packages/site/package.json': JSON.stringify({ name: '@essai/site' }),
  'packages/outil/package.json': JSON.stringify({
    name: '@essai/outil',
    scripts: { 'test:unit': 'vitest run' },
  }),
})) {
  mkdirSync(path.dirname(path.join(PROJET, rel)), { recursive: true });
  writeFileSync(path.join(PROJET, rel), texte);
}

const AU_TESTWRITER: Constat = {
  titre: 'Les champs ajoutés à /devices.json ne sont pas testés',
  regle: 'critère 8',
  role: 'testwriter',
  corps: 'test_data_files ne vérifie que count et page.',
  piece: 'site/pages/test_pages.py:255',
};
const AU_DEVELOPPEUR: Constat = {
  ...AU_TESTWRITER,
  titre: 'Un fabricant inconnu laisse le sélecteur vide',
  role: 'developpeur',
};
const ctx = (paquets: string[], constats: Constat[]): Ctx => ({
  copie: PROJET,
  racine: PROJET,
  paquets,
  constats,
});

describe('grillhouse-26x, critères 1 et 2 — un constat au testwriter que le plan saute arrête le circuit', () => {
  let arret: Arret | null = null;
  beforeAll(() => {
    arret = arretDuTestwriterSaute(
      ctx(['packages/site'], [AU_DEVELOPPEUR, AU_TESTWRITER]),
      'le verdict'
    );
  });

  it('the stop is relecture-arret, at this verdict', () => {
    expect(arret?.nom).toBe('relecture-arret');
  });

  it('its report names the finding, the role skipped and why (the package, no test played), then the verdict', () => {
    expect(arret?.rapport).toContain(`« ${AU_TESTWRITER.titre} »`);
    expect(arret?.rapport).toContain('testwriter');
    expect(arret?.rapport).toContain('packages/site');
    expect(arret?.rapport).toContain('aucun paquet du plan ne joue de tests');
    expect(arret?.rapport).toContain('le verdict');
    expect(arret?.rapport).not.toContain(AU_DEVELOPPEUR.titre);
  });

  it('its piece is the piece of the finding', () => {
    expect(arret?.piece).toContain(AU_TESTWRITER.piece);
  });

  it('its question to the supervisor: declare the tests of the package, or settle the finding', () => {
    expect(arret?.question).toContain('déclarer les tests du paquet');
    expect(arret?.question).toContain('trancher le constat');
    expect(arret?.question).toContain('--reprendre');
    expect(arret?.question).toContain('--depuis developpeur');
  });
});

describe('grillhouse-26x, critère 3 — un constat au testwriter que le plan joue suit le chemin d’aujourd’hui', () => {
  it('a plan whose package plays tests: no stop', () => {
    expect(
      arretDuTestwriterSaute(ctx(['packages/outil'], [AU_TESTWRITER]), 'le verdict')
    ).toBeNull();
  });

  it('a plan without tests whose findings all go to the developpeur: no stop', () => {
    expect(
      arretDuTestwriterSaute(ctx(['packages/site'], [AU_DEVELOPPEUR]), 'le verdict')
    ).toBeNull();
  });
});
