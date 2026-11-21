// The supervisor's explicit command wins over the sort of the plan: under « comportement inchangé »,
// `--depuis testwriter` plays a session of the testwriter, the circuit marks in its memory that the
// supervisor asked it (`testwriterDemande`), the proof accepts every green, a lot of tests alone goes
// to the checks, and a stop of the testwriter goes up to the supervisor. Without the command, the
// mark is not set and the plan's rule stays. As a merge queue or an orchestrator lets the operator
// replay a named step, whatever the automatic rule would have chosen.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as transitions from '../../scripts/transitions.mjs';

const RACINE = path.resolve(__dirname, '../../../..');
const plat = (f: string) => readFileSync(path.join(RACINE, f), 'utf8').replace(/\s+/g, ' ');

interface Effet {
  genre: string;
  etape?: string;
  texte?: string;
}
interface Decision {
  besoin?: { fait: string };
  suivant: { etape: string; tentative: number; rapport: string | null };
  memoire: Record<string, unknown>;
  effets: Effet[];
  arret?: { nom: string };
}
const transition = transitions.transition as (e: object) => Decision;
const T = transitions as unknown as Record<string, string>;
const testwriterDemande = transitions.testwriterDemande as (o: {
  depuis: string | null;
  reprendre: boolean;
  marque: boolean;
}) => boolean;

const INCHANGE = { genre: 'comportement', raison: 'des commentaires', comportement: 'inchangé' };
const MECANIQUE = { genre: 'mécanique', raison: 'un renommage', commande: 'git mv a b' };
const ticket = (sorte: object) => ({
  id: 'essai-1',
  paquets: ['packages/a'],
  sorte,
  copie: '/copie',
});

// Plays the decision of <etape>, giving each fact it asks for from <faits>; the decision, or the
// first fact missing from <faits>.
function jouer(
  etape: string,
  sorte: object,
  memoire: Record<string, unknown>,
  faits: Record<string, unknown>
) {
  const lus: Record<string, unknown> = {};
  for (let i = 0; i < 30; i++) {
    const d = transition({
      etat: { etape, tentative: 1, rapport: null, finale: false },
      memoire,
      ticket: ticket(sorte),
      faits: lus,
    });
    if (!d.besoin) {
      return { decision: d, manque: null };
    }
    if (!(d.besoin.fait in faits)) {
      return { decision: d, manque: d.besoin.fait };
    }
    lus[d.besoin.fait] = faits[d.besoin.fait];
  }
  throw new Error('trop de faits');
}
const FAITS_DU_PLAN = { mecanique: false, sansTests: false };
const preuve = { ok: true, rouges: 0, texte: 'T', resume: 'r', resultat: {} };

describe('la marque de la demande du superviseur : posée par --depuis testwriter, gardée par --reprendre, tombée sinon', () => {
  it('`--depuis testwriter` pose la marque', () => {
    expect(testwriterDemande({ depuis: 'testwriter', reprendre: false, marque: false })).toBe(true);
    expect(testwriterDemande({ depuis: 'testwriter', reprendre: true, marque: false })).toBe(true);
  });

  it('un démarrage sans --depuis, un plan neuf, ne pose pas la marque', () => {
    expect(testwriterDemande({ depuis: null, reprendre: false, marque: false })).toBe(false);
  });

  it('`--reprendre` sans commande garde la marque posée et ne la pose pas', () => {
    expect(testwriterDemande({ depuis: null, reprendre: true, marque: true })).toBe(true);
    expect(testwriterDemande({ depuis: null, reprendre: true, marque: false })).toBe(false);
  });

  it('un démarrage sans --depuis fait tomber la marque posée', () => {
    expect(testwriterDemande({ depuis: null, reprendre: false, marque: true })).toBe(false);
  });

  it('un --depuis d’une autre étape fait tomber la marque posée', () => {
    for (const depuis of ['developpeur', 'preuve', 'controles', 'passe-finale']) {
      expect(testwriterDemande({ depuis, reprendre: false, marque: true }), depuis).toBe(false);
      expect(testwriterDemande({ depuis, reprendre: true, marque: true }), depuis).toBe(false);
    }
  });

  it('la marque est de la mémoire du circuit : elle survit aux arrêts et aux relances', () => {
    expect(transitions.MEMOIRE).toContain('testwriterDemande');
  });
});

