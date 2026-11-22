import { describe, expect, it, vi } from 'vitest';
import { jouer } from '../../scripts/machine.mjs';

type Etat = ReturnType<typeof etat>;
const etat = (
  prises: number,
  parts: number,
  fermeture: { auteur: string; depuis: number } | null = null
) => ({
  prises: Array.from({ length: prises }, (_, i) => ({ ticket: `t-${i}`, racine: '/depots/alpha' })),
  parts: Array.from({ length: parts }, (_, i) => ({
    ticket: `p-${i}`,
    projet: '/depots/alpha',
    etat: 'tient',
  })),
  fermeture,
});

// Plays the command with its joints (act, read, sleep) given: what it says, the sleeps, the code.
async function jouerAvec(mode: string, args: string[], issue: string, lectures: Etat[]) {
  const dit: string[] = [];
  const dormir = vi.fn(() => Promise.resolve(undefined));
  const agir = vi.fn(() => issue);
  let n = 0;
  const lire = vi.fn(() => lectures[Math.min(n++, lectures.length - 1)]);
  const code = await jouer(mode, args, {
    env: {},
    dire: l => dit.push(l),
    maintenant: () => 10_000,
    agir: agir as never,
    lire: lire as never,
    dormir,
  });
  return { code, dit, dormir, agir, lire };
}

describe('the machine command plays its loop', () => {
  it('sleeps while places or parts remain on closing with --attendre, says the machine is empty, then exits 0', async () => {
    const r = await jouerAvec('fermer', ['--attendre'], 'fermee', [
      etat(2, 1, { auteur: 'superviseur', depuis: 0 }),
      etat(1, 1),
      etat(0, 1),
      etat(0, 0),
    ]);
    expect(r.code).toBe(0);
    expect(r.dormir).toHaveBeenCalledTimes(3);
    expect(r.dit.at(-1)).toBe('la machine est vide');
    expect(r.dit.slice(0, -1).filter(l => l === 'la machine est vide')).toEqual([]);
  });

  it('keeps sleeping while only parts remain', async () => {
    const r = await jouerAvec('fermer', ['--attendre'], 'fermee', [
      etat(0, 2),
      etat(0, 2),
      etat(0, 0),
    ]);
    expect(r.code).toBe(0);
    expect(r.dormir).toHaveBeenCalledTimes(2);
    expect(r.dit.at(-1)).toBe('la machine est vide');
  });

  it('exits 0 at once without sleeping on closing without --attendre, saying what still runs', async () => {
    const r = await jouerAvec('fermer', [], 'fermee', [etat(1, 0)]);
    expect(r.code).toBe(0);
    expect(r.agir).toHaveBeenCalledWith('fermer', { env: {} });
    expect(r.dormir).not.toHaveBeenCalled();
    expect(r.dit.join('\n')).toContain('t-0');
  });

  it('exits 0 at once on an empty machine with --attendre, without sleeping', async () => {
    const r = await jouerAvec('fermer', ['--attendre'], 'fermee', [etat(0, 0)]);
    expect(r.code).toBe(0);
    expect(r.dormir).not.toHaveBeenCalled();
    expect(r.dit).toContain('la machine est vide');
  });

  it('exits 0 on reopening, without sleeping', async () => {
    const r = await jouerAvec('rouvrir', [], 'rouverte', [etat(1, 0)]);
    expect(r.code).toBe(0);
    expect(r.agir).toHaveBeenCalledWith('rouvrir', { env: {} });
    expect(r.dormir).not.toHaveBeenCalled();
    expect(r.dit[0]).toContain('machine rouverte');
  });
});
