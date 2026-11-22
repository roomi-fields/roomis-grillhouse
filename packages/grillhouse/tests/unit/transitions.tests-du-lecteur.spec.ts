// Le rouge des tests d'un paquet lecteur (`testsLecteurs` du relevé des contrôles) : le circuit
// étend le plan à ces fichiers de test seuls (le fait `etendreAuxTests`), sans arrêt, à 3.1 comme à
// la passe finale ; le rouge, que les fichiers de test portent, va au testwriter, dans la limite
// des relances du testwriter ; un rouge de code d'un lecteur hors du plan arrête la passe finale
// comme avant.
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
const { CONTROLES, CODE, TESTS, RELANCES_TESTWRITER } = transitions as unknown as Record<
  string,
  string | number
>;

const TICKET = { id: 'essai-1', paquets: ['packages/a'], sorte: null, copie: '/copie' };
const FICHIER = 'packages/b/tests/b.test.ts';
const LIEU = { fichier: FICHIER, gardes: [], dansLePlan: true, paquet: 'b' };
const ROUGE = {
  rouge: true,
  aRepasser: false,
  arbitrer: false,
  auDeveloppeur: true,
  texte: 'texte',
  complet: 'complet',
  sansListe: 'sans liste',
  avertissements: '',
  rouges: [{ paquet: 'b', texte: 'rouge' }],
  resume: 'résumé',
  horsTitre: [] as string[],
  ecartesRouges: [] as string[],
  testsLecteurs: ['packages/b'],
  lieux: [LIEU],
  references: [],
  tous: [{ paquet: 'b', texte: 'rouge' }],
  notes: [],
};

function jouer(etat: Etat, faits: Record<string, unknown>, memoire: Record<string, unknown> = {}) {
  const lus: Record<string, unknown> = {};
  const demandes: { fait: string; [cle: string]: unknown }[] = [];
  for (let i = 0; i < 50; i++) {
    const d = transition({ etat, ticket: TICKET, faits: lus, memoire });
    if (!d.besoin) {
      return { d, demandes };
    }
    demandes.push(d.besoin);
    if (!(d.besoin.fait in faits)) {
      throw new Error(`fait non donné : ${d.besoin.fait}`);
    }
    lus[d.besoin.fait] = faits[d.besoin.fait];
  }
  throw new Error('trop de faits');
}
const aux = (finale: boolean): Etat => ({
  etape: CONTROLES as string,
  tentative: 1,
  rapport: null,
  finale,
});
const faits = (k: object, finale: boolean) => ({
  controles: k,
  mecanique: false,
  portes: { tests: [FICHIER], code: [], lecteurs: [FICHIER] },
  etendreAuxEcartes: null,
  etendreAuxTests: null,
  ...(finale ? { passeFinale: { arbre: 'T', restreinte: null }, referencesDesRouges: [] } : {}),
});

describe('le rouge des tests d’un paquet lecteur étend le plan à ces tests, sans arrêt', () => {
  it.each([
    ['aux contrôles', false],
    ['à la passe finale', true],
  ])(
    '%s : le plan s’étend aux tests du lecteur, puis le testwriter est relancé',
    (_nom, finale) => {
      const { d, demandes } = jouer(aux(finale), faits(ROUGE, finale));
      expect(demandes.find(b => b.fait === 'etendreAuxTests')).toMatchObject({
        fait: 'etendreAuxTests',
        composants: ['packages/b'],
      });
      expect(d.arret).toBeUndefined();
      expect(d.suivant).toMatchObject({ etape: TESTS, tentative: 1 });
    }
  );

  it('plusieurs lecteurs rouges entrent ensemble, une seule extension', () => {
    const k = { ...ROUGE, testsLecteurs: ['packages/b', 'packages/c'] };
    const { demandes } = jouer(aux(false), faits(k, false));
    expect(demandes.filter(b => b.fait === 'etendreAuxTests')).toEqual([
      expect.objectContaining({ composants: ['packages/b', 'packages/c'] }),
    ]);
  });

  it('l’extension porte les rouges au circuit, qui écrit sa pièce', () => {
    const { demandes } = jouer(aux(false), faits(ROUGE, false));
    expect(demandes.find(b => b.fait === 'etendreAuxTests')).toMatchObject({
      rouges: ROUGE.tous,
    });
  });
});

describe('les relances du testwriter que ces extensions font comptent dans la limite existante', () => {
  it('chaque renvoi compte une relance', () => {
    const { d } = jouer(aux(false), faits(ROUGE, false), { relancesTestwriter: 0 });
    expect(d.memoire).toMatchObject({ relancesTestwriter: 1 });
  });

  it('la limite atteinte, le circuit s’arrête sur « controles » comme avant', () => {
    const { d } = jouer(aux(false), faits(ROUGE, false), {
      relancesTestwriter: (RELANCES_TESTWRITER as number) + 1,
    });
    expect(d.arret?.nom).toBe('controles');
    expect(d.suivant.etape).not.toBe(CODE);
  });
});
