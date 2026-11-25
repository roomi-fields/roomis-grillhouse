// The decision of a direct circuit (scripts/transitions.mjs; circuit.md §5.1, §5.4, §5.5): it starts
// at 3 Code with the agent direct, goes from its sheet to the final pass, gives it back each red of
// the pass and each finding of the review within the bounded loops, and writes its texts to it. The
// ticket says its circuit (`ticket.circuit`); without it, the rule decides as a long circuit.
import { describe, expect, it } from 'vitest';
import * as transitions from '../../scripts/transitions.mjs';

interface Effet {
  genre: string;
  nom?: string;
  texte?: string;
  rapport?: string;
}
interface Etat {
  etape: string;
  tentative: number;
  rapport: string | null;
  finale: boolean;
  relanceSurLeRefus?: boolean;
}
interface Decision {
  besoin?: { fait: string; [p: string]: unknown };
  suivant: Etat;
  memoire: Record<string, unknown>;
  effets: Effet[];
  arret?: {
    nom: string;
    rapport?: string | null;
    question?: string;
    etape?: string | null;
    statut?: { role: string };
    horsDuPlan?: object;
  };
}
const T = transitions as unknown as Record<string, string> & {
  transition: (e: object) => Decision;
};
const { TESTS, PREUVE, CODE, CONTROLES, REFERENCES, RELECTURE, EN_FILE, INTEGRATION } = T;

const TICKET = {
  id: 'essai-1',
  paquets: ['packages/forms', 'packages/binder'],
  sorte: null,
  copie: '/copie',
  circuit: 'direct',
};
const FICHIER = 'packages/forms/src/index.mjs';
const TEST = 'packages/forms/tests/mesure.spec.mjs';

const FAIT = { statut: 'FAIT' };
const ROUGE = {
  rouge: true,
  aRepasser: false,
  arbitrer: false,
  auDeveloppeur: true,
  texte: 'ROUGE DE LA PASSE',
  complet: 'complet',
  sansListe: 'sans liste',
  avertissements: '',
  resume: 'passe finale rouge',
  rouges: [{ paquet: 'forms', texte: 'rouge' }],
  tous: [{ paquet: 'forms', texte: 'rouge' }],
  lieux: [{ paquet: 'forms', fichier: FICHIER, gardes: [] as string[], dansLePlan: true }],
  horsTitre: [] as string[],
  references: [],
  notes: [],
};
const VERT = { ...ROUGE, rouge: false, rouges: [], tous: [], lieux: [] };

// The facts of a run, which a case replaces by name.
const faits = (o: Record<string, unknown> = {}) => ({
  mecanique: false,
  sansTests: false,
  empreinteAvant: 'A',
  empreinte: 'B',
  empreinteEtape: 'E',
  seance: FAIT,
  renvoi: null,
  lecture: null,
  livre: false,
  livreAvant: false,
  passation: 'La passation.',
  passeFinale: { arbre: 'T', restreinte: null },
  arbreAvant: 'T',
  arbreApres: 'U',
  controles: ROUGE,
  referencesDesRouges: [],
  portes: { tests: [TEST], code: [FICHIER] },
  lotAccepte: false,
  rendus: 1,
  etendreAuxEcartes: true,
  etendreAuxTests: true,
  commit: 'abc1234',
  ...o,
});

// The decision of &lt;entree&gt;, each fact it asks for given from &lt;donnes&gt;, the requests kept.
function jouer(entree: object, donnes: Record<string, unknown> = faits()) {
  const lus: Record<string, unknown> = {};
  const besoins: { fait: string; [p: string]: unknown }[] = [];
  for (let i = 0; i < 50; i++) {
    const d = T.transition({
      ticket: TICKET,
      marqueurs: { attributionAvantSansLivraison: true },
      ...entree,
      faits: lus,
    });
    if (!d.besoin) {
      return { ...d, besoins };
    }
    besoins.push(d.besoin);
    if (!(d.besoin.fait in donnes)) {
      throw new Error(`fait non donné : ${d.besoin.fait}`);
    }
    lus[d.besoin.fait] = donnes[d.besoin.fait];
  }
  throw new Error('trop de faits');
}
const etat = (etape: string, tentative = 1, finale = false, rapport: string | null = null) => ({
  etape,
  tentative,
  rapport,
  finale,
});
const passe = (tentative = 1) => etat(CONTROLES, tentative, true);
const seanceDe = (d: { besoins: { fait: string; role?: unknown }[] }) =>
  d.besoins.find(b => b.fait === 'seance');

