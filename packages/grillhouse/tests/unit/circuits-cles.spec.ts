// grillhouse-4nr.9, decision D9: the setting of the project that bounds its circuits alive at once,
// the key `grillhouse.circuits` of its package.json (scripts/circuits-cles.mjs), read as written,
// as the other keys of the project are (the owner's word of 2026-11-04): an integer of 1 or more,
// the number of circuits that run at once; absent or null, 1; any other value is a fault, named.
import { describe, expect, it } from 'vitest';
import * as circuitsCles from '../../scripts/circuits-cles.mjs';

const { reglageDesCircuits } = circuitsCles;

describe('grillhouse.circuits', () => {
  it('absent or null: one circuit at a time', () => {
    expect(reglageDesCircuits({})).toEqual({ max: 1, faute: null });
    expect(reglageDesCircuits({ grillhouse: {} })).toEqual({ max: 1, faute: null });
    expect(reglageDesCircuits({ grillhouse: { circuits: null } })).toEqual({ max: 1, faute: null });
    expect(reglageDesCircuits(null)).toEqual({ max: 1, faute: null });
  });

  it('an integer of 1 or more: the bound', () => {
    expect(reglageDesCircuits({ grillhouse: { circuits: 1 } })).toEqual({ max: 1, faute: null });
    expect(reglageDesCircuits({ grillhouse: { circuits: 3 } })).toEqual({ max: 3, faute: null });
  });

  it('any other value is a fault, named with its value', () => {
    for (const v of [0, -1, 1.5, '2', true, [], {}]) {
      expect(reglageDesCircuits({ grillhouse: { circuits: v } })).toEqual({
        max: null,
        faute: `grillhouse.circuits vaut ${JSON.stringify(v)}, pas un entier ≥ 1.`,
      });
    }
  });
});

// The key `grillhouse.rappel`: the minutes between two presentations of a question of a circuit
// that nobody answered, a number above 0, 5 by default; any other value is a fault, named with its
// value, as the other keys `grillhouse.*` are.
describe('grillhouse.rappel', () => {
  const lire = (pkg: unknown) =>
    (
      circuitsCles as unknown as {
        reglageDuRappel: (pkg: unknown) => { minutes: number | null; faute: string | null };
      }
    ).reglageDuRappel(pkg);

  it('absent or null: 5 minutes', () => {
    expect(lire({})).toEqual({ minutes: 5, faute: null });
    expect(lire({ grillhouse: {} })).toEqual({ minutes: 5, faute: null });
    expect(lire({ grillhouse: { rappel: null } })).toEqual({ minutes: 5, faute: null });
    expect(lire(null)).toEqual({ minutes: 5, faute: null });
  });

  it('a number above 0: the interval, fractions included', () => {
    expect(lire({ grillhouse: { rappel: 1 } })).toEqual({ minutes: 1, faute: null });
    expect(lire({ grillhouse: { rappel: 12 } })).toEqual({ minutes: 12, faute: null });
    expect(lire({ grillhouse: { rappel: 0.5 } })).toEqual({ minutes: 0.5, faute: null });
  });

  it('any other value is a fault, named with its value', () => {
    for (const v of [0, -1, '5', true, [], {}]) {
      expect(lire({ grillhouse: { rappel: v } })).toEqual({
        minutes: null,
        faute: `grillhouse.rappel vaut ${JSON.stringify(v)}, pas un nombre > 0.`,
      });
    }
  });
});
