// The supervisor's context of a run (`--contexte`, with `--depuis`, `--reprendre` or `--etendre`)
// is the task of its sessions; the findings of the reviewer still open are their context
// (grillhouse-jya), as a review relaunched by its author on a task he frames keeps its threads in
// sight without blocking on them.
// Witness: BPScript bp-mono-vbwf.320.14.2.3 under 0.25.2, `--depuis developpeur --contexte "<écris
// dans 030-binder la demande de racine…>"`: the context came at line 13, after the rule that a sheet
// FAIT answers each open finding; the session worked an old finding of 130-projector only, its sheet
// was refused for a missing answer, the resumption changed no file, then « sans-livraison », twice:
// 16 sessions, 11,70 $, 84 % of the time lost.
import { describe, expect, it } from 'vitest';
import * as circuit from '../../scripts/circuit.mjs';

interface Constat {
  titre: string;
  regle: string;
  role: string;
  corps: string;
  piece?: string;
  reponse?: unknown;
  enContexte?: boolean;
}
interface DeLaSeance {
  tache: string;
  ouverts: string;
  constats: string;
  valider: (fiche: object) => string | null;
  repondre: (tous: Constat[], fiche: object) => Constat[];
}
const constatsDeLaSeance = circuit.constatsDeLaSeance as (
  contexte: string | null,
  constats: Constat[],
  role: string
) => DeLaSeance;
const consigne = circuit.consigne as (valeurs: Record<string, unknown>, rang: number) => string;
const auLancement = circuit.auLancement as (
  contexte: string | null,
  constats: Constat[]
) => Constat[];
const constatsOuverts = circuit.constatsOuverts as (
  ctx: { constats: Constat[] },
  fiche: object,
  texte: string
) => Constat[];

const CONTEXTE = 'Écris dans 030-binder la demande de racine que le test vise.';
const DESCRIPTION = 'Le ticket, sa description et ses critères.';
const RAPPORT = 'Le rapport des contrôles rouges.';
const ANCIEN: Constat = {
  titre: 'packages/130-projector/docs/INTERFACE.md:12',
  regle: 'une interface dit ses exports',
  role: 'developpeur',
  corps: 'La documentation de 130-projector ne nomme pas son export.',
  piece: 'packages/130-projector/docs/INTERFACE.md:12',
};
const DU_TESTWRITER = { ...ANCIEN, titre: 'un test du lot', role: 'testwriter' };

// The instruction of a fresh session (rang 0) and of a resumption (rang 3), rendered with the
// values that `seance` gives them, the findings <tous> as the run holds them, by default those
// open at its launch.
function rendre(
  contexte: string | null,
  rang: 0 | 3,
  tous: Constat[] = auLancement(contexte, [ANCIEN, DU_TESTWRITER])
) {
  const { tache, ouverts, constats } = constatsDeLaSeance(contexte, tous, 'developpeur');
  return consigne(
    {
      role: 'développeur',
      depot: '/depot',
      ticket: 'bp-1',
      sujet: 'le sujet',
      paquets: 'packages/030-binder',
      reprise: 'oui',
      lots: 'aucun',
      description: DESCRIPTION,
      notes: '',
      rapport: RAPPORT,
      passation: 'aucune',
      references: '',
      tentative: 2,
      change: 'les contrôles, joués après ta séance, sont rouges',
      tache,
      ouverts,
      constats,
    },
    rang
  );
}