// Every text a decision writes: the ticket's lines, the reports, the stop, the state and the memory.
const textes = (d: Decision) =>
  [
    ...d.effets.flatMap(e => [e.texte, e.rapport]),
    d.arret?.rapport,
    d.arret?.question,
    d.suivant?.rapport,
    d.memoire?.rienALivrer,
  ]
    .filter(t => typeof t === 'string')
    .join('\n');
// The texts name the agent direct, and neither the developpeur nor its --depuis.
const nommentLeDirect = (d: Decision) => {
  expect(textes(d)).toMatch(/agent direct|--depuis direct/);
  expect(textes(d)).not.toMatch(/développeur|--depuis developpeur/);
};

describe('a direct circuit starts at 3 Code with the agent direct', () => {
  it('asks the session of the agent direct at 3 Code', () => {
    const d = jouer({ etat: etat(CODE) });
    expect(seanceDe(d)).toMatchObject({ role: 'direct', tentative: 1 });
  });

  it.each([
    ['2 Tests', TESTS],
    ['2.1 the proof of the red', PREUVE],
  ])(
    'launches the agent direct, never the testwriter nor the proof, from a state at %s',
    (_nom, etape) => {
      let courant: Etat = etat(etape, 1, false, 'LE CONFLIT');
      const vus: { fait: string; role?: unknown }[] = [];
      for (let i = 0; i < 4 && !vus.some(b => b.fait === 'seance'); i++) {
        const d = jouer({ etat: courant });
        expect(d.arret).toBeUndefined();
        vus.push(...d.besoins);
        courant = d.suivant;
      }
      expect(vus.filter(b => b.fait === 'seance').map(b => b.role)).toEqual(['direct']);
      expect(vus.map(b => b.fait)).not.toContain('preuve');
      expect([TESTS, PREUVE]).not.toContain(courant.etape);
    }
  );

  it.each([
    ['2 Tests', TESTS],
    ['3 Code', CODE],
  ])(
    'comes back to the pass once the session a conflict of the advance launched at %s ends',
    (_nom, etape) => {
      const retour = passe(2);
      let courant: Etat = etat(etape, 1, false, 'LE CONFLIT');
      let memoire: Record<string, unknown> = { retourDuConflit: retour };
      const roles: unknown[] = [];
      for (let i = 0; i < 4 && !roles.length; i++) {
        const d = jouer({ etat: courant, memoire });
        roles.push(...d.besoins.filter(b => b.fait === 'seance').map(b => b.role));
        courant = d.suivant;
        memoire = { ...memoire, ...d.memoire };
      }
      expect(roles).toEqual(['direct']);
      expect(courant).toMatchObject(retour);
      expect(memoire.retourDuConflit).toBeNull();
    }
  );

  it.each([
    ['a long circuit', 'long'],
    ['a circuit the ticket does not say', undefined],
  ])('keeps the testwriter at 2 Tests for %s', (_nom, circuit) => {
    const d = jouer({ etat: etat(TESTS), ticket: { ...TICKET, circuit } });
    expect(seanceDe(d)).toMatchObject({ role: 'testwriter' });
  });

  it.each(['long', 'court', undefined])(
    'keeps the developpeur at 3 Code for the circuit %s',
    circuit => {
      const d = jouer({ etat: etat(CODE), ticket: { ...TICKET, circuit } });
      expect(seanceDe(d)).toMatchObject({ role: 'developpeur' });
    }
  );
});

