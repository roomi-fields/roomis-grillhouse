// The id the circuit gives each session it opens (scripts/seances.mjs, `idDeSeance`), the one the
// bilan reads at the launch of the session: a UUID, fresh without a key, the same for the same
// attempt of the same event when a key of the act exists (an act that Temporal plays again).
import { describe, expect, it } from 'vitest';
import * as seances from '../../scripts/seances.mjs';

const idDeSeance = seances.idDeSeance as (
  ctx: { cle?: string; essaiDeLActe?: number },
  evenement: string
) => string;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('l’identifiant d’une séance', () => {
  it('est un UUID neuf à chaque appel quand le circuit n’a pas de clé d’acte', () => {
    const a = idDeSeance({}, 'relecture');
    const b = idDeSeance({}, 'relecture');
    expect(a).toMatch(UUID);
    expect(b).toMatch(UUID);
    expect(a).not.toBe(b);
  });

  it('est le même UUID pour le même événement d’un acte rejoué, un autre pour un autre événement', () => {
    const ctx = { cle: 'demo-1:acte' };
    expect(idDeSeance(ctx, 'relecture')).toMatch(UUID);
    expect(idDeSeance(ctx, 'relecture')).toBe(idDeSeance(ctx, 'relecture'));
    expect(idDeSeance(ctx, 'tri')).not.toBe(idDeSeance(ctx, 'relecture'));
  });

  it('change à chaque essai de l’acte', () => {
    const premier = idDeSeance({ cle: 'demo-1:acte', essaiDeLActe: 1 }, 'relecture');
    const second = idDeSeance({ cle: 'demo-1:acte', essaiDeLActe: 2 }, 'relecture');
    expect(second).toMatch(UUID);
    expect(second).not.toBe(premier);
  });
});
