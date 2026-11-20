// L'arrêt d'une séance que la limite d'usage coupe n'est pas une question : `arretDeLaLimiteDUsage`
// (scripts/transitions.mjs) rend l'arrêt « limite-d-usage » (code 26), sans question au
// superviseur, avec le commentaire du report que l'acte écrit au ticket (l'heure de reprise, ou
// l'attente d'une heure quand aucune heure ne se lit) et l'état de l'étape arrêtée, sa raison
// « limite-d-usage » (le mémo du circuit la garde pour le tableau).
import { describe, expect, it } from 'vitest';
import { ARRETS } from '../../scripts/etapes.mjs';
import * as transitions from '../../scripts/transitions.mjs';

interface Etat {
  etape: string;
  [cle: string]: unknown;
}
interface Arret {
  code: number;
  nom: string;
  question: null;
  etat: Etat & { raison: string };
  commentaire: string;
}
const arret = (
  transitions as unknown as {
    arretDeLaLimiteDUsage: (etat: Etat, limite: { reprise: number; lisible: boolean }) => Arret;
  }
).arretDeLaLimiteDUsage;

const REPRISE = Date.UTC(2026, 10, 20, 1, 0, 0); // 2026-11-20T01:00:00.000Z

describe("l'arrêt d'une séance coupée par la limite d'usage", () => {
  it("porte le code et le nom de l'arrêt limite-d-usage, sans question", () => {
    const a = arret({ etape: 'tests' }, { reprise: REPRISE, lisible: true });
    expect(a.nom).toBe('limite-d-usage');
    expect(a.code).toBe((ARRETS as Record<string, number>)['limite-d-usage']);
    expect(a.question).toBeNull();
  });

  it("garde l'état de l'étape arrêtée et y inscrit la raison", () => {
    const a = arret({ etape: 'code', tentative: 2 }, { reprise: REPRISE, lisible: true });
    expect(a.etat).toEqual({ etape: 'code', tentative: 2, raison: 'limite-d-usage' });
  });

  it("le commentaire dit le report et l'heure de reprise", () => {
    const a = arret({ etape: 'tests' }, { reprise: REPRISE, lisible: true });
    expect(a.commentaire).toContain("limite d'usage");
    expect(a.commentaire).toContain('2026-11-20T01:00:00.000Z');
    expect(a.commentaire).not.toContain('aucune heure lisible');
  });

  it("le commentaire d'une heure illisible dit l'attente d'une heure", () => {
    const a = arret({ etape: 'tests' }, { reprise: REPRISE + 7_200_000, lisible: false });
    expect(a.commentaire).toContain('2026-11-20T03:00:00.000Z');
    expect(a.commentaire).toContain('aucune heure lisible');
  });

  it("ne modifie pas l'état reçu", () => {
    const etat = { etape: 'tests' };
    arret(etat, { reprise: REPRISE, lisible: true });
    expect(etat).toEqual({ etape: 'tests' });
  });
});
