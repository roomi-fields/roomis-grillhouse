// La preuve du rouge « à repasser » (`transition`, scripts/transitions.mjs, étape 2.1) : une preuve
// dont la passe finit à 75 n'a rien prouvé. Le circuit s'arrête « a-repasser » à la preuve, comme
// aux contrôles, sans relancer le testwriter ; une attente de la machine à sa borne le dit
// (`attente`), et le déroulé la rejoue sans compter. Un test petit : une fonction sans entrée ni
// sortie.
import { describe, expect, it } from 'vitest';
import * as transitions from '../../scripts/transitions.mjs';

interface Decision {
  besoin?: { fait: string };
  suivant: { etape: string; tentative: number };
  effets: { genre: string; texte?: string }[];
  arret?: { nom: string; rapport: string; attente?: boolean; resultat?: unknown };
}
const transition = transitions.transition as (e: {
  etat: object;
  ticket: object;
  memoire?: object;
  faits: Record<string, unknown>;
}) => Decision;
const { PREUVE } = transitions as unknown as Record<string, string>;

const TEXTE =
  '2.1 Preuve du rouge : à repasser — npm test -- --force a.test.mjs (code 75) : ⏱ attente de la part bornée à 60 min : la nuit tient la machine.';

function apresLaPreuve(preuve: object, tentative = 1) {
  const lus: Record<string, unknown> = {};
  for (let i = 0; i < 20; i++) {
    const d = transition({
      etat: { etape: PREUVE, tentative, rapport: null, finale: false },
      ticket: {
        id: 'essai-1',
        paquets: ['packages/a'],
        sorte: { genre: 'comportement', raison: 'un calcul neuf', comportement: 'changé' },
        copie: '/copie',
      },
      memoire: {},
      faits: lus,
    });
    if (!d.besoin) {
      return d;
    }
    if (d.besoin.fait !== 'preuve') {
      throw new Error(`fait non donné : ${d.besoin.fait}`);
    }
    lus.preuve = preuve;
  }
  throw new Error('trop de faits');
}

const aRepasser = (attente: boolean) => ({
  ok: false,
  aRepasser: true,
  attente,
  rouges: 0,
  texte: TEXTE,
  resume: 'à repasser',
});

describe('la preuve du rouge dont la passe finit à 75', () => {
  it('arrête le circuit « a-repasser » à la preuve, son rapport nommant l’attente de la machine', () => {
    const d = apresLaPreuve(aRepasser(true));
    expect(d.arret?.nom).toBe('a-repasser');
    expect(d.arret?.rapport).toBe(TEXTE);
    // Nothing was measured: the stop keeps no outcome of a proof for the bilan.
    expect(d.arret?.resultat).toBeUndefined();
    expect(d.suivant).toMatchObject({ etape: PREUVE, tentative: 1 });
  });

  it('ne relance pas le testwriter, quelle que soit la séance', () => {
    for (const tentative of [1, 2, 3]) {
      const d = apresLaPreuve(aRepasser(true), tentative);
      expect(d.suivant).toMatchObject({ etape: PREUVE, tentative });
      expect(d.effets.filter(e => e.genre === 'rapport')).toEqual([]);
    }
  });

  it('dit l’attente de la machine, que le déroulé rejoue sans compter', () => {
    expect(apresLaPreuve(aRepasser(true)).arret?.attente).toBe(true);
  });

  it('ne dit aucune attente pour un 75 qui n’en est pas une, rejoué dans sa limite', () => {
    const d = apresLaPreuve(aRepasser(false));
    expect(d.arret?.nom).toBe('a-repasser');
    expect(d.arret?.attente).toBeUndefined();
  });
});
