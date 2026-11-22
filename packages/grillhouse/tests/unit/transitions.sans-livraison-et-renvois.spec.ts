// The stops « sans-livraison » of the developpeur's step (scripts/transitions.mjs): a session that
// changes no file of the plan, then a second sending of his red to the testwriter on the same red
// output of the checks. The first sending is carried to the testwriter, the findings of the
// reviewer kept; a sending after checks that named another red goes on; the bilan keeps that the
// developpeur changed nothing (`inchange`) only when his session changed no file of the plan.
import { describe, expect, it } from 'vitest';
import * as transitions from '../../scripts/transitions.mjs';

interface Effet {
  genre: string;
  nom?: string;
  entree?: { inchange?: boolean };
}
interface Decision {
  besoin?: { fait: string };
  suivant: { etape: string; tentative: number; rapport: string | null };
  memoire: Record<string, unknown>;
  effets: Effet[];
  arret?: { nom: string; rapport: string };
}
const T = transitions as unknown as Record<string, string> & {
  transition: (e: object) => Decision;
};
const { CODE, CONTROLES, TESTS } = T;

const TICKET = {
  id: 'essai-1',
  paquets: ['packages/forms', 'packages/binder'],
  sorte: null,
  copie: '/copie',
};
const etat = (etape: string) => ({ etape, tentative: 1, rapport: null, finale: false });