describe('the sheet of the agent direct', () => {
  it.each([1, 2, 3])(
    'FAIT at the session %i leads to the final pass, the count of the sessions kept',
    tentative => {
      const d = jouer({ etat: etat(CODE, tentative) });
      expect(d.arret).toBeUndefined();
      expect(d.suivant).toMatchObject({ etape: CONTROLES, finale: true, tentative });
    }
  );

  it('is never read as a sending of the red to the testwriter', () => {
    const d = jouer({ etat: etat(CODE) }, faits({ renvoi: 'Un renvoi au testwriter.' }));
    expect(d.arret).toBeUndefined();
    expect(d.suivant).toMatchObject({ etape: CONTROLES, finale: true });
    expect(d.effets.filter(e => e.genre === 'geste').map(e => e.nom)).not.toContain(
      'renvoi-au-testwriter'
    );
  });

  it.each([
    ['BESOIN', 'besoin'],
    ['BLOQUÉ', 'hors-portee'],
  ])('%s stops at « %s » naming the role direct', (statut, nom) => {
    const d = jouer(
      { etat: etat(CODE) },
      faits({ seance: { statut }, renvoi: 'Un renvoi au testwriter.' })
    );
    expect(d.arret?.nom).toBe(nom);
    expect(d.arret?.statut?.role).toBe('direct');
  });

  it('a copy it leaves unreadable relaunches it at 3 Code, one session used', () => {
    const d = jouer({ etat: etat(CODE) }, faits({ lecture: { rapport: 'ILLISIBLE' } }));
    expect(d.arret).toBeUndefined();
    expect(d.suivant).toMatchObject({ etape: CODE, tentative: 2, rapport: 'ILLISIBLE' });
    nommentLeDirect(d);
  });

  it('a copy still unreadable after its third session stops at « controles »', () => {
    const d = jouer({ etat: etat(CODE, 3) }, faits({ lecture: { rapport: 'ILLISIBLE' } }));
    expect(d.arret?.nom).toBe('controles');
  });
});

describe('a session of the agent direct that changes nothing', () => {
  const rien = () => jouer({ etat: etat(CODE) }, faits({ empreinte: 'A' }));

  it('plays the gesture « rien à livrer » toward the final pass', () => {
    const d = rien();
    expect(d.arret).toBeUndefined();
    expect(d.effets.filter(e => e.genre === 'geste').map(e => e.nom)).toEqual(['rien-a-livrer']);
    expect(d.suivant).toMatchObject({ etape: CONTROLES, finale: true });
    expect(String(d.memoire.rienALivrer)).toContain('La passation.');
    nommentLeDirect(d);
  });

  it.each([
    ['of code', FICHIER, [] as string[]],
    ['of test of the lot', TEST, ['tailles']],
  ])(
    'stops at « sans-livraison » at 3 Code, with no relaunch, on a red final pass on a file %s',
    (_nom, fichier, gardes) => {
      const premier = rien();
      const d = jouer(
        { etat: premier.suivant, memoire: premier.memoire },
        faits({ controles: { ...ROUGE, lieux: [{ fichier, gardes }] } })
      );
      expect(d.arret?.nom).toBe('sans-livraison');
      expect(d.arret?.etape).toBe(CODE);
    }
  );

  it.each([
    ['changes files', ['docs/agents/index-des-interfaces.md']],
    ['changes nothing', [] as string[]],
  ])(
    'stops at « sans-livraison » at 3 Code, with no relaunch, when the pass stays red after a regeneration that %s',
    (_nom, fichiers) => {
      const lieux = [
        { fichier: FICHIER, gardes: [] as string[] },
        { fichier: 'docs/agents/index-des-interfaces.md', gardes: [] as string[] },
      ];
      const donnes = faits({
        controles: { ...ROUGE, lieux },
        referencesDesRouges: [{ nom: 'index' }],
        regeneration: { texte: 'régénéré', regenerees: ['index'], fichiers, restreinte: null },
      });
      const premier = rien();
      const pass = jouer({ etat: premier.suivant, memoire: premier.memoire }, donnes);
      expect(pass.arret).toBeUndefined();
      expect(pass.suivant).toMatchObject({ etape: REFERENCES });
      let memoire: Record<string, unknown> = { ...premier.memoire, ...pass.memoire };
      const regeneration = jouer({ etat: pass.suivant, memoire }, donnes);
      expect(regeneration.suivant).toMatchObject({ etape: CONTROLES, finale: true });
      memoire = { ...memoire, ...regeneration.memoire };
      const suite = jouer(
        { etat: regeneration.suivant, memoire },
        faits({ controles: { ...ROUGE, lieux: [lieux[0]] } })
      );
      expect(suite.arret?.nom).toBe('sans-livraison');
      expect(suite.arret?.etape).toBe(CODE);
      expect([pass, regeneration, suite].map(seanceDe)).toEqual([undefined, undefined, undefined]);
    }
  );
});

