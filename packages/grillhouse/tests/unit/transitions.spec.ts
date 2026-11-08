// The decisions of the circuit of a ticket (scripts/transitions.mjs, grillhouse-4nr.5): the content
// of the branches of `derouler` (scripts/circuit.mjs) in functions without input nor output, as a
// workflow of Temporal decides on the results of its activities. For each step of the circuit and
// each fact read there, the table gives the step that follows, its attempt, its report, the flag
// of the final pass and the stop (its name), as the branches of `derouler` gave them; and the guard
// holds the module, and the list of the steps it reads, out of every reading of the machine.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import * as transitions from '../../scripts/transitions.mjs';

const SCRIPTS = path.resolve(__dirname, '../../scripts');

interface Effet {
  genre: string;
  etape?: string;
  texte?: string;
  nom?: string;
  resultat?: unknown;
  rapport?: string;
  entree?: Record<string, unknown>;
}
interface Etat {
  etape: string;
  tentative: number;
  rapport: string | null;
  finale: boolean;
  relanceSurLeRefus?: boolean;
}
interface Decision {
  besoin?: { fait: string; [cle: string]: unknown };
  suivant: Etat;
  memoire: Record<string, unknown>;
  effets: Effet[];
  arret?: Record<string, unknown> & { nom: string };
  fin?: { code: number };
  usage?: string;
}
interface Entree {
  etat: Etat;
  memoire?: Record<string, unknown>;
  ticket?: Record<string, unknown>;
  reprend?: boolean;
  faits?: Record<string, unknown>;
}
const transition = transitions.transition as (e: Entree & { ticket: object }) => Decision;
const T = transitions as unknown as Record<string, string> & {
  RELANCES_TESTWRITER: number;
  SEANCES_DEVELOPPEUR: number;
  RELECTURES: number;
};
const { GESTE, TESTS, PREUVE, CODE, CONTROLES, REFERENCES, RELECTURE, INTEGRATION, EN_FILE, TRI } =
  T;

const TICKET = {
  id: 'essai-1',
  paquets: ['packages/a'],
  sorte: null as object | null,
  copie: '/copie',
};

// The decision of <entree>, each fact it asks for given from <faits> in its order: the decision
// and the facts it asked for, with their parameters. A fact <faits> does not hold fails the test.
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
const genres = (d: Decision) =>
  d.effets.map(e => (e.genre === 'geste' ? `geste:${e.nom}` : e.genre));

const FAIT = { statut: 'FAIT' };
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
const ROUGE = {
  ...VERT,
  rouge: true,
  auDeveloppeur: true,
  rouges: [{ paquet: 'a', texte: 'rouge' }],
  lieux: [{ fichier: 'packages/a/x.ts', gardes: [] }],
  tous: [{ paquet: 'a', texte: 'rouge' }],
};