// The decision of <entree>, each fact it asks for given from <faits>.
function jouer(entree: object, faits: Record<string, unknown>) {
  const lus: Record<string, unknown> = {};
  for (let i = 0; i < 50; i++) {
    const d = T.transition({ ticket: TICKET, ...entree, faits: lus });
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
const FAIT = { statut: 'FAIT' };
const RENVOI = 'Le développeur renvoie le rouge qui reste aux tests du lot.';
const faits = (o: object = {}) => ({
  empreinteAvant: 'A',
  seance: FAIT,
  renvoi: null,
  lecture: null,
  empreinte: 'B',
  passation: 'La passation.',
  ...o,
});
const inchanges = (d: Decision) =>
  d.effets.filter(e => e.genre === 'inscrire' && e.entree?.inchange === true);

describe('une séance du développeur qui ne change aucun fichier du plan', () => {
  const rien = jouer({ etat: etat(CODE) }, faits({ empreinte: 'A' }));

  it('ne s’arrête pas : les contrôles jugent le lot, le geste « rien à livrer » est joué', () => {
    expect(rien.arret).toBeUndefined();
    expect(rien.suivant.etape).toBe(CONTROLES);
    expect(rien.effets.filter(e => e.genre === 'geste').map(e => e.nom)).toEqual(['rien-a-livrer']);
  });

  it('garde en mémoire le rapport du futur arrêt : les paquets du plan et la passation', () => {
    expect(String(rien.memoire.rienALivrer)).toContain('(packages/forms, packages/binder)');
    expect(String(rien.memoire.rienALivrer)).toContain('La passation.');
  });

  it('le bilan garde qu’il n’a rien changé', () => {
    expect(inchanges(rien)).toHaveLength(1);
  });

  it('des contrôles rouges ensuite arrêtent à « sans-livraison » au développeur, le rapport gardé', () => {
    const rouge = {
      rouge: true,
      auDeveloppeur: true,
      aRepasser: false,
      arbitrer: false,
      texte: 'T',
      complet: 'T',
      sansListe: 'T',
      avertissements: '',
      resume: 'r',
      rouges: [{ paquet: 'forms', texte: 'rouge' }],
      tous: [{ paquet: 'forms', texte: 'rouge' }],
      lieux: [{ fichier: 'packages/forms/src/index.mjs', gardes: [] }],
      horsTitre: [],
      references: [],
      notes: [],
    };
    const d = jouer(
      { etat: etat(CONTROLES), memoire: { rienALivrer: rien.memoire.rienALivrer } },
      { controles: rouge, mecanique: false }
    );
    expect(d.arret?.nom).toBe('sans-livraison');
    expect(d.arret?.rapport).toContain('(packages/forms, packages/binder)');
    expect(d.arret?.rapport).toContain('La passation.');
  });
});

describe('le développeur qui renvoie son rouge au testwriter', () => {
  it('le premier renvoi va au testwriter, les constats du relecteur restent gardés, ses contrôles aucun', () => {
    const d = jouer({ etat: etat(CODE), memoire: {} }, faits({ renvoi: RENVOI }));
    expect(d.suivant).toMatchObject({ etape: TESTS, tentative: 1, rapport: RENVOI });
    // The decision changes no finding of the reviewer: the circuit's memory keeps them all.
    expect(Object.keys(d.memoire)).not.toContain('constats');
    expect(d.memoire.renvoiAuTestwriter).toBe('');
  });

  it('un second renvoi après des contrôles qui nomment un autre rouge va au testwriter, le rouge nommé retenu', () => {
    const d = jouer(
      {
        etat: etat(CODE),
        memoire: { controlesRouges: 'critère 1 — mesure rend le double', renvoiAuTestwriter: '' },
      },
      faits({ renvoi: RENVOI })
    );
    expect(d.arret).toBeUndefined();
    expect(d.suivant.etape).toBe(TESTS);
    expect(d.memoire.renvoiAuTestwriter).toBe('critère 1 — mesure rend le double');
  });

  it('un second renvoi sans contrôles verts entre eux, sur la même sortie rouge, arrête à « sans-livraison »', () => {
    const d = jouer(
      { etat: etat(CODE), memoire: { controlesRouges: 'S', renvoiAuTestwriter: 'S' } },
      faits({ renvoi: RENVOI })
    );
    expect(d.arret?.nom).toBe('sans-livraison');
    expect(d.arret?.rapport).toContain('deuxième fois de suite au testwriter');
    expect(d.arret?.rapport).toContain('même sortie rouge des contrôles');
    expect(d.arret?.rapport).toContain(RENVOI);
  });

  it('sans contrôles entre les deux renvois, la sortie vide est la même : arrêt au second', () => {
    const d = jouer(
      { etat: etat(CODE), memoire: { renvoiAuTestwriter: '' } },
      faits({ renvoi: RENVOI })
    );
    expect(d.arret?.nom).toBe('sans-livraison');
  });

  it('le bilan garde « inchangé » à l’arrêt du second renvoi seulement quand sa séance ne change aucun fichier du plan', () => {
    const memoire = { controlesRouges: 'S', renvoiAuTestwriter: 'S' };
    const change = jouer({ etat: etat(CODE), memoire }, faits({ renvoi: RENVOI, empreinte: 'B' }));
    expect(inchanges(change)).toEqual([]);
    const rien = jouer({ etat: etat(CODE), memoire }, faits({ renvoi: RENVOI, empreinte: 'A' }));
    expect(inchanges(rien)).toHaveLength(1);
  });
});

describe('un plan dont aucun paquet ne joue de tests', () => {
  const d = jouer({ etat: etat(TESTS) }, { mecanique: false, sansTests: true });

  it('lance le développeur directement : ni testwriter ni preuve', () => {
    expect(d.arret).toBeUndefined();
    expect(d.suivant).toMatchObject({ etape: CODE, tentative: 1 });
  });

  it('le dit au ticket et dans le rapport du développeur, le plan nommé', () => {
    const textes = d.effets
      .filter(e => e.genre === 'commenter')
      .map(e => (e as unknown as { texte: string }).texte);
    expect(textes.join('\n')).toContain(
      'aucun test dans le plan (aucun paquet qui joue des tests ne le tient)'
    );
    expect(d.suivant.rapport).toContain(
      'Le plan (packages/forms, packages/binder) ne porte aucun test'
    );
  });
});
