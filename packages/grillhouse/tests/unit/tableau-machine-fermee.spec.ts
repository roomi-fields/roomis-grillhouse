// La machine fermée sur le panneau (scripts/tableau.mjs) : l'état des places reprend la fermeture
// de la vue des places (`lues.fermeture`, `{ auteur, depuis, phase }`), et une ligne d'AGENTS dit
// « machine fermée par le superviseur » ou « par la nuit », depuis quand. Une fermeture du
// superviseur n'est pas une nuit : aucune ligne de nuit. Hors fermeture, aucune ligne.
// Petits tests : le panneau assemblé en mémoire.
import { describe, expect, it } from 'vitest';
import { etatDesPlaces } from '../../scripts/places-de-la-machine.mjs';
import { assembler, LARGEUR, lignes } from '../../scripts/tableau.mjs';

const MAINTENANT = Date.parse('2026-11-21T10:00:00Z');
const H = 3_600_000;

type Fermeture = { auteur: 'superviseur' | 'nuit'; depuis: number; phase: string };

describe('l’état des places porte la fermeture de la machine', () => {
  const MESURE = JSON.stringify({
    coeurs: 4,
    charge: 1,
    memoireLibre: 2 ** 33,
    memoireTotale: 2 ** 34,
  });
  const etat = (fermeture?: Fermeture | null, nuit?: { phase: string } | null) =>
    (
      etatDesPlaces as unknown as (o: unknown) => {
        fermeture: Fermeture | null;
        nuit: string | null;
      }
    )({
      env: { CI: '1', GRILLHOUSE_MESURE_D_ESSAI: MESURE },
      lues: {
        plafond: 3,
        prises: [],
        attentes: [],
        ...(fermeture === undefined ? {} : { fermeture }),
        ...(nuit === undefined ? {} : { nuit }),
      },
    });

  it('rend l’auteur, le début et la phase de la fermeture du superviseur', () => {
    const f = { auteur: 'superviseur', depuis: 5, phase: 'attend' } as const;
    expect(etat(f).fermeture).toEqual(f);
    expect(etat(f).nuit).toBeNull();
  });

  it('rend la fermeture de la nuit, la phase de la nuit gardée', () => {
    const f = { auteur: 'nuit', depuis: 5, phase: 'en cours' } as const;
    expect(etat(f, { phase: 'en cours' })).toMatchObject({ fermeture: f, nuit: 'en cours' });
  });

  it('rend null hors fermeture', () => {
    expect(etat().fermeture).toBeNull();
    expect(etat(null).fermeture).toBeNull();
  });
});

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
const agents = (fermeture: Fermeture | null | undefined) => {
  const places = fermeture === undefined ? PLACES : { ...PLACES, fermeture };
  const p = assembler({
    tous: [],
    prefix: 'demo',
    registre: [],
    vivants: [],
    circuits: [],
    maintenant: MAINTENANT,
    jour: MAINTENANT - 2 * H,
    machine: null,
    places,
    nuit: null,
  } as unknown as Parameters<typeof assembler>[0]);
  return (lignes(p, 'depot') as Ligne[]).filter(l => l.section === 'agents').map(l => l.texte);
};

describe('la machine fermée dans AGENTS', () => {
  it('fermée par le superviseur : la ligne le dit et dit depuis quand', () => {
    const l = agents({ auteur: 'superviseur', depuis: MAINTENANT - 3 * H, phase: 'attend' });
    const f = l.find(x => /fermée par le superviseur/.test(x));
    expect(f).toMatch(/machine fermée par le superviseur/);
    expect(f).toMatch(/depuis 3 h|depuis 180 min/);
  });

  it('la fermeture du superviseur ne montre aucune ligne de nuit', () => {
    const l = agents({ auteur: 'superviseur', depuis: MAINTENANT - H, phase: 'vide' });
    expect(l.some(x => /^nuit/.test(x))).toBe(false);
  });

  it('fermée par la nuit : la ligne le dit et dit depuis quand', () => {
    const l = agents({ auteur: 'nuit', depuis: MAINTENANT - 2 * H, phase: 'en cours' });
    const f = l.find(x => /fermée par la nuit/.test(x));
    expect(f).toMatch(/machine fermée par la nuit/);
    expect(f).toMatch(/depuis 2 h|depuis 120 min/);
  });

  it('une fermeture du superviseur dont les places sont vides le dit', () => {
    const l = agents({ auteur: 'superviseur', depuis: MAINTENANT - H, phase: 'vide' });
    expect(l.some(x => /machine fermée par le superviseur.*vide|machine est vide/.test(x))).toBe(
      true
    );
  });

  it('hors fermeture, aucune ligne de fermeture', () => {
    for (const f of [null, undefined] as const) {
      expect(agents(f).some(x => /fermée/.test(x))).toBe(false);
    }
  });

  it('les lignes tiennent dans la largeur du panneau', () => {
    for (const a of ['superviseur', 'nuit'] as const) {
      for (const x of agents({ auteur: a, depuis: MAINTENANT - 50 * H, phase: 'attend' })) {
        expect(colonnes(x), x).toBeLessThanOrEqual(LARGEUR);
      }
    }
  });
});
