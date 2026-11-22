// A red of the checks that names a test file of the lot goes to the testwriter, who writes it
// (scripts/reprise.mjs `attribuerLeRouge`, scripts/transitions.mjs): the file a guard refuses, or
// the file the message of a failed test names (a guard written as a test, which lists what it
// finds), even after a developpeur who had nothing to deliver. A red in code stays the
// developpeur's. Mature model: a failed check goes back to the author of the file it names (Gerrit).
import { describe, expect, it } from 'vitest';
import { attribuerLeRouge as attribuer } from '../../scripts/reprise.mjs';
import * as transitions from '../../scripts/transitions.mjs';

interface Lieu {
  fichier: string | null;
  gardes?: string[];
  nommes?: string[];
  dansLePlan?: boolean;
}
interface Decision {
  besoin?: { fait: string };
  suivant: { etape: string; tentative: number; rapport: string | null };
  memoire: Record<string, unknown>;
  effets: object[];
  arret?: { nom: string };
}
const attribuerLeRouge = attribuer as unknown as (e: {
  lieux: Lieu[];
  portes: { tests: string[]; code: string[] };
}) => { etape: string | null; fichiers: string[] };
const T = transitions as unknown as Record<string, string> & {
  transition: (e: object) => Decision;
};
const { CODE, CONTROLES, TESTS } = T;

const GARDE = 'packages/a/tests/dossiers-d-essai.spec.ts';
const NEUF = 'packages/a/tests/neuf.spec.ts';
const AUTRE = 'packages/a/tests/autre.spec.ts';
const CODE_X = 'packages/a/src/x.ts';
// The testwriter carries the test file of the lot; the developpeur, the guard the lot does not
// change and the code.
const PORTES = { tests: [NEUF], code: [GARDE, CODE_X] };

describe('un rouge qui nomme un fichier de test du lot s’attribue au testwriter', () => {
  it('un test hors du lot qui échoue et dont le message nomme un fichier de test du lot : le testwriter, ce fichier nommé', () => {
    const r = attribuerLeRouge({
      lieux: [{ fichier: GARDE, gardes: [], nommes: [NEUF] }],
      portes: PORTES,
    });
    expect(r.etape).toBe('testwriter');
    expect(r.fichiers).toContain(NEUF);
  });

  it('le même test qui échoue sans nommer de fichier du lot : le développeur', () => {
    expect(
      attribuerLeRouge({ lieux: [{ fichier: GARDE, gardes: [], nommes: [] }], portes: PORTES })
    ).toMatchObject({ etape: 'developpeur', fichiers: [GARDE] });
  });

  it('un message qui nomme un fichier que le testwriter ne porte pas : le développeur', () => {
    expect(
      attribuerLeRouge({
        lieux: [{ fichier: GARDE, gardes: [], nommes: [CODE_X] }],
        portes: PORTES,
      })
    ).toMatchObject({ etape: 'developpeur', fichiers: [GARDE] });
  });

  it('un test du lot qui échoue sans rien nommer reste au développeur', () => {
    expect(
      attribuerLeRouge({ lieux: [{ fichier: NEUF, gardes: [] }], portes: PORTES })
    ).toMatchObject({ etape: 'developpeur', fichiers: [NEUF] });
  });

  it('un test du lot qui échoue et dont le message nomme un autre test du lot reste au développeur', () => {
    const portes = { tests: [NEUF, AUTRE], code: [GARDE, CODE_X] };
    expect(
      attribuerLeRouge({ lieux: [{ fichier: NEUF, gardes: [], nommes: [AUTRE] }], portes })
    ).toMatchObject({ etape: 'developpeur', fichiers: [NEUF] });
  });

  it('un rouge dans du code reste au développeur', () => {
    expect(
      attribuerLeRouge({ lieux: [{ fichier: CODE_X, gardes: [] }], portes: PORTES })
    ).toMatchObject({ etape: 'developpeur', fichiers: [CODE_X] });
  });
});

const TICKET = { id: 'essai-1', paquets: ['packages/a'], sorte: null, copie: '/copie' };
// The marker of the workflow of a ticket (src/temporal/circuit/deroule.ts) under which the
// attribution of a red comes before the stop « sans-livraison »; a run recorded before it keeps
// the former order.
const MARQUEURS = { attributionAvantSansLivraison: true };