describe('un tableau de transitions par étape', () => {
  describe('2 Tests, et la route après le plan', () => {
    it.each([
      ['un plan mécanique : le geste', { mecanique: true, sansTests: false }, GESTE, 1],
      ['un plan sans tests : le développeur', { mecanique: false, sansTests: true }, CODE, 1],
    ])('%s', (_nom, faits, etape, tentative) => {
      const { d } = jouer(
        { etat: etat(TESTS), ticket: { ...TICKET, sorte: { genre: 'mécanique', raison: 'r' } } },
        faits
      );
      expect(d.suivant).toMatchObject({ etape, tentative });
      expect(d.arret).toBeUndefined();
    });

    it('le testwriter FAIT : la preuve, aucun contrôle rouge gardé', () => {
      const { d, demandes } = jouer(
        { etat: etat(TESTS), memoire: { controlesRouges: 'x' } },
        { mecanique: false, sansTests: false, seance: FAIT, lecture: null }
      );
      expect(demandes.map(b => b.fait)).toEqual(['mecanique', 'sansTests', 'seance', 'lecture']);
      expect(demandes[2]).toMatchObject({ role: 'testwriter', tentative: 1, derniere: false });
      expect(d.suivant).toMatchObject({ etape: PREUVE, tentative: 1 });
      expect(d.memoire).toEqual({ controlesRouges: null });
      expect(genres(d)).toEqual(['commenter']);
    });

    it.each([
      ['BESOIN', 'besoin'],
      ['BLOQUÉ', 'hors-portee'],
    ])('le testwriter %s : l’arrêt %s, avec sa fiche', (statut, nom) => {
      const fiche = { statut };
      const { d } = jouer(
        { etat: etat(TESTS) },
        { mecanique: false, sansTests: false, seance: fiche }
      );
      expect(d.arret).toEqual({ nom, statut: { role: 'testwriter', tentative: 1, fiche } });
    });

    it('la copie ne se lit plus : le testwriter relancé, puis l’arrêt controles au bout', () => {
      const faits = { mecanique: false, sansTests: false, seance: FAIT, lecture: { rapport: 'R' } };
      const { d } = jouer({ etat: etat(TESTS) }, faits);
      expect(d.suivant).toMatchObject({ etape: TESTS, tentative: 2, rapport: 'R' });
      const max = T.RELANCES_TESTWRITER + 1;
      const fin = jouer({ etat: etat(TESTS, { tentative: max }) }, faits).d;
      expect(fin.arret).toMatchObject({ nom: 'controles', rapport: 'R' });
      expect(fin.memoire).toEqual({ controlesRouges: null });
    });
  });

  describe('1.1 Geste mécanique', () => {
    const ticket = { ...TICKET, sorte: { genre: 'mécanique', raison: 'r', commande: 'mv a b' } };
    it('une reprise dont la copie porte le geste : aux contrôles, sans séance', () => {
      const { d, demandes } = jouer(
        { etat: etat(GESTE), ticket, reprend: true },
        { livreAvant: true }
      );
      expect(demandes.map(b => b.fait)).toEqual(['livreAvant']);
      expect(d.suivant).toMatchObject({ etape: CONTROLES, tentative: 0 });
    });
    it('la commande jouée : aux contrôles', () => {
      const { d } = jouer({ etat: etat(GESTE), ticket }, { seanceDuGeste: FAIT, livre: true });
      expect(d.suivant).toMatchObject({ etape: CONTROLES, tentative: 0 });
    });
    it('la commande ne change rien : sans-livraison, la commande en pièce', () => {
      const { d } = jouer({ etat: etat(GESTE), ticket }, { seanceDuGeste: FAIT, livre: false });
      expect(d.arret?.nom).toBe('sans-livraison');
      expect(d.arret?.piece).toContain('$ mv a b');
    });
    it('l’explorateur BLOQUÉ : hors-portee', () => {
      const { d } = jouer({ etat: etat(GESTE), ticket }, { seanceDuGeste: { statut: 'BLOQUÉ' } });
      expect(d.arret).toMatchObject({ nom: 'hors-portee', statut: { role: 'explorateur' } });
    });
  });

  describe('2.1 Preuve du rouge', () => {
    const preuve = (o: object) => ({
      ok: true,
      rouges: 0,
      texte: 'T',
      resume: 'r',
      resultat: {},
      ...o,
    });
    it.each([
      ['des rouges : au développeur', { rouges: 2 }, {}, null, CODE, 1],
      ['aucun rouge, un lot de tests seul : aux contrôles', {}, {}, null, CONTROLES, 0],
      [
        'aucun rouge, un constat au développeur',
        {},
        { constats: [{ role: 'developpeur' }] },
        null,
        CODE,
        1,
      ],
      ['aucun rouge, comportement inchangé', {}, {}, { inchange: true }, CODE, 1],
    ])('%s', (_nom, p, memoire, sorte, etape, tentative) => {
      const { d } = jouer(
        { etat: etat(PREUVE), memoire, ticket: { ...TICKET, sorte } },
        { preuve: preuve(p) }
      );
      expect(d.suivant).toMatchObject({ etape, tentative, rapport: 'T' });
      expect(genres(d)).toEqual(['rapport']);
    });
    it('une preuve refusée : le testwriter relancé, puis l’arrêt preuve', () => {
      const p = { preuve: preuve({ ok: false }) };
      expect(jouer({ etat: etat(PREUVE) }, p).d.suivant).toMatchObject({
        etape: TESTS,
        tentative: 2,
      });
      const fin = jouer({ etat: etat(PREUVE, { tentative: T.RELANCES_TESTWRITER + 1 }) }, p).d;
      expect(fin.arret).toMatchObject({ nom: 'preuve', rapport: 'T' });
    });
  });

  describe('3 Code', () => {
    const faits = (o: object = {}) => ({
      empreinteAvant: 'A',
      seance: FAIT,
      renvoi: null,
      lecture: null,
      empreinte: 'B',
      ...o,
    });
    it('un lot changé : aux contrôles, la séance demandée avec ses options', () => {
      const { d, demandes } = jouer({ etat: etat(CODE) }, faits());
      expect(demandes.map(b => b.fait)).toEqual([
        'empreinteAvant',
        'seance',
        'renvoi',
        'lecture',
        'empreinte',
      ]);
      expect(demandes[1]).toMatchObject({ role: 'developpeur', tentative: 1, fort: false });
      expect(d.suivant).toMatchObject({ etape: CONTROLES, tentative: 1 });
    });
    it('la dernière séance sur le modèle fort ; la relance sur le refus dit ce qui change', () => {
      const { demandes, d } = jouer(
        { etat: etat(CODE, { tentative: T.SEANCES_DEVELOPPEUR, relanceSurLeRefus: true }) },
        faits()
      );
      expect(demandes[1]).toMatchObject({ fort: true, derniere: true });
      expect(demandes[1].change).toBe(transitions.CHANGE_DU_REFUS);
      expect(d.suivant.relanceSurLeRefus).toBe(false);
    });
    it('le commentaire d’une séance forte nomme opus sans effort, celui des autres ne nomme aucun modèle', () => {
      const texteDuCommentaire = (tentative: number) => {
        const { d } = jouer({ etat: etat(CODE, { tentative }) }, faits());
        return d.effets.filter(e => e.genre === 'commenter').map(e => e.texte ?? '');
      };
      const forte = texteDuCommentaire(T.SEANCES_DEVELOPPEUR).join('\n');
      expect(forte).toContain('opus');
      expect(forte).not.toMatch(/effort|high/);
      const premiere = texteDuCommentaire(1).join('\n');
      expect(premiere).not.toMatch(/opus|effort|high/);
    });
    it('BESOIN : besoin ; BLOQUÉ : hors-portee ; hors du plan : hors-portee', () => {
      expect(
        jouer({ etat: etat(CODE) }, faits({ seance: { statut: 'BESOIN' } })).d.arret?.nom
      ).toBe('besoin');
      expect(
        jouer({ etat: etat(CODE) }, faits({ seance: { statut: 'BLOQUÉ' } })).d.arret?.nom
      ).toBe('hors-portee');
      const hors = jouer({ etat: etat(CODE) }, faits({ seance: { ...FAIT, hors_plan: [{}] } })).d;
      expect(hors.arret).toMatchObject({ nom: 'hors-portee', horsDuPlan: { tentative: 1 } });
    });
    it('un renvoi au testwriter : le testwriter, puis sans-livraison au second sur la même sortie', () => {
      const { d } = jouer(
        { etat: etat(CODE, { finale: true }), memoire: { controlesRouges: 'S' } },
        faits({ renvoi: 'RENVOI' })
      );
      expect(d.suivant).toMatchObject({
        etape: TESTS,
        tentative: 1,
        rapport: 'RENVOI',
        finale: false,
      });
      expect(d.memoire).toEqual({ renvoiAuTestwriter: 'S' });
      expect(genres(d)).toEqual(['commenter', 'geste:renvoi-au-testwriter']);
      const encore = jouer(
        { etat: etat(CODE), memoire: { controlesRouges: 'S', renvoiAuTestwriter: 'S' } },
        faits({ renvoi: 'RENVOI', empreinte: 'A' })
      ).d;
      expect(encore.arret?.nom).toBe('sans-livraison');
      expect(genres(encore)).toEqual(['inscrire']);
    });
    it('la copie ne se lit plus : le développeur relancé, puis controles', () => {
      const { d } = jouer({ etat: etat(CODE) }, faits({ lecture: { rapport: 'R' } }));
      expect(d.suivant).toMatchObject({ etape: CODE, tentative: 2, rapport: 'R' });
      const max = T.SEANCES_DEVELOPPEUR;
      expect(
        jouer({ etat: etat(CODE, { tentative: max }) }, faits({ lecture: { rapport: 'R' } })).d
          .arret?.nom
      ).toBe('controles');
    });
    it('le lot refusé, inchangé : relancé une fois sur le refus, puis sans-livraison', () => {
      const refus = { rapport: 'REFUS', piece: 'P', empreinte: 'A', lance: true, relance: false };
      const { d } = jouer({ etat: etat(CODE), memoire: { refus } }, faits({ empreinte: 'A' }));
      expect(d.suivant).toMatchObject({ etape: CODE, tentative: 2, relanceSurLeRefus: true });
      expect(d.suivant.rapport).toBe(transitions.rapportDuRefus(refus));
      expect(d.memoire).toEqual({ refus: { ...refus, relance: true } });
      const encore = jouer(
        { etat: etat(CODE), memoire: { refus: { ...refus, relance: true } } },
        faits({ empreinte: 'A' })
      ).d;
      expect(encore.arret).toMatchObject({ nom: 'sans-livraison', piece: 'P' });
    });
    it('rien à livrer : le geste, la passation gardée ; une reprise livrée : aux contrôles', () => {
      const { d } = jouer({ etat: etat(CODE) }, faits({ empreinte: 'A', passation: 'PASS' }));
      expect(genres(d)).toEqual(['geste:rien-a-livrer', 'inscrire', 'commenter']);
      expect(String(d.memoire.rienALivrer)).toContain('PASS');
      expect(d.suivant.etape).toBe(CONTROLES);
      const reprise = jouer(
        { etat: etat(CODE), reprend: true },
        faits({ empreinte: 'A', livre: true })
      ).d;
      expect(genres(reprise)).toEqual(['commenter', 'inscrire', 'commenter']);
      expect(reprise.memoire).toEqual({});
    });
  });

  describe('3.1 Contrôles et 4.1 Passe finale', () => {
    it('les contrôles du plan verts : la passe finale', () => {
      const { d, demandes } = jouer(
        { etat: etat(CONTROLES, { tentative: 2 }) },
        { controles: VERT }
      );
      expect(demandes[0]).toEqual({
        fait: 'controles',
        finale: false,
        restreinte: null,
        reportes: null,
      });
      expect(d.suivant).toMatchObject({ etape: CONTROLES, tentative: 0, finale: true });
      expect(d.memoire).toMatchObject({ renvoiAuTestwriter: null, controlesRouges: null });
    });
    it('la passe finale verte : l’intégration sur le lot accepté, sinon la relecture', () => {
      const passe = { passeFinale: { arbre: 'T', restreinte: null }, controles: VERT };
      const acceptee = jouer(
        { etat: etat(CONTROLES, { finale: true }) },
        { ...passe, lotAccepte: true }
      ).d;
      expect(acceptee.suivant.etape).toBe(INTEGRATION);
      expect(acceptee.memoire.verifie).toBe('T');
      const neuve = jouer(
        { etat: etat(CONTROLES, { finale: true }) },
        { ...passe, lotAccepte: false }
      ).d;
      expect(neuve.suivant.etape).toBe(RELECTURE);
    });
    it('un rouge : le développeur relancé, puis l’arrêt controles au bout', () => {
      const { d } = jouer({ etat: etat(CONTROLES) }, { controles: ROUGE, mecanique: false });
      expect(d.suivant).toMatchObject({ etape: CODE, tentative: 2, rapport: 'texte' });
      expect(d.memoire.controlesRouges).toBe('texte');
      const fin = jouer(
        { etat: etat(CONTROLES, { tentative: T.SEANCES_DEVELOPPEUR }) },
        { controles: ROUGE, mecanique: false }
      ).d;
      expect(fin.arret).toMatchObject({ nom: 'controles', resultat: { issue: 'rouge' } });
    });
    it.each([
      ['hors du titre', { horsTitre: ['packages/b'] }, true, 'controles'],
      ['sans paquet du plan', { auDeveloppeur: false }, false, 'controles'],
      ['à arbitrer', { arbitrer: true }, false, 'controles'],
    ])('un rouge %s : controles', (_nom, k, finale, nom) => {
      const faits = finale
        ? {
            passeFinale: { arbre: 'T', restreinte: null },
            controles: { ...ROUGE, ...k },
            referencesDesRouges: [],
          }
        : { controles: { ...ROUGE, ...k } };
      expect(jouer({ etat: etat(CONTROLES, { finale }) }, faits).d.arret?.nom).toBe(nom);
    });
    it('un rouge d’un lot mécanique : controles ; après rien à livrer : sans-livraison au code', () => {
      expect(
        jouer(
          {
            etat: etat(CONTROLES),
            ticket: { ...TICKET, sorte: { genre: 'mécanique', raison: 'r' } },
          },
          { controles: ROUGE, mecanique: true }
        ).d.arret?.nom
      ).toBe('controles');
      const rien = jouer(
        { etat: etat(CONTROLES), memoire: { rienALivrer: 'RIEN' } },
        { controles: ROUGE, mecanique: false }
      ).d;
      expect(rien.arret).toMatchObject({ nom: 'sans-livraison', etape: CODE, resultat: null });
      expect(rien.memoire.rienALivrer).toBeNull();
    });
    it('à repasser : a-repasser', () => {
      expect(
        jouer({ etat: etat(CONTROLES) }, { controles: { ...VERT, aRepasser: true } }).d.arret?.nom
      ).toBe('a-repasser');
    });
    it('un rouge de référence aux contrôles du plan : la régénération, puis les contrôles', () => {
      const k = { ...ROUGE, references: [{ nom: 'ref' }] };
      const { d } = jouer(
        { etat: etat(CONTROLES), memoire: { rienALivrer: 'R' } },
        { controles: k, arbreApres: 'T' }
      );
      expect(d.suivant).toMatchObject({ etape: REFERENCES, finale: true, tentative: 1 });
      expect(d.memoire.aRegenerer).toMatchObject({ noms: ['ref'], suite: 'controles' });
      expect(d.memoire.rienALivrer).toBe('R');
      const seule = jouer(
        { etat: etat(CONTROLES, { tentative: 2 }) },
        { controles: { ...VERT, references: [{ nom: 'ref' }] }, arbreApres: 'T' }
      ).d;
      expect(seule.suivant).toMatchObject({ etape: REFERENCES, tentative: 0 });
      expect(seule.memoire.aRegenerer).toMatchObject({ suite: 'passe' });
      const deja = jouer(
        { etat: etat(CONTROLES), memoire: { regenereSur: { arbre: 'T', noms: ['ref'] } } },
        { controles: k, arbreApres: 'T', mecanique: false }
      ).d;
      expect(deja.suivant.etape).toBe(CODE);
    });
    it('la passe finale rouge d’une référence : sa régénération, une fois sur ce même arbre', () => {
      const faits = {
        passeFinale: { arbre: 'T', restreinte: null },
        controles: ROUGE,
        referencesDesRouges: [{ nom: 'ref' }],
      };
      const { d } = jouer({ etat: etat(CONTROLES, { finale: true }) }, faits);
      expect(d.suivant.etape).toBe(REFERENCES);
      expect(d.memoire.aRegenerer).toMatchObject({ noms: ['ref'], entiere: true });
      const deja = jouer(
        {
          etat: etat(CONTROLES, { finale: true }),
          memoire: { regenereSur: { arbre: 'T', noms: ['ref'] } },
        },
        { ...faits, mecanique: false }
      ).d;
      expect(deja.suivant.etape).toBe(CODE);
    });
    it('la passe après une régénération : restreinte, ses rouges reportés', () => {
      const regeneration = {
        restreinte: { avant: 'a', apres: 'b' },
        entiere: true,
        reportes: { rouges: [] },
      };
      const { d, demandes } = jouer(
        { etat: etat(CONTROLES, { finale: true }), memoire: { regeneration } },
        { arbreAvant: 'T', controles: VERT, lotAccepte: false }
      );
      expect(demandes[1]).toMatchObject({
        restreinte: regeneration.restreinte,
        reportes: regeneration.reportes,
      });
      expect(d.memoire).toMatchObject({ regeneration: null, verifie: 'T' });
    });
  });

  describe('4.2 Régénération des références', () => {
    it('rien à régénérer dans l’état : references', () => {
      expect(jouer({ etat: etat(REFERENCES) }).d.arret?.nom).toBe('references');
    });
    it('le lot refusé par une commande du projet : au développeur', () => {
      const a = {
        noms: ['ref'],
        notes: [],
        suite: 'controles',
        rouges: [],
        auDeveloppeur: 'ROUGES',
      };
      const { d } = jouer(
        { etat: etat(REFERENCES, { tentative: 1, finale: true }), memoire: { aRegenerer: a } },
        { regeneration: { refus: ['non'] } }
      );
      expect(d.suivant).toMatchObject({ etape: CODE, tentative: 2, finale: false });
      expect(d.memoire).toEqual({ aRegenerer: null, rienALivrer: null });
    });
    it.each([
      [
        'après les contrôles, rien de changé',
        'controles',
        [],
        false,
        { reportes: { rouges: [], rejouee: false } },
      ],
      ['après les contrôles seuls', 'passe', ['f'], true, null],
      [
        'après la passe finale',
        undefined,
        ['f'],
        true,
        { restreinte: 'R', entiere: true, reportes: { rouges: [], rejouee: true } },
      ],
    ])('%s', (_nom, suite, fichiers, finale, regeneration) => {
      const a = { noms: ['ref'], notes: [], suite, rouges: [], entiere: true };
      const { d } = jouer(
        { etat: etat(REFERENCES, { finale: true }), memoire: { aRegenerer: a } },
        {
          regeneration: { texte: 'G', regenerees: ['ref'], fichiers, restreinte: 'R' },
          arbreApres: 'T2',
        }
      );
      expect(d.suivant).toMatchObject({ etape: CONTROLES, finale });
      expect(d.memoire.regeneration).toEqual(regeneration);
      expect(d.memoire.regenereSur).toEqual(suite ? { arbre: 'T2', noms: ['ref'] } : null);
    });
  });

  describe('4.3 Relecture', () => {
    const v = (o: object = {}) => ({ verdict: 'RENDU', fiche: {}, texte: 'V', arbre: 'T', ...o });
    it('une question au responsable : besoin', () => {
      const { d } = jouer(
        { etat: etat(RELECTURE) },
        { relecture: v({ fiche: { question: 'Q' } }) }
      );
      expect(d.arret).toMatchObject({ nom: 'besoin', qui: 'responsable' });
    });
    it('ACCEPTÉ sur un lot vérifié : l’intégration ; sinon la passe finale entière', () => {
      const ok = jouer(
        { etat: etat(RELECTURE), memoire: { verifie: 'T', constats: [{}] } },
        { relecture: v({ verdict: 'ACCEPTÉ' }) }
      ).d;
      expect(ok.suivant.etape).toBe(INTEGRATION);
      expect(ok.memoire.constats).toEqual([]);
      const non = jouer({ etat: etat(RELECTURE) }, { relecture: v({ verdict: 'ACCEPTÉ' }) }).d;
      expect(non.suivant).toMatchObject({ etape: CONTROLES, tentative: 0, finale: true });
    });
    it('RENDU : l’agent que nomme le constat ; à la troisième, relecture-arret', () => {
      const constats = [{ role: 'testwriter', titre: 't' }];
      const { d } = jouer(
        { etat: etat(RELECTURE, { finale: true }) },
        { relecture: v(), rendus: 1, constats: { constats }, sansTests: false, mecanique: false }
      );
      expect(d.suivant).toMatchObject({ etape: TESTS, tentative: 1, rapport: null, finale: false });
      expect(d.memoire.constats).toEqual(constats);
      const dev = jouer(
        { etat: etat(RELECTURE) },
        {
          relecture: v(),
          rendus: 1,
          constats: { constats: [{ role: 'developpeur' }] },
          mecanique: false,
        }
      ).d;
      expect(dev.suivant.etape).toBe(CODE);
      expect(
        jouer({ etat: etat(RELECTURE) }, { relecture: v(), rendus: T.RELECTURES }).d.arret?.nom
      ).toBe('relecture-arret');
    });
    it('un constat sans destinataire, au testwriter sauté, ou sur un lot mécanique : relecture-arret', () => {
      const sans = { arret: { nom: 'relecture-arret', rapport: 'R', piece: 'P' } };
      expect(
        jouer({ etat: etat(RELECTURE) }, { relecture: v(), rendus: 1, constats: sans }).d.arret
      ).toEqual(sans.arret);
      const constats = { constats: [{ role: 'testwriter', titre: 't' }] };
      expect(
        jouer({ etat: etat(RELECTURE) }, { relecture: v(), rendus: 1, constats, sansTests: true }).d
          .arret?.nom
      ).toBe('relecture-arret');
      const meca = jouer(
        {
          etat: etat(RELECTURE),
          ticket: { ...TICKET, sorte: { genre: 'mécanique', raison: 'r' } },
        },
        { relecture: v(), rendus: 1, constats: { constats: [] }, mecanique: true }
      ).d;
      expect(meca.arret?.nom).toBe('relecture-arret');
    });
  });

  describe('5.1 Intégration, 5.2 File, 5.3 Tri', () => {
    it('l’intégration à 75 : a-repasser ; refusée : integration, le refus gardé ; commitée : en file', () => {
      expect(
        jouer({ etat: etat(INTEGRATION) }, { integration: { code: 75, sortie: 's' } }).d.arret?.nom
      ).toBe('a-repasser');
      const refus = jouer(
        { etat: etat(INTEGRATION) },
        { integration: { code: 1, sortie: 's', commande: 'node integrer.mjs' }, empreinte: 'E' }
      ).d;
      expect(refus.arret).toMatchObject({ nom: 'integration' });
      expect(refus.arret?.piece).toContain('$ node integrer.mjs');
      expect(refus.memoire.refus).toMatchObject({ empreinte: 'E', lance: false, relance: false });
      const ok = jouer(
        { etat: etat(INTEGRATION) },
        { integration: { code: 0, sortie: '' }, commit: 'abc' }
      ).d;
      expect(ok.suivant.etape).toBe(EN_FILE);
      expect(ok.memoire).toEqual({ refus: null });
      expect(ok.effets[0].texte).toContain('commit abc sur agent/essai-1');
    });
    it.each([
      ['ferme', undefined, TRI],
      ['en-file', 'a-repasser', undefined],
      ['rouvert', 'integration', undefined],
    ])('la file %s', (e, nom, etape) => {
      const { d } = jouer(
        { etat: etat(EN_FILE) },
        { file: { etat: e, raison: 'r' }, empreinte: 'E' }
      );
      expect(d.arret?.nom).toBe(nom);
      if (etape) {
        expect(d.suivant.etape).toBe(etape);
      }
    });
    it('le tri : la fin du circuit', () => {
      expect(jouer({ etat: etat(TRI) }, { tri: true }).d.fin).toEqual({ code: 0 });
    });
    it('une étape inconnue : un usage', () => {
      expect(jouer({ etat: etat('nulle-part') }).d.usage).toContain('nulle-part');
    });
  });
});

