import { readFileSync, rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { sortie, CIRCUIT, IMMOBILE_MS, ARRETS, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs): for the whole ticket, the testwriter, the proof of
// the red, the developpeur and the checks, then the final pass and the reviewer, and on ACCEPTÉ
// the integration, which puts the branch in the queue.
// Decided by the owner on 2026-10-17 (grill): the circuit launches each session itself, in place
// of a session launching and waiting for each one; the circuit
// launches the reviewer (Q6) and integrates the lot itself, the role of the integrateur gone (Q7);
// it ends at the entry of the lot in the queue (Q13).
//
// This file: the stops of the circuit and their codes, and the calls it refuses. The circuit of a
// ticket is tested in the files beside it: circuit.preuve (the testwriter and the proof),
// circuit.sessions (the sessions relaunched, stopped and resumed), circuit.ticket (one session per
// agent for the whole ticket, its findings kept open), circuit.passe-finale (the final pass),
// circuit.construction (a failed build),
// circuit.tests-de-head (the tests HEAD holds), circuit.relecture (the review and the
// integration), circuit.gestes (the gestures the circuit makes) and circuit.montee (a question
// that goes up to the supervisor, and his answers).
// The trial repository and its stand-ins: ./circuit-essai.ts; each file of the circuit's tests
// builds its own, in a trial directory of its own.

// The trial lives out of /tmp, which the envelope replaces with an empty directory.
const ESSAIS = racineSousLaMaison('grillhouse-essais-circuit-');
afterAll(() => rmSync(ESSAIS, { recursive: true, force: true }));
const { ticket, circuit, sessions } = circuitEssai(ESSAIS);

describe('the stops of the circuit and their codes', () => {
  it('names a distinct code, not 0 nor 2, for each stop', () => {
    const noms = [
      'lancement',
      'bloqué',
      'sans-fiche',
      'preuve',
      'controles',
      'sans-livraison',
      'relecture-arret',
      'integration',
      'a-repasser',
      'hors-portee',
      'besoin',
      'questionnement',
      'references',
      'hors-plan',
    ];
    expect(Object.keys(ARRETS).sort()).toEqual([...noms].sort());
    const codes = Object.values(ARRETS);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).not.toContain(0);
    expect(codes).not.toContain(2);
    expect(ARRETS['a-repasser']).toBe(75);
    expect(ARRETS['relecture-arret']).toBe(16);
    // grillhouse-3uv.95.4: no stop of a regulator's question.
    expect(ARRETS).not.toHaveProperty('question');
    // The stops on a status line: a BLOQUÉ without a recipient, a BESOIN.
    expect(ARRETS['hors-portee']).toBe(19);
    expect(ARRETS.besoin).toBe(20);
    // grillhouse-3uv.95.5: questions of the plan left open after the explorateur's answer.
    expect(ARRETS.questionnement).toBe(22);
    // grillhouse-3uv.92.1, grillhouse-j2m: a regeneration that changes a file no reference
    // writes, or whose command fails.
    expect(ARRETS.references).toBe(23);
  });
  it('waits 20 minutes of a motionless transcript before it stops a session', () => {
    expect(IMMOBILE_MS).toBe(20 * 60 * 1000);
  });
  it('names its stops and their codes in its header', () => {
    const entete = readFileSync(CIRCUIT, 'utf8').split('\nimport ')[0];
    for (const [nom, code] of Object.entries(ARRETS)) {
      expect(entete).toContain(nom);
      expect(entete).toContain(String(code));
    }
  });
});

describe.runIf(canWrap)('the circuit refuses a malformed --depuis', () => {
  const id = 'demo-depuis-refus';
  beforeAll(() => {
    ticket(id, '000-forms');
  });
  // grillhouse-3uv.95.6: `--depuis` names a step for the whole ticket, never a component.
  for (const [cas, args] of [
    ['a step other than testwriter or developpeur', ['--depuis', 'preuve']],
    ['a step missing', ['--depuis']],
    ['a component after the step', ['--depuis', 'testwriter', 'packages/forms']],
    ['--depuis with --reprendre', ['--depuis', 'testwriter', '--reprendre']],
  ] as const) {
    it(`${cas}, exit 2, nothing launched`, () => {
      const r = circuit([id, ...args]);
      expect(r.status, sortie(r)).toBe(2);
      expect(sessions(id, 'testwriter')).toBe(0);
    });
  }
});

describe.runIf(canWrap)('the circuit refuses a malformed call', () => {
  it('without a ticket, exit 2', () => {
    expect(circuit([]).status).toBe(2);
  });
  it('--reprendre without a state, exit 2', () => {
    const id = 'demo-sans-etat';
    ticket(id, '000-forms');
    const r = circuit([id, '--reprendre']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(`${id}.circuit.json`);
  });
  it('a component of the title that names no package nor path, exit 2, named', () => {
    const id = 'demo-inconnu';
    ticket(id, '000-forms, 999-absent');
    const r = circuit([id]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('999-absent');
    expect(sessions(id, 'testwriter')).toBe(0);
  });
});
