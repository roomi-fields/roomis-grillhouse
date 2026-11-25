// The bilan of a direct circuit (scripts/bilan.mjs): the sessions of the agent direct, at 3 Code,
// count among the roles the list of the steps gives (scripts/etapes.mjs), as work or as a relaunch
// without effect, and the lot they deliver counts for the pass that follows.
import { describe, expect, it } from 'vitest';
import { bilan } from '../../scripts/bilan.mjs';

const TICKET = 'demo-7';
const T0 = Date.parse('2026-10-20T10:00:00Z');
const a = (m: number) => T0 + m * 60_000;
const iso = (m: number) => new Date(a(m)).toISOString();
const ligne = (role: string, agent: string, d: number, f: number, etape?: string) => ({
  projet: '/depot',
  agent,
  ticket: TICKET,
  role,
  etape,
  debut: iso(d),
  fin: iso(f),
  travail: a(f) - a(d),
  tours: [[a(d), a(f)]],
  jetons: 1000,
  cache: 0,
  cout: 0.5,
});
const passe = (n: number, d: number, f: number) =>
  ligne('circuit', `circuit:${n}`, d, f, 'controles');
const finale = (m: number) => ({
  date: iso(m),
  role: 'circuit',
  etape: 'controles',
  resultat: { issue: 'rouge', finale: true, rouges: ['forms : rouge'] },
});
const lancement = (m: number) => ({
  date: iso(m),
  role: 'circuit',
  lancement: { role: 'direct', seance: 'd1' },
});
const fiche = (m: number) => ({ date: iso(m), role: 'direct', fiche: { statut: 'FAIT' } });

interface Bilan {
  seances: { total: number; parRole: Record<string, number> };
  categories: Record<'travail' | 'sansEffet' | 'finales' | 'rejeu', { n: number; jetons: number }>;
}
// A red final pass, a session of the agent direct, the same red final pass; `inchangee` when the
// session changed no file of the plan.
const jouer = (inchangee: boolean) =>
  bilan({
    ticket: TICKET,
    lignes: [passe(1, 0, 2), ligne('direct', 'd1', 3, 10), passe(2, 11, 13)],
    entrees: [
      finale(2),
      lancement(3),
      fiche(10),
      ...(inchangee
        ? [{ date: iso(10), role: 'circuit', etape: 'developpeur', inchange: true }]
        : []),
      finale(13),
    ],
  } as unknown as Parameters<typeof bilan>[0]) as unknown as Bilan;

describe('the sessions of the agent direct in the bilan', () => {
  it('counts the session by its role, as work', () => {
    const b = jouer(false);
    expect(b.seances.parRole).toEqual({ direct: 1 });
    expect(b.categories.travail).toMatchObject({ n: 1, jetons: 1000 });
  });

  it('counts the lot it delivers for the pass that follows', () => {
    const b = jouer(false);
    expect(b.categories.finales.n).toBe(2);
    expect(b.categories.sansEffet.n).toBe(0);
  });

  it('counts a session that changes nothing as a relaunch without effect, and the same pass after it', () => {
    const b = jouer(true);
    expect(b.seances.parRole).toEqual({ direct: 1 });
    expect(b.categories.travail.n).toBe(0);
    expect(b.categories.sansEffet.n).toBe(2);
    expect(b.categories.finales.n).toBe(1);
  });
});
