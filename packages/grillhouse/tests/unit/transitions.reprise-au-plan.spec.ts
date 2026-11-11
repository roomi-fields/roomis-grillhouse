// La reprise d'un circuit arrêté à son plan (scripts/transitions.mjs `etatDeReprise`) : le déroulé
// d'un ticket sous Temporal (src/temporal/circuit/deroule.ts) tient, de son ouverture à son plan
// passé, l'étape `plan`, que la table des transitions ne connaît pas ; un arrêt pendant le plan
// s'écrit, et se reprend, à l'état que le plan écrit (le testwriter, son plan à écrire), d'où
// l'ouverture rejoue le plan. Modèle mûr : une reprise Temporal rejoue depuis l'étape où l'arrêt a
// eu lieu. Le déroulé lui-même, sous patched('reprise-au-plan'), se prouve la nuit
// (tests/temporal/circuit.nuit.spec.ts).
import { describe, expect, it } from 'vitest';
import { etapeDuCircuit } from '../../scripts/etapes.mjs';
import { AU_PLAN, etatDeReprise, TESTS, transition } from '../../scripts/transitions.mjs';

// The stop « inattendu » of a run at its plan, as the workflow held it before its opening.
const ARRET_AU_PLAN = {
  etape: AU_PLAN,
  tentative: 1,
  rapport: null,
  finale: false,
  raison: 'inattendu',
};

const TICKET = { id: 'x-1', paquets: ['packages/a'], sorte: null, copie: '/copie' };

describe('un circuit arrêté au plan se reprend au plan', () => {
  it('a stop at the plan is written at the plan’s state: the testwriter’s first attempt, the plan named', () => {
    expect(etatDeReprise(ARRET_AU_PLAN)).toMatchObject({
      etape: TESTS,
      tentative: 1,
      finale: false,
      raison: 'inattendu',
      questionnement: { objet: 'plan' },
    });
  });

  it('the board places a stop at the plan at step 1 Plan', () => {
    expect(etapeDuCircuit(etatDeReprise(ARRET_AU_PLAN))?.numero).toBe('1');
  });

  it('the state a stop at the plan resumes from is a step the table of transitions knows', () => {
    const d = transition({ etat: etatDeReprise(ARRET_AU_PLAN), memoire: {}, ticket: TICKET });
    expect(d.usage).toBeUndefined();
  });

  it('a stop past the plan resumes at its own step', () => {
    const arret = { etape: TESTS, tentative: 2, rapport: 'r', finale: false, raison: 'preuve' };
    expect(etatDeReprise(arret)).toBe(arret);
  });
});
