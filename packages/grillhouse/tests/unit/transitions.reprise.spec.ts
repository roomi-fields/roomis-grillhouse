// La reprise dans les décisions du circuit (scripts/transitions.mjs) : une étape dont l'empreinte
// est celle de son dernier vert se relit, un rouge se reprend à l'étape qui le porte, et un rouge
// d'un seul fichier de test rejoue ce fichier, puis les contrôles et la passe finale restreints.
// Modèle mûr : « Re-run failed jobs » de GitHub Actions (le job rouge et ses dépendants), une
// cible de Turborepo dont les entrées n'ont pas bougé se relit du cache.
import { describe, expect, it } from 'vitest';
import * as transitions from '../../scripts/transitions.mjs';

interface Effet {
  genre: string;
  etape?: string;
  texte?: string;
  entree?: Record<string, unknown>;
  evenement?: string;
}
interface Etat {
  etape: string;
  tentative: number;
  rapport: string | null;
  finale: boolean;
}
interface Decision {
  besoin?: { fait: string; [cle: string]: unknown };
  suivant: Etat;
  memoire: Record<string, unknown>;
  effets: Effet[];
  arret?: Record<string, unknown> & { nom: string };
}
interface Entree {
  etat: Etat;
  memoire?: Record<string, unknown>;
}
const transition = transitions.transition as unknown as (
  e: Entree & { ticket: object; faits: Record<string, unknown> }
) => Decision;
const T = transitions as unknown as Record<string, string> & { SEANCES_DEVELOPPEUR: number };
const { TESTS, PREUVE, CODE, CONTROLES, RELECTURE, INTEGRATION } = T;

const TICKET = { id: 'essai-1', paquets: ['packages/a'], sorte: null, copie: '/copie' };