describe('a red final pass of a direct circuit', () => {
  it('goes back to the agent direct, the output of the pass as its report', () => {
    const d = jouer({ etat: passe(1) });
    expect(d.arret).toBeUndefined();
    expect(d.suivant).toMatchObject({ etape: CODE, tentative: 2, rapport: 'ROUGE DE LA PASSE' });
    nommentLeDirect(d);
  });

  it.each([
    ['a test file of the lot a guard refuses', [{ fichier: TEST, gardes: ['tailles'] }], {}],
    [
      'a test file the message of a failed test names',
      [{ fichier: 'packages/forms/tests/garde.spec.mjs', gardes: [], nommes: [TEST] }],
      { tests: [TEST], code: ['packages/forms/tests/garde.spec.mjs'] },
    ],
    [
      'a test file of a reader package',
      [{ fichier: TEST, gardes: [] }],
      { tests: [TEST], code: [], lecteurs: [TEST] },
    ],
    [
      'test files and code together',
      [
        { fichier: TEST, gardes: ['tailles'] },
        { fichier: FICHIER, gardes: [] },
      ],
      {},
    ],
  ])('gives %s to the agent direct, no file replayed alone', (_nom, lieux, portes) => {
    const d = jouer(
      { etat: passe(1) },
      faits({
        controles: { ...ROUGE, lieux },
        portes: { tests: [TEST], code: [FICHIER], ...portes },
      })
    );
    expect(d.arret).toBeUndefined();
    expect(d.suivant).toMatchObject({ etape: CODE, tentative: 2 });
    expect(d.memoire.reprise ?? null).toBeNull();
    expect(d.memoire.relancesTestwriter ?? 0).toBe(0);
  });

  it('stops at « controles » on the third session that does not lift it, from 3 Code to the stop', () => {
    let courant: Etat = etat(CODE, 1);
    let memoire: Record<string, unknown> = {};
    const sessions: unknown[] = [];
    let arret: string | undefined;
    for (let i = 0; i < 12 && !arret; i++) {
      const d = jouer(
        { etat: courant, memoire },
        faits({ controles: { ...ROUGE, lieux: [{ fichier: TEST, gardes: ['tailles'] }] } })
      );
      const s = seanceDe(d);
      if (s) {
        sessions.push([s.role, s.tentative]);
      }
      arret = d.arret?.nom;
      courant = d.suivant;
      memoire = { ...memoire, ...d.memoire };
    }
    expect(sessions).toEqual([
      ['direct', 1],
      ['direct', 2],
      ['direct', 3],
    ]);
    expect(arret).toBe('controles');
  });

  it('keeps the count across the regeneration of the references and back to the final pass', () => {
    const avant = jouer({ etat: passe(2) }, faits({ referencesDesRouges: [{ nom: 'index' }] }));
    expect(avant.suivant).toMatchObject({ etape: REFERENCES, tentative: 2 });
    const apres = jouer(
      { etat: avant.suivant, memoire: avant.memoire },
      faits({
        regeneration: { texte: 'régénéré', regenerees: ['index'], fichiers: [], restreinte: null },
      })
    );
    expect(apres.suivant).toMatchObject({ etape: CONTROLES, tentative: 2, finale: true });
  });

  it('gives a refused regeneration to the agent direct, which comes back to the final pass', () => {
    const avant = jouer({ etat: passe(1) }, faits({ referencesDesRouges: [{ nom: 'index' }] }));
    const refus = jouer(
      { etat: avant.suivant, memoire: avant.memoire },
      faits({ regeneration: { refus: ['La commande refuse le lot.'] } })
    );
    expect(refus.suivant).toMatchObject({ etape: CODE, tentative: 2 });
    nommentLeDirect(refus);
    const seance = jouer({ etat: refus.suivant, memoire: refus.memoire });
    expect(seanceDe(seance)).toMatchObject({ role: 'direct', tentative: 2 });
    expect(seance.suivant).toMatchObject({ etape: CONTROLES, finale: true, tentative: 2 });
  });

  it('green, goes to the review', () => {
    const d = jouer({ etat: passe(1) }, faits({ controles: VERT }));
    expect(d.arret).toBeUndefined();
    expect(d.suivant.etape).toBe(RELECTURE);
  });
});

