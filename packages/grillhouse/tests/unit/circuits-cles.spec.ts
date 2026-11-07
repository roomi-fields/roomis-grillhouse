// grillhouse-4nr.9, decision D9: the setting of the project that bounds its circuits alive at once,
// the key `grillhouse.circuits` of its package.json (scripts/circuits-cles.mjs), read as written,
// as the other keys of the project are (the owner's word of 2026-11-04): an integer of 1 or more,
// the number of circuits that run at once; absent or null, 1; any other value is a fault, named.
import { describe, expect, it } from 'vitest';
import { reglageDesCircuits } from '../../scripts/circuits-cles.mjs';

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