describe('jya — the supervisor’s context heads the instruction, the open findings are its context', () => {
  it('critère 1 — a fresh instruction and a resumption carry the context first, as the task, before the ticket, the report and the findings', () => {
    for (const rang of [0, 3] as const) {
      const texte = rendre(CONTEXTE, rang);
      const ou = texte.indexOf(CONTEXTE);
      expect(ou, `rang ${rang}`).toBeGreaterThanOrEqual(0);
      expect(texte.slice(0, ou), `rang ${rang}`).toMatch(/TA TÂCHE/);
      for (const apres of ['TON TICKET', RAPPORT, ANCIEN.corps]) {
        expect(ou, `rang ${rang} : ${apres}`).toBeLessThan(texte.indexOf(apres));
      }
      if (rang === 0) {
        expect(ou).toBeLessThan(texte.indexOf(DESCRIPTION));
      }
      expect(texte.split(CONTEXTE).length - 1, `rang ${rang}`).toBe(1);
    }
  });

  it('critère 2 — under the context, the open findings are named as context; a sheet FAIT without an answer is not refused; an answer given is kept with its finding', () => {
    const lances = auLancement(CONTEXTE, [ANCIEN, DU_TESTWRITER]);
    const seance = constatsDeLaSeance(CONTEXTE, lances, 'developpeur');
    for (const rang of [0, 3] as const) {
      const texte = rendre(CONTEXTE, rang);
      const titre = texte.slice(texte.indexOf('LES CONSTATS'), texte.indexOf(ANCIEN.corps));
      expect(titre, `rang ${rang}`).toMatch(/en contexte/);
      expect(titre, `rang ${rang}`).not.toMatch(/QUI RESTENT OUVERTS pour ton rôle, chacun/);
    }
    expect(seance.valider({ statut: 'FAIT' })).toBeNull();
    const fiche = {
      statut: 'FAIT',
      reponses: [{ titre: ANCIEN.titre, etat: 'levé', piece: 'packages/130-projector/x:1' }],
    };
    const gardes = seance.repondre(lances, fiche);
    expect(gardes[0].reponse).toEqual({ etat: 'levé', piece: 'packages/130-projector/x:1' });
    expect(gardes[1]).toEqual(lances[1]);
  });

  // The reviewer of grillhouse-jya (4ba9b76): the context lasts the whole run, so a finding a
  // RENDU states within it came « en contexte », its answer not required.
  it('critère 2 — after a RENDU within a run with a context, the finding open at its launch stays context, the new one is the task and asks its answer', () => {
    const NEUF = {
      titre: 'packages/030-binder/src/racine.ts:4',
      genre: 'bloquant',
      regle: 'critère 1',
      role: 'developpeur',
      corps: 'La demande de racine ne garde pas son chemin.',
      piece: 'packages/030-binder/src/racine.ts:4',
    };
    const lances = auLancement(CONTEXTE, [ANCIEN, DU_TESTWRITER]);
    const apres = constatsOuverts(
      { constats: lances },
      { statut: 'RENDU', constats: [NEUF] },
      'le verdict'
    );
    const seance = constatsDeLaSeance(CONTEXTE, apres, 'developpeur');
    expect(seance.valider({ statut: 'FAIT' })).toBe(
      `reponses : sans réponse au constat « ${NEUF.titre} »`
    );
    expect(
      seance.valider({
        statut: 'FAIT',
        reponses: [{ titre: NEUF.titre, etat: 'levé', piece: NEUF.piece }],
      })
    ).toBeNull();
    for (const rang of [0, 3] as const) {
      const texte = rendre(CONTEXTE, rang, apres);
      expect(texte.indexOf(CONTEXTE), `rang ${rang}`).toBeLessThan(texte.indexOf('TON TICKET'));
      // The line of the task names only the findings given as context.
      expect(texte.slice(0, texte.indexOf(CONTEXTE)), `rang ${rang}`).toMatch(
        /TA TÂCHE, que le superviseur te donne ; elle passe avant le ticket, le rapport et les constats donnés en contexte ci-dessous :/
      );
      const neuf = texte.indexOf(NEUF.corps);
      const contexte = texte.indexOf('PUIS les constats ouverts au lancement');
      const ancien = texte.indexOf(ANCIEN.corps);
      expect(texte.slice(0, neuf), `rang ${rang}`).toMatch(
        /QUI RESTENT OUVERTS pour ton rôle, chacun jusqu'à la relecture qui le juge levé/
      );
      expect(neuf, `rang ${rang}`).toBeLessThan(contexte);
      expect(contexte, `rang ${rang}`).toBeLessThan(ancien);
    }
    // A RENDU that states the old finding again makes it the task.
    const redit = constatsOuverts(
      { constats: lances },
      { statut: 'RENDU', constats: [{ ...ANCIEN, genre: 'bloquant' }] },
      'le verdict'
    );
    expect(constatsDeLaSeance(CONTEXTE, redit, 'developpeur').valider({ statut: 'FAIT' })).toBe(
      `reponses : sans réponse au constat « ${ANCIEN.titre} »`
    );
    // No finding given as context: the line of the task names none.
    expect(constatsDeLaSeance(CONTEXTE, redit, 'developpeur').tache).toMatch(
      /^TA TÂCHE, que le superviseur te donne ; elle passe avant le ticket, le rapport ci-dessous :/
    );
  });

  it('critère 3 — without a context, the open findings are the task and a sheet FAIT answers each', () => {
    // A run without a context drops the mark a run with one left in the state.
    const lances = auLancement(null, auLancement(CONTEXTE, [ANCIEN, DU_TESTWRITER]));
    expect(lances).toEqual([ANCIEN, DU_TESTWRITER]);
    const seance = constatsDeLaSeance(null, lances, 'developpeur');
    expect(seance.tache).toBe('');
    expect(seance.valider({ statut: 'FAIT' })).toBe(
      `reponses : sans réponse au constat « ${ANCIEN.titre} »`
    );
    for (const rang of [0, 3] as const) {
      const texte = rendre(null, rang);
      expect(texte, `rang ${rang}`).not.toMatch(/TA TÂCHE/);
      const titre = texte.slice(texte.indexOf('LES CONSTATS'), texte.indexOf(ANCIEN.corps));
      expect(titre, `rang ${rang}`).toMatch(
        /^LES CONSTATS DU RELECTEUR QUI RESTENT OUVERTS pour ton rôle, chacun jusqu'à la relecture qui le juge levé :/
      );
      expect(titre, `rang ${rang}`).not.toMatch(/en contexte/);
    }
    expect(
      constatsDeLaSeance(null, [DU_TESTWRITER], 'testwriter').valider({ statut: 'FAIT' })
    ).toBeNull();
  });
});