describe('après le plan, sous « comportement inchangé »', () => {
  it('sans la marque, le développeur directement, sans testwriter ni preuve', () => {
    const { decision } = jouer(T.TESTS, INCHANGE, {}, FAITS_DU_PLAN);
    expect(decision.suivant).toMatchObject({ etape: T.CODE, tentative: 1 });
  });

  it('avec la marque, le testwriter joue sa séance, et le commentaire dit que le superviseur l’a demandée', () => {
    const { decision, manque } = jouer(
      T.TESTS,
      INCHANGE,
      { testwriterDemande: true },
      FAITS_DU_PLAN
    );
    expect(manque).toBe('seance');
    expect(decision.besoin).toMatchObject({ fait: 'seance' });
    const dit = decision.effets
      .filter(e => e.genre === 'commenter')
      .map(e => e.texte ?? '')
      .join('\n');
    expect(dit).toMatch(/superviseur/);
    expect(dit).toMatch(/testwriter/);
  });

  it('un plan mécanique garde sa route (1.1), marque ou non', () => {
    for (const memoire of [{}, { testwriterDemande: true }]) {
      const { decision } = jouer(T.TESTS, MECANIQUE, memoire, {
        ...FAITS_DU_PLAN,
        mecanique: true,
      });
      expect(decision.suivant.etape).toBe(T.GESTE);
    }
  });

  it('un plan sans test garde le développeur directement, la marque ne le change pas', () => {
    const { decision } = jouer(
      T.TESTS,
      { genre: 'comportement', raison: 'r', comportement: 'changé' },
      { testwriterDemande: true },
      { ...FAITS_DU_PLAN, sansTests: true }
    );
    expect(decision.suivant.etape).toBe(T.CODE);
  });
});

describe('la séance du testwriter demandée par le superviseur', () => {
  const marque = { testwriterDemande: true };

  it('FAIT : la preuve suit, la sorte du plan reste « inchangé »', () => {
    const { decision, manque } = jouer(T.TESTS, INCHANGE, marque, {
      ...FAITS_DU_PLAN,
      seance: { statut: 'FAIT' },
      lecture: null,
    });
    expect(manque).not.toBe('seance');
    expect(decision.suivant?.etape ?? T.PREUVE).toBe(T.PREUVE);
  });

  it('un testwriter bloqué monte au superviseur, comme sous tout plan', () => {
    const { decision } = jouer(T.TESTS, INCHANGE, marque, {
      ...FAITS_DU_PLAN,
      seance: { statut: 'BLOQUÉ', raison: 'r' },
    });
    expect(decision.arret).toBeDefined();
  });

  it('un testwriter qui dit aucun-comportement monte au superviseur : le circuit ne bascule pas de lui-même', () => {
    const { decision } = jouer(T.TESTS, INCHANGE, marque, {
      ...FAITS_DU_PLAN,
      seance: { statut: 'BESOIN', motif: 'aucun-comportement', question: 'q' },
    });
    expect(decision.arret).toBeDefined();
    expect(decision.effets.find(e => e.genre === 'sorte')).toBeUndefined();
  });
});

describe('la preuve sous la marque', () => {
  const marque = { testwriterDemande: true };

  it('une preuve sans rouge passe aux contrôles, sans séance du développeur', () => {
    const { decision } = jouer(T.PREUVE, INCHANGE, marque, { preuve });
    expect(decision.suivant).toMatchObject({ etape: T.CONTROLES, tentative: 0 });
  });

  it('une preuve rouge va toujours au développeur', () => {
    const { decision } = jouer(T.PREUVE, INCHANGE, marque, { preuve: { ...preuve, rouges: 2 } });
    expect(decision.suivant).toMatchObject({ etape: T.CODE, tentative: 1 });
  });

  it('un constat du relecteur ouvert pour le développeur lui renvoie le lot', () => {
    const { decision } = jouer(
      T.PREUVE,
      INCHANGE,
      { ...marque, constats: [{ role: 'developpeur', titre: 't' }] },
      { preuve }
    );
    expect(decision.suivant.etape).toBe(T.CODE);
  });
});

describe('la règle écrite : la charte et l’architecture du paquet disent l’exception', () => {
  it('la charte : sous « comportement inchangé », la commande --depuis testwriter du superviseur l’emporte', () => {
    const charte = plat('mods/grillhouse/charte.md');
    const debut = charte.indexOf('**Un ticket prend le circuit court');
    const fin = charte.indexOf("**Un ticket prend l'une de trois voies**");
    const paragraphe = charte.slice(debut, fin);
    expect(paragraphe).toContain('--depuis testwriter');
    expect(paragraphe).toMatch(/superviseur/);
  });

  it('l’architecture du paquet : la commande du superviseur l’emporte sur la sorte « inchangé »', () => {
    const architecture = plat('packages/grillhouse/docs/ARCHITECTURE.md');
    const i = architecture.indexOf('le développeur seul, sans testwriter ni preuve');
    expect(i).toBeGreaterThan(-1);
    expect(architecture.slice(i, i + 900)).toContain('--depuis testwriter');
  });
});
