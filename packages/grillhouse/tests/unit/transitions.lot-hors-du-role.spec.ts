// Le geste « lot hors du rôle » (document du circuit, §5.5) : la fiche d'un auteur dont le lot sort
// de la règle de son rôle (`horsRole`, `{ fichiers, rapport }`) rend son étape, dans la boucle des
// tests pour le testwriter, dans celle du code pour le développeur, les fichiers fautifs au rapport.
import { describe, expect, it } from 'vitest';
import * as transitions from '../../scripts/transitions.mjs';

interface Decision {
  besoin?: { fait: string };
  suivant: { etape: string; tentative: number; rapport: string | null };
  arret?: { nom: string };
}
const transition = transitions.transition as unknown as (e: object) => Decision;
const T = transitions as unknown as Record<string, string> & {
  RELANCES_TESTWRITER: number;
  SEANCES_DEVELOPPEUR: number;
};
const TICKET = {
  id: 'demo-1',
  paquets: ['packages/a'],
  circuit: 'complet',
  sorte: null,
  copie: '/copie',
};
const FAITS = {
  mecanique: false,
  sansTests: false,
  lecture: null,
  renvoi: null,
  empreinteAvant: 'A',
  empreinte: 'B',
};
const RAPPORT = 'Fichiers hors de la règle du rôle : packages/a/x';
const hors = {
  statut: 'FAIT',
  horsRole: { fichiers: ['packages/a/x'], rapport: RAPPORT },
};

function decider(etape: string, tentative: number, seance: object) {
  const faits: Record<string, unknown> = {};
  const disponibles: Record<string, unknown> = { ...FAITS, seance };
  for (let i = 0; i < 20; i++) {
    const d = transition({
      etat: { etape, tentative, rapport: null, finale: false },
      ticket: TICKET,
      faits,
    });
    if (!d.besoin) {
      return d;
    }
    expect(disponibles, d.besoin.fait).toHaveProperty(d.besoin.fait);
    faits[d.besoin.fait] = disponibles[d.besoin.fait];
  }
  throw new Error('trop de faits');
}

describe('le lot hors du rôle rend l’étape à son auteur', () => {
  it('testwriter : l’étape des tests est rejouée, tentative suivante, les fichiers au rapport', () => {
    const d = decider(T.TESTS, 1, hors);
    expect(d.arret).toBeUndefined();
    expect(d.suivant).toMatchObject({ etape: T.TESTS, tentative: 2 });
    expect(d.suivant.rapport).toContain(RAPPORT);
  });

  it('développeur : l’étape du code est rejouée, tentative suivante, les fichiers au rapport', () => {
    const d = decider(T.CODE, 1, hors);
    expect(d.arret).toBeUndefined();
    expect(d.suivant).toMatchObject({ etape: T.CODE, tentative: 2 });
    expect(d.suivant.rapport).toContain(RAPPORT);
  });

  it.each([
    ['testwriter', 'TESTS', () => T.RELANCES_TESTWRITER + 1],
    ['développeur', 'CODE', () => T.SEANCES_DEVELOPPEUR],
  ])('%s : la boucle épuisée, le circuit s’arrête, les fichiers au rapport', (_r, etape, max) => {
    const d = decider(T[etape], max(), hors);
    expect(d.arret).toBeDefined();
    expect(JSON.stringify(d.arret)).toContain('packages/a/x');
  });

  it('un lot dans la règle du rôle avance : le testwriter va à la preuve', () => {
    const d = decider(T.TESTS, 1, { statut: 'FAIT', horsRole: null });
    expect(d.suivant).toMatchObject({ etape: T.PREUVE });
  });
});
