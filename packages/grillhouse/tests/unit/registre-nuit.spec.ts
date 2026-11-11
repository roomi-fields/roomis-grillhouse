// The register's line of a night that the workflow of the nights skips (scripts/registre.mjs,
// `ligneDeNuit`): its role `nuit`, no ticket, no turn, the reason, the top and the reference
// compared, one key per project, top and day; the board counts it nowhere, neither as an agent
// nor as a step.
import { describe, expect, it } from 'vitest';
import { ligneDeNuit } from '../../scripts/registre.mjs';
import { assembler } from '../../scripts/tableau.mjs';

const MIN = 60_000;
const MAINTENANT = Date.parse('2026-11-12T23:30:00Z');
const saut = (quand: string) =>
  ligneDeNuit({
    projet: '/depot/demo',
    quand,
    raison: 'son sommet abc1234 est celui de sa dernière nuit verte : rien n’a bougé',
    sommet: 'a'.repeat(40),
    reference: 'a'.repeat(40),
  });

describe('the register line of a night skipped', () => {
  it('carries the reason, the top and the reference compared, with no ticket and no turn', () => {
    expect(saut('2026-11-12T23:05:00.000Z')).toMatchObject({
      projet: '/depot/demo',
      ticket: null,
      role: 'nuit',
      tours: [],
      jetons: 0,
      nuit: {
        verdict: 'sautee',
        raison: expect.stringContaining('dernière nuit verte') as string,
        sommet: 'a'.repeat(40),
        reference: 'a'.repeat(40),
      },
    });
  });
  it('has one key per project, top and day', () => {
    expect(saut('2026-11-12T23:05:00.000Z').cle).toBe(saut('2026-11-12T23:40:00.000Z').cle);
    expect(saut('2026-11-12T23:05:00.000Z').cle).not.toBe(saut('2026-11-13T23:05:00.000Z').cle);
  });
  it('the board counts it nowhere', () => {
    const tableau = (registre: object[]) =>
      assembler({
        tous: [],
        prefix: 'demo',
        registre,
        vivants: [],
        maintenant: MAINTENANT,
        jour: MAINTENANT - 24 * 60 * MIN,
      });
    expect(tableau([saut('2026-11-12T23:05:00.000Z')])).toEqual(tableau([]));
  });
});