// The modules of <fichier> imports, relative ones followed, from the scripts: `[module, import]`.
function importsDe(fichier: string, vus = new Set<string>()): [string, string][] {
  if (vus.has(fichier)) {
    return [];
  }
  vus.add(fichier);
  const texte = readFileSync(fichier, 'utf8');
  const f = ts.createSourceFile(fichier, texte, ts.ScriptTarget.Latest, true);
  const out: [string, string][] = [];
  for (const n of f.statements) {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier) {
      const nom = (n.moduleSpecifier as ts.StringLiteral).text;
      out.push([path.relative(SCRIPTS, fichier), nom]);
      if (nom.startsWith('.')) {
        out.push(...importsDe(path.resolve(path.dirname(fichier), nom), vus));
      }
    }
  }
  return out;
}
const INTERDITS = /^(node:)?(fs|fs\/promises|child_process)$/;

describe('les décisions et la liste des étapes ne lisent pas la machine (garde)', () => {
  it.each(['transitions.mjs', 'etapes.mjs', 'codes-de-sortie.mjs'])(
    '%s n’importe, ni lui ni ce qu’il importe, node:fs ou node:child_process',
    f => {
      const lus = importsDe(path.join(SCRIPTS, f));
      expect(lus.filter(([, nom]) => INTERDITS.test(nom))).toEqual([]);
      expect(lus.filter(([, nom]) => !nom.startsWith('.')).map(([, nom]) => nom)).toEqual([]);
    }
  );

  it('la garde voit un module qui lit la machine', () => {
    expect(importsDe(path.join(SCRIPTS, 'mesure/pression.mjs')).map(([, nom]) => nom)).toContain(
      'node:fs'
    );
  });

  it('A_REPASSER vit dans le module des codes de sortie, que pression.mjs n’exporte plus', async () => {
    const pression = await import('../../scripts/mesure/pression.mjs');
    expect('A_REPASSER' in pression).toBe(false);
    const codes = await import('../../scripts/codes-de-sortie.mjs');
    expect(codes.A_REPASSER).toBe(75);
  });
});

