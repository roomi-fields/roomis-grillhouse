// The memo of a circuit holds of its written state only what a resumption rereads
// (`etatPourLeMemo`, src/temporal/circuit/contrat.ts), whatever the length of the ticket; the
// resumption of a workflow ended without its issue rereads that state from the memo alone
// (`etatDeLaReprise`), a memo that still holds the whole state read by the same path.
import { describe, expect, it } from 'vitest';
import { MEMOIRE } from '../../scripts/transitions.mjs';
import { etatDeLaReprise, etatPourLeMemo } from '../../src/temporal/circuit/contrat.js';

const BORNE_DU_MEMO = 4096;
const GROS = 'x'.repeat(200 * 1024);

// The state the circuit writes whole (scripts/circuit.mjs `ecrireEtat`), with a report, findings
// and a journal of 200 Ko each.
const etatEntier = (surcharge: Record<string, unknown> = {}) => ({
  etape: 'developpeur',
  tentative: 2,
  code: 2,
  raison: 'questionnement',
  rapport: `${GROS}\nsuite`,
  finale: false,
  boucles: { controles: 1 },
  question: { arret: 'questionnement', fait: 'f', piece: 'p', question: 'q', qui: 'superviseur' },
  questionnement: { objet: 'plan' },
  mene: null,
  paquets: ['packages/grillhouse'],
  rang: 7,
  constats: [{ titre: GROS }],
  journal: [{ ligne: GROS }],
  verts: { a: GROS },
  relanceSurLeRefus: true,
  seanceReprise: 'seance-42',
  reprise: { session: 's1', tour: 3 },
  verifie: { arbre: 'abc123', vert: true },
  refus: { lance: false, relance: true },
  toursDeLaPasseFinale: 2,
  aRegenerer: ['docs/INTERFACE.md'],
  ...surcharge,
});

const taille = (v: unknown) => JSON.stringify(v).length;

describe('le mémo d’un circuit', () => {
  it('reste sous quelques Ko après un état dont le rapport, les constats et le journal pèsent 200 Ko', () => {
    expect(taille(etatEntier())).toBeGreaterThan(600 * 1024);
    expect(taille(etatPourLeMemo(etatEntier()))).toBeLessThan(BORNE_DU_MEMO);
  });

  it('ne garde ni le rapport entier, ni les constats, ni le journal', () => {
    const gardes = etatPourLeMemo(etatEntier()) as Record<string, unknown>;
    expect(gardes.constats).toBeUndefined();
    expect(gardes.journal).toBeUndefined();
    expect(JSON.stringify(gardes.rapport ?? '')).not.toContain(GROS);
  });

  it('garde ce que la reprise relit : étape, tentative, arrêt, boucles, rang, paquets', () => {
    const gardes = etatPourLeMemo(etatEntier());
    expect(gardes).toMatchObject({
      etape: 'developpeur',
      tentative: 2,
      raison: 'questionnement',
      finale: false,
      boucles: { controles: 1 },
      rang: 7,
      paquets: ['packages/grillhouse'],
    });
  });

  it('garde les champs de reprise de la séance, de la vérification, du refus et de la régénération', () => {
    expect(etatPourLeMemo(etatEntier())).toMatchObject({
      relanceSurLeRefus: true,
      seanceReprise: 'seance-42',
      reprise: { session: 's1', tour: 3 },
      verifie: { arbre: 'abc123', vert: true },
      refus: { lance: false, relance: true },
      toursDeLaPasseFinale: 2,
      aRegenerer: ['docs/INTERFACE.md'],
    });
  });

  it('garde chaque clé de la mémoire du circuit que l’état écrit porte, que la reprise relit', () => {
    const cles: string[] = [...MEMOIRE];
    const leger: Record<string, unknown> = { etape: 'developpeur' };
    for (const cle of cles) {
      leger[cle] = [`valeur-${cle}`];
    }
    const lu = etatDeLaReprise({ ecrit: etatPourLeMemo(leger) }) as Record<string, unknown>;
    for (const cle of cles) {
      expect(lu[cle], cle).toEqual([`valeur-${cle}`]);
    }
    expect(lu).toMatchObject({ constats: ['valeur-constats'], verts: ['valeur-verts'] });
  });

  it('garde la tête d’une liste trop longue et laisse de côté une valeur trop lourde', () => {
    const longue = Array.from({ length: 500 }, (_, i) => `ligne-${i}-${'y'.repeat(50)}`);
    const gardes = etatPourLeMemo({
      etape: 'testwriter',
      aRegenerer: longue,
      verifie: GROS,
    }) as Record<string, unknown>;
    const tete = gardes.aRegenerer as string[];
    expect(tete.length).toBeGreaterThan(0);
    expect(tete.length).toBeLessThan(longue.length);
    expect(tete).toEqual(longue.slice(0, tete.length));
    expect(gardes.verifie).toBeUndefined();
  });

  it('reste petit quelle que soit la longueur du ticket, pour un autre état', () => {
    const autre = etatEntier({ etape: 'testwriter', raison: null, rapport: null, rang: 3 });
    const gardes = etatPourLeMemo(autre);
    expect(gardes).toMatchObject({ etape: 'testwriter', raison: null, rang: 3 });
    expect(taille(gardes)).toBeLessThan(BORNE_DU_MEMO);
  });
});

describe('la reprise d’un déroulé fini sans issue', () => {
  it('relit l’état du seul mémo que le déroulé a publié', () => {
    const lu = etatDeLaReprise({ ecrit: etatPourLeMemo(etatEntier()) }) as Record<string, unknown>;
    expect(lu).toMatchObject({
      etape: 'developpeur',
      tentative: 2,
      raison: 'questionnement',
      rang: 7,
      paquets: ['packages/grillhouse'],
    });
  });

  it('lit par le même chemin un mémo ancien qui garde l’état entier', () => {
    const ancien = etatEntier();
    expect(etatDeLaReprise({ ecrit: ancien })).toEqual(ancien);
  });

  it('ne rend aucun état quand le mémo n’en garde aucun', () => {
    expect(etatDeLaReprise({})).toBeNull();
    expect(etatDeLaReprise(undefined)).toBeNull();
    expect(etatDeLaReprise({ ecrit: null })).toBeNull();
  });
});
