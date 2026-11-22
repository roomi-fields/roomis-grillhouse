// The three decisions that say where a run of the circuit starts, what a developpeur's sending
// carries and where a supervisor's extension resumes (scripts/transitions.mjs, the table of the
// decisions): `depart`, `renvoiDe` and `etendre`, with no input nor output, as `transition` is. They
// read the facts they are given (the command's options, the state of the stop, the handover, the red
// output of the checks) and return what the circuit applies: the state the run starts at, the
// memory it changes, a refusal (`usage`).
import { describe, expect, it } from 'vitest';
import * as transitions from '../../scripts/transitions.mjs';

interface Etat {
  etape: string;
  tentative: number;
  rapport: string | null;
  finale: boolean;
  raison?: string;
  question?: unknown;
}
interface Depart {
  suivant?: Etat;
  memoire?: Record<string, unknown>;
  usage?: string;
}
interface EntreeDepart {
  depuis?: string | null;
  reprendre?: boolean;
  marque?: boolean;
  etat?: (Partial<Etat> & { etape: string }) | null;
  refus?: { rapport: string; piece?: string; empreinte?: string } | null;
  ticket?: string;
}
const T = transitions as unknown as Record<string, string> & {
  depart: (e: EntreeDepart) => Depart;
  renvoiDe: (e: {
    fiche: { renvoi?: { role: string } | null; raison?: string };
    passation: string | null;
    controlesRouges: string | null;
  }) => string | null;
  etendre: (e: {
    etat: (Partial<Etat> & { etape: string }) | null;
    etendus: string[];
    plan: string;
    contexte: string | null;
    renvoi: { role: string } | null;
  }) => { suivant: Etat | null; contexte?: string | null; reprend?: boolean };
  rapportDuRefus: (r: { rapport: string }) => string;
};
const { TESTS, CODE, CONTROLES, PREUVE, depart, renvoiDe, etendre } = T;

