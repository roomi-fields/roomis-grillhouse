// The circuits of a ticket as the list of the steps declares them (scripts/etapes.mjs; circuit.md
// §5.1, the table « Étape × Long, Court, Direct »): the circuits that play each step, the roles of a
// step for a circuit, the agents who write the lot of a circuit, the loops that run at a step for a
// circuit, and the answers the text of the questions names.
import { describe, expect, it } from 'vitest';
import * as etapes from '../../scripts/etapes.mjs';

interface Etape {
  numero: string;
  qui: string[];
  circuits?: string[];
}
const E = etapes as unknown as {
  SUITE: Etape[];
  AUTO: string;
  REPONSES: string;
  rolesDe: (e: Etape, circuit: string) => string[];
  agentsDuLot: (circuit?: string | null) => string[];
  bouclesDe: (e: Etape, circuit?: string) => { cle: string; max: number }[];
  quiDe: (e: Etape) => string;
};
const a = (numero: string) => E.SUITE.find(e => e.numero === numero)!;

describe('the circuits that play each step, as the table of the three circuits gives them', () => {
  it.each([
    ['1', ['court', 'long']],
    ['1.1', ['court']],
    ['2', ['long']],
    ['2.1', ['long']],
    ['3', ['court', 'direct', 'long']],
    ['3.1', ['court', 'long']],
    ['4.1', ['court', 'direct', 'long']],
    ['4.2', ['court', 'direct', 'long']],
    ['4.3', ['court', 'direct', 'long']],
    ['5.1', ['court', 'direct', 'long']],
    ['5.2', ['court', 'direct', 'long']],
    ['5.3', ['court', 'direct', 'long']],
  ])('the step %s is played by the circuits %j', (numero, circuits) => {
    expect([...(a(numero).circuits ?? [])].sort()).toEqual(circuits);
  });
});

describe('the roles of a step for a circuit', () => {
  it('has the agent direct alone at 3 Code in a direct circuit, the developpeur alone in the others', () => {
    expect(E.rolesDe(a('3'), 'direct')).toEqual(['direct']);
    expect(E.rolesDe(a('3'), 'long')).toEqual(['developpeur']);
    expect(E.rolesDe(a('3'), 'court')).toEqual(['developpeur']);
  });

  it.each(['1', '1.1', '2', '2.1', '3.1'])(
    'has none at the step %s a direct circuit does not play',
    numero => {
      expect(E.rolesDe(a(numero), 'direct')).toEqual([]);
    }
  );

  it('has none at the tests of a short circuit, nor at the gesture of a long one', () => {
    expect(E.rolesDe(a('2'), 'court')).toEqual([]);
    expect(E.rolesDe(a('2.1'), 'court')).toEqual([]);
    expect(E.rolesDe(a('1.1'), 'long')).toEqual([]);
  });

  it('gives the short circuit both the gesture and the code, the sort of the plan choosing', () => {
    expect(E.rolesDe(a('1.1'), 'court')).toEqual(['explorateur']);
    expect(E.rolesDe(a('3'), 'court')).toEqual(['developpeur']);
  });

  it('keeps the roles of the steps every circuit plays', () => {
    for (const circuit of ['long', 'court', 'direct']) {
      expect(E.rolesDe(a('4.1'), circuit), circuit).toEqual([E.AUTO]);
      expect(E.rolesDe(a('4.3'), circuit), circuit).toEqual(['relecteur']);
      expect(E.rolesDe(a('5.3'), circuit), circuit).toEqual(['explorateur']);
    }
  });

  it('keeps the roles and the label of 3 Code the board reads', () => {
    expect(E.rolesDe(a('3'), 'direct')).toEqual(['direct']);
    expect(a('3').qui).toEqual(['developpeur']);
    expect(E.quiDe(a('3'))).toBe('développeur');
  });
});

describe('the agents who write the lot of a circuit', () => {
  it('is the agent direct alone in a direct circuit', () => {
    expect(E.agentsDuLot('direct')).toEqual(['direct']);
  });

  it.each(['long', 'court', undefined, null])(
    'is the testwriter and the developpeur in the circuit %s',
    circuit => {
      expect(E.agentsDuLot(circuit)).toEqual(['testwriter', 'developpeur']);
    }
  );
});

describe('the loops that run at a step of a direct circuit', () => {
  it('counts the sessions of the code at 3 and still at the final pass', () => {
    expect(E.bouclesDe(a('3'), 'direct').map(b => b.cle)).toEqual(['code']);
    expect(E.bouclesDe(a('4.1'), 'direct')).toEqual([{ cle: 'code', libelle: 'essai', max: 3 }]);
  });

  it('counts the reviews at 4.3', () => {
    expect(E.bouclesDe(a('4.3'), 'direct').map(b => b.cle)).toEqual(['relecture']);
  });

  it.each(['long', 'court'])('counts no code at the final pass of a %s circuit', circuit => {
    expect(E.bouclesDe(a('4.1'), circuit)).toEqual([]);
  });
});

describe('the answers the questions of the circuit name', () => {
  it('names --depuis direct', () => {
    expect(E.REPONSES).toMatch(/--depuis (?:direct\b|<[^>]*\bdirect\b[^>]*>)/);
  });
});
