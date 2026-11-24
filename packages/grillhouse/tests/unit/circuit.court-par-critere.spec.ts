// Le circuit court se décide par un critère, et la bascule marche dans les deux sens : un ticket
// sans test honnête à rougir prend le circuit court ; le superviseur, à l'arrêt du testwriter qui
// ne trouve aucun comportement, bascule le ticket sans refaire le plan ; le relecteur d'un lot qui
// change un comportement le renvoie à 2 Tests sur le même plan. Deux formes du circuit court : le
// geste qu'une commande joue (1.1, `--mecanique <commande>`) et le geste écrit à la main (le
// développeur écrit, la suite existante fait la preuve, `--mecanique` sans commande).
// Tests petits : aucun serveur, aucun processus.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as reponses from '../../scripts/reponses-du-circuit.mjs';
import * as transitions from '../../scripts/transitions.mjs';
import { MONTEES } from '../../scripts/etapes.mjs';
import { lireFiche, schemaDeFiche, sorteDuPlan } from '../../scripts/resultats.mjs';

const RACINE = path.resolve(__dirname, '../../../..');
const plat = (f: string) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\s+/g, ' ');
const appel = () => import('../../src/temporal/circuit/appel.js');

describe('la charte dit le critère du circuit court et ses exemples', () => {
  const charte = plat('mods/grillhouse/charte.md');

  it('un ticket prend le circuit court quand aucun test honnête ne peut rougir avant son lot', () => {
    expect(charte).toMatch(/aucun test honnête ne peut rougir avant son lot/);
    expect(charte).toMatch(/le produit se comportant pareil avant et après/);
    expect(charte).toMatch(/la suite existante, qui reste verte, et la relecture font la preuve/);
    expect(charte).toMatch(/[Ll]e doute va au circuit complet/);
  });

  it('la liste devient les exemples du critère, ceux d’avant et les neufs', () => {
    for (const exemple of [
      'montée du cadre',
      'documents seuls',
      'renommage ou déplacement',
      'montée de dépendance',
      'configuration seule',
      'correction de style',
      'seuil relevé',
      'commentaires de code seuls',
      'suppression de code',
      'fichiers engendrés régénérés',
      'textes de messages',
      'typage resserré',
    ]) {
      expect(charte, exemple).toContain(exemple);
    }
  });

  it('les exemples portent leur condition', () => {
    expect(charte).toMatch(/textes de messages qu['’]aucun test ni aucun autre paquet ne lit/);
    expect(charte).toMatch(
      /typage resserré sans changement à l['’]exécution et dont aucun lecteur du relevé ne casse à la compilation/
    );
    expect(charte).toMatch(/suppression de code sans appelant vivant/);
  });

  it('reste au circuit complet ce qu’un utilisateur ou un autre paquet observe, et la configuration mesurée par une garde', () => {
    expect(charte).toMatch(/ce qu['’]un utilisateur ou un autre paquet observe/);
    expect(charte).toContain('un code de retour');
    expect(charte).toContain('une interface publiée');
    expect(charte).toMatch(/[Uu]ne configuration dont une garde mesure l['’]effet/);
    expect(charte).toMatch(/« comportement tests-adaptés »/);
  });
});

describe('la compétence de l’explorateur reprend le critère et donne son sens à « honnête »', () => {
  const explorateur = plat('mods/grillhouse/skills/explorateur/SKILL.md');

  it('dit mécanique un ticket qui remplit le critère, avec sa raison, sa commande, et la forme écrite à la main', () => {
    expect(explorateur).toMatch(/aucun test honnête ne peut rougir/);
    expect(explorateur).toMatch(/écrit à la main/);
  });

  it('un test honnête échoue avant le lot et passe après, sur un comportement observé', () => {
    expect(explorateur).toMatch(/test honnête/);
    expect(explorateur).toMatch(/échoue avant le lot et passe après/);
    expect(explorateur).toMatch(/autre paquet|interface publiée/);
  });

  it('cherche par l’index les lecteurs d’un texte de message, d’un typage resserré ou d’un code supprimé, et écrit ce qu’il a cherché', () => {
    expect(explorateur).toMatch(/textes de messages/);
    expect(explorateur).toMatch(/typage resserré/);
    expect(explorateur).toMatch(/code supprimé/);
    expect(explorateur).toMatch(/ce qu['’]il a cherché/);
    expect(explorateur).toMatch(/un lecteur trouvé, ou un doute, va au circuit complet/i);
  });
});

describe('les fiches du testwriter et du relecteur portent un motif nommé', () => {
  const piece = '$ echo x\nx';
  const sortie = (fiche: object) =>
    JSON.stringify({ type: 'result', session_id: 's', structured_output: fiche });

  it('le testwriter dit « aucun-comportement » quand aucun comportement n’est à tester', () => {
    const schema = schemaDeFiche('testwriter') as {
      properties: Record<string, { enum?: string[] }>;
    };
    expect(schema.properties.motif?.enum).toContain('aucun-comportement');
    const lu = lireFiche(
      'testwriter',
      sortie({ statut: 'BESOIN', question: 'Q', piece, motif: 'aucun-comportement' })
    );
    expect(lu).toMatchObject({ fiche: { motif: 'aucun-comportement' } });
    expect(plat('mods/grillhouse/skills/testwriter/SKILL.md')).toContain('aucun-comportement');
  });

  it('le relecteur rend un lot avec le motif « comportement-change »', () => {
    const schema = schemaDeFiche('relecteur') as {
      properties: Record<string, { enum?: string[] }>;
    };
    expect(schema.properties.motif?.enum).toContain('comportement-change');
    const lu = lireFiche(
      'relecteur',
      sortie({
        verdict: 'RENDU',
        motif: 'comportement-change',
        conformite: [],
        constats: [
          {
            titre: 'Le lot change une sortie',
            genre: 'bloquant',
            regle: 'critère 1',
            role: 'testwriter',
            corps: 'La sortie change.',
            piece,
          },
        ],
      })
    );
    expect(lu).toMatchObject({ fiche: { motif: 'comportement-change' } });
    expect(plat('mods/grillhouse/skills/relecteur/SKILL.md')).toContain('comportement-change');
  });
});

describe('le superviseur bascule un ticket arrêté sur le testwriter par --mecanique', () => {
  it('lit --mecanique <commande> avec sa raison en --contexte', async () => {
    const { lireLAppel } = await appel();
    expect(
      lireLAppel(['essai-1', '--mecanique', 'git mv a b', '--contexte', 'un renommage'])
    ).toMatchObject({
      ticket: 'essai-1',
      mecanique: { commande: 'git mv a b' },
      contexte: 'un renommage',
      reprendre: false,
      depuis: null,
    });
  });

  it('lit --mecanique sans commande : le geste écrit à la main va au développeur', async () => {
    const { lireLAppel } = await appel();
    expect(
      lireLAppel(['essai-1', '--mecanique', '--contexte', 'des commentaires seuls'])
    ).toMatchObject({ mecanique: { commande: null }, contexte: 'des commentaires seuls' });
    expect(lireLAppel(['essai-1', '--reprendre'])).toMatchObject({ mecanique: null });
  });

  it('refuse --mecanique sans sa raison, ou avec une autre réponse', async () => {
    const { lireLAppel, Usage } = await appel();
    expect(() => lireLAppel(['essai-1', '--mecanique', 'git mv a b'])).toThrow(Usage);
    for (const autre of [['--reprendre'], ['--depuis', 'developpeur'], ['--arreter']]) {
      expect(() =>
        lireLAppel(['essai-1', '--mecanique', 'git mv a b', '--contexte', 'r', ...autre])
      ).toThrow(Usage);
    }
    expect(() =>
      lireLAppel(['essai-1', '--etendre', 'a', '--mecanique', '--contexte', 'r'])
    ).toThrow(Usage);
  });

  const reponse = reponses.reponseMecanique as (o: {
    etat: { etape: string; raison: string | null };
    sorte: { genre: string; raison: string | null; comportement?: string; commande?: string };
    commande: string | null;
    contexte: string | null;
  }) => {
    refus?: string;
    sorte?: { genre: string; raison: string; commande?: string; comportement?: string };
    suivant?: { etape: string };
  };
  const COMPORTEMENT = { genre: 'comportement', raison: 'plan', comportement: 'changé' };

  it.each(['besoin', 'hors-portee'])(
    'sur un arrêt « %s » du testwriter, avec une commande : la sorte devient mécanique, reprise à 1.1',
    raison => {
      const r = reponse({
        etat: { etape: 'testwriter', raison },
        sorte: COMPORTEMENT,
        commande: 'git mv a b',
        contexte: 'un renommage',
      });
      expect(r.refus).toBeUndefined();
      expect(r.sorte).toEqual({
        genre: 'mécanique',
        raison: 'un renommage',
        commande: 'git mv a b',
      });
      expect(r.suivant).toMatchObject({ etape: transitions.GESTE });
    }
  );

  it('sans commande : le geste écrit à la main va au développeur, la suite existante faisant la preuve', () => {
    const r = reponse({
      etat: { etape: 'testwriter', raison: 'besoin' },
      sorte: COMPORTEMENT,
      commande: null,
      contexte: 'des commentaires seuls',
    });
    expect(r.refus).toBeUndefined();
    expect(r.sorte).toMatchObject({
      genre: 'comportement',
      raison: 'des commentaires seuls',
      comportement: 'inchangé',
    });
    expect(r.suivant).toMatchObject({ etape: transitions.CODE });
  });

  it('refuse quand le ticket n’est pas arrêté sur le testwriter, sans raison, ou quand la sorte est déjà mécanique', () => {
    const cas = (o: Partial<Parameters<typeof reponse>[0]>) =>
      reponse({
        etat: { etape: 'testwriter', raison: 'besoin' },
        sorte: COMPORTEMENT,
        commande: 'git mv a b',
        contexte: 'r',
        ...o,
      });
    expect(cas({ etat: { etape: 'developpeur', raison: 'controles' } }).refus).toBeTruthy();
    expect(cas({ etat: { etape: 'testwriter', raison: 'preuve' } }).refus).toBeTruthy();
    expect(cas({ contexte: ' ' }).refus).toBeTruthy();
    expect(
      cas({ sorte: { genre: 'mécanique', raison: 'r', commande: 'mv a b' } }).refus
    ).toBeTruthy();
    expect(cas({}).refus).toBeUndefined();
  });

  it('l’arrêt du testwriter propose --mecanique à côté de --depuis developpeur et --arreter', () => {
    for (const arret of ['besoin', 'hors-portee'] as const) {
      const q = MONTEES[arret].question;
      expect(q, arret).toContain('--mecanique');
      expect(q, arret).toContain('--depuis');
      expect(q, arret).toContain('--arreter');
    }
    expect(reponses.lesReponses('essai-1', 'RUNNING', true)).toContain('--mecanique');
  });
});

describe('le relecteur renvoie à 2 Tests un lot qui change un comportement, sur le même plan', () => {
  interface Effet {
    genre: string;
    sorte?: { genre: string; raison: string; comportement?: string };
  }
  interface Decision {
    besoin?: { fait: string };
    suivant: { etape: string; tentative: number; rapport: string | null; finale: boolean };
    memoire: Record<string, unknown>;
    effets: Effet[];
    arret?: { nom: string };
  }
  const transition = transitions.transition as (e: object) => Decision;
  const T = transitions as unknown as Record<string, string> & { RELECTURES: number };
  const MECANIQUE = { genre: 'mécanique', raison: 'un renommage', commande: 'git mv a b' };
  const A_LA_MAIN = { genre: 'comportement', raison: 'des commentaires', comportement: 'inchangé' };
  const ticket = (sorte: object) => ({
    id: 'essai-1',
    paquets: ['packages/a'],
    sorte,
    copie: '/copie',
  });
  const verdict = (fiche: object = {}) => ({
    verdict: 'RENDU',
    fiche,
    texte: 'Le lot change une sortie.',
    arbre: 'T',
  });
  const constats = [{ role: 'developpeur', titre: 't' }];

  function jouer(sorte: object, faits: Record<string, unknown>) {
    const lus: Record<string, unknown> = {};
    for (let i = 0; i < 50; i++) {
      const d = transition({
        etat: { etape: T.RELECTURE, tentative: 1, rapport: null, finale: false },
        memoire: {},
        ticket: ticket(sorte),
        faits: lus,
      });
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
  const faits = (fiche: object, o: Record<string, unknown> = {}) => ({
    relecture: verdict(fiche),
    rendus: 1,
    constats: { constats },
    mecanique: false,
    ...o,
  });

  it('d’un lot mécanique : la sorte devient comportement, raison le verdict, et le circuit reprend à 2 Tests', () => {
    const d = jouer(MECANIQUE, faits({ motif: 'comportement-change' }, { mecanique: true }));
    expect(d.arret).toBeUndefined();
    expect(d.suivant).toMatchObject({ etape: T.TESTS, tentative: 1, rapport: null, finale: false });
    const sorte = d.effets.find(e => e.genre === 'sorte');
    expect(sorte?.sorte).toMatchObject({
      genre: 'comportement',
      raison: 'Le lot change une sortie.',
      comportement: 'changé',
    });
  });

  it('d’un lot écrit à la main : la sorte perd son « inchangé », le circuit reprend à 2 Tests', () => {
    const d = jouer(A_LA_MAIN, faits({ motif: 'comportement-change' }));
    expect(d.arret).toBeUndefined();
    expect(d.suivant).toMatchObject({ etape: T.TESTS, tentative: 1 });
    expect(d.effets.find(e => e.genre === 'sorte')?.sorte).toMatchObject({
      genre: 'comportement',
      comportement: 'changé',
    });
  });

  it('un RENDU de lot mécanique pour un autre motif garde son arrêt', () => {
    for (const fiche of [{}, { motif: 'autre' }]) {
      const d = jouer(MECANIQUE, faits(fiche, { mecanique: true }));
      expect(d.arret?.nom).toBe('relecture-arret');
      expect(d.effets.find(e => e.genre === 'sorte')).toBeUndefined();
    }
  });

  it('la bascule compte dans les RENDU : le troisième arrête toujours le circuit', () => {
    const d = jouer(
      MECANIQUE,
      faits({ motif: 'comportement-change' }, { mecanique: true, rendus: T.RELECTURES })
    );
    expect(d.arret?.nom).toBe('relecture-arret');
  });
});

describe('le champ comportement du plan a trois valeurs : changé, tests-adaptés, inchangé', () => {
  const apresLePlan = transitions.etapeApresLePlan as (o: {
    sorte: object | null;
    sansTests: boolean;
  }) => string;
  const sorteDe = sorteDuPlan as (fiche: object) => {
    genre: string;
    raison: string | null;
    comportement?: string;
  };
  const plan = (comportement: unknown, raison = 'sa raison') => ({
    sorte: { genre: 'comportement', comportement, raison },
  });

  it.each(['changé', 'tests-adaptés', 'inchangé'])(
    'la valeur « %s » se lit telle quelle, avec sa raison',
    valeur => {
      expect(sorteDe(plan(valeur))).toEqual({
        genre: 'comportement',
        raison: 'sa raison',
        comportement: valeur,
      });
    }
  );

  it('une valeur absente, inconnue ou sans raison vaut changé : le doute va au circuit complet', () => {
    expect(sorteDe({ sorte: { genre: 'comportement', raison: 'r' } }).comportement).toBe('changé');
    expect(sorteDe(plan('autre')).comportement).toBe('changé');
    expect(sorteDe(plan('inchangé', ' ')).comportement).toBe('changé');
    expect(sorteDe(plan('tests-adaptés', ' ')).comportement).toBe('changé');
  });

  it('un geste écrit à la main (inchangé) va du plan au développeur, sans testwriter', () => {
    const sorte = sorteDe(plan('inchangé', 'des commentaires seuls'));
    expect(apresLePlan({ sorte, sansTests: false })).toBe(transitions.CODE);
  });

  it('des tests adaptés ou une matière de test seule gardent le testwriter, comme un comportement changé', () => {
    for (const valeur of ['tests-adaptés', 'changé']) {
      expect(apresLePlan({ sorte: sorteDe(plan(valeur)), sansTests: false })).toBe(
        transitions.TESTS
      );
    }
  });

  it('les tests adaptés se distinguent du geste écrit à la main : le testwriter pour l’un, le développeur pour l’autre', () => {
    const adaptes = apresLePlan({ sorte: sorteDe(plan('tests-adaptés')), sansTests: false });
    const alaMain = apresLePlan({ sorte: sorteDe(plan('inchangé')), sansTests: false });
    expect(adaptes).not.toBe(alaMain);
  });

  it('un plan mécanique va au geste ; un plan sans test va au développeur, quelle que soit sa valeur', () => {
    const meca = sorteDe({ sorte: { genre: 'mécanique', raison: 'r', commande: 'git mv a b' } });
    expect(apresLePlan({ sorte: meca, sansTests: false })).toBe(transitions.GESTE);
    expect(apresLePlan({ sorte: sorteDe(plan('tests-adaptés')), sansTests: true })).toBe(
      transitions.CODE
    );
  });

  it('le schéma du plan nomme les trois valeurs et dit celle d’un test adapté', () => {
    const schema = schemaDeFiche('explorateur') as {
      properties: {
        sorte: { properties: { comportement: { enum: string[]; description: string } } };
      };
    };
    const c = schema.properties.sorte.properties.comportement;
    expect(c.enum).toEqual(['changé', 'tests-adaptés', 'inchangé']);
    expect(c.description).toMatch(/tests-adaptés/);
  });
});

describe('la preuve du rouge accepte les verts d’un plan de tests adaptés et garde son rouge exigé pour un comportement changé', () => {
  interface Decision {
    besoin?: { fait: string };
    suivant: { etape: string; tentative: number };
  }
  const transition = transitions.transition as (e: object) => Decision;
  const T = transitions as unknown as Record<string, string>;
  const preuve = { ok: true, rouges: 0, texte: 'T', resume: 'r', resultat: {} };

  function apresLaPreuve(comportement: string) {
    const lus: Record<string, unknown> = {};
    for (let i = 0; i < 10; i++) {
      const d = transition({
        etat: { etape: T.PREUVE, tentative: 1, rapport: null, finale: false },
        memoire: {},
        ticket: {
          id: 'essai-1',
          paquets: ['packages/a'],
          sorte: { genre: 'comportement', raison: 'r', comportement },
          copie: '/copie',
        },
        faits: lus,
      });
      if (!d.besoin) {
        return d;
      }
      if (d.besoin.fait !== 'preuve') {
        throw new Error(`fait non donné : ${d.besoin.fait}`);
      }
      lus.preuve = preuve;
    }
    throw new Error('trop de faits');
  }

  it('des tests adaptés, sans aucun rouge : la preuve passe et le développeur écrit le code', () => {
    expect(apresLaPreuve('tests-adaptés').suivant).toMatchObject({ etape: T.CODE, tentative: 1 });
  });

  it('un comportement changé sans rouge : un lot de tests seul, aux contrôles', () => {
    expect(apresLaPreuve('changé').suivant).toMatchObject({ etape: T.CONTROLES, tentative: 0 });
  });
});
