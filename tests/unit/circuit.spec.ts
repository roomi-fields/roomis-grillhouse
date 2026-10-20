import { readFileSync, rmSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canWrap, racineSousLaMaison } from '../machine.js';
import { sortie, CIRCUIT, IMMOBILE_MS, ARRETS, circuitEssai } from './circuit-essai.js';

// The circuit of a ticket (scripts/circuit.mjs): for each component of its title, the provider
// first, the testeur, the proof of the red, the developpeur and the checks; then the reviewer,
// and on ACCEPTÉ the integration, which puts the branch in the queue.
// Decided by the owner on 2026-10-17 (grill): the circuit launches each session itself, in place
// of a regulator launching and waiting for each one; the circuit
// launches the reviewer (Q6) and integrates the lot itself, the role of the integrateur gone (Q7);
// it ends at the entry of the lot in the queue (Q13).
//
// This file: the stops of the circuit and their codes, and the calls it refuses. The circuit of a
// ticket is tested in the files beside it: circuit.preuve (the testeur and the proof),
// circuit.sessions (the sessions relaunched, stopped and resumed), circuit.composants (a red judged
// by its component), circuit.passe-finale (the final pass), circuit.construction (a failed build),
// circuit.tests-de-head (the tests HEAD holds), circuit.relecture (the review and the
// integration) and circuit.regulator (the regulator on a stop).
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
      'sans-passation',
      'preuve',
      'controles',
      'sans-livraison',
      'relecture-arret',
      'integration',
      'a-repasser',
      'question',
      'hors-portee',
      'besoin',
    ];
    expect(Object.keys(ARRETS).sort()).toEqual([...noms].sort());
    const codes = Object.values(ARRETS);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).not.toContain(0);
    expect(codes).not.toContain(2);
    expect(ARRETS['a-repasser']).toBe(75);
    expect(ARRETS['relecture-arret']).toBe(16);
    // grillhouse-3uv.85, critère 4: the stop on the regulator's question.
    expect(ARRETS.question).toBe(18);
    // The stops on a status line: a BLOQUÉ without a recipient, a BESOIN.
    expect(ARRETS['hors-portee']).toBe(19);
    expect(ARRETS.besoin).toBe(20);
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

describe.runIf(canWrap)('the circuit refuses a malformed --depuis or --reponse', () => {
  const id = 'demo-depuis-refus';
  beforeAll(() => {
    ticket(id, '000-forms');
  });
  for (const [cas, args] of [
    ['a step other than testeur or developpeur', ['--depuis', 'preuve', 'packages/forms']],
    ['a component the title does not name', ['--depuis', 'testeur', 'packages/binder']],
    ['a component missing', ['--depuis', 'testeur']],
    ['--depuis with --reprendre', ['--depuis', 'testeur', 'packages/forms', '--reprendre']],
    ['--reponse without its text', ['--reponse']],
    ['--reponse with --reprendre', ['--reponse', 'Le double.', '--reprendre']],
  ] as const) {
    it(`${cas}, exit 2, nothing launched`, () => {
      const r = circuit([id, ...args]);
      expect(r.status, sortie(r)).toBe(2);
      expect(sessions(id, 'testeur')).toBe(0);
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
    expect(sessions(id, 'testeur')).toBe(0);
  });
});