// La décision de <entree>, chaque fait demandé donné par <faits> dans son ordre : la décision et
// les faits demandés, avec leurs paramètres. Un fait que <faits> ne tient pas fait échouer le test.
function jouer(entree: Entree, faits: Record<string, unknown> = {}) {
  const lus: Record<string, unknown> = {};
  const demandes: { fait: string; [cle: string]: unknown }[] = [];
  for (let i = 0; i < 50; i++) {
    const d = transition({ ticket: TICKET, ...entree, faits: lus });
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
const etat = (etape: string, o: Partial<Etat> = {}): Etat => ({
  etape,
  tentative: 1,
  rapport: null,
  finale: false,
  ...o,
});
const noms = (demandes: { fait: string }[]) => demandes.map(b => b.fait);

const VERT = {
  rouge: false,
  aRepasser: false,
  arbitrer: false,
  auDeveloppeur: false,
  texte: 'texte',
  complet: 'complet',
  sansListe: 'sans liste',
  avertissements: '',
  rouges: [],
  resume: 'résumé',
  horsTitre: [],
  lieux: [],
  references: [],
  tous: [],
  notes: [],
};
// Un test qui échoue n'a aucune garde ; un constat de garde ou de style en porte au moins une.
const rouge = (fichiers: string[], gardes: string[] = []) => ({
  ...VERT,
  rouge: true,
  auDeveloppeur: true,
  rouges: [{ paquet: 'packages/a', texte: 'rouge' }],
  lieux: fichiers.map(fichier => ({ fichier, gardes })),
  tous: [{ paquet: 'packages/a', texte: 'rouge' }],
});
const GARDE = ['tailles-des-tests'];
const TEST_X = 'packages/a/tests/x.spec.ts';
const TEST_Y = 'packages/a/tests/y.spec.ts';
const CODE_X = 'packages/a/src/x.ts';
const PORTES = { tests: [TEST_X, TEST_Y], code: [CODE_X] };
const preuveOk = (o: object = {}) => ({
  ok: true,
  rouges: 0,
  texte: 'T',
  resume: 'r',
  resultat: {},
  ...o,
});

describe('une étape à l’empreinte de son dernier vert se relit', () => {
  it('la preuve : relue sans se rejouer, la durée du dernier vert au ticket, puis l’étape qui suit', () => {
    const { d, demandes } = jouer(
      {
        etat: etat(PREUVE),
        memoire: { verts: { preuve: { empreinte: 'E1', rouges: 0, ms: 3000 } } },
      },
      { empreinteEtape: 'E1' }
    );
    expect(demandes[0]).toMatchObject({ fait: 'empreinteEtape', etape: 'preuve' });
    expect(noms(demandes)).not.toContain('preuve');
    expect(d.suivant).toMatchObject({ etape: CONTROLES, tentative: 0 });
    expect(d.effets.find(e => e.genre === 'commenter')?.texte).toMatch(/relu/);
    expect(d.effets.find(e => e.evenement === 'relue')).toMatchObject({
      genre: 'inscrire',
      entree: { etape: 'preuve', relue: { ms: 3000 } },
    });
  });

  it('la preuve relue d’un lot à rouges : le développeur, comme sa preuve d’alors', () => {
    const { d } = jouer(
      {
        etat: etat(PREUVE),
        memoire: { verts: { preuve: { empreinte: 'E1', rouges: 2, ms: 10 } } },
      },
      { empreinteEtape: 'E1' }
    );
    expect(d.suivant).toMatchObject({ etape: CODE, tentative: 1 });
  });

  it('la preuve dont l’empreinte a changé : rejouée, son empreinte gardée comme dernier vert', () => {
    const { d, demandes } = jouer(
      {
        etat: etat(PREUVE),
        memoire: { verts: { preuve: { empreinte: 'E1', rouges: 0, ms: 3000 } } },
      },
      { empreinteEtape: 'E2', preuve: preuveOk({ empreinte: 'E2', ms: 4000 }) }
    );
    expect(noms(demandes)).toEqual(['empreinteEtape', 'preuve']);
    expect(d.effets.some(e => e.evenement === 'relue')).toBe(false);
    expect(d.memoire.verts).toMatchObject({ preuve: { empreinte: 'E2', rouges: 0 } });
  });

  it('les contrôles du plan : relus sans se rejouer, puis la passe finale', () => {
    const { d, demandes } = jouer(
      {
        etat: etat(CONTROLES, { tentative: 0 }),
        memoire: { verts: { controles: { empreinte: 'C1', ms: 5000 } } },
      },
      { empreinteEtape: 'C1' }
    );
    expect(demandes[0]).toMatchObject({ fait: 'empreinteEtape', etape: 'controles' });
    expect(noms(demandes)).not.toContain('controles');
    expect(d.suivant).toMatchObject({ etape: CONTROLES, tentative: 0, finale: true });
    expect(d.effets.find(e => e.evenement === 'relue')).toMatchObject({
      entree: { etape: 'controles', relue: { ms: 5000 } },
    });
  });

  it('les contrôles dont une entrée a changé : rejoués, leur empreinte gardée', () => {
    const { d, demandes } = jouer(
      {
        etat: etat(CONTROLES, { tentative: 0 }),
        memoire: { verts: { controles: { empreinte: 'C1', ms: 5000 } } },
      },
      { empreinteEtape: 'C2', controles: { ...VERT, empreinte: 'C2' } }
    );
    expect(noms(demandes)).toContain('controles');
    expect(d.suivant).toMatchObject({ etape: CONTROLES, finale: true });
    expect(d.memoire.verts).toMatchObject({ controles: { empreinte: 'C2' } });
  });

  it('la passe finale : relue sans se rejouer, le lot accepté va à l’intégration sur l’arbre gardé', () => {
    const { d, demandes } = jouer(
      {
        etat: etat(CONTROLES, { tentative: 0, finale: true }),
        memoire: { verts: { 'passe-finale': { empreinte: 'F1', arbre: 'T1', ms: 9000 } } },
      },
      { empreinteEtape: 'F1', lotAccepte: true }
    );
    expect(demandes[0]).toMatchObject({ fait: 'empreinteEtape', etape: 'passe-finale' });
    expect(noms(demandes)).not.toContain('controles');
    expect(noms(demandes)).not.toContain('passeFinale');
    expect(demandes.find(b => b.fait === 'lotAccepte')).toMatchObject({ arbre: 'T1' });
    expect(d.suivant.etape).toBe(INTEGRATION);
    expect(d.memoire.verifie).toBe('T1');
    expect(d.effets.find(e => e.evenement === 'relue')).toMatchObject({
      entree: { etape: 'passe-finale', relue: { ms: 9000 } },
    });
  });

  it('la passe finale relue d’un lot que la relecture n’a pas accepté : la relecture', () => {
    const { d } = jouer(
      {
        etat: etat(CONTROLES, { tentative: 0, finale: true }),
        memoire: { verts: { 'passe-finale': { empreinte: 'F1', arbre: 'T1', ms: 9000 } } },
      },
      { empreinteEtape: 'F1', lotAccepte: false }
    );
    expect(d.suivant.etape).toBe(RELECTURE);
  });

  it('la passe finale verte garde son empreinte, son arbre et sa durée pour la relire', () => {
    const { d } = jouer(
      { etat: etat(CONTROLES, { tentative: 0, finale: true }) },
      {
        passeFinale: { arbre: 'T2', restreinte: null },
        controles: { ...VERT, empreinte: 'F2', ms: 7000 },
        lotAccepte: false,
      }
    );
    expect(d.memoire.verts).toMatchObject({
      'passe-finale': { empreinte: 'F2', arbre: 'T2', ms: 7000 },
    });
  });
});

describe('un rouge de contrôles se reprend à l’étape qui le porte', () => {
  it('un fichier de code du lot : le développeur relancé, ses contrôles rouges en rapport', () => {
    const { d, demandes } = jouer(
      { etat: etat(CONTROLES, { tentative: 0 }) },
      { controles: rouge([CODE_X]), mecanique: false, portes: PORTES }
    );
    expect(noms(demandes)).toContain('portes');
    expect(d.suivant).toMatchObject({ etape: CODE, tentative: 1, rapport: 'texte' });
  });

  it('un constat de garde ou de style sur un fichier de test du lot : le testwriter relancé, le rouge en rapport', () => {
    const { d } = jouer(
      { etat: etat(CONTROLES, { tentative: 0 }) },
      { controles: rouge([TEST_X], GARDE), mecanique: false, portes: PORTES }
    );
    expect(d.suivant).toMatchObject({ etape: TESTS, tentative: 1, rapport: 'texte' });
  });

  it('un test du lot qui échoue (aucune garde) : le développeur relancé, jamais le testwriter', () => {
    const { d } = jouer(
      { etat: etat(CONTROLES, { tentative: 0 }) },
      { controles: rouge([TEST_X]), mecanique: false, portes: PORTES }
    );
    expect(d.suivant).toMatchObject({ etape: CODE, tentative: 1, rapport: 'texte' });
  });

  it('un rouge sans fichier nommé : jamais attribué, il monte au superviseur', () => {
    const { d } = jouer(
      { etat: etat(CONTROLES, { tentative: 0 }) },
      { controles: rouge([]), mecanique: false, portes: PORTES }
    );
    expect(d.arret).toMatchObject({ nom: 'controles' });
  });

  it('un fichier que ni le testwriter ni le développeur ne portent : il monte, personne n’est relancé', () => {
    const { d } = jouer(
      { etat: etat(CONTROLES, { tentative: 0 }) },
      { controles: rouge(['packages/a/package.json']), mecanique: false, portes: PORTES }
    );
    expect(d.arret).toMatchObject({ nom: 'controles' });
  });

  it('la passe finale rouge dans un fichier de code : le développeur, comme avant', () => {
    const { d, demandes } = jouer(
      { etat: etat(CONTROLES, { finale: true, tentative: 0 }) },
      {
        passeFinale: { arbre: 'T', restreinte: null },
        controles: rouge([CODE_X]),
        referencesDesRouges: [],
        mecanique: false,
        portes: PORTES,
      }
    );
    expect(noms(demandes)).toContain('portes');
    expect(d.suivant).toMatchObject({ etape: CODE, tentative: 1 });
    expect(d.memoire.reprise ?? null).toBeNull();
  });

  it('la passe finale rouge sans fichier nommé : elle monte, aucune séance', () => {
    const { d } = jouer(
      { etat: etat(CONTROLES, { finale: true, tentative: 0 }) },
      {
        passeFinale: { arbre: 'T', restreinte: null },
        controles: rouge([]),
        referencesDesRouges: [],
        mecanique: false,
        portes: PORTES,
      }
    );
    expect(d.arret).toMatchObject({ nom: 'controles' });
  });

  it('un rouge ne laisse pas son étape en dernier vert', () => {
    const { d } = jouer(
      {
        etat: etat(CONTROLES, { finale: true, tentative: 0 }),
        memoire: {
          verts: {
            'passe-finale': { empreinte: 'F0', arbre: 'T0', ms: 1 },
            preuve: { empreinte: 'P' },
          },
        },
      },
      {
        empreinteEtape: 'F1',
        passeFinale: { arbre: 'T', restreinte: null },
        controles: rouge([CODE_X]),
        referencesDesRouges: [],
        mecanique: false,
        portes: PORTES,
      }
    );
    expect(d.memoire.verts).not.toHaveProperty('passe-finale');
    expect(d.memoire.verts).toMatchObject({ preuve: { empreinte: 'P' } });
  });
});

describe('un rouge de passe finale dû à un seul fichier de test rejoue ce fichier, puis le restreint', () => {
  const REPRISE = { fichiers: [TEST_X] };

  it('la passe finale rouge dans un seul fichier de test : le testwriter, la reprise gardée', () => {
    const { d } = jouer(
      { etat: etat(CONTROLES, { finale: true, tentative: 0 }) },
      {
        passeFinale: { arbre: 'T', restreinte: null },
        controles: rouge([TEST_X], GARDE),
        referencesDesRouges: [],
        mecanique: false,
        portes: PORTES,
      }
    );
    expect(d.suivant).toMatchObject({ etape: TESTS, tentative: 1, rapport: 'texte' });
    expect(d.memoire.reprise).toMatchObject(REPRISE);
  });

  it('la séance du testwriter ne porte que ce fichier, puis la preuve', () => {
    const { d, demandes } = jouer(
      { etat: etat(TESTS), memoire: { reprise: REPRISE } },
      { mecanique: false, sansTests: false, seance: { statut: 'FAIT' }, lecture: null }
    );
    expect(demandes.find(b => b.fait === 'seance')).toMatchObject({
      role: 'testwriter',
      fichiers: [TEST_X],
    });
    expect(d.suivant).toMatchObject({ etape: PREUVE });
  });

  it('la preuve ne joue que ce fichier, puis les contrôles : ni développeur ni relecture', () => {
    const { d, demandes } = jouer(
      { etat: etat(PREUVE), memoire: { reprise: REPRISE } },
      { preuve: preuveOk() }
    );
    expect(demandes.find(b => b.fait === 'preuve')).toMatchObject({ fichiers: [TEST_X] });
    expect(d.suivant).toMatchObject({ etape: CONTROLES, tentative: 0, finale: false });
  });

  it('les contrôles puis la passe finale se restreignent à ce fichier, la reprise s’éteint au vert', () => {
    const controles = jouer(
      { etat: etat(CONTROLES, { tentative: 0 }), memoire: { reprise: REPRISE } },
      { controles: VERT }
    );
    expect(controles.demandes.find(b => b.fait === 'controles')).toMatchObject({
      fichiers: [TEST_X],
    });
    expect(controles.d.suivant).toMatchObject({ etape: CONTROLES, finale: true });
    expect(controles.d.memoire.reprise ?? REPRISE).toMatchObject(REPRISE);

    const finale = jouer(
      { etat: etat(CONTROLES, { tentative: 0, finale: true }), memoire: { reprise: REPRISE } },
      { passeFinale: { arbre: 'T', restreinte: null }, controles: VERT, lotAccepte: false }
    );
    expect(finale.demandes.find(b => b.fait === 'controles')).toMatchObject({
      fichiers: [TEST_X],
    });
    expect(finale.d.memoire.reprise).toBeNull();
    expect(finale.d.suivant.etape).toBe(RELECTURE);
  });

  it('le rouge de la reprise restreinte nomme encore ce fichier : le testwriter, une séance de plus', () => {
    const { d } = jouer(
      { etat: etat(CONTROLES, { tentative: 0, finale: true }), memoire: { reprise: REPRISE } },
      {
        passeFinale: { arbre: 'T', restreinte: null },
        controles: rouge([TEST_X], GARDE),
        referencesDesRouges: [],
        mecanique: false,
        portes: PORTES,
      }
    );
    expect(d.suivant.etape).toBe(TESTS);
  });
});