// The decision of <entree>, each fact it asks for given from <faits>.
function jouer(entree: object, faits: Record<string, unknown>) {
  const lus: Record<string, unknown> = {};
  for (let i = 0; i < 50; i++) {
    const d = T.transition({ ticket: TICKET, marqueurs: MARQUEURS, ...entree, faits: lus });
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
const rouge = (lieux: Lieu[]) => ({
  rouge: true,
  auDeveloppeur: true,
  aRepasser: false,
  arbitrer: false,
  texte: 'T',
  complet: 'T',
  sansListe: 'T',
  avertissements: '',
  resume: 'r',
  rouges: [{ paquet: 'packages/a', texte: 'rouge' }],
  tous: [{ paquet: 'packages/a', texte: 'rouge' }],
  lieux,
  horsTitre: [],
  references: [],
  notes: [],
});
const etat = (tentative: number) => ({
  etape: CONTROLES,
  tentative,
  rapport: null,
  finale: false,
});
const RIEN = 'La séance 1 du développeur ne change aucun fichier du plan.';

describe('des contrôles rouges sur un fichier de test du lot relancent le testwriter', () => {
  it('un test hors du lot dont le message nomme un fichier de test du lot : le testwriter, le rouge en rapport', () => {
    const d = jouer(
      { etat: etat(0) },
      {
        controles: rouge([{ fichier: GARDE, gardes: [], nommes: [NEUF] }]),
        mecanique: false,
        portes: PORTES,
      }
    );
    expect(d.arret).toBeUndefined();
    expect(d.suivant).toMatchObject({ etape: TESTS, tentative: 1, rapport: 'T' });
    expect(JSON.stringify(d.effets)).toContain(NEUF);
  });

  it('après un développeur qui n’avait rien à livrer : le testwriter, sans arrêt « sans-livraison »', () => {
    const d = jouer(
      { etat: etat(1), memoire: { rienALivrer: RIEN } },
      {
        controles: rouge([{ fichier: GARDE, gardes: [], nommes: [NEUF] }]),
        mecanique: false,
        portes: PORTES,
      }
    );
    expect(d.arret).toBeUndefined();
    expect(d.suivant).toMatchObject({ etape: TESTS, tentative: 1 });
    expect(d.memoire.rienALivrer).toBeNull();
  });

  it('après un développeur qui n’avait rien à livrer, un fichier de test du lot qu’une garde refuse : le testwriter', () => {
    const d = jouer(
      { etat: etat(1), memoire: { rienALivrer: RIEN } },
      {
        controles: rouge([{ fichier: NEUF, gardes: ['tailles-des-tests'] }]),
        mecanique: false,
        portes: PORTES,
      }
    );
    expect(d.arret).toBeUndefined();
    expect(d.suivant).toMatchObject({ etape: TESTS, tentative: 1 });
  });

  it('après un développeur qui n’avait rien à livrer, un rouge dans du code arrête à « sans-livraison », au développeur', () => {
    const d = jouer(
      { etat: etat(1), memoire: { rienALivrer: RIEN } },
      {
        controles: rouge([{ fichier: CODE_X, gardes: [] }]),
        mecanique: false,
        portes: PORTES,
      }
    );
    expect(d.arret).toMatchObject({ nom: 'sans-livraison', etape: CODE });
  });

  it('sans le marqueur du déroulé, l’ancien ordre : « sans-livraison » avant toute attribution, le fait « portes » jamais demandé', () => {
    const d = jouer(
      { etat: etat(1), memoire: { rienALivrer: RIEN }, marqueurs: undefined },
      { controles: rouge([{ fichier: GARDE, gardes: [], nommes: [NEUF] }]), mecanique: false }
    );
    expect(d.arret).toMatchObject({ nom: 'sans-livraison', etape: CODE });
  });

  it('un rouge dans du code relance le développeur', () => {
    const d = jouer(
      { etat: etat(0) },
      { controles: rouge([{ fichier: CODE_X, gardes: [] }]), mecanique: false, portes: PORTES }
    );
    expect(d.suivant).toMatchObject({ etape: CODE, tentative: 1 });
  });
});