// grillhouse-y42: in open-synth-descriptors (OSD-b91.2.3), each answer of the developpeur's sheet
// was titled « Constat N — <titre> », as the instruction heads the finding; none was paired.
describe('y42 — an answer titled as the instruction numbers its finding is paired with it', () => {
  it('critère 1 — no refusal, and the answer is kept with its finding', () => {
    const seance = constatsDeLaSeance(null, [ANCIEN, DU_TESTWRITER], 'developpeur');
    expect(seance.constats).toMatch(`### Constat 1 — ${ANCIEN.titre}`);
    const fiche = {
      statut: 'FAIT',
      reponses: [
        { titre: `Constat 1 — ${ANCIEN.titre}`, etat: 'levé', piece: 'packages/130-projector/x:1' },
      ],
    };
    expect(seance.valider(fiche)).toBeNull();
    const gardes = seance.repondre([ANCIEN, DU_TESTWRITER], fiche);
    expect(gardes[0].reponse).toEqual({ etat: 'levé', piece: 'packages/130-projector/x:1' });
    expect(gardes[1]).toEqual(DU_TESTWRITER);
  });

  it('critère 2 — an answer to no finding, numbered or not, leaves it without answer', () => {
    const seance = constatsDeLaSeance(null, [ANCIEN], 'developpeur');
    for (const titre of ['Constat 1 — un autre', 'un autre']) {
      const fiche = { statut: 'FAIT', reponses: [{ titre, etat: 'levé', piece: 'x:1' }] };
      expect(seance.valider(fiche), titre).toBe(
        `reponses : sans réponse au constat « ${ANCIEN.titre} »`
      );
      expect(seance.repondre([ANCIEN], fiche)[0], titre).toEqual(ANCIEN);
    }
  });

  // The reviewer's instruction heads each finding before it the same way (`lignesDesConstats`).
  it('a reviewer’s suivi levé titled « Constat N — <titre> » lifts its finding; one of no finding lifts none', () => {
    const suivi = (titre: string) => ({
      statut: 'ACCEPTÉ',
      suivi: [{ titre, etat: 'levé', preuve: 'la différence du lot' }],
    });
    expect(
      constatsOuverts({ constats: [ANCIEN] }, suivi(`Constat 1 — ${ANCIEN.titre}`), 'le verdict')
    ).toEqual([]);
    for (const titre of ['Constat 1 — un autre', 'un autre']) {
      expect(constatsOuverts({ constats: [ANCIEN] }, suivi(titre), 'le verdict'), titre).toEqual([
        ANCIEN,
      ]);
    }
  });
});
