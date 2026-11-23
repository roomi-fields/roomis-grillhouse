// The relaunches of the testwriter on a red of the checks count until the final pass is green, as a
// bounded loop counts its turns until its exit condition (the retry budget of a job in a CI, which
// a green step in between does not refill). A test file of a reader package the plan extended to
// its tests is red at the final pass and at the checks restricted to that file, and each sends the
// testwriter back; the checks of the whole plan, which play its packages and not the reader, are
// green in between, and do not reset the count; else a testwriter that lifts nothing is relaunched
// without end.
import { describe, expect, it } from 'vitest';
import * as transitions from '../../scripts/transitions.mjs';

interface Etat {
  etape: string;
  tentative: number;
  rapport: string | null;
  finale: boolean;
}
interface Decision {
  besoin?: { fait: string; [cle: string]: unknown };
  suivant: Etat;
  arret?: { nom: string };
  memoire?: Record<string, unknown>;
}
const transition = transitions.transition as (e: {
  etat: Etat;
  ticket: object;
  faits: Record<string, unknown>;
  memoire?: Record<string, unknown>;
}) => Decision;
const { CONTROLES, TESTS, RELANCES_TESTWRITER } = transitions as unknown as Record<
  string,
  string | number
>;

const TICKET = { id: 'essai-1', paquets: ['packages/a'], sorte: null, copie: '/copie' };
const FICHIER = 'packages/b/tests/b.test.ts';
const VERT = {
  rouge: false,
  aRepasser: false,
  arbitrer: false,
  auDeveloppeur: false,
  texte: '',
  complet: '',
  sansListe: '',
  avertissements: '',
  rouges: [],
  resume: 'résumé',
  horsTitre: [] as string[],
  ecartesRouges: [] as string[],
  testsLecteurs: [] as string[],
  lieux: [] as object[],
  references: [],
  tous: [] as object[],
  notes: [],
};
// The final pass red in a test file of the reader package packages/b, already extended to its tests.
const ROUGE = {
  ...VERT,
  rouge: true,
  auDeveloppeur: true,
  texte: 'texte',
  rouges: [{ paquet: 'b', texte: 'rouge' }],
  testsLecteurs: ['packages/b'],
  lieux: [{ fichier: FICHIER, gardes: [], dansLePlan: true, paquet: 'b' }],
  tous: [{ paquet: 'b', texte: 'rouge' }],
};

// The decision of the checks <k>, of the plan or final, under the memory <memoire>.
function decider(k: object, finale: boolean, memoire: Record<string, unknown>): Decision {
  const faits: Record<string, unknown> = {
    controles: k,
    mecanique: false,
    portes: { tests: [FICHIER], code: [], lecteurs: [FICHIER] },
    etendreAuxEcartes: null,
    etendreAuxTests: null,
    passeFinale: { arbre: 'T', restreinte: null },
    referencesDesRouges: [],
    lotAccepte: false,
  };
  const etat: Etat = { etape: CONTROLES as string, tentative: 1, rapport: null, finale };
  const lus: Record<string, unknown> = {};
  for (let i = 0; i < 50; i++) {
    const d = transition({ etat, ticket: TICKET, faits: lus, memoire });
    if (!d.besoin) {
      return d;
    }
    if (!(d.besoin.fait in faits)) {
      throw new Error(`fait non donné : ${d.besoin.fait}`);
    }
    lus[d.besoin.fait] = faits[d.besoin.fait];
  }
  throw new Error('trop de faits');
}

describe('les relances du testwriter comptent jusqu’à la passe finale verte', () => {
  it('des contrôles du plan verts gardent le compte des relances', () => {
    const memoire = { relancesTestwriter: 2 };
    const d = decider(VERT, false, memoire);
    expect(d.suivant).toMatchObject({ etape: CONTROLES, finale: true });
    expect({ ...memoire, ...d.memoire }).toMatchObject({ relancesTestwriter: 2 });
  });

  it('une passe finale verte remet le compte à zéro', () => {
    const d = decider(VERT, true, { relancesTestwriter: 2 });
    expect(d.arret).toBeUndefined();
    expect(d.memoire).toMatchObject({ relancesTestwriter: 0 });
  });

  it('un test de lecteur que le testwriter ne lève pas arrête le circuit sur « controles » à la troisième relance, par la suite que le circuit joue', () => {
    expect(RELANCES_TESTWRITER).toBe(2);
    let memoire: Record<string, unknown> = {};
    // One pass of the checks: its decision, the memory kept for the next.
    const passe = (k: object, finale: boolean) => {
      const d = decider(k, finale, memoire);
      memoire = { ...memoire, ...d.memoire };
      return d;
    };
    const relance = { etape: TESTS, tentative: 1 };
    const versLaFinale = { etape: CONTROLES, finale: true };
    // The checks of the plan green, then the final pass red in the test of the reader: relaunch 1.
    expect(passe(VERT, false).suivant).toMatchObject(versLaFinale);
    expect(passe(ROUGE, true).suivant).toMatchObject(relance);
    // The proof finds the file red: the checks restricted to it, red: relaunch 2.
    expect(passe(ROUGE, false).suivant).toMatchObject(relance);
    // The proof finds no red: the checks of the whole plan, green, then the final pass, red:
    // relaunch 3.
    expect(passe(VERT, false).suivant).toMatchObject(versLaFinale);
    const troisieme = passe(ROUGE, true);
    expect(troisieme.arret).toBeUndefined();
    expect(troisieme.suivant).toMatchObject(relance);
    expect(memoire).toMatchObject({ relancesTestwriter: 3 });
    // The checks restricted to the file, red again: the bound, the stop at those checks.
    const quatrieme = passe(ROUGE, false);
    expect(quatrieme.arret?.nom).toBe('controles');
    expect(quatrieme.suivant.etape).not.toBe(TESTS);
  });
});