describe('où une passe du circuit démarre', () => {
  it('sans option, la passe repart du testwriter, tout ce que l’ancienne passe gardait est lâché', () => {
    const d = depart({ ticket: 'essai-1' });
    expect(d.suivant).toEqual({ etape: TESTS, tentative: 1, rapport: null, finale: false });
    expect(d.memoire).toMatchObject({
      verts: null,
      reprise: null,
      relancesTestwriter: null,
      verifie: null,
      toursDeLaPasseFinale: null,
      constats: [],
      refus: null,
      controlesRouges: null,
      testwriterDemande: false,
    });
  });

  it.each([
    ['des contrôles', CONTROLES, 0, true],
    ['du développeur', CODE, 1, false],
    ['du testwriter', TESTS, 1, false],
    ['de l’intégration, que la reprise rejoue sur le même lot', T.INTEGRATION, 1, false],
  ])(
    'une reprise repart de l’étape de l’arrêt %s, son rapport gardé, sans rien lâcher de la mémoire',
    (_nom, etape, tentative, finale) => {
      const d = depart({
        reprendre: true,
        etat: { etape, tentative: 3, rapport: 'LE RAPPORT', finale },
      });
      expect(d.suivant).toEqual({ etape, tentative, rapport: 'LE RAPPORT', finale });
      expect(d.memoire).toEqual({ testwriterDemande: false });
    }
  );

  it('une reprise sans état d’arrêt est refusée, par le ticket nommé', () => {
    expect(depart({ reprendre: true, etat: null, ticket: 'essai-7' }).usage).toBe(
      "rien à reprendre : le circuit de essai-7 n'a aucun état d'arrêt."
    );
  });

  it('une reprise d’un lot intégré est refusée', () => {
    expect(depart({ reprendre: true, etat: { etape: 'integre' }, ticket: 'essai-7' }).usage).toBe(
      'rien à reprendre : le lot de essai-7 est intégré.'
    );
  });

  it.each([
    ['testwriter', TESTS, 1, false],
    ['preuve', PREUVE, 1, false],
    ['developpeur', CODE, 1, false],
    ['controles', CONTROLES, 0, false],
    ['passe-finale', CONTROLES, 0, true],
  ])(
    '--depuis %s joue cette étape et celles d’après, aucune empreinte gardée',
    (nom, etape, tentative, finale) => {
      const d = depart({ depuis: nom, etat: { etape: CONTROLES, tentative: 2, rapport: 'R' } });
      expect(d.suivant).toEqual({ etape, tentative, rapport: null, finale });
      expect(d.memoire).toMatchObject({ verts: {}, reprise: null, relancesTestwriter: null });
    }
  );

  it('--depuis garde les constats du relecteur en mémoire : aucune clé constats n’est écrite', () => {
    for (const depuis of ['testwriter', 'preuve', 'developpeur', 'controles', 'passe-finale']) {
      const d = depart({ depuis, etat: { etape: CODE, tentative: 2, rapport: null } });
      expect(Object.keys(d.memoire ?? {}), depuis).not.toContain('constats');
      expect(Object.keys(d.memoire ?? {}), depuis).not.toContain('controlesRouges');
    }
  });

  it('--depuis testwriter lâche le refus de l’intégration, --depuis developpeur sans refus le laisse', () => {
    const refus = { rapport: 'REFUS', piece: 'P', empreinte: 'E' };
    expect(
      depart({ depuis: 'testwriter', etat: { etape: 'integration' }, refus }).memoire
    ).toMatchObject({ refus: null });
    const sans = depart({ depuis: 'developpeur', etat: { etape: CODE, raison: 'sans-livraison' } });
    expect(Object.keys(sans.memoire ?? {})).not.toContain('refus');
  });

  it('--depuis developpeur après un refus de l’intégration : le développeur, le refus pour rapport, la séance marquée lancée', () => {
    const refus = { rapport: 'LA SORTIE DU REFUS', piece: 'P', empreinte: 'E' };
    const d = depart({
      depuis: 'developpeur',
      etat: { etape: 'integration', raison: 'integration', tentative: 1, rapport: 'x' },
      refus,
    });
    expect(d.suivant).toEqual({
      etape: CODE,
      tentative: 1,
      rapport: T.rapportDuRefus(refus),
      finale: false,
    });
    expect(d.suivant?.rapport).toContain('LA SORTIE DU REFUS');
    expect(d.memoire?.refus).toEqual({ ...refus, lance: true, relance: false });
  });

  it('--depuis developpeur après un arrêt autre que l’intégration ignore le refus gardé', () => {
    const d = depart({
      depuis: 'developpeur',
      etat: { etape: CONTROLES, raison: 'controles', tentative: 2, rapport: 'x' },
      refus: { rapport: 'REFUS', piece: 'P', empreinte: 'E' },
    });
    expect(d.suivant).toEqual({ etape: CODE, tentative: 1, rapport: null, finale: false });
  });

  it('la marque « le superviseur a demandé le testwriter » : posée par --depuis testwriter, gardée par une reprise, lâchée par tout autre départ', () => {
    const marque = (e: EntreeDepart) => depart(e).memoire?.testwriterDemande;
    expect(marque({ depuis: 'testwriter' })).toBe(true);
    expect(marque({ reprendre: true, marque: true, etat: { etape: CODE } })).toBe(true);
    expect(marque({ reprendre: true, marque: false, etat: { etape: CODE } })).toBe(false);
    expect(marque({ depuis: 'developpeur', marque: true })).toBe(false);
    expect(marque({ marque: true })).toBe(false);
  });
});

