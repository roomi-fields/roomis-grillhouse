// La preuve du rouge qui ne trouve aucun rouge (`transition`, scripts/transitions.mjs, étape 2.1) :
// le rapport de l'étape dit où va le lot et pourquoi, selon la sorte du plan. Sous « tests-adaptés »
// le développeur écrit le code (la suite existante a fait la preuve) ; un comportement changé n'a
// qu'un lot de tests seul, qui va aux contrôles. Un test petit : une fonction sans entrée ni sortie.
import { describe, expect, it } from 'vitest';
import * as transitions from '../../scripts/transitions.mjs';

interface Decision {
  besoin?: { fait: string };
  suivant: { etape: string; tentative: number };
  effets: { genre: string; texte?: string; rapport?: string }[];
}
const transition = transitions.transition as (e: {
  etat: object;
  ticket: object;
  memoire?: object;
  faits: Record<string, unknown>;
}) => Decision;
const { PREUVE, CODE, CONTROLES } = transitions as unknown as Record<string, string>;

const preuve = { ok: true, rouges: 0, texte: 'T', resume: 'r', resultat: {} };

function apresLaPreuve(sorte: object | null) {
  const lus: Record<string, unknown> = {};
  for (let i = 0; i < 20; i++) {
    const d = transition({
      etat: { etape: PREUVE, tentative: 1, rapport: null, finale: false },
      ticket: { id: 'essai-1', paquets: ['packages/a'], sorte, copie: '/copie' },
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
const rapportDe = (d: Decision) => d.effets.find(e => e.genre === 'rapport')!.texte!;

describe('la preuve du rouge sans aucun rouge', () => {
  it('sous « tests-adaptés », dit au rapport que le développeur écrit le code, et l’y envoie', () => {
    const d = apresLaPreuve({
      genre: 'comportement',
      raison: 'un test de plus',
      comportement: 'tests-adaptés',
    });
    expect(d.suivant).toMatchObject({ etape: CODE, tentative: 1 });
    expect(rapportDe(d)).toContain('aucun rouge : le plan dit « tests-adaptés », au développeur');
  });

  it('sous un comportement changé, dit au rapport qu’un lot de tests seul va aux contrôles, et l’y envoie', () => {
    const d = apresLaPreuve({
      genre: 'comportement',
      raison: 'un calcul neuf',
      comportement: 'changé',
    });
    expect(d.suivant).toMatchObject({ etape: CONTROLES, tentative: 0 });
    expect(rapportDe(d)).toContain('aucun rouge : un lot de tests seul, aux contrôles');
  });
});