// grillhouse-4nr.12: the workflow of a ticket is the one loop of the circuit.
describe('le déroulé d’un ticket interprète les décisions, sans décider lui-même', () => {
  const derouler = readFileSync(
    path.resolve(__dirname, '../../src/temporal/circuit/deroule.ts'),
    'utf8'
  );
  it('le déroulé appelle les décisions', () => {
    expect(derouler).toContain('transition({');
    expect(derouler).toMatch(
      /import \{[^}]*\btransition\b[^}]*\} from '[./]*\/scripts\/transitions\.mjs'/
    );
  });
  it('aucune branche du déroulé ne nomme une étape suivante', () => {
    for (const etape of [
      'TESTS',
      'PREUVE',
      'CODE',
      'GESTE',
      'REFERENCES',
      'RELECTURE',
      'INTEGRATION',
    ]) {
      expect(derouler, etape).not.toMatch(new RegExp(`etape = ${etape}\\b`));
    }
    expect(derouler).not.toMatch(/tentative\+\+|tentative = \d/);
  });
});

// grillhouse-4nr.6.3: the decisions of the plan, which the circuit and the workflow of a ticket
// take alike: its next step, the questions put, what stays open.
describe('les décisions du plan', () => {
  const { pasDuPlan, questionsPosees, ouvertesDuPlan } = transitions;
  const vide = {
    avant: '',
    plan: null,
    premier: null,
    seance: null,
    lu: null,
    posees: [],
    reponse: null,
  };

  it('the explorateur, the questionneur, the answer when questions were put, then the conclusion', () => {
    expect(pasDuPlan(vide)).toBe('explorateur');
    const plan = { questions: [] };
    expect(pasDuPlan({ ...vide, plan })).toBe('questionneur');
    expect(pasDuPlan({ ...vide, plan, lu: {}, posees: ['q'] })).toBe('reponse');
    expect(pasDuPlan({ ...vide, plan, lu: {}, posees: [] })).toBe('conclure');
    expect(pasDuPlan({ ...vide, plan, lu: {}, posees: ['q'], reponse: {} })).toBe('conclure');
  });

  it('the questions put: none, the disagreement as one, or the questions', () => {
    expect(questionsPosees({ issue: 'AUCUNE', questions: [] })).toEqual([]);
    expect(questionsPosees({ issue: 'DÉSACCORD', desaccord: 'non', questions: [] })).toEqual([
      'non',
    ]);
    expect(
      questionsPosees({ issue: 'QUESTIONS', questions: [{ question: 'a' }, { question: 'b' }] })
    ).toEqual(['a', 'b']);
  });

  it('what stays open: the plan’s questions, then each question put left without its answer', () => {
    const q = { question: 'du plan', piece: 'p' };
    expect(ouvertesDuPlan({ questions: [q] }, ['a', 'b'], [{ numero: '2' }])).toEqual([
      q,
      { question: 'a', piece: 'question du questionneur, sans réponse' },
    ]);
  });
});

