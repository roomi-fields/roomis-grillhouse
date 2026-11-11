// The summary of a circuit's state its workflow publishes in its memo (`resumeDeLEtat`,
// src/temporal/circuit/contrat.ts), which the board reads (`lireLesCircuits`) and places at a step
// (`etapeDuCircuit`, scripts/etapes.mjs): from its opening to its plan passed, a run stands at
// step 1 Plan, whatever state its plan wrote last; once the plan passes, at the step of its state.
// The workflow itself, which publishes it at the opening and at each step of the plan, is proved by
// tests/temporal/circuit.nuit.spec.ts.
import { describe, expect, it } from 'vitest';
import { etapeDuCircuit } from '../../scripts/etapes.mjs';
import { resumeDeLEtat } from '../../src/temporal/circuit/contrat.js';

// The step number the board shows for the summary <r>.
const numeroDe = (r: ReturnType<typeof resumeDeLEtat>) =>
  etapeDuCircuit({ ...r, raison: r.raison })?.numero ?? null;

// The state the plan writes once a session ends (scripts/circuit.mjs `etatDuPlan`): the step of
// the testwriter, where a resumption starts, no session named.
const ETAT_ENTRE_DEUX_SEANCES = {
  etape: 'testwriter',
  tentative: 1,
  code: null,
  raison: null,
  rapport: null,
  questionnement: null,
};

describe('un circuit au plan est à l’étape 1 au tableau', () => {
  it('a run at its opening, no state written yet, stands at step 1 Plan', () => {
    const r = resumeDeLEtat(null, true);
    expect(r).toMatchObject({ etape: 'plan', questionnement: 'plan' });
    expect(numeroDe(r)).toBe('1');
  });

  it('the state the plan writes between two sessions stands at step 1, not at the testwriter', () => {
    const r = resumeDeLEtat(ETAT_ENTRE_DEUX_SEANCES, true);
    expect(r).toMatchObject({ etape: 'plan', questionnement: 'plan' });
    expect(numeroDe(r)).toBe('1');
  });

  it('a stop written during the plan is published as it is, by its own stop', () => {
    const arret = { ...ETAT_ENTRE_DEUX_SEANCES, raison: 'questionnement', code: 22 };
    expect(resumeDeLEtat(arret, true)).toMatchObject({
      etape: 'testwriter',
      raison: 'questionnement',
      code: 22,
    });
  });

  it('once the plan passes, the state stands at its own step: the testwriter at step 2', () => {
    const r = resumeDeLEtat(ETAT_ENTRE_DEUX_SEANCES, false);
    expect(r).toMatchObject({ etape: 'testwriter', questionnement: null });
    expect(numeroDe(r)).toBe('2');
  });
});
