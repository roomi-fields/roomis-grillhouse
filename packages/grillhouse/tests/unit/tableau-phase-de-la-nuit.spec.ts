// La phase de la nuit sur le panneau (scripts/tableau.mjs) : pendant la réservation de la machine,
// une ligne d'AGENTS dit « nuit : attend la fin des étapes en cours », puis « nuit en cours » ; la
// phase est lue dans `places.nuit` (`'attend'` ou `'en cours'`, null hors nuit). Hors nuit, aucune
// ligne.
import { describe, expect, it } from 'vitest';
import { etatDesPlaces } from '../../scripts/places-de-la-machine.mjs';
import { assembler, LARGEUR, lignes } from '../../scripts/tableau.mjs';

// L'état des places que lit le panneau reprend la phase de la nuit de la vue des places.
describe('l’état des places porte la phase de la nuit', () => {
  const MESURE = JSON.stringify({
    coeurs: 4,
    charge: 1,
    memoireLibre: 2 ** 33,
    memoireTotale: 2 ** 34,
  });
  const etat = (nuit?: { phase: 'attend' | 'en cours' } | null) =>
    (etatDesPlaces as unknown as (o: unknown) => { nuit: string | null })({
      env: { CI: '1', GRILLHOUSE_MESURE_D_ESSAI: MESURE },
      lues: { plafond: 3, prises: [], attentes: [], ...(nuit === undefined ? {} : { nuit }) },
    });

  it('rend la phase « attend » tant que la nuit attend la fin des étapes', () => {
    expect(etat({ phase: 'attend' }).nuit).toBe('attend');
  });

  it('rend la phase « en cours » quand la nuit joue', () => {
    expect(etat({ phase: 'en cours' }).nuit).toBe('en cours');
  });

  it('rend null hors nuit', () => {
    expect(etat().nuit).toBeNull();
    expect(etat(null).nuit).toBeNull();
  });
});

const MAINTENANT = Date.parse('2026-11-12T02:00:00Z');

interface Ligne {
  texte: string;
  section?: string;
}
const colonnes = (s: string) => [...s].length + (s.match(/[🔒⏳💤🌙]/gu)?.length ?? 0);

const PLACES = {
  prises: 1,
  plafond: 3,
  charge: 4,
  coeurs: 12,
  memoireGo: 9,
  memoireTotaleGo: 30,
  attentes: [],
};
const agents = (nuit: 'attend' | 'en cours' | null | undefined) => {
  const places = nuit === undefined ? PLACES : { ...PLACES, nuit };
  const p = assembler({
    tous: [],
    prefix: 'demo',
    registre: [],
    vivants: [],
    circuits: [],
    maintenant: MAINTENANT,
    jour: MAINTENANT - 2 * 3_600_000,
    machine: null,
    places,
    nuit: null,
  } as unknown as Parameters<typeof assembler>[0]);
  return (lignes(p, 'depot') as Ligne[]).filter(l => l.section === 'agents');
};

describe('la phase de la nuit dans AGENTS', () => {
  it('tant que des étapes tournent : « nuit : attend la fin des étapes en cours »', () => {
    const l = agents('attend').filter(x => /nuit/.test(x.texte));
    expect(l.map(x => x.texte)).toContain('nuit : attend la fin des étapes en cours');
  });

  it('une fois les places rendues : « nuit en cours »', () => {
    const l = agents('en cours').map(x => x.texte);
    expect(l).toContain('nuit en cours');
    expect(l.some(x => /attend la fin des étapes/.test(x))).toBe(false);
  });

  it('hors nuit, aucune ligne de nuit', () => {
    for (const nuit of [null, undefined] as const) {
      expect(agents(nuit).some(x => /nuit/.test(x.texte))).toBe(false);
    }
  });

  it('les lignes tiennent dans la largeur du panneau', () => {
    for (const nuit of ['attend', 'en cours'] as const) {
      for (const l of agents(nuit)) {
        expect(colonnes(l.texte), l.texte).toBeLessThanOrEqual(LARGEUR);
      }
    }
  });
});
