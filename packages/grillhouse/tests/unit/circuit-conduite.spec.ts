// The conduct around the circuit of a ticket (scripts/circuit.mjs), decided by the owner on
// 2026-10-17 (grill, Q10 and Q2): the supervisor launches the circuit in the background, its end
// waking him. The wait by slices (the script `ATTENDRE` names) is gone: no session waits for a
// verdict at a ticket. The wording of the texts that describe this conduct is judged by the
// reviewer (grillhouse-44b.10.5), not by a test.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const RACINE = path.resolve(__dirname, '../../../..');
// The name of the removed script, written in two parts so that this file does not cite it.
const ATTENDRE = ['attendre', 'sh'].join('.');

describe('Q2 — the wait by slices is gone', () => {
  it('the script is removed', () => {
    expect(existsSync(path.join(RACINE, 'packages/grillhouse/scripts', ATTENDRE))).toBe(false);
  });
});