describe('ce que reçoit le testwriter d’un développeur qui renvoie le rouge', () => {
  const fiche = { renvoi: { role: 'testwriter' }, raison: 'le test attend un autre type' };

  it('une fiche sans renvoi n’en porte aucun', () => {
    expect(renvoiDe({ fiche: {}, passation: 'P', controlesRouges: 'S' })).toBeNull();
    expect(renvoiDe({ fiche: { renvoi: null }, passation: 'P', controlesRouges: null })).toBeNull();
  });

  it('dit le renvoi, la raison de la fiche et la passation du développeur', () => {
    expect(
      renvoiDe({ fiche, passation: 'Le rouge est dans les tests.', controlesRouges: null })
    ).toBe(
      'Le développeur renvoie le rouge qui reste aux tests du lot : le test attend un autre type.\n\nSa passation :\n\nLe rouge est dans les tests.'
    );
  });

  it('sans raison ni passation, le texte reste dit, la passation « aucune »', () => {
    expect(
      renvoiDe({
        fiche: { renvoi: { role: 'testwriter' } },
        passation: null,
        controlesRouges: null,
      })
    ).toBe(
      'Le développeur renvoie le rouge qui reste aux tests du lot.\n\nSa passation :\n\naucune'
    );
  });

  it('porte la sortie rouge des derniers contrôles quand des contrôles ont joué depuis le testwriter', () => {
    const texte = renvoiDe({
      fiche,
      passation: 'P',
      controlesRouges: 'critère 1 — mesure rend le double',
    });
    expect(texte).toContain(
      '\n\nLa sortie rouge des derniers contrôles :\n\ncritère 1 — mesure rend le double'
    );
    expect(renvoiDe({ fiche, passation: 'P', controlesRouges: '' })).not.toContain(
      'La sortie rouge des derniers contrôles'
    );
    expect(renvoiDe({ fiche, passation: 'P', controlesRouges: null })).not.toContain(
      'La sortie rouge des derniers contrôles'
    );
  });
});

describe('où reprend le circuit quand le superviseur étend le plan', () => {
  const arret = (o: Partial<Etat> = {}) => ({
    etape: CODE,
    tentative: 2,
    rapport: 'R',
    finale: false,
    raison: 'hors-portee',
    question: { arret: 'hors-portee', fait: 'le fait' },
    ...o,
  });
  const entree = {
    etendus: ['030-binder'],
    plan: '000-forms, 030-binder',
    contexte: null as string | null,
    renvoi: null as { role: string } | null,
  };

  it('sans état d’arrêt, le circuit part sur le plan étendu : aucun état à reprendre', () => {
    expect(etendre({ ...entree, etat: null })).toEqual({ suivant: null });
  });

  it('sur un arrêt, reprend l’étape en cours, la réponse du superviseur pour contexte de ses séances', () => {
    const d = etendre({ ...entree, etat: arret() });
    expect(d.suivant).toEqual(arret());
    expect(d.reprend).toBe(true);
    expect(d.contexte).toContain(
      'Le superviseur a étendu le plan à 030-binder ; le plan du ticket est maintenant : 000-forms, 030-binder.'
    );
    expect(d.contexte).not.toContain('le fait');
  });

  it('le texte de --contexte suit la réponse du superviseur', () => {
    const d = etendre({ ...entree, contexte: 'Le double, pas le triple.', etat: arret() });
    expect(d.contexte).toMatch(/030-binder[^]*\n\nLe double, pas le triple\.$/);
  });

  it('un arrêt sans question laisse le seul texte de --contexte', () => {
    expect(
      etendre({ ...entree, contexte: 'Mon mot.', etat: arret({ question: undefined }) }).contexte
    ).toBe('Mon mot.');
  });

  it('un arrêt « sans-livraison » dont le développeur renvoyait au testwriter reprend au testwriter', () => {
    const d = etendre({
      ...entree,
      etat: arret({ raison: 'sans-livraison', tentative: 3, rapport: 'RENVOI' }),
      renvoi: { role: 'testwriter' },
    });
    expect(d.suivant).toMatchObject({ etape: TESTS, tentative: 3, rapport: 'RENVOI' });
    expect(d.reprend).toBe(true);
  });

  it.each([
    ['un arrêt « sans-livraison » sans renvoi', arret({ raison: 'sans-livraison' }), null],
    ['un renvoi à un autre rôle', arret({ raison: 'sans-livraison' }), { role: 'relecteur' }],
    ['un renvoi sur un autre arrêt', arret({ raison: 'hors-portee' }), { role: 'testwriter' }],
    [
      'un renvoi hors du développeur',
      arret({ raison: 'sans-livraison', etape: CONTROLES }),
      { role: 'testwriter' },
    ],
  ])('%s : l’étape de l’arrêt reprend', (_nom, etat, renvoi) => {
    const d = etendre({ ...entree, etat, renvoi });
    expect(d.suivant?.etape).toBe(etat.etape);
  });
});
