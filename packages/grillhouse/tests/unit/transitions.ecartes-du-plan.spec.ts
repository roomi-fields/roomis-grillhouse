// Le rouge d'un composant que le plan avait écarté du relevé (`ecartesRouges` du relevé des
// contrôles, scripts/activites.mjs) : le circuit étend le plan à ce paquet (le fait
// `etendreAuxEcartes`, que le circuit joue) puis le rouge va au développeur, aux contrôles de 3.1
// comme à la passe finale, sans arrêt. Un rouge hors du plan que les écartés ne nomment pas arrête
// toujours le circuit. Les ensembles des écartés qui restent lisibles après le plan (`ecartesDuPlan`,
// scripts/circuit.mjs) : ceux de la dernière fiche du plan, réponse comprise, moins les paquets
// que le plan a gagnés.
import { describe, expect, it } from 'vitest';
import * as circuit from '../../scripts/circuit.mjs';
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
}
const transition = transitions.transition as (e: {
  etat: Etat;
  ticket: object;
  faits: Record<string, unknown>;
}) => Decision;
const { CONTROLES, CODE } = transitions as unknown as Record<string, string>;
const ecartesDuPlan = circuit.ecartesDuPlan as (
  plans: { fiche: { ecartes?: { composant: string; raison: string }[] }; reponse?: boolean }[],
  paquets: string[],
  resoudre: (p: string) => string
) => string[];

const TICKET = { id: 'essai-1', paquets: ['packages/a'], sorte: null, copie: '/copie' };
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
  ecartesRouges: ['packages/b'],
  lieux: [{ fichier: 'packages/b/x.ts', gardes: [] }],
  references: [],
  tous: [{ paquet: 'b', texte: 'rouge' }],
  notes: [],
};

// La décision de l'état <etat> : chaque fait demandé se donne de <faits>, son nom et ses
// paramètres rendus dans `demandes`.
function jouer(etat: Etat, faits: Record<string, unknown>) {
  const lus: Record<string, unknown> = {};
  const demandes: { fait: string; [cle: string]: unknown }[] = [];
  for (let i = 0; i < 50; i++) {
    const d = transition({ etat, ticket: TICKET, faits: lus });
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
  etape: CONTROLES,
  tentative: 1,
  rapport: null,
  finale,
});
const faits = (k: object, finale: boolean) => ({
  controles: k,
  mecanique: false,
  portes: { tests: [], code: ['packages/b/x.ts'] },
  etendreAuxEcartes: null,
  ...(finale ? { passeFinale: { arbre: 'T', restreinte: null }, referencesDesRouges: [] } : {}),
});

describe('le rouge d’un composant écarté entre au plan sans arrêt', () => {
  it.each([
    ['aux contrôles', false],
    ['à la passe finale', true],
  ])('%s : le plan s’étend à l’écarté, puis le rouge va au développeur', (_nom, finale) => {
    const { d, demandes } = jouer(aux(finale), faits(ROUGE, finale));
    expect(demandes.find(b => b.fait === 'etendreAuxEcartes')).toMatchObject({
      fait: 'etendreAuxEcartes',
      composants: ['packages/b'],
    });
    expect(d.arret).toBeUndefined();
    expect(d.suivant).toMatchObject({ etape: CODE, tentative: 2 });
  });

  it('plusieurs écartés rouges entrent ensemble, une seule extension', () => {
    const k = { ...ROUGE, ecartesRouges: ['packages/b', 'packages/c'] };
    const { demandes } = jouer(aux(false), faits(k, false));
    expect(demandes.filter(b => b.fait === 'etendreAuxEcartes')).toEqual([
      expect.objectContaining({ composants: ['packages/b', 'packages/c'] }),
    ]);
  });

  it('un rouge sans écarté n’étend rien', () => {
    const k = { ...ROUGE, ecartesRouges: [] };
    const { demandes } = jouer(aux(false), faits(k, false));
    expect(demandes.map(b => b.fait)).not.toContain('etendreAuxEcartes');
  });

  it('un rouge hors du plan que les écartés ne nomment pas arrête toujours la passe finale', () => {
    const k = { ...ROUGE, auDeveloppeur: false, ecartesRouges: [], horsTitre: ['packages/z'] };
    const { d, demandes } = jouer(aux(true), faits(k, true));
    expect(d.arret?.nom).toBe('controles');
    expect(demandes.map(b => b.fait)).not.toContain('etendreAuxEcartes');
  });
});

describe('les écartés du plan restent lisibles après le plan', () => {
  const resoudre = (p: string) => (p.startsWith('packages/') ? p : `packages/${p}`);
  const fiche = (...composants: string[]) => ({
    fiche: { ecartes: composants.map(composant => ({ composant, raison: 'inchangé' })) },
  });

  it('rend les dossiers des écartés de la dernière fiche du plan', () => {
    expect(ecartesDuPlan([fiche('x'), fiche('b', 'c')], ['packages/a'], resoudre)).toEqual([
      'packages/b',
      'packages/c',
    ]);
  });

  it('une réponse qui ne dit pas ses écartés garde ceux du plan qu’elle répond', () => {
    const reponse = { fiche: {}, reponse: true };
    expect(ecartesDuPlan([fiche('b'), reponse], ['packages/a'], resoudre)).toEqual(['packages/b']);
  });

  it('un écarté qui entre au plan, par le circuit ou le superviseur, sort de la liste', () => {
    expect(ecartesDuPlan([fiche('b', 'c')], ['packages/a', 'packages/b'], resoudre)).toEqual([
      'packages/c',
    ]);
  });

  it('sans fiche du plan, aucun écarté', () => {
    expect(ecartesDuPlan([], ['packages/a'], resoudre)).toEqual([]);
  });
});