// The stop « inattendu » whose own act failed stands in the memo alone: its question, which the
// supervisor reads, names the cause by the first line of the act's error.
describe('the stop « inattendu » written by no act names its cause in its question', () => {
  it('its question carries the first line of the error, then what the supervisor does', () => {
    const a = transitions.arretSansActe(
      { etape: 'commit', tentative: 1, rapport: null, finale: false },
      'git commit échoue : rien à valider\n    at commiter (circuit.mjs:12)',
      'le déroulé circuit:/depot:demo-1'
    );
    expect(a.nom).toBe('inattendu');
    expect(a.question.question).toBe(
      "L'arrêt de l'étape « commit » ne s'écrit pas au ticket : git commit échoue : rien à valider. Lever la cause, puis reprendre le circuit (--reprendre) ou l’arrêter (--arreter)."
    );
  });

  it('the codes of colour of the error go from its question and its fact', () => {
    const a = transitions.arretSansActe(
      { etape: 'controles', tentative: 1, rapport: null, finale: false },
      '\u001b[31m✗ npm run verifier\u001b[39m rouge\n\u001b]8;;http://x\u0007lien\u001b]8;;\u0007',
      'ici'
    );
    expect(a.question.question).toContain("ne s'écrit pas au ticket : ✗ npm run verifier rouge. ");
    expect(a.question.fait).not.toContain('\u001b');
    expect(a.question.fait).toContain('lien');
  });
});