describe('a RENDU of the review of a direct circuit', () => {
  const constat = { titre: 'Un constat', role: 'direct', corps: 'c', piece: 'p', regle: 'r' };
  const relire = (rendus: number) =>
    jouer(
      { etat: etat(RELECTURE) },
      faits({
        relecture: { verdict: 'RENDU', texte: 'LE VERDICT', fiche: { verdict: 'RENDU' } },
        constats: { constats: [constat] },
        rendus,
      })
    );

  it.each([1, 2])('goes back to the agent direct at the review %i', rendus => {
    const d = relire(rendus);
    expect(d.arret).toBeUndefined();
    expect(d.suivant).toMatchObject({ etape: CODE, tentative: 1 });
    expect(d.memoire.constats).toEqual([constat]);
    nommentLeDirect(d);
    const seance = jouer({ etat: d.suivant, memoire: d.memoire });
    expect(seanceDe(seance)).toMatchObject({ role: 'direct' });
  });

  it('stops at « relecture-arret » on the third', () => {
    expect(relire(3).arret?.nom).toBe('relecture-arret');
  });
});

describe('the texts a direct circuit writes name the agent direct', () => {
  it('a red final pass in a package out of the plan', () => {
    const d = jouer(
      { etat: passe(1) },
      faits({ controles: { ...ROUGE, horsTitre: ['060-sheet'], auDeveloppeur: false } })
    );
    expect(d.arret?.nom).toBe('controles');
    expect(d.arret?.rapport).toContain('--depuis direct');
    nommentLeDirect(d);
  });

  it.each([
    ['no package of the plan holds', { auDeveloppeur: false }],
    ['is to arbitrate', { arbitrer: true }],
  ])('a red final pass that %s', (_nom, o) => {
    const d = jouer({ etat: passe(1) }, faits({ controles: { ...ROUGE, ...o } }));
    expect(d.arret?.nom).toBe('controles');
    expect(textes(d)).not.toMatch(/développeur|--depuis developpeur/);
  });

  it('a red final pass on a file nobody wrote', () => {
    const d = jouer(
      { etat: passe(1) },
      faits({ controles: { ...ROUGE, lieux: [{ fichier: 'autre/fichier.mjs', gardes: [] }] } })
    );
    expect(d.arret?.nom).toBe('controles');
    expect(d.arret?.rapport).toContain('autre/fichier.mjs');
    expect(textes(d)).not.toMatch(/développeur|--depuis developpeur/);
  });

  it('a regeneration whose references the state lost', () => {
    const d = jouer({ etat: etat(REFERENCES, 1, true) });
    expect(d.arret?.nom).toBe('references');
    expect(d.arret?.rapport).toContain('--depuis direct');
    nommentLeDirect(d);
  });

  it('a branch the queue cannot replay on main', () => {
    const d = jouer(
      { etat: etat(EN_FILE) },
      faits({
        file: { etat: 'rouvert', raison: 'Conflit avec main.', conflit: true },
      })
    );
    expect(d.arret?.nom).toBe('integration');
    expect(d.arret?.question).toContain('--depuis direct');
    nommentLeDirect(d);
  });

  const refus = { rapport: 'REFUS', piece: 'P', empreinte: 'A', lance: true, relance: false };

  it('relaunches the agent direct once on the refusal of a lot it leaves unchanged', () => {
    const d = jouer({ etat: etat(CODE), memoire: { refus } }, faits({ empreinte: 'A' }));
    expect(d.arret).toBeUndefined();
    expect(d.suivant).toMatchObject({ etape: CODE, tentative: 2 });
    nommentLeDirect(d);
  });

  it('stops at « sans-livraison » on a second unchanged session on that refusal', () => {
    const d = jouer(
      { etat: etat(CODE, 2), memoire: { refus: { ...refus, relance: true } } },
      faits({ empreinte: 'A' })
    );
    expect(d.arret?.nom).toBe('sans-livraison');
    nommentLeDirect(d);
  });

  it('an integration that refuses the lot keeps the refusal for the agent direct', () => {
    const d = jouer(
      { etat: etat(INTEGRATION) },
      faits({
        integration: { code: 1, sortie: 'REFUS DU SCRIPT', commande: 'integrer' },
      })
    );
    expect(d.arret?.nom).toBe('integration');
    expect(textes(d)).not.toMatch(/développeur|--depuis developpeur/);
  });
});
