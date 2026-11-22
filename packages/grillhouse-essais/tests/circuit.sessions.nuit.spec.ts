// @equipee: l'enveloppe bwrap, un serveur Temporal
import { rmSync } from 'node:fs';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '@roomi-fields/grillhouse-matiere/test-fixtures';
import { sortie, CODE_JUSTE, ECRIT_ROUGE, LANCE, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs, tests/unit/circuit.spec.ts), the one journey that
// stays whole in the night: the command gives the hand back at once, and the circuit goes on to its
// end in the worker. The rules of the sessions (relaunches, stops « controles », « sans-livraison »,
// « sans-fiche », « bloqué », resumptions) are proved small, by their decision, in tests/unit of the
// package grillhouse (transitions.*.spec.ts, seances.*.spec.ts, activites.*.spec.ts).
// The trial repository and its stand-ins: ./circuit-essai.ts; each file of the circuit's tests
// builds its own, in a trial directory of its own.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { revenirAuDebut, ticket, scenario, circuit, sessions, etat, ordre } = circuitEssai(ESSAIS);

describe.runIf(canWrap)('the circuit of a ticket', { timeout: 300_000 }, () => {
  afterEach(revenirAuDebut);

  // grillhouse-ybq.4, critère 2. Witness: BPScript 320.8 (17:10:43), the circuit, a background
  // command of the supervisor's session, died with it (« Background shell command didn't finish
  // before the previous session ended »), and was resumed by hand. Its workflow runs in the worker
  // of the project: the command gives the hand back at once, and nothing of the run lives in it.
  // The death of the worker itself: tests/circuit.temporal.nuit.spec.ts.
  it('`npx grillhouse circuit` gives the hand back at once, and the circuit goes on to its end without it', () => {
    const id = 'demo-appelant-mort';
    ticket(id, '000-forms');
    scenario(id, 'testwriter', `${ECRIT_ROUGE}sleep 4\npassation 'Tests écrits.'\n`);
    scenario(id, 'developpeur', `${CODE_JUSTE}passation 'Code écrit.'\n`);
    const r = circuit([id]);
    expect(r.stdout, sortie(r)).toMatch(LANCE);
    expect(r.status, sortie(r)).toBe(0);
    expect(etat(id)).toMatchObject({ etape: 'integre', code: 0 });
    expect(sessions(id, 'testwriter')).toBe(1);
    expect(ordre(id)).toEqual(['testwriter', 'developpeur', 'relecteur']);
  });
});
