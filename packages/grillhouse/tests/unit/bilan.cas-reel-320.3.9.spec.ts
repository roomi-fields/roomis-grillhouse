// The bilan of a real ticket (grillhouse-982.3): BPScript bp-mono-vbwf.320.3.9, led by Grillhouse
// 0.24.6, whose bilan counted 6.0 min without effect (5.2 min of them a developpeur whose code the
// commit delivers, N3) and 0.9 min of the owner's wait where the owner wrote nothing (N4). The
// material, tests/cas-reels/bp-320.3.9/, is the real case reduced: the register's lines of the
// ticket, the results its circuit kept without their reports nor the bodies of the sheets, and the
// supervisor's transcript from 08:20 to 09:52, its user and assistant events, their content cut.
// The circuit of 0.24.6 did not keep the supervisor's session with each stop: it is added here.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { bilan, messagesDuResponsable } from '../../scripts/bilan.mjs';

const CAS = path.join(__dirname, '../cas-reels/bp-320.3.9');
const TICKET = 'bp-mono-vbwf.320.3.9';
const SUPERVISEUR = '09f61bc7-6f77-49bd-8ddb-4b9a5ce868d1';
const MIN = 60_000;
const jsonl = (f: string) =>
  readFileSync(path.join(CAS, f), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(l => JSON.parse(l) as Record<string, unknown>);

const entrees = jsonl('fiches.jsonl').map(e =>
  e.montee ? { ...e, montee: { ...(e.montee as object), superviseur: SUPERVISEUR } } : e
);
const duResponsable = messagesDuResponsable(
  readFileSync(path.join(CAS, 'transcriptions', `${SUPERVISEUR}.jsonl`), 'utf8')
);
const b = bilan({
  ticket: TICKET,
  lignes: jsonl('registre.jsonl'),
  entrees,
  etat: { etape: 'integre' },
  duResponsable,
}) as { categories: Record<string, { ms: number; n: number }> };
const min = (ms: number) => Math.round((ms / MIN) * 100) / 100;

describe('982.3 critère 1 : a developer whose code the commit delivers is never without effect (BP 320.3.9)', () => {
  it('counts the developpeur f67f2b9a, stopped at « sans-livraison » on his second sending to the testwriter, as work kept in the lot', () => {
    // 08:53:25 → 08:58:38, 5.21 min; the rest without effect: the testwriters resumed for their
    // « vert attendu » and the proofs they replay (3 + 3), 0.79 min.
    expect(b.categories.sansEffet.n).toBe(6);
    expect(min(b.categories.sansEffet.ms)).toBeLessThan(1);
    expect(min(b.categories.travail.ms)).toBeGreaterThan(27.09 + 5.2);
    expect(b.categories.travail.n).toBe(14);
  });
});

describe('982.3 critère 2 : a wait is the owner’s only when he writes during it (BP 320.3.9)', () => {
  it('reads the owner’s two messages before the launch, none during the circuit', () => {
    expect(duResponsable.map(t => new Date(t).toISOString())).toEqual([
      '2026-10-26T08:22:09.762Z',
      '2026-10-26T08:22:49.469Z',
    ]);
  });

  it('gives the three waits to the supervisor, none to the owner', () => {
    expect(b.categories.responsable).toMatchObject({ ms: 0, n: 0 });
    expect(b.categories.superviseur.n).toBe(3);
    expect(min(b.categories.superviseur.ms)).toBeCloseTo(0.9 + 1.02 + 0.82, 1);
  });
});
