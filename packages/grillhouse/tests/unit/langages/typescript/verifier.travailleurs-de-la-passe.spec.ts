// The workers of each task of tests of a heavy pass (scripts/langages/typescript/verifier.mjs,
// `travailleursDeLaPasse`): the cores of the machine shared between the tasks of tests played side
// by side, so that the test processes of a pass never outnumber the cores.
//
// Small tests: a pure function.
import { describe, expect, it } from 'vitest';
import { travailleursDeLaPasse } from '../../../../scripts/langages/typescript/verifier.mjs';

describe('les travailleurs de chaque tâche de tests d’une passe', () => {
  it('12 cores and 6 tasks side by side over 44 packages give 2 workers each, 12 in all', () => {
    const n = travailleursDeLaPasse({ coeurs: 12, coteACote: 6, paquets: 44 });
    expect(n).toBe(2);
    expect(n * 6).toBeLessThanOrEqual(12);
  });
  it('fewer packages than tasks side by side share the cores between the packages', () => {
    expect(travailleursDeLaPasse({ coeurs: 12, coteACote: 6, paquets: 2 })).toBe(6);
    expect(travailleursDeLaPasse({ coeurs: 12, coteACote: 6, paquets: 1 })).toBe(12);
  });
  it('one worker at least, whatever the machine', () => {
    expect(travailleursDeLaPasse({ coeurs: 2, coteACote: 4, paquets: 9 })).toBe(1);
    expect(travailleursDeLaPasse({ coeurs: 4, coteACote: 2, paquets: 0 })).toBe(4);
  });
});
