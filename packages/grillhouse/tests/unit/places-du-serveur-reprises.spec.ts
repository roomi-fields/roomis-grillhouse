// The bridge to the places of the machine (scripts/places-du-serveur.mjs) plays again a call the
// server fails transiently, and only then gives up: a busy server is a wait, never a red.
import { createServer } from 'node:net';
import { describe, expect, it } from 'vitest';
import { avecReprises, ecoute, transitoire } from '../../scripts/places-du-serveur.mjs';

const sansPause = { attendre: () => Promise.resolve() };
const delai = Object.assign(new Error('4 DEADLINE_EXCEEDED: Deadline exceeded after 0.000s'), {
  code: 4,
});

describe('a call the server fails transiently is played again', () => {
  it('tells a deadline exceeded, a call cancelled at its deadline and an unavailable server from another failure', () => {
    expect(transitoire(delai)).toBe(true);
    expect(transitoire({ code: 14, message: 'UNAVAILABLE' })).toBe(true);
    expect(transitoire({ cause: { code: 4 } })).toBe(true);
    expect(transitoire({ code: 1, message: '1 CANCELLED: Call cancelled' })).toBe(true);
    expect(transitoire(new Error('workflow not found'))).toBe(false);
  });

  it('passes on a later attempt, after a pause that grows', async () => {
    const pauses: number[] = [];
    let n = 0;
    const r = await avecReprises(() => (++n < 3 ? Promise.reject(delai) : Promise.resolve('lu')), {
      essais: 3,
      reculMs: 10,
      attendre: ms => (pauses.push(ms), Promise.resolve()),
    });
    expect(r).toBe('lu');
    expect(pauses).toEqual([10, 20]);
  });

  it('throws the last transient failure after its attempts, and another failure at once', async () => {
    let n = 0;
    await expect(
      avecReprises(() => (n++, Promise.reject(delai)), { essais: 3, ...sansPause })
    ).rejects.toBe(delai);
    expect(n).toBe(3);
    let m = 0;
    const autre = new Error('workflow not found');
    await expect(
      avecReprises(() => (m++, Promise.reject(autre)), { essais: 3, ...sansPause })
    ).rejects.toBe(autre);
    expect(m).toBe(1);
  });
});

describe('a server busy is told from a server absent', () => {
  it('a port that listens is a server there, a port refused none', async () => {
    const serveur = createServer();
    await new Promise<void>(ok => serveur.listen(0, '127.0.0.1', ok));
    const { port } = serveur.address() as { port: number };
    expect(await ecoute(`127.0.0.1:${port}`)).toBe(true);
    await new Promise<void>(ok => serveur.close(() => ok()));
    // A refusal answers at once; the wide bound keeps a slow loopback from passing for a server.
    expect(await ecoute(`127.0.0.1:${port}`, 30_000)).toBe(false);
  });
});
